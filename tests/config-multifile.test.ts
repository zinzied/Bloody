import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-multifile-'));
process.env.TOKENSAVER_HOME = TMP;

const cfgDir = path.join(TMP, '.config', 'opencode');
fs.mkdirSync(cfgDir, { recursive: true });

const config = await import('../src/core/config.js');

const JSON_FILE = path.join(cfgDir, 'opencode.json');
const JSONC_FILE = path.join(cfgDir, 'opencode.jsonc');

function write(file: string, obj: any) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}
function read(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function baseUrlOf(file: string, pid: string): string {
  return String(read(file).provider?.[pid]?.options?.baseURL || '');
}

/**
 * Backups are named to the second, so several rotations within one second
 * collapse into a single file and a test that counts them passes or fails
 * depending on how fast the machine runs. Tests that care about backup contents
 * start from a known-empty history.
 */
function clearBackups(): void {
  for (const n of fs.readdirSync(cfgDir)) {
    if (/\.backup$/.test(n)) fs.rmSync(path.join(cfgDir, n), { force: true });
  }
}

test('set_provider_base_urls rewrites a provider defined only in opencode.json', () => {
  // The regression: a provider declared in `opencode.json` was left pointing at
  // its real upstream, so OpenCode could merge that copy back over the proxied
  // one and send requests straight past the proxy.
  write(JSON_FILE, {
    provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:31415/v1', apiKey: '{env:FREELLMAPI_API_KEY}' } } },
  });
  fs.rmSync(JSONC_FILE, { force: true });

  const changed = config.set_provider_base_urls('http://127.0.0.1:8199', ['freellmapi']);
  assert.deepEqual(changed, ['freellmapi']);
  assert.equal(baseUrlOf(JSON_FILE, 'freellmapi'), 'http://127.0.0.1:8199/p/freellmapi/v1');
});

test('set_provider_base_urls rewrites the same provider in every file defining it', () => {
  write(JSON_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:31415/v1' } } } });
  write(JSONC_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:31415/v1' } } } });

  const changed = config.set_provider_base_urls('http://127.0.0.1:8199', ['freellmapi']);
  assert.deepEqual(changed, ['freellmapi']);
  for (const f of [JSON_FILE, JSONC_FILE]) {
    assert.equal(baseUrlOf(f, 'freellmapi'), 'http://127.0.0.1:8199/p/freellmapi/v1', `${f} not rewritten`);
  }
});

test('restore_provider_base_urls puts every file back', () => {
  const saved = { freellmapi: 'http://127.0.0.1:31415/v1' };
  const changed = config.restore_provider_base_urls(saved);
  assert.deepEqual(changed, ['freellmapi']);
  for (const f of [JSON_FILE, JSONC_FILE]) {
    assert.equal(baseUrlOf(f, 'freellmapi'), 'http://127.0.0.1:31415/v1', `${f} not restored`);
  }
});

test('restore leaves a provider that already points at a real upstream alone', () => {
  write(JSON_FILE, { provider: { google: { options: { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai' } } } });
  const changed = config.restore_provider_base_urls({ google: 'https://generativelanguage.googleapis.com/v1beta/openai' });
  assert.deepEqual(changed, []);
});

test('read_merged_config sees a provider defined in another file', () => {
  write(JSON_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:31415/v1' }, models: { auto: {} } } } });
  write(JSONC_FILE, { model: 'freellmapi/auto', provider: { google: { options: { baseURL: 'https://example.test/v1' } } } });

  const merged = config.read_merged_config();
  assert.equal(merged.model, 'freellmapi/auto');
  assert.ok(merged.provider.freellmapi, 'provider from opencode.json missing');
  assert.ok(merged.provider.google, 'provider from opencode.jsonc missing');
  assert.equal(merged.provider.freellmapi.options.baseURL, 'http://127.0.0.1:31415/v1');
});

test('config_env_credential resolves an {env:VAR} api key', () => {
  process.env.TS_TEST_LOCAL_KEY = 'local-secret-key';
  write(JSON_FILE, { provider: { freellmapi: { options: { apiKey: '{env:TS_TEST_LOCAL_KEY}' } } } });
  assert.equal(config.config_env_credential('freellmapi'), 'local-secret-key');
});

test('config_env_credential returns empty for a provider with no usable key', () => {
  write(JSON_FILE, { provider: { freellmapi: { options: {} } } });
  assert.equal(config.config_env_credential('freellmapi'), '');
});

test('rotate_backup names the backup after the file it copied', () => {
  clearBackups();
  write(JSONC_FILE, { provider: {} });
  config.rotate_backup(JSON_FILE);
  const made = fs.readdirSync(cfgDir).filter((n) => n.startsWith('opencode.json.') && n.endsWith('.backup'));
  assert.equal(made.length, 1, `expected 1 backup, got ${made.join(', ')}`);
});

test('find_original_provider_base_url ignores the proxy address', () => {
  // The local router's real upstream is itself a loopback address, so only the
  // proxy's own port tells the two apart. With no history to recover from, the
  // live file is all there is, and it names only the proxy.
  clearBackups();
  write(JSON_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:31415/v1' } } } });
  assert.equal(config.find_original_provider_base_url('freellmapi', 8199), 'http://127.0.0.1:31415/v1');

  write(JSON_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:8199/p/freellmapi/v1' } } } });
  assert.equal(config.find_original_provider_base_url('freellmapi', 8199), '');
});

test('find_original_provider_base_url recovers from a rotated backup', () => {
  clearBackups();
  write(JSON_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:31415/v1' } } } });
  config.rotate_backup(JSON_FILE);
  // The live file is now the proxied one, exactly as an interrupted run leaves it.
  write(JSON_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:8199/p/freellmapi/v1' } } } });
  assert.equal(config.find_original_provider_base_url('freellmapi', 8199), 'http://127.0.0.1:31415/v1');
});

test('find_original_provider_base_url finds the upstream in a sibling config file', () => {
  clearBackups();
  fs.rmSync(JSONC_FILE, { force: true });
  write(JSON_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:31415/v1' } } } });
  write(JSONC_FILE, { provider: { freellmapi: { options: { baseURL: 'http://127.0.0.1:8199/p/freellmapi/v1' } } } });
  assert.equal(config.find_original_provider_base_url('freellmapi', 8199), 'http://127.0.0.1:31415/v1');
});

test('a commented config keeps its comments when it is pointed at the proxy', () => {
  // The regression this prevents is silent: the file still parses, the proxy
  // still works, and the user's notes are simply gone after the next start.
  clearBackups();
  fs.rmSync(JSON_FILE, { force: true });
  const commented = [
    '{',
    '  // my local router, do not touch the port',
    '  "provider": {',
    '    /* upstream moved in March */',
    '    "freellmapi": {',
    '      "options": {',
    '        "apiKey": "{env:FREELLMAPI_API_KEY}",',
    '        // keep an eye on the timeout',
    '        "timeout": 300000,',
    '        "baseURL": "http://127.0.0.1:31415/v1"',
    '      }',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(JSONC_FILE, commented, 'utf-8');

  const changed = config.set_provider_base_urls('http://127.0.0.1:8199', ['freellmapi']);
  assert.deepEqual(changed, ['freellmapi']);

  const after = fs.readFileSync(JSONC_FILE, 'utf-8');
  assert.match(after, /\/\/ my local router, do not touch the port/);
  assert.match(after, /\/\* upstream moved in March \*\//);
  assert.match(after, /\/\/ keep an eye on the timeout/);
  assert.match(after, /"apiKey": "\{env:FREELLMAPI_API_KEY\}"/);
  assert.match(after, /"timeout": 300000/);
  assert.match(after, /"baseURL": "http:\/\/127\.0\.0\.1:8199\/p\/freellmapi\/v1"/);
  // Still the user's file, not ours: exactly one line differs, and it is the URL.
  const before = commented.split('\n');
  const differing = before.map((line, i) => (after.split('\n')[i] === line ? -1 : i)).filter((i) => i >= 0);
  assert.deepEqual(differing, [9], `only the baseURL line should change, changed ${differing.join(', ')}`);
});

test('restoring a commented config leaves the comments in place', () => {
  clearBackups();
  const commented = [
    '{',
    '  // proxy is temporary',
    '  "provider": {',
    '    "freellmapi": {',
    '      "options": {',
    '        "baseURL": "http://127.0.0.1:8199/p/freellmapi/v1"',
    '      }',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(JSONC_FILE, commented, 'utf-8');

  const changed = config.restore_provider_base_urls({ freellmapi: 'http://127.0.0.1:31415/v1' });
  assert.deepEqual(changed, ['freellmapi']);

  const after = fs.readFileSync(JSONC_FILE, 'utf-8');
  assert.match(after, /\/\/ proxy is temporary/);
  assert.match(after, /"baseURL": "http:\/\/127\.0\.0\.1:31415\/v1"/);
});

test('a baseURL is added to a provider that has no options yet', () => {
  clearBackups();
  fs.rmSync(JSON_FILE, { force: true });
  fs.writeFileSync(JSONC_FILE, '{\n  // bare provider\n  "provider": {\n    "fresh": {}\n  }\n}\n', 'utf-8');

  const changed = config.set_provider_base_urls('http://127.0.0.1:8199', ['fresh']);
  assert.deepEqual(changed, ['fresh']);

  const after = fs.readFileSync(JSONC_FILE, 'utf-8');
  assert.match(after, /\/\/ bare provider/);
  const parsed = JSON.parse(after.replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(parsed.provider.fresh.options.baseURL, 'http://127.0.0.1:8199/p/fresh/v1');
});

test('a config that cannot be edited is left alone rather than rewritten', () => {
  // Refusing is the whole point: the only alternative to a splice is a
  // parse/stringify round trip, and that is what eats the comments.
  clearBackups();
  fs.rmSync(JSON_FILE, { force: true });
  const broken = '{ "provider": { "freellmapi": { "options": { "baseURL": "http://x/v1" \n';
  fs.writeFileSync(JSONC_FILE, broken, 'utf-8');

  const changed = config.set_provider_base_urls('http://127.0.0.1:8199', ['freellmapi']);
  assert.deepEqual(changed, []);
  assert.equal(fs.readFileSync(JSONC_FILE, 'utf-8'), broken);
});

test('switching models keeps every other setting in the config', () => {
  // write_config runs on every model switch (CLI, models page, insights). It used
  // to write a document built from {model, small_model, compaction, provider},
  // which silently deleted theme, agent, permission, mcp and every comment the
  // user had in there.
  clearBackups();
  fs.rmSync(JSON_FILE, { force: true });
  const original = [
    '{',
    '  // my settings, keep them',
    '  "theme": "tokyonight",',
    '  "model": "openai/gpt-4o",',
    '  "permission": { "edit": "ask" },',
    '  "provider": {',
    '    "openai": {',
    '      "options": {',
    '        "apiKey": "{env:OPENAI_API_KEY}"',
    '      }',
    '    }',
    '  }',
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(JSONC_FILE, original, 'utf-8');

  config.write_config('anthropic/claude-sonnet-4', 'openai/gpt-4o-mini');

  const after = fs.readFileSync(JSONC_FILE, 'utf-8');
  assert.match(after, /\/\/ my settings, keep them/);
  const parsed = JSON.parse(after.replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(parsed.theme, 'tokyonight', 'unrelated settings must survive a model switch');
  assert.deepEqual(parsed.permission, { edit: 'ask' });
  assert.equal(parsed.model, 'anthropic/claude-sonnet-4');
  assert.equal(parsed.small_model, 'openai/gpt-4o-mini');
  assert.deepEqual(parsed.compaction, { auto: true, prune: true, reserved: 10000 });
  assert.equal(parsed.provider.openai.options.apiKey, '{env:OPENAI_API_KEY}');
  assert.equal(parsed.provider.openai.options.timeout, 300000, 'timeouts are still filled in');
  assert.equal(parsed.provider.openai.options.chunkTimeout, 60000);
  assert.ok(!('baseURL' in parsed.provider.openai.options), 'a model switch must not invent an upstream');
});

test('write_config creates a valid file when there is none', () => {
  clearBackups();
  fs.rmSync(JSON_FILE, { force: true });
  fs.rmSync(JSONC_FILE, { force: true });

  config.write_config('openai/gpt-4o', '');

  const parsed = JSON.parse(fs.readFileSync(JSONC_FILE, 'utf-8'));
  assert.equal(parsed.model, 'openai/gpt-4o');
  assert.equal(parsed.small_model, '');
  assert.deepEqual(parsed.compaction, { auto: true, prune: true, reserved: 10000 });
});

test('a provider id is found whatever its case or separator spelling', () => {
  // Provider ids reach the proxy from three places that disagree on spelling
  // (`MyLocal` in the config, `mylocal` in the catalog, the `/p/<id>/` path), and
  // a lookup that misses leaves the proxy with no upstream to send to. Only case
  // and `-`/`_` are bridged: a camelCase id cannot be guessed to be a snake_case
  // one, so `MyLocal` and `my_local` stay distinct.
  const camel = { MyLocal: { options: { baseURL: 'http://127.0.0.1:31415/v1' } } };
  assert.deepEqual(config.provider_entry(camel, 'mylocal'), camel.MyLocal);
  assert.deepEqual(config.provider_entry(camel, 'MYLOCAL'), camel.MyLocal);
  assert.equal(config.provider_entry(camel, 'my_local'), undefined);
  assert.equal(config.provider_entry(camel, 'other'), undefined);
  assert.equal(config.provider_key_in(camel, 'mylocal'), 'MyLocal');

  const kebab = { 'my-local': { options: { baseURL: 'http://127.0.0.1:31415/v1' } } };
  assert.deepEqual(config.provider_entry(kebab, 'my_local'), kebab['my-local']);
  assert.deepEqual(config.provider_entry(kebab, 'My-Local'), kebab['my-local']);
  assert.equal(config.provider_key_in(kebab, 'my_local'), 'my-local');

  clearBackups();
  fs.rmSync(JSON_FILE, { force: true });
  write(JSONC_FILE, { provider: { MyLocal: { options: { baseURL: 'http://127.0.0.1:31415/v1' } } } });
  const changed = config.set_provider_base_urls('http://127.0.0.1:8199', ['mylocal']);
  assert.deepEqual(changed, ['mylocal']);
  // The path carries the config's own spelling, and the key order is untouched.
  const after = JSON.parse(fs.readFileSync(JSONC_FILE, 'utf-8'));
  assert.equal(after.provider.MyLocal.options.baseURL, 'http://127.0.0.1:8199/p/MyLocal/v1');
});
