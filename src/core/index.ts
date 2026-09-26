import { createRequire } from 'node:module';
import { INDEX_DB_PATH } from './config.js';
import type { SqliteDb } from './types.js';

const require = createRequire(import.meta.url);

let _db: SqliteDb | null = null;

/** Every insert/update column, so a database written by an older build can be topped up. */
const _COLUMNS: Record<string, string> = {
  path: 'TEXT',
  model: 'TEXT',
  cost_level: 'TEXT',
  raw_tokens: 'INTEGER DEFAULT 0',
  saved_tokens: 'INTEGER DEFAULT 0',
  timestamp: 'TEXT',
};

/**
 * The statements are best-effort: the caller may hold the older `node:sqlite`
 * build, and a pragma it does not know must not stop the table from being
 * created. `journal_mode` in particular returns a row rather than a result.
 */
function _exec(db: SqliteDb, sql: string): void {
  try {
    db.exec(sql);
  } catch {}
}

function _init(db: SqliteDb): void {
  _exec(db, 'PRAGMA busy_timeout = 5000');
  _exec(db, 'PRAGMA journal_mode = WAL');
  _exec(db, `
    CREATE TABLE IF NOT EXISTS proxy_requests (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        path        TEXT,
        model       TEXT,
        cost_level  TEXT,
        raw_tokens  INTEGER DEFAULT 0,
        saved_tokens INTEGER DEFAULT 0,
        timestamp   TEXT NOT NULL
    )
  `);
  // `CREATE TABLE IF NOT EXISTS` does nothing when the table already exists, so
  // an index.db from a build that predates a column kept the old shape forever and
  // every insert failed with "no column named ..." — silently, since the failure
  // was swallowed below. Add whatever is missing instead.
  try {
    const rows = db.prepare('PRAGMA table_info(proxy_requests)').all() as Array<{ name: string }>;
    const have = new Set((rows || []).map((r) => r && r.name));
    for (const [name, decl] of Object.entries(_COLUMNS)) {
      if (have.has(name)) continue;
      if (name === 'timestamp') continue; // NOT NULL in the original schema; cannot be added bare
      _exec(db, `ALTER TABLE proxy_requests ADD COLUMN ${name} ${decl}`);
    }
  } catch {}
}

function _closeQuietly(db: SqliteDb | null): void {
  try {
    (db as unknown as { close?: () => void })?.close?.();
  } catch {}
}

function _open(): SqliteDb | null {
  if (_db) return _db;
  const attempts: Array<() => SqliteDb> = [
    () => new (require('better-sqlite3') as new (p: string) => SqliteDb)(INDEX_DB_PATH),
    () => new (require('node:sqlite').DatabaseSync as new (p: string) => SqliteDb)(INDEX_DB_PATH),
  ];
  for (const attempt of attempts) {
    let db: SqliteDb | null = null;
    try {
      db = attempt();
      _init(db);
      // Only published once init has succeeded. It used to be assigned first, so
      // one failed init (a non-SQLite file, a read-only volume) left a non-null
      // handle that short-circuited every later call for the life of the process:
      // the ledger silently stopped recording with no further attempt to open it.
      _db = db;
      return _db;
    } catch {
      _closeQuietly(db);
    }
  }
  return null;
}

const _warned = new Set<string>();
/** Report a swallowed failure once per message instead of on every request. */
function _warnOnce(message: string): void {
  if (_warned.has(message)) return;
  _warned.add(message);
  try {
    console.error(`[ledger] ${message}`);
  } catch {}
}

export function logProxyRequest(path: string, model: string, rawTokens = 0, savedTokens = 0, costLevel = ''): boolean {
  const db = _open();
  if (!db) {
    _warnOnce(`cannot open ${INDEX_DB_PATH} — request savings are not being recorded to the index.`);
    return false;
  }
  try {
    db.prepare(
      'INSERT INTO proxy_requests (path, model, cost_level, raw_tokens, saved_tokens, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(path, model, costLevel, rawTokens, savedTokens, new Date().toISOString());
    return true;
  } catch (e) {
    // The return value was ignored by the only caller, which is itself inside a
    // try/catch, so a permanently failing ledger produced no output at all.
    _warnOnce(`insert into proxy_requests failed (${(e as Error)?.message || e}) — savings totals may be short.`);
    return false;
  }
}

export function proxyStats(): { total_requests: number; total_saved: number; avg_saved: number } | null {
  const db = _open();
  if (!db) return null;
  try {
    const row = db
      .prepare(
        'SELECT COUNT(*) AS total_requests, COALESCE(SUM(saved_tokens),0) AS total_saved, COALESCE(AVG(saved_tokens),0) AS avg_saved FROM proxy_requests'
      )
      .get() as { total_requests: number; total_saved: number; avg_saved: number } | undefined;
    return row || null;
  } catch {
    return null;
  }
}
