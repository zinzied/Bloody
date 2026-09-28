import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert';
import type { SqliteDb } from '../src/core/types.js';

const require = createRequire(import.meta.url);

// better-sqlite3 is an optional dependency — it needs a native build on some
// machines, and the ledger falls back to the built-in node:sqlite — so the test
// has to be able to write the legacy file with whichever driver is present,
// using the same two attempts as src/core/index.ts.
function open(file: string): SqliteDb {
  const attempts: Array<() => SqliteDb> = [
    () => new (require('better-sqlite3') as new (p: string) => SqliteDb)(file),
    () => new (require('node:sqlite').DatabaseSync as new (p: string) => SqliteDb)(file),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {}
  }
  throw new Error('no sqlite driver available — install better-sqlite3 or use Node.js 22.13+ for node:sqlite');
}

// The ledger is opened lazily and cached for the life of the process, so a
// migration can only be exercised from a file that already exists on disk before
// the module is imported. Hence a separate test file with its own home.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-index-migrate-'));
process.env.NOBLEED_HOME = TMP;

const DB_DIR = path.join(TMP, '.config', 'opencode', 'compress');
const DB_FILE = path.join(DB_DIR, 'index.db');
fs.mkdirSync(DB_DIR, { recursive: true });

// The shape shipped before `cost_level` was added. `CREATE TABLE IF NOT EXISTS`
// leaves it alone, so without an explicit top-up every insert into this file
// fails with "no column named cost_level" — silently, because the failure was
// swallowed and the caller discarded the result.
{
  const db = open(DB_FILE);
  db.exec(`
    CREATE TABLE proxy_requests (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        path        TEXT,
        model       TEXT,
        raw_tokens  INTEGER DEFAULT 0,
        saved_tokens INTEGER DEFAULT 0,
        timestamp   TEXT NOT NULL
    )
  `);
  db.prepare('INSERT INTO proxy_requests (path, model, raw_tokens, saved_tokens, timestamp) VALUES (?,?,?,?,?)').run(
    '/v1/chat/completions',
    'openai/legacy',
    900,
    90,
    new Date().toISOString()
  );
  db.close();
}

const index = await import('../src/core/index.js');

test('an index.db from an older build is topped up instead of failing every insert', () => {
  // The pre-existing row has to survive, and the new one has to land: before the
  // fix this returned false and wrote nothing.
  assert.strictEqual(index.logProxyRequest('/v1/chat/completions', 'openai/new', 1000, 250, 'free'), true);

  const stats = index.proxyStats();
  assert.strictEqual(stats!.total_requests, 2, 'the legacy row plus the new one');
  assert.strictEqual(stats!.total_saved, 340, '90 + 250');

  const db = open(DB_FILE);
  const cols = db.prepare('PRAGMA table_info(proxy_requests)').all().map((r) => r.name);
  db.close();
  assert.ok(cols.includes('cost_level'), `cost_level should have been added, got ${cols.join(',')}`);
  assert.ok(cols.includes('id'), 'the original columns are left alone');
});
