export class CharacterInventory {
  constructor(db) {
    this.db = db;
  }

  // --- Characters ---

  getAllCharacters() {
    return this.db.prepare('SELECT * FROM characters WHERE status = ? ORDER BY name').all('active');
  }

  getCharacter(id) {
    return this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
  }

  getCharacterBySlug(slug) {
    return this.db.prepare('SELECT * FROM characters WHERE slug = ?').get(slug);
  }

  createCharacter({ name, slug, description = '', reference_images = [] }) {
    const result = this.db.prepare(`
      INSERT INTO characters (name, slug, description, reference_images)
      VALUES (?, ?, ?, ?)
    `).run(name, slug, description, JSON.stringify(reference_images));
    return { id: result.lastInsertRowid, name, slug, description };
  }

  updateCharacter(id, fields) {
    const allowed = ['name', 'description', 'reference_images', 'status'];
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(key === 'reference_images' ? JSON.stringify(val) : val);
      }
    }
    if (updates.length === 0) return null;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getCharacter(id);
  }

  // --- Animation Assets ---

  getAssets(characterId, { type } = {}) {
    if (type) {
      return this.db.prepare(
        'SELECT * FROM animation_assets WHERE character_id = ? AND type = ? ORDER BY label'
      ).all(characterId, type);
    }
    return this.db.prepare(
      'SELECT * FROM animation_assets WHERE character_id = ? ORDER BY type, label'
    ).all(characterId);
  }

  getAsset(id) {
    return this.db.prepare('SELECT * FROM animation_assets WHERE id = ?').get(id);
  }

  lookupAsset(characterId, label, type) {
    // Exact match first
    if (type) {
      const exact = this.db.prepare(
        'SELECT * FROM animation_assets WHERE character_id = ? AND label = ? AND type = ?'
      ).get(characterId, label, type);
      if (exact) return exact;
    } else {
      const exact = this.db.prepare(
        'SELECT * FROM animation_assets WHERE character_id = ? AND label = ?'
      ).get(characterId, label);
      if (exact) return exact;
    }

    // Fuzzy match: label contains the query or vice versa
    if (type) {
      return this.db.prepare(
        `SELECT * FROM animation_assets
         WHERE character_id = ? AND type = ?
         AND (label LIKE ? OR ? LIKE '%' || label || '%')
         ORDER BY use_count DESC LIMIT 1`
      ).get(characterId, type, `%${label}%`, label);
    }
    return this.db.prepare(
      `SELECT * FROM animation_assets
       WHERE character_id = ?
       AND (label LIKE ? OR ? LIKE '%' || label || '%')
       ORDER BY use_count DESC LIMIT 1`
    ).get(characterId, `%${label}%`, label);
  }

  createAsset(characterId, { type, label, asset_ref, metadata = {}, source = 'generated' }) {
    const result = this.db.prepare(`
      INSERT INTO animation_assets (character_id, type, label, asset_ref, metadata, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(characterId, type, label, asset_ref, JSON.stringify(metadata), source);
    return { id: result.lastInsertRowid, character_id: characterId, type, label, asset_ref };
  }

  incrementAssetUse(assetId) {
    this.db.prepare(`
      UPDATE animation_assets
      SET use_count = use_count + 1, last_used_at = datetime('now')
      WHERE id = ?
    `).run(assetId);
    return this.getAsset(assetId);
  }

  // --- Book References ---

  upsertBookReference({ source_id, source_type = 'script', page_or_episode, content_text, character_ids = [], actions = [] }) {
    const existing = this.db.prepare('SELECT id FROM book_references WHERE source_id = ?').get(source_id);

    let bookRefId;
    if (existing) {
      bookRefId = existing.id;
    } else {
      const result = this.db.prepare(`
        INSERT INTO book_references (source_id, source_type, page_or_episode, content_text)
        VALUES (?, ?, ?, ?)
      `).run(source_id, source_type, page_or_episode || null, content_text || null);
      bookRefId = result.lastInsertRowid;
    }

    // Link characters (idempotent via DELETE + re-insert)
    if (character_ids.length > 0) {
      this.db.prepare('DELETE FROM book_reference_characters WHERE book_reference_id = ?').run(bookRefId);
      const stmt = this.db.prepare('INSERT INTO book_reference_characters (book_reference_id, character_id) VALUES (?, ?)');
      for (const cid of character_ids) {
        stmt.run(bookRefId, cid);
      }
    }

    // Link actions (idempotent via DELETE + re-insert)
    if (actions.length > 0) {
      this.db.prepare('DELETE FROM book_reference_actions WHERE book_reference_id = ?').run(bookRefId);
      const stmt = this.db.prepare('INSERT INTO book_reference_actions (book_reference_id, character_id, action_label) VALUES (?, ?, ?)');
      for (const { character_id, action_label } of actions) {
        stmt.run(bookRefId, character_id, action_label);
      }
    }

    return this.getBookReference(bookRefId);
  }

  getBookReference(id) {
    const ref = this.db.prepare('SELECT * FROM book_references WHERE id = ?').get(id);
    if (!ref) return null;
    ref.characters = this.db.prepare(
      'SELECT c.* FROM characters c JOIN book_reference_characters brc ON c.id = brc.character_id WHERE brc.book_reference_id = ?'
    ).all(id);
    ref.actions = this.db.prepare(
      'SELECT bra.*, c.name as character_name FROM book_reference_actions bra JOIN characters c ON c.id = bra.character_id WHERE bra.book_reference_id = ?'
    ).all(id);
    return ref;
  }

  markBookReferenceResolved(id, resolved = true) {
    this.db.prepare('UPDATE book_references SET resolved = ? WHERE id = ?').run(resolved ? 1 : 0, id);
  }

  // --- Inventory Gaps ---

  createGap(character_id, requested_label, asset_type = 'pose', first_requested_from = null) {
    try {
      const result = this.db.prepare(`
        INSERT INTO inventory_gaps (character_id, requested_label, asset_type, first_requested_from)
        VALUES (?, ?, ?, ?)
      `).run(character_id, requested_label, asset_type, first_requested_from);
      return { id: result.lastInsertRowid, character_id, requested_label, asset_type, status: 'pending' };
    } catch (e) {
      // UNIQUE constraint — already exists
      if (e.message?.includes('UNIQUE')) {
        return this.db.prepare(
          'SELECT * FROM inventory_gaps WHERE character_id = ? AND asset_type = ? AND requested_label = ?'
        ).get(character_id, asset_type, requested_label);
      }
      throw e;
    }
  }

  getGaps({ status, character_id } = {}) {
    let sql = 'SELECT ig.*, c.name as character_name FROM inventory_gaps ig JOIN characters c ON c.id = ig.character_id WHERE 1=1';
    const params = [];
    if (status) {
      sql += ' AND ig.status = ?';
      params.push(status);
    }
    if (character_id) {
      sql += ' AND ig.character_id = ?';
      params.push(character_id);
    }
    sql += ' ORDER BY ig.created_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  resolveGap(id) {
    this.db.prepare("UPDATE inventory_gaps SET status = 'generated', updated_at = datetime('now') WHERE id = ?").run(id);
  }

  ignoreGap(id) {
    this.db.prepare("UPDATE inventory_gaps SET status = 'ignored', updated_at = datetime('now') WHERE id = ?").run(id);
  }

  // --- Stats ---

  getStats() {
    const characters = this.db.prepare("SELECT COUNT(*) as count FROM characters WHERE status = 'active'").get();
    const assets = this.db.prepare('SELECT COUNT(*) as count FROM animation_assets').get();
    const pendingGaps = this.db.prepare("SELECT COUNT(*) as count FROM inventory_gaps WHERE status = 'pending'").get();
    const resolvedRefs = this.db.prepare('SELECT COUNT(*) as count FROM book_references WHERE resolved = 1').get();
    const totalRefs = this.db.prepare('SELECT COUNT(*) as count FROM book_references').get();
    const assetTypeBreakdown = this.db.prepare(
      'SELECT type, COUNT(*) as count FROM animation_assets GROUP BY type ORDER BY count DESC'
    ).all();
    return {
      characters: characters.count,
      total_assets: assets.count,
      pending_gaps: pendingGaps.count,
      resolved_references: resolvedRefs.count,
      total_references: totalRefs.count,
      asset_type_breakdown: assetTypeBreakdown,
    };
  }
}
