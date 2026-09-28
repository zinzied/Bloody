import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NOBLEED_* is the current spelling, TOKENSAVER_* is still read for units and
// shells that predate the rename.
const env = (name) => process.env[`NOBLEED_${name}`] ?? process.env[`TOKENSAVER_${name}`];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(env('HOME') || os.homedir(), '.config', 'opencode', 'compress');
const LOCK_PATH = path.join(STATE_DIR, 'watchdog.lock');
const LOG_PATH = path.join(STATE_DIR, 'watchdog.log');
const ENTRY = path.join(ROOT, 'dist', 'index.js');
const PORT = Number(env('PROXY_PORT') || 8199);
const HEALTH_MS = Number(env('WATCHDOG_HEALTH_MS') || 15000);
const BACKOFF_MS = [1000, 2000, 5000, 10000, 15000, 30000];

fs.mkdirSync(STATE_DIR, { recursive: true });

function log(msg) {
  const line = `${new Date().toISOString()} [watchdog] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line, 'utf-8');
  } catch {}
  process.stdout.write(line);
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function claimLock() {
  try {
    const prev = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8'));
    if (alive(prev.pid)) {
      log(`another watchdog is already running (pid ${prev.pid}) - exiting`);
      return false;
    }
  } catch {}
  try {
    fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, port: PORT, started: new Date().toISOString() }), 'utf-8');
  } catch {}
  return true;
}

function releaseLock() {
  try {
    const prev = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf-8'));
    if (prev.pid === process.pid) fs.unlinkSync(LOCK_PATH);
  } catch {}
}

function portOpen(timeout = 2000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port: PORT });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

let child = null;
let attempts = 0;
let foreignProxy = false;
let stopping = false;

function spawnProxy() {
  if (child || stopping) return;
  if (!fs.existsSync(ENTRY)) {
    log(`missing build ${ENTRY} - run "npm run build" first`);
    stopping = true;
    return;
  }
  const out = fs.openSync(LOG_PATH, 'a');
  child = spawn(process.execPath, [ENTRY, 'proxy', 'start', '--port', String(PORT)], {
    cwd: ROOT,
    detached: false,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  log(`spawned proxy pid=${child.pid} attempt=${attempts + 1}`);
  child.on('exit', (code, signal) => {
    log(`proxy exited code=${code} signal=${signal || 'none'}`);
    child = null;
  });
  child.on('error', (e) => log(`proxy spawn error: ${e.message}`));
}

async function tick() {
  if (stopping) return;
  const up = await portOpen();
  if (up) {
    foreignProxy = false;
    attempts = 0;
    if (!child) log('proxy port is serving but not ours - monitoring only');
    return;
  }
  if (child) {
    log('proxy port stopped answering - killing the wedged process');
    try {
      child.kill('SIGKILL');
    } catch {}
    child = null;
    return;
  }
  if (foreignProxy) {
    log('foreign proxy went away - taking over the port');
    foreignProxy = false;
  }
  const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
  attempts += 1;
  log(`proxy is down - restarting in ${delay}ms`);
  setTimeout(spawnProxy, delay);
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`received ${signal} - stopping`);
  if (child) {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
  releaseLock();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', releaseLock);
process.on('uncaughtException', (e) => log(`uncaught: ${e && e.message}`));
process.on('unhandledRejection', (e) => log(`unhandled: ${e && e.message}`));

if (!claimLock()) process.exit(0);

log(`watchdog up root=${ROOT} port=${PORT} health=${HEALTH_MS}ms`);
foreignProxy = await portOpen();
if (foreignProxy) log(`port ${PORT} already served by another process - supervising it`);
else spawnProxy();
setInterval(tick, HEALTH_MS);
