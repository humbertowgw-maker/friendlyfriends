export class EpisodeManager {
  constructor(db) {
    this.db = db;
  }

  // --- Episodes ---

  getAllEpisodes() {
    return this.db.prepare('SELECT * FROM episodes ORDER BY created_at DESC').all();
  }

  getEpisode(id) {
    const ep = this.db.prepare('SELECT * FROM episodes WHERE id = ?').get(id);
    if (!ep) return null;
    ep.scenes = this.db.prepare('SELECT * FROM scenes WHERE episode_id = ? ORDER BY scene_order').all(id);
    ep.approvals = this.db.prepare('SELECT * FROM episode_approvals WHERE episode_id = ? ORDER BY created_at DESC').all(id);
    try { ep.metadata = JSON.parse(ep.metadata || '{}'); } catch { ep.metadata = {}; }
    for (const scene of ep.scenes) {
      try { scene.dialogue = JSON.parse(scene.dialogue || '[]'); } catch { scene.dialogue = []; }
      try { scene.actions = JSON.parse(scene.actions || '[]'); } catch { scene.actions = []; }
      try { scene.metadata = JSON.parse(scene.metadata || '{}'); } catch { scene.metadata = {}; }
    }
    return ep;
  }

  getEpisodeBySlug(slug) {
    const ep = this.db.prepare('SELECT * FROM episodes WHERE slug = ?').get(slug);
    return ep ? this.getEpisode(ep.id) : null;
  }

  createEpisode({ title, slug, description = '', metadata = {} }) {
    const result = this.db.prepare(`
      INSERT INTO episodes (title, slug, description, metadata)
      VALUES (?, ?, ?, ?)
    `).run(title, slug, description, JSON.stringify(metadata));
    return this.getEpisode(result.lastInsertRowid);
  }

  updateEpisode(id, fields) {
    const allowed = ['title', 'description', 'status', 'metadata'];
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(key === 'metadata' ? JSON.stringify(val) : val);
      }
    }
    if (updates.length === 0) return null;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    this.db.prepare(`UPDATE episodes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.getEpisode(id);
  }

  deleteEpisode(id) {
    this.db.prepare('DELETE FROM episodes WHERE id = ?').run(id);
  }

  // --- Scenes ---

  addScene(episodeId, { title, narration, background_scene, dialogue = [], actions = [], metadata = {} }) {
    const maxOrder = this.db.prepare('SELECT MAX(scene_order) as max_order FROM scenes WHERE episode_id = ?').get(episodeId);
    const order = (maxOrder?.max_order ?? -1) + 1;
    const result = this.db.prepare(`
      INSERT INTO scenes (episode_id, scene_order, title, narration, background_scene, dialogue, actions, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(episodeId, order, title || `Scene ${order + 1}`, narration || '', background_scene || 'indoor_general', JSON.stringify(dialogue), JSON.stringify(actions), JSON.stringify(metadata));
    return this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(result.lastInsertRowid);
  }

  updateScene(id, fields) {
    const allowed = ['title', 'narration', 'background_scene', 'dialogue', 'actions', 'image_asset_ref', 'audio_asset_ref', 'video_asset_ref', 'status', 'metadata', 'scene_order'];
    const updates = [];
    const values = [];
    for (const [key, val] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(typeof val === 'object' ? JSON.stringify(val) : val);
      }
    }
    if (updates.length === 0) return null;
    values.push(id);
    this.db.prepare(`UPDATE scenes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.db.prepare('SELECT * FROM scenes WHERE id = ?').get(id);
  }

  deleteScene(id) {
    this.db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  }

  reorderScenes(episodeId, sceneIds) {
    const stmt = this.db.prepare('UPDATE scenes SET scene_order = ? WHERE id = ? AND episode_id = ?');
    sceneIds.forEach((sid, idx) => stmt.run(idx, sid, episodeId));
  }

  // --- Approvals ---

  createApproval(episodeId, stage) {
    const existing = this.db.prepare(
      "SELECT id FROM episode_approvals WHERE episode_id = ? AND stage = ? AND status = 'pending'"
    ).get(episodeId, stage);
    if (existing) return existing;

    const result = this.db.prepare(`
      INSERT INTO episode_approvals (episode_id, stage) VALUES (?, ?)
    `).run(episodeId, stage);
    return { id: result.lastInsertRowid, episode_id: episodeId, stage, status: 'pending' };
  }

  approveStage(id, reviewer = 'user', notes = '') {
    this.db.prepare(`
      UPDATE episode_approvals SET status = 'approved', reviewer = ?, notes = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `).run(reviewer, notes, id);
    this.updateEpisodeApprovalStatus(this.db.prepare('SELECT episode_id FROM episode_approvals WHERE id = ?').get(id)?.episode_id);
  }

  rejectStage(id, reviewer = 'user', notes = '') {
    this.db.prepare(`
      UPDATE episode_approvals SET status = 'rejected', reviewer = ?, notes = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `).run(reviewer, notes, id);
    this.updateEpisodeApprovalStatus(this.db.prepare('SELECT episode_id FROM episode_approvals WHERE id = ?').get(id)?.episode_id);
  }

  updateEpisodeApprovalStatus(episodeId) {
    if (!episodeId) return;
    const pending = this.db.prepare(
      "SELECT COUNT(*) as count FROM episode_approvals WHERE episode_id = ? AND status = 'pending'"
    ).get(episodeId);
    const rejected = this.db.prepare(
      "SELECT COUNT(*) as count FROM episode_approvals WHERE episode_id = ? AND status = 'rejected'"
    ).get(episodeId);

    let status = 'pending';
    if (rejected.count > 0) status = 'rejected';
    else if (pending.count === 0) status = 'approved';

    this.db.prepare("UPDATE episodes SET approval_status = ?, updated_at = datetime('now') WHERE id = ?").run(status, episodeId);
  }

  // --- Stats ---

  getEpisodeStats() {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM episodes').get();
    const byStatus = this.db.prepare('SELECT status, COUNT(*) as count FROM episodes GROUP BY status').all();
    const byApproval = this.db.prepare('SELECT approval_status, COUNT(*) as count FROM episodes GROUP BY approval_status').all();
    const totalScenes = this.db.prepare('SELECT COUNT(*) as count FROM scenes').get();
    return {
      total_episodes: total.count,
      by_status: byStatus,
      by_approval: byApproval,
      total_scenes: totalScenes.count,
    };
  }
}
