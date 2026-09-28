import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// The app was renamed to NoBleed. NOBLEED_* is the current env spelling and
// TOKENSAVER_* is the pre-rename one, so setups written before the rename keep
// working. This file runs in its own process, which is what lets the legacy
// value be observed by config.js at import time (BASE_HOME is computed once).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-legacy-'));
delete process.env.NOBLEED_HOME;
process.env.TOKENSAVER_HOME = TMP;

const { envValue } = await import('../src/core/utils.js');
const config = await import('../src/core/config.js');

test('envValue reads the current NOBLEED_ spelling', () => {
  process.env.NOBLEED_DEMO_FLAG = 'new';
  try {
    assert.strictEqual(envValue('DEMO_FLAG'), 'new');
  } finally {
    delete process.env.NOBLEED_DEMO_FLAG;
  }
});

test('envValue falls back to the legacy TOKENSAVER_ spelling', () => {
  process.env.TOKENSAVER_DEMO_FLAG = 'old';
  try {
    assert.strictEqual(envValue('DEMO_FLAG'), 'old');
  } finally {
    delete process.env.TOKENSAVER_DEMO_FLAG;
  }
});

test('envValue prefers NOBLEED_ when both names are set', () => {
  process.env.NOBLEED_DEMO_FLAG = 'new';
  process.env.TOKENSAVER_DEMO_FLAG = 'old';
  try {
    assert.strictEqual(envValue('DEMO_FLAG'), 'new');
  } finally {
    delete process.env.NOBLEED_DEMO_FLAG;
    delete process.env.TOKENSAVER_DEMO_FLAG;
  }
});

test('envValue returns undefined for a name that is set nowhere', () => {
  assert.strictEqual(envValue('DEFINITELY_NOT_SET_LOCALLY'), undefined);
});

test('config still honours a pre-rename TOKENSAVER_HOME', () => {
  assert.ok(
    config.CONFIG_PATH.startsWith(TMP),
    `expected ${config.CONFIG_PATH} to live under ${TMP}`
  );
  assert.ok(config.COMPRESS_DIR.startsWith(TMP));
});
