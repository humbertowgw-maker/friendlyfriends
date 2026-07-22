import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'rate-gauge.db');

let db;
let SQL;

class SqlJsWrapper {
  constructor(sqliteDb) {
    this._db = sqliteDb;
  }

  exec(sql) {
    this._db.exec(sql);
    this._save();
  }

  prepare(sql) {
    return new PreparedStatement(this._db, sql, this);
  }

  _save() {
    try {
      const data = this._db.export();
      writeFileSync(DB_PATH, Buffer.from(data));
    } catch {}
  }
}

class PreparedStatement {
  constructor(sqliteDb, sql, wrapper) {
    this._db = sqliteDb;
    this._sql = sql;
    this._wrapper = wrapper;
  }

  run(...params) {
    this._db.run(this._sql, params);
    const changes = this._db.getRowsModified();
    let lastInsertRowid = null;
    try {
      const res = this._db.exec('SELECT last_insert_rowid() as id');
      if (res.length > 0 && res[0].values.length > 0) {
        lastInsertRowid = res[0].values[0][0];
      }
    } catch {}
    this._wrapper._save();
    return { changes, lastInsertRowid };
  }

  get(...params) {
    const stmt = this._db.prepare(this._sql);
    stmt.bind(params);
    if (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      stmt.free();
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      return row;
    }
    stmt.free();
    return undefined;
  }

  all(...params) {
    const results = [];
    const stmt = this._db.prepare(this._sql);
    stmt.bind(params);
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      const row = {};
      cols.forEach((c, i) => { row[c] = vals[i]; });
      results.push(row);
    }
    stmt.free();
    return results;
  }
}

export async function initDb() {
  try { mkdirSync(join(__dirname, '..', 'data'), { recursive: true }); } catch {}

  SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SqlJsWrapper(new SQL.Database(buffer));
  } else {
    db = new SqlJsWrapper(new SQL.Database());
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      timestamp DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      metric TEXT NOT NULL,
      threshold REAL NOT NULL,
      type TEXT DEFAULT 'warning',
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER,
      provider TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL,
      threshold REAL,
      message TEXT,
      timestamp DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rate_limit_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      rpm_remaining INTEGER,
      rpm_limit INTEGER,
      tpm_remaining INTEGER,
      tpm_limit INTEGER,
      timestamp DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      reference_images TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS animation_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      asset_ref TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      source TEXT DEFAULT 'generated',
      use_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      last_used_at DATETIME,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      UNIQUE(character_id, type, label)
    );

    CREATE TABLE IF NOT EXISTS book_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      source_type TEXT DEFAULT 'script',
      page_or_episode TEXT,
      content_text TEXT,
      resolved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(source_id)
    );

    CREATE TABLE IF NOT EXISTS book_reference_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_reference_id INTEGER NOT NULL,
      character_id INTEGER NOT NULL,
      FOREIGN KEY (book_reference_id) REFERENCES book_references(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS book_reference_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_reference_id INTEGER NOT NULL,
      character_id INTEGER NOT NULL,
      action_label TEXT NOT NULL,
      FOREIGN KEY (book_reference_id) REFERENCES book_references(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_gaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER NOT NULL,
      requested_label TEXT NOT NULL,
      asset_type TEXT DEFAULT 'pose',
      first_requested_from INTEGER,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
      FOREIGN KEY (first_requested_from) REFERENCES book_references(id) ON DELETE SET NULL,
      UNIQUE(character_id, asset_type, requested_label)
    );
  `);

  return db;
}

export function getDb() {
  return db;
}
