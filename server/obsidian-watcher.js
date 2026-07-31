import { watch } from 'chokidar';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename, extname } from 'path';
import matter from 'gray-matter';

export class ObsidianWatcher {
  constructor(db) {
    this.db = db;
    this.watchers = new Map(); // userId -> { watcher, vaultPath }
  }

  async startWatching(userId, vaultPath) {
    const resolvedPath = resolve(vaultPath);
    
    // Stop existing watcher for this user
    this.stopWatching(userId);

    if (!existsSync(resolvedPath)) {
      throw new Error(`Vault path does not exist: ${resolvedPath}`);
    }

    // Initial sync
    await this.syncVaultToBrain(userId, resolvedPath);

    // Watch for changes
    const watcher = watch(resolvedPath, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
    });

    watcher
      .on('add', (filePath) => this.handleFileChange(userId, resolvedPath, filePath, 'add'))
      .on('change', (filePath) => this.handleFileChange(userId, resolvedPath, filePath, 'change'))
      .on('unlink', (filePath) => this.handleFileDelete(userId, resolvedPath, filePath))
      .on('error', (err) => console.error('Obsidian watcher error:', err));

    this.watchers.set(userId, { watcher, vaultPath: resolvedPath });
    console.log(`Obsidian watcher started for user ${userId}: ${resolvedPath}`);
  }

  stopWatching(userId) {
    const entry = this.watchers.get(userId);
    if (entry) {
      entry.watcher.close();
      this.watchers.delete(userId);
      console.log(`Obsidian watcher stopped for user ${userId}`);
    }
  }

  getStatus(userId) {
    const entry = this.watchers.get(userId);
    return { watching: !!entry, vaultPath: entry?.vaultPath || null };
  }

  async syncVaultToBrain(userId, vaultPath) {
    // We'll implement this to sync all .md files from vault to brain_docs
    // For now, just return
    console.log(`Initial sync for ${userId} from ${vaultPath}`);
  }

  async handleFileChange(userId, vaultPath, filePath, eventType) {
    if (!filePath.endsWith('.md')) return;

    try {
      const content = readFileSync(filePath, 'utf8');
      const { data: frontmatter, content: body } = matter(content);
      
      const title = frontmatter.title || basename(filePath, '.md');
      const type = frontmatter.type || 'text';
      const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags.join(', ') : (frontmatter.tags || '');
      const pinned = frontmatter.pinned === true;

      // Check if this file is already mapped to a brain doc
      const mapping = this.db.prepare(
        'SELECT * FROM obsidian_file_mappings WHERE user_id = ? AND file_path = ?'
      ).get(userId, filePath);

      if (mapping) {
        // Update existing brain doc
        this.db.prepare(
          'UPDATE brain_docs SET title = ?, content = ?, type = ?, tags = ?, pinned = ? WHERE id = ?'
        ).run(title, body, type, tags, pinned ? 1 : 0, mapping.brain_doc_id);
        console.log(`Updated brain doc ${mapping.brain_doc_id} from ${filePath}`);
      } else {
        // Create new brain doc
        const r = this.db.prepare(
          'INSERT INTO brain_docs (title, content, type, tags, pinned, owner_id, permission) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(title, body, type, tags, pinned ? 1 : 0, userId, 'private');

        // Create mapping
        this.db.prepare(
          'INSERT INTO obsidian_file_mappings (user_id, brain_doc_id, file_path, last_synced) VALUES (?, ?, ?, datetime(\'now\'))'
        ).run(userId, r.lastInsertRowid, filePath);

        console.log(`Created brain doc ${r.lastInsertRowid} from ${filePath}`);
      }
    } catch (e) {
      console.error(`Error syncing ${filePath}:`, e);
    }
  }

  async handleFileDelete(userId, vaultPath, filePath) {
    if (!filePath.endsWith('.md')) return;

    try {
      const mapping = this.db.prepare(
        'SELECT * FROM obsidian_file_mappings WHERE user_id = ? AND file_path = ?'
      ).get(userId, filePath);

      if (mapping) {
        // Soft delete - mark as done in reminders or just delete the brain doc
        this.db.prepare('DELETE FROM brain_docs WHERE id = ?').run(mapping.brain_doc_id);
        this.db.prepare('DELETE FROM obsidian_file_mappings WHERE id = ?').run(mapping.id);
        console.log(`Deleted brain doc ${mapping.brain_doc_id} for removed file ${filePath}`);
      }
    } catch (e) {
      console.error(`Error handling delete for ${filePath}:`, e);
    }
  }
}