// Control API + WebSocket event bus for the desktop app.
// Mounted at /api/* on the existing proxy http.Server (strictly 127.0.0.1).
// Token auth via X-Token-Saver header. File-based handshake via control.json.

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { PROXY_CONFIG, COMPRESS_DIR, ensureDir } from './config.js';
import { sha256Hex } from './utils.js';
import * as insights from './insights.js';
import * as proxy from './proxy.js';
import * as models from './models.js';
import * as budget from './budget.js';

const OPEN = 1;

// ---- Event bus ----
export const eventBus = new EventEmitter();

// Topic constants
export const EVENT_TOPICS = {
  budgetExceeded: 'budget.exceeded',
  providerRatelimited: 'provider.ratelimited',
  proxyRequest: 'proxy.request',
  proxyStopped: 'proxy.stopped',
} as const;

type EventTopic = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];

// ---- Token auth ----
let controlToken: string | null = null;
let controlPort: number | null = null;

export function getControlToken(): string | null {
  return controlToken;
}

export function setControlToken(token: string, port: number) {
  controlToken = token;
  controlPort = port;
}

function checkAuth(headers: http.IncomingHttpHeaders): boolean {
  if (!controlToken) return false;
  const sent = headers['x-token-saver'] as string | undefined;
  return sent === controlToken;
}

// ---- Handshake file ----
const CONTROL_FILE = path.join(COMPRESS_DIR, 'control.json');

function writeControlFile(port: number, token: string) {
  try {
    ensureDir(COMPRESS_DIR);
    fs.writeFileSync(CONTROL_FILE, JSON.stringify({ port, token }, null, 2), 'utf-8');
  } catch {}
}

function clearControlFile() {
  try {
    fs.unlinkSync(CONTROL_FILE);
  } catch {}
}

// ---- Helpers ----
function sendJson(res: http.ServerResponse, code: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// ---- API handlers ----
async function handleOverview(_req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  const data = insights.usageSummary();
  sendJson(res, 200, data);
}

async function handleQuota(_req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  const data = insights.quotaSummary();
  sendJson(res, 200, data);
}

async function handleRouting(_req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  const data = insights.routingSummary();
  sendJson(res, 200, data);
}

async function handleProviders(_req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  const data = insights.providersList();
  sendJson(res, 200, data);
}

async function handleSearch(_req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const q = url.searchParams.get('q') || '';
  const limit = Number(url.searchParams.get('limit')) || 25;
  const data = insights.searchQuery(q, limit);
  sendJson(res, 200, data);
}

async function handleCompress(req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    try {
      const { text } = JSON.parse(body);
      const data = insights.compressTest(text);
      sendJson(res, 200, data);
    } catch {
      sendJson(res, 400, { error: 'invalid body: expected { text: string }' });
    }
  });
}

async function handleSettings(req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  if (req.method === 'GET') {
    const data = insights.settingsGet();
    sendJson(res, 200, data);
  } else if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const opts = JSON.parse(body);
        const data = insights.settingsSave(opts);
        sendJson(res, 200, data);
      } catch {
        sendJson(res, 400, { error: 'invalid body' });
      }
    });
  } else {
    sendJson(res, 405, { error: 'method not allowed' });
  }
}

async function handleStatus(_req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  const data = proxy.status();
  sendJson(res, 200, data);
}

async function handleModels(_req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  const data = models.get_user_models_sync();
  sendJson(res, 200, data);
}

async function handleDoctor(_req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const fix = url.searchParams.get('fix') === 'true';
  const data = insights.doctorSummary({ fix });
  sendJson(res, 200, data);
}

async function handleBudget(_req: http.IncomingMessage, res: http.ServerResponse, _url: URL) {
  const data = budget.getBudgetStatus();
  sendJson(res, 200, data);
}

// ---- Router ----
const routeHandlers: Record<string, (req: http.IncomingMessage, res: http.ServerResponse, url: URL) => Promise<void>> = {
  '/api/overview': handleOverview,
  '/api/quota': handleQuota,
  '/api/routing': handleRouting,
  '/api/providers': handleProviders,
  '/api/search': handleSearch,
  '/api/compress': handleCompress,
  '/api/settings': handleSettings,
  '/api/status': handleStatus,
  '/api/models': handleModels,
  '/api/doctor': handleDoctor,
  '/api/budget': handleBudget,
};

export async function handleControlApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathOnly: string
): Promise<boolean> {
  const url = new URL(pathOnly, `http://127.0.0.1:${controlPort}`);

  // Check token auth for all /api/*
  if (!checkAuth(req.headers)) {
    sendJson(res, 401, { error: 'unauthorized: missing or invalid X-Token-Saver header' });
    return true;
  }

  const handler = routeHandlers[url.pathname];
  if (!handler) return false;

  try {
    await handler(req, res, url);
    return true;
  } catch (e) {
    sendJson(res, 500, { error: String((e as Error).message || e) });
    return true;
  }
}

// ---- WebSocket hub ----
let wss: WebSocketServer | null = null;

function broadcast(topic: EventTopic, payload: unknown) {
  if (!wss) return;
  const frame = JSON.stringify({ topic, ts: Date.now(), payload });
  for (const client of wss.clients) {
    if (client.readyState === OPEN) {
      client.send(frame);
    }
  }
}

// Emit helper used by proxy.ts (instrumented sites call this)
export function emitEvent(topic: EventTopic, payload: unknown) {
  eventBus.emit(topic, payload);
  broadcast(topic, payload);
}

function initWebSocket(server: http.Server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://127.0.0.1:${controlPort}`);
    if (url.pathname !== '/api/events') return;

    // Token auth on WS handshake
    const proto = req.headers['sec-websocket-protocol'] as string | undefined;
    const tokenFromProto = proto?.split(',').map(s => s.trim()).find(s => s.startsWith('token='))?.slice(6);
    const tokenFromHeader = req.headers['x-token-saver'] as string | undefined;
    const token = tokenFromProto || tokenFromHeader;

    if (token !== controlToken) {
      socket.destroy();
      return;
    }

    if (wss) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss?.emit('connection', ws, req);
      });
    }
  });

  wss?.on('connection', (ws: unknown) => {
    const wsTyped = ws as { send: (data: string) => void; on: (event: string, listener: () => void) => void };
    // Send welcome with current state snapshot
    wsTyped.send(JSON.stringify({ topic: 'hello', ts: Date.now(), payload: { ok: true } }));

    wsTyped.on('close', () => {});
    wsTyped.on('error', () => {});
  });
}

// ---- Public init ----
export function initControlApi(server: http.Server, port: number) {
  // Generate token
  const token = sha256Hex(Math.random().toString(36).slice(2) + Date.now().toString(36));
  controlToken = token;
  controlPort = port;
  writeControlFile(port, token);

  // Init WS
  initWebSocket(server);

  // Attach to event bus (also broadcasts to WS)
  eventBus.on(EVENT_TOPICS.budgetExceeded, (payload) => broadcast(EVENT_TOPICS.budgetExceeded, payload));
  eventBus.on(EVENT_TOPICS.providerRatelimited, (payload) => broadcast(EVENT_TOPICS.providerRatelimited, payload));
  eventBus.on(EVENT_TOPICS.proxyRequest, (payload) => broadcast(EVENT_TOPICS.proxyRequest, payload));
  eventBus.on(EVENT_TOPICS.proxyStopped, (payload) => broadcast(EVENT_TOPICS.proxyStopped, payload));

  // Cleanup on server close
  server.on('close', () => {
    clearControlFile();
    wss?.close();
    wss = null;
    controlToken = null;
    controlPort = null;
  });
}

export { CONTROL_FILE };