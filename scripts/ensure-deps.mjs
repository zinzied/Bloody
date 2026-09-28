#!/usr/bin/env node
/**
 * `npm run dev` spawns `tsx` out of ./node_modules/.bin, so a clone that was
 * never installed dies with "'tsx' is not recognized as an internal or external
 * command" before a line of app code runs. Every entry point runs this first:
 * a few existsSync calls when the tree is already there, an install when it is
 * not — a fresh clone works on any machine that has Node and network access.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'node_modules');

/** Needed by at least one script here; `tsx` is the binary dev/start/test spawn. */
const REQUIRED = ['tsx', 'typescript', 'ink', 'react', 'ink-text-input', 'js-tiktoken', '@types/node'];
/** Native, so genuinely optional: the app falls back to the built-in node:sqlite. */
const NATIVE = ['better-sqlite3'];

function absent(names) {
  return names.filter((name) => !fs.existsSync(path.join(MODULES, name)));
}

function npm(args) {
  // npm_execpath is npm's own JS entry point while a script is running, so the
  // install does not depend on npm being resolvable on PATH from here.
  const execpath = process.env.npm_execpath;
  const shell = process.platform === 'win32';
  const result = execpath
    ? spawnSync(process.execPath, [execpath, ...args], { cwd: ROOT, stdio: 'inherit' })
    : spawnSync(shell ? 'npm.cmd' : 'npm', args, { cwd: ROOT, stdio: 'inherit', shell });
  return result.status === 0;
}

function hasTree() {
  try {
    return fs.readdirSync(MODULES).length > 0;
  } catch {
    return false;
  }
}

const missing = absent(REQUIRED);
if (!missing.length) process.exit(0);

if ((process.env.NOBLEED_SKIP_DEP_CHECK ?? process.env.TOKENSAVER_SKIP_DEP_CHECK) === '1') {
  console.error(`[deps] missing ${missing.join(', ')} and NOBLEED_SKIP_DEP_CHECK=1 is set`);
  process.exit(1);
}

console.error(`[deps] missing ${missing.join(', ')} — installing (one time, needs network access)`);

// A lockfile with an empty node_modules is exactly the fresh-clone case, where
// `npm ci` gives the versions CI tests. Anything else is a partial tree, which
// `npm ci` would delete and rebuild from scratch, so plain `install` is right.
const action = fs.existsSync(path.join(ROOT, 'package-lock.json')) && !hasTree() ? 'ci' : 'install';
const flags = ['--no-audit', '--no-fund'];

let ok = npm([action, ...flags]);
if (!ok) {
  // A native module with no C++ toolchain takes the whole install down with it.
  // better-sqlite3 is optional for exactly that reason — retry without the
  // optional dependencies so the TUI still runs on node:sqlite.
  console.error('[deps] install failed — retrying without optional (native) dependencies');
  ok = npm(['install', '--omit=optional', ...flags]);
}

const stillMissing = absent(REQUIRED);
if (!ok || stillMissing.length) {
  console.error(`[deps] could not install ${stillMissing.join(', ') || 'the dependencies'}.`);
  console.error('[deps] check the network/proxy, then run: npm install');
  process.exit(1);
}

const native = absent(NATIVE);
if (native.length) {
  console.error(`[deps] ${native.join(', ')} not installed — using the SQLite built into Node instead.`);
}
console.error('[deps] dependencies ready');
