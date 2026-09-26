import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nowIso, readJson, writeJson, ensureDir } from './utils.js';
import { PROXY_CONFIG, CACHE_PATH, SAVER_POLICY_PATH, read_config, get_current_model, set_provider_base_urls, restore_provider_base_urls } from './config.js';
import { readCatalogCache, get_user_models_sync, model_total_cost } from './models.js';
import * as rtk from './filters/rtk.js';
import * as routing from './routing.js';
import { QuotaTracker, parse_rate_limit_headers } from './quota.js';
import * as index from './index.js';
import * as tokens from './tokens.js';
import * as budget from './budget.js';
import * as prompts from './prompts.js';
import { initControlApi, emitEvent, EVENT_TOPICS, handleControlApi } from './control-api.js';
import type { AppliedStyle, CompressStats, ProxyConfig, ProxyStatus, RequestBody } from './types.js';

export const DEFAULT_PORT = 8199;

export const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  cohere: 'https://api.cohere.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  xai: 'https://api.x.ai/v1',
  perplexity: 'https://api.perplexity.ai',
  deepinfra: 'https://api.deepinfra.com/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  cerebras: 'https://api.cerebras.ai/public/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  huggingface: 'https://api-inference.huggingface.co/v1',
  venice: 'https://api.venice.ai/api/v1',
  zenmux: 'https://zenmux.ai/api/v1',
  ollama: 'https://ollama.com/api',
  opencode: 'https://opencode.ai/zen/v1',
  opencode_go: 'https://opencode.ai/zen/v1',
  zai: 'https://api.z.ai/api/paas/v4',
  iflowcn: 'https://apis.iflow.cn/v1',
  anyapi: 'https://api.anyapi.ai/v1',
  llama: 'https://llama.developer.meta.com/api/v1',
  alibaba: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  kimi: 'https://api.moonshot.cn/v1',
  aihubmix: 'https://aihubmix.com/v1',
  vertex: 'https://us-central1-aiplatform.googleapis.com/v1',
  github: 'https://models.github.ai/inference',
  github_models: 'https://models.github.ai/inference',
  novita: 'https://api.novita.ai/v3/openai',
  sambanova: 'https://api.sambanova.ai/v1',
  replicate: 'https://api.replicate.com/v1',
  kiro: 'https://api.kiro.ai/v1',
  iflow: 'https://api.iflow.ai/v1',
  nano_gpt: 'https://nano-gpt.com/api/v1',
  claudinio: 'https://claudinio.com/api',
  nara: 'https://api.nara.ai/v1',
  llmgateway: 'https://llm-gateway.com/v1',
};

const HOP_BY_HOP = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'upgrade',
  'accept-encoding',
]);

const PREFER_HEADERS = new Set([
  'content-type',
  'authorization',
  'x-api-key',
  'api-key',
  'user-agent',
  'accept',
  'anthropic-version',
  'anthropic-beta',
  'openai-organization',
  'openai-project',
  'x-title',
  'http-referer',
]);

// The `x-*` allow-rule below forwards every extension header, which would hand
// this project's own control-plane credential to the LLM provider.
const STRIP_HEADERS = new Set(['x-token-saver']);

// Every header that can carry a credential, so a swap can clear all of them
// before writing the replacement. Leaving a stale one behind is what makes an
// upstream answer "invalid api key" after a reroute.
const CREDENTIAL_HEADERS = ['authorization', 'x-api-key', 'api-key'];

// Upstreams that authenticate with a raw key header instead of a bearer token.
// Sending `Authorization: Bearer` to these is rejected as an invalid key.
const RAW_KEY_HEADER_PROVIDERS = new Set(['anthropic', 'claudinio']);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let _server: http.Server | null = null;
let _port = DEFAULT_PORT;
const _metrics: {
  requestsServed: number;
  totalSavedBytes: number;
  hits: number;
  styleApplied: number;
  styleEscalated: number;
  lastModel: string;
  lastAccount: string;
  startedAt: string | null;
} = {
  requestsServed: 0,
  totalSavedBytes: 0,
  hits: 0,
  styleApplied: 0,
  styleEscalated: 0,
  lastModel: '',
  lastAccount: '',
  startedAt: null,
};

// ---------------------------------------------------------------------------
// Output style: ALWAYS ON while the proxy runs (terse-output prompt), unless
// TOKENSAVER_OUTPUT_STYLE=off or proxy.json says "output_style": "off".
// Output tokens are the expensive ones, so this runs on every chat request.
// ---------------------------------------------------------------------------
let _outputStyle: prompts.OutputStyleSetting = prompts.resolveOutputStyle(process.env.TOKENSAVER_OUTPUT_STYLE);
let _styleLogged = false;
// Context-aware escalation: step the level up as the request's own context grows.
let _styleEscalate = true;
let _styleEscalateAt: number[] = [...prompts.DEFAULT_ESCALATE_AT];
let _settingsLoaded = false;

export function outputStyle(): prompts.OutputStyleSetting {
  ensureSettingsLoaded();
  return _outputStyle;
}

/** Whether the level steps up with context size, and at which sizes. */
export function outputStyleEscalation(): { enabled: boolean; at: number[] } {
  ensureSettingsLoaded();
  return { enabled: _styleEscalate, at: [..._styleEscalateAt] };
}

function _truthyFlag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['0', 'off', 'false', 'no', 'disabled'].includes(v)) return false;
  return true;
}

/** Re-read the escalation policy from env then proxy.json. */
function loadStyleEscalation(cfg?: ProxyConfig): void {
  const c = cfg ?? loadConfig();
  const env = process.env.TOKENSAVER_OUTPUT_STYLE_ESCALATE;
  const envAt = process.env.TOKENSAVER_OUTPUT_STYLE_ESCALATE_AT;
  _styleEscalate = _truthyFlag(env !== undefined ? env : c.output_style_escalate, true);
  _styleEscalateAt = prompts.resolveEscalateAt(
    envAt !== undefined && envAt !== '' ? envAt : c.output_style_escalate_at
  );
}

/**
 * Resolve and activate an output style. `value === null/undefined` re-reads the
 * env var, then proxy.json, then falls back to the always-on default.
 */
export function setOutputStyle(value?: string | null): prompts.OutputStyleSetting {
  let wanted = value;
  if (wanted === undefined || wanted === null || wanted === '') {
    wanted = process.env.TOKENSAVER_OUTPUT_STYLE || (loadConfig().output_style ?? null);
  }
  _outputStyle = prompts.resolveOutputStyle(wanted);
  loadStyleEscalation();
  return _outputStyle;
}

/**
 * Read the active settings from proxy.json exactly once.
 *
 * Both accessors are used by read-only commands (`proxy style`, `/api/style`)
 * that never go through setOutputStyle(), so without this they would report the
 * built-in defaults and silently ignore what the user actually saved.
 */
function ensureSettingsLoaded(): void {
  if (_settingsLoaded) return;
  _settingsLoaded = true;
  const cfg = loadConfig();
  if (!_outputStyle || _outputStyle.style === 'caveman') {
    const wanted = process.env.TOKENSAVER_OUTPUT_STYLE || cfg.output_style;
    if (wanted) _outputStyle = prompts.resolveOutputStyle(wanted);
  }
  loadStyleEscalation(cfg);
}

/** Turn escalation on/off and optionally set the thresholds. Persisted by callers. */
export function setOutputStyleEscalation(
  enabled?: boolean,
  at?: Array<number | string> | null
): { enabled: boolean; at: number[] } {
  const cfg = loadConfig();
  if (enabled !== undefined) _styleEscalate = !!enabled;
  else _styleEscalate = _truthyFlag(process.env.TOKENSAVER_OUTPUT_STYLE_ESCALATE, cfg.output_style_escalate ?? true);
  if (at && at.length) _styleEscalateAt = prompts.resolveEscalateAt(at);
  else _styleEscalateAt = prompts.resolveEscalateAt(cfg.output_style_escalate_at);
  return { enabled: _styleEscalate, at: [..._styleEscalateAt] };
}

/** Chat/completion endpoints only — never touch embeddings, models or audio calls. */
export function styleEligible(pathOnly: string, body: RequestBody | null | undefined): boolean {
  if (!body || typeof body !== 'object') return false;
  const p = canonicalEndpoint(pathOnly || '');
  const chatish =
    p === '/chat/completions' ||
    p === '/responses' ||
    p === '/messages' ||
    p === '/completions' ||
    /:generatecontent$/i.test(pathOnly || '') ||
    /\/messages$/i.test(pathOnly || '');
  if (!chatish) return false;

  if (typeof body.system === 'string' || Array.isArray(body.system)) return true;
  if (typeof body.instructions === 'string') return true;
  if (body.system_instruction || body.systemInstruction) return true;
  const req = body.request;
  if (req && typeof req === 'object' && ((req as Record<string, unknown>).contents || (req as Record<string, unknown>).content)) return true;
  // OpenAI / Anthropic style message arrays must hold objects (never string arrays,
  // which is what an embeddings payload looks like).
  const arr = Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : null;
  if (!arr || arr.length === 0) return false;
  return typeof arr[0] === 'object' && arr[0] !== null;
}

/**
 * Inject the always-on output style, escalating the level when the request's own
 * context is already large. Returns what was actually injected, or null.
 */
function applyAlwaysOnStyle(pathOnly: string, body: RequestBody | null | undefined): AppliedStyle | null {
  if (!_outputStyle || _outputStyle.style === 'off') return null;
  if (!styleEligible(pathOnly, body)) return null;
  try {
    // Measure the request BEFORE injecting, so the level tracks the real context
    // the model is already carrying and not our own prompt.
    let contextTokens = 0;
    try {
      contextTokens = tokens.estimate_request_tokens_accurate(body as never);
    } catch {}
    const effective = _styleEscalate
      ? prompts.escalateOutputStyle(_outputStyle, contextTokens, _styleEscalateAt)
      : _outputStyle;
    const applied = prompts.apply_output_style(body as RequestBody, effective);
    if (applied) {
      if (!_styleLogged) {
        _styleLogged = true;
        const ladder = prompts.styleLadder(_outputStyle);
        const top = ladder ? ladder[ladder.length - 1] : null;
        const escalation =
          _styleEscalate && top && top !== _outputStyle.level
            ? ` → up to ${_outputStyle.style}-${top} past ${_styleEscalateAt.join('/')} tok`
            : '';
        console.log(
          `[style] output style ON: ${_outputStyle.label}${escalation} (set TOKENSAVER_OUTPUT_STYLE=off to disable)`
        );
      }
      return {
        label: effective.label,
        base: _outputStyle.label,
        tokens: tokens.count_tokens(effective.prompt) + tokens.BLOCK_OVERHEAD,
        escalated: effective.label !== _outputStyle.label,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const accountManager = new routing.AccountManager();
export const quotaTracker = new QuotaTracker();

let _limitPromptedDate: string | null = null;

/**
 * Ask the user to answer a reached daily limit.
 * Emitted at most once per day, and — crucially — it never blocks or reroutes the
 * request: the caller keeps forwarding to the configured model until the user
 * explicitly chooses "stay blocked".
 */
export function promptDailyLimitChoice(): void {
  try {
    const status = budget.getBudgetStatus();
    if (!status.limitReached || status.decision) return;
    if (_limitPromptedDate === status.daily.date) return;
    _limitPromptedDate = status.daily.date;
    const message = `${status.reason || 'Daily limit reached'} — choose "reset" to keep using your configured model, or "blocked" to keep the free-model guard for today.`;
    console.log(`[limit] ${message}`);
    emitEvent(EVENT_TOPICS.dailyLimitReached, {
      reason: status.reason,
      message,
      choices: ['reset', 'blocked'],
      spentTokens: status.spentTokens,
      freeDailyTokenLimit: status.policy.free_daily_token_limit,
      dailyBudgetUSD: status.policy.daily_budget_usd,
      decision: null,
    });
  } catch {}
}

/** Reset today's counters after the user picked "reset". */
export function resetDailyLimit(): void {
  budget.setLimitDecision('reset');
  _limitPromptedDate = null;
}

/** The user picked "stay blocked" — opt in to the guard for today. */
export function blockDailyLimit(): void {
  budget.setLimitDecision('blocked');
}

export function loadConfig(): ProxyConfig {
  return readJson<ProxyConfig>(PROXY_CONFIG, null) || {};
}

export function saveConfig(cfg: ProxyConfig): void {
  writeJson(PROXY_CONFIG, cfg);
}

export function normalizeProviderId(pid: string): string {
  return String(pid || '').trim().toLowerCase().replace(/-/g, '_');
}

/**
 * The same provider is spelled differently depending on where the id came from:
 * the `opencode` block in opencode.jsonc, the auth store (`opencode-go`) and
 * the models.dev catalog (`opencode_go`). Credential and base-URL lookups try
 * every spelling, otherwise a key saved under one name is invisible from another.
 */
export function providerIdAliases(pid: string): string[] {
  const id = String(pid || '').trim().toLowerCase();
  if (!id) return [];
  const out = [id];
  for (const candidate of [id.replace(/-/g, '_'), id.replace(/_/g, '-')]) {
    if (!out.includes(candidate)) out.push(candidate);
  }
  // `opencode` and `opencode_go` are both OpenCode Zen.
  if (id === 'opencode' || id === 'opencode_go' || id === 'opencode-go') {
    for (const candidate of ['opencode', 'opencode_go', 'opencode-go']) {
      if (!out.includes(candidate)) out.push(candidate);
    }
  }
  return out;
}

function lookupByProvider<T>(record: Record<string, T> | null | undefined, pid: string): T | undefined {
  if (!record || !pid) return undefined;
  for (const alias of providerIdAliases(pid)) {
    const v = record[alias];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export function providerBaseUrl(pid: string): string {
  if (!pid) return '';
  const cfg = loadConfig();
  const saved = lookupByProvider<string>(cfg.saved_base_urls, pid) || lookupByProvider<string>(cfg.upstreams, pid);
  if (saved) return String(saved).replace(/\/+$/, '');
  // Honour <PROVIDER>_BASE_URL for every provider, not just openai. Without this
  // a key minted for a custom gateway is sent to the hardcoded public upstream,
  // which answers "invalid api key".
  for (const alias of providerIdAliases(pid)) {
    const envBase = process.env[`${alias.toUpperCase().replace(/-/g, '_')}_BASE_URL`];
    if (envBase && String(envBase).trim()) return String(envBase).trim().replace(/\/+$/, '');
  }
  for (const alias of providerIdAliases(pid)) {
    const known = PROVIDER_BASE_URLS[alias];
    if (known) return known;
  }
  return '';
}

export function modelProvider(modelId: string): string {
  if (!modelId) return '';
  const m = String(modelId).trim();
  if (!m) return '';
  const first = m.split('/')[0];
  return first || '';
}

export function canonicalEndpoint(pathOnly: string): string {
  if (!pathOnly) return '';
  if (pathOnly.endsWith('/chat/completions')) return '/chat/completions';
  if (pathOnly.endsWith('/responses')) return '/responses';
  if (pathOnly.endsWith('/messages')) return '/messages';
  if (pathOnly.endsWith('/models')) return '/models';
  return pathOnly;
}

function isSelfUrl(url: string): boolean {
  const port = _port || loadConfig().port || DEFAULT_PORT;
  return new RegExp(`127\\.0\\.0\\.1:${port}|localhost:${port}`).test(url || '');
}

function authFilePaths(): string[] {
  const home = process.env.TOKENSAVER_HOME || os.homedir();
  return [
    path.join(home, '.local', 'share', 'opencode', 'auth.json'),
    path.join(home, '.config', 'opencode', 'auth.json'),
  ];
}

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  zai: ['ZAI_API_KEY', 'Z_AI_API_KEY', 'ZHIPU_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  deepseek: ['DEEPSEEK_API_KEY'],
  groq: ['GROQ_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY'],
  siliconflow: ['SILICONFLOW_API_KEY'],
  opencode: ['OPENCODE_ZEN_API_KEY', 'OPENCODE_API_KEY'],
  opencode_go: ['OPENCODE_ZEN_API_KEY', 'OPENCODE_API_KEY', 'OPENCODE_GO_API_KEY'],
};

/**
 * Best local credential for a provider: explicit env var first, then OpenCode's
 * auth store. Returns '' when nothing usable is on disk so callers can fall back
 * to passing the client's own credential through untouched.
 */
function apiKeyForProvider(pid: string): string {
  if (!pid) return '';
  const aliases = providerIdAliases(pid);
  for (const alias of aliases) {
    for (const envName of PROVIDER_ENV_KEYS[alias] || []) {
      const v = process.env[envName];
      if (v && v.trim()) return v.trim();
    }
  }
  for (const file of authFilePaths()) {
    let auth: Record<string, any>;
    try {
      auth = readJson<Record<string, any>>(file, {}) || {};
    } catch {
      continue;
    }
    for (const alias of aliases) {
      const entry = auth[alias];
      if (!entry || typeof entry !== 'object') continue;
      // OAuth entries hold an access/refresh token, not a provider API key.
      // Presenting one of those as a bearer credential is a guaranteed 401.
      if (entry.type && entry.type !== 'api') continue;
      const key = entry.api?.key ?? entry.key;
      if (key && String(key).trim()) return String(key).trim();
    }
  }
  return '';
}

/** The credential the client put on the request, if any. */
function clientCredential(headers: http.IncomingHttpHeaders): string {
  for (const name of CREDENTIAL_HEADERS) {
    const raw = headers[name];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function usesRawKeyHeader(pid: string): boolean {
  return RAW_KEY_HEADER_PROVIDERS.has(normalizeProviderId(pid));
}

/**
 * Replace whatever credential the client sent with `key`, written in the style
 * the upstream expects. Clearing first matters: a leftover key belonging to the
 * provider we rerouted away from is exactly what upstream calls invalid.
 */
function applyCredential(headers: Record<string, string>, provider: string, key: string): void {
  for (const name of Object.keys(headers)) {
    if (CREDENTIAL_HEADERS.includes(name.toLowerCase())) delete headers[name];
  }
  if (usesRawKeyHeader(provider)) headers['x-api-key'] = key;
  else headers['Authorization'] = `Bearer ${key}`;
}

function fallbackModelForProvider(pid: string): string {
  try {
    const cfg = read_config();
    const small = cfg && cfg.small_model ? String(cfg.small_model) : '';
    if (small && small.split('/')[0] === pid) return small.split('/').slice(1).join('/');
  } catch {}
  try {
    const catalog = get_user_models_sync();
    const group = Object.values(catalog).find((g) => g.id === pid);
    if (group) {
      let bestId = '';
      let bestCost = Infinity;
      for (const m of group.models) {
        if (!m.modalities.input.includes('text') || !m.modalities.output.includes('text')) continue;
        const c = model_total_cost(m);
        if (Number.isFinite(c)) {
          if (c < bestCost) {
            bestCost = c;
            bestId = m.id;
          }
        } else if (!bestId) {
          bestId = m.id;
        }
      }
      if (bestId) return bestId.split('/').slice(1).join('/');
    }
  } catch {}
  return '';
}

export function pickHealthyFallback(excludeProvider: string): string | null {
  const current = get_current_model();
  const curPid = current ? current.split('/')[0] : '';
  if (curPid && curPid !== excludeProvider && !quotaTracker.is_rate_limited(curPid)) {
    const curBase = providerBaseUrl(curPid);
    if (curBase && !isSelfUrl(curBase) && apiKeyForProvider(curPid)) return current;
  }
  const authed: string[] = [];
  for (const file of authFilePaths()) {
    let auth: Record<string, any>;
    try {
      auth = readJson<Record<string, any>>(file, {}) || {};
    } catch {
      continue;
    }
    for (const pid of Object.keys(auth)) {
      if (pid === excludeProvider || pid === curPid) continue;
      if (authed.includes(pid)) continue;
      authed.push(pid);
    }
  }
  for (const pid of authed) {
    if (quotaTracker.is_rate_limited(pid)) continue;
    const base = providerBaseUrl(pid);
    if (!base || isSelfUrl(base)) continue;
    if (!apiKeyForProvider(pid)) continue;
    const mid = fallbackModelForProvider(pid);
    if (mid) return `${pid}/${mid}`;
  }
  const policy = readJson<any>(SAVER_POLICY_PATH, {}) || {};
  const rec = policy.last_recommendation || {};
  const candidates: string[] = [rec.small_model, rec.main_model, ...(Array.isArray(rec.fallbacks) ? rec.fallbacks : [])];
  for (const c of candidates) {
    if (!c || typeof c !== 'string' || !c.includes('/')) continue;
    const pid = c.split('/')[0];
    if (pid === excludeProvider) continue;
    if (!providerBaseUrl(pid)) continue;
    if (quotaTracker.is_rate_limited(pid)) continue;
    if (!apiKeyForProvider(pid)) continue;
    return c;
  }
  return null;
}

export function defaultUpstream(): { pid: string; base: string } {  const cfg = loadConfig();
  const candidates: string[] = [];
  for (const pid of cfg.proxied_providers || []) candidates.push(pid);
  for (const pid of Object.keys(cfg.saved_base_urls || {})) candidates.push(pid);
  for (const pid of Object.keys(cfg.upstreams || {})) candidates.push(pid);
  for (const pid of [...new Set(candidates)]) {
    const base = providerBaseUrl(pid);
    if (base && !isSelfUrl(base)) return { pid, base };
  }
  const envBase = process.env.OPENAI_BASE_URL;
  if (envBase) return { pid: 'openai', base: String(envBase).replace(/\/+$/, '') };
  return { pid: 'openai', base: PROVIDER_BASE_URLS.openai };
}

let _modelProviderCache: Record<string, string[]> | null = null;
let _modelProviderCacheMtime = 0;

function modelToProviders(): Record<string, string[]> {
  let mtime = 0;
  try {
    mtime = fs.statSync(CACHE_PATH).mtimeMs;
  } catch {}
  if (_modelProviderCache && mtime === _modelProviderCacheMtime) return _modelProviderCache;
  const map: Record<string, string[]> = {};
  try {
    const catalog = readCatalogCache();
    if (catalog) {
      for (const [pid, pdata] of Object.entries(catalog)) {
        if (!pdata || typeof pdata !== 'object') continue;
        const models = (pdata as Record<string, any>).models || {};
        if (typeof models === 'object') {
          for (const mid of Object.keys(models)) {
            (map[mid] = map[mid] || []).push(pid);
          }
        }
      }
    }
  } catch {}
  _modelProviderCache = map;
  _modelProviderCacheMtime = mtime;
  return map;
}

export function catalogProviderForModel(modelId: string): string {
  if (!modelId) return '';
  const providers = modelToProviders()[modelId];
  if (!providers || !providers.length) return '';
  const cfg = loadConfig();
  const proxied = new Set(cfg.proxied_providers || []);
  const candidates = [...providers];
  const routed = candidates.filter((p) => {
    const base = providerBaseUrl(p);
    return base && !isSelfUrl(base) && (proxied.has(p) || (cfg.saved_base_urls?.[p] ?? cfg.upstreams?.[p]));
  });
  const pool = routed.length ? routed : candidates.filter((p) => {
    const base = providerBaseUrl(p);
    return base && !isSelfUrl(base);
  });
  if (!pool.length) return '';
  const curPid = modelProvider(get_current_model());
  if (curPid && pool.includes(curPid)) return curPid;
  return pool[0];
}

export function resolveUpstream(modelId: string, pathOnly: string): { pid: string; url: string } {
  const pid = modelProvider(modelId);
  const base = pid ? providerBaseUrl(pid) : '';
  if (base && !isSelfUrl(base)) return { pid, url: base + canonicalEndpoint(pathOnly) };
  if (pid && !base) {
    const catalogPid = catalogProviderForModel(modelId);
    const catBase = catalogPid ? providerBaseUrl(catalogPid) : '';
    if (catalogPid && catBase && !isSelfUrl(catBase)) {
      return { pid: catalogPid, url: catBase + canonicalEndpoint(pathOnly) };
    }
  }
  const def = defaultUpstream();
  return { pid: def.pid, url: def.base + canonicalEndpoint(pathOnly) };
}

function pickHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!v) continue;
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    if (STRIP_HEADERS.has(lk)) continue;
    if (PREFER_HEADERS.has(lk) || lk.startsWith('x-')) out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  if (!out['Content-Type']) out['Content-Type'] = 'application/json';
  if (!out['User-Agent']) out['User-Agent'] = UA;
  if (!out['Accept']) out['Accept'] = 'text/event-stream, application/json';
  return out;
}

function respondJson(res: http.ServerResponse, code: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req: http.IncomingMessage, cb: (err: Error | null, body?: string) => void): void {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => cb(null, Buffer.concat(chunks).toString('utf-8')));
  req.on('error', (e: Error) => cb(e));
}

function streamBack(upRes: http.IncomingMessage, res: http.ServerResponse): void {
  const ct = upRes.headers['content-type'] || 'application/json';
  const headers: Record<string, string> = { 'Content-Type': String(ct) };
  if (/text\/event-stream/i.test(String(ct))) {
    headers['Cache-Control'] = 'no-cache';
    headers['X-Accel-Buffering'] = 'no';
  }
  res.writeHead(upRes.statusCode || 200, headers);
  upRes.pipe(res);
}

interface RecordStats {
  bytesBefore: number;
  bytesAfter: number;
}

function computeTokenSavings(rawBody: string, outBody: string): { rawTokens: number; outTokens: number; savedTokens: number } {
  let rawTokens: number;
  let outTokens: number;
  try {
    const rawData = JSON.parse(rawBody);
    const outData = JSON.parse(outBody);
    const looksLikeRequest = rawData && (Array.isArray(rawData.messages) || Array.isArray(rawData.input) || typeof rawData.system === 'string');
    if (looksLikeRequest) {
      rawTokens = tokens.estimate_request_tokens_accurate(rawData);
      outTokens = tokens.estimate_request_tokens_accurate(outData);
    } else {
      rawTokens = tokens.count_tokens(rawBody);
      outTokens = tokens.count_tokens(outBody);
    }
  } catch {
    rawTokens = tokens.count_tokens(rawBody);
    outTokens = tokens.count_tokens(outBody);
  }
  return { rawTokens, outTokens, savedTokens: Math.max(0, rawTokens - outTokens) };
}

function recordHistory(
  pathOnly: string,
  modelId: string,
  stats: CompressStats | null,
  upstreamUrl: string,
  rawBody: string,
  outBody: string,
  style: AppliedStyle | null = null
): void {
  try {
    const cfg = loadConfig();
    const { rawTokens, outTokens } = computeTokenSavings(rawBody, outBody);
    // The always-on output style adds a small prompt to every request. Keep that
    // cost out of the compression savings (reported on its own) so `saved_tokens`
    // keeps meaning "tokens saved by compressing your request".
    const styleTokens = style ? style.tokens : 0;
    const savedTokens = Math.max(0, rawTokens - Math.max(0, outTokens - styleTokens));
    const saved = stats ? Math.max(0, stats.bytesBefore - stats.bytesAfter) : 0;
    const history = cfg.history || [];
    history.push({
      path: pathOnly,
      model: modelId || 'unknown',
      saved_tokens: savedTokens,
      frost_saved: 0,
      saved_bytes: saved,
      upstream: upstreamUrl,
      timestamp: Math.floor(Date.now() / 1000),
      ts_iso: nowIso(),
      output_style: style ? style.label : 'off',
      style_tokens: styleTokens,
      style_escalated: style ? style.escalated : false,
    });
    saveConfig({
      ...cfg,
      history: history.slice(-200),
      total_saved_bytes: (Number(cfg.total_saved_bytes) || 0) + saved,
      total_saved_tokens: (Number(cfg.total_saved_tokens) || 0) + savedTokens,
    });
    index.logProxyRequest(pathOnly, modelId || 'unknown', rawTokens, savedTokens);
    // record daily budget spend (estimate cost from input tokens)
    try {
      const cost = budget.estimateCostForRequest(rawTokens, 0, modelId);
      budget.recordDailySpend({ cost, tokensIn: rawTokens, tokens: rawTokens });
    } catch {}
  } catch {}
}

function forward(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  upstreamUrl: string,
  outBody: string,
  rawBody: string,
  pathOnly: string,
  modelId: string,
  stats: CompressStats | null,
  account: routing.Account | null,
  credentialKey: string,
  upstreamProvider: string,
  style: AppliedStyle | null = null
): void {
  const u = new URL(upstreamUrl);
  const transport = u.protocol === 'https:' ? https : http;

  function pick(): Record<string, string> {
    const headers = pickHeaders(req.headers);
    if (credentialKey) applyCredential(headers, upstreamProvider, credentialKey);
    return headers;
  }

  function finish(statusCode: number, upRes: http.IncomingMessage | null): void {
    const provider = modelProvider(modelId);
    try {
      if (statusCode >= 400) {
        if (statusCode === 429) {
          quotaTracker.mark_rate_limited(provider, modelId, 30 * 60 * 1000, account && account.id);
          emitEvent(EVENT_TOPICS.providerRatelimited, {
            provider,
            model: modelId,
            statusCode,
            cooldownMs: 30 * 60 * 1000,
            accountId: account && account.id,
          });
        } else if (statusCode >= 500) {
          quotaTracker.mark_rate_limited(provider, modelId, 60 * 1000, account && account.id);
          emitEvent(EVENT_TOPICS.providerRatelimited, {
            provider,
            model: modelId,
            statusCode,
            cooldownMs: 60 * 1000,
            accountId: account && account.id,
          });
        }
      } else {
        const parsed = parse_rate_limit_headers((upRes && upRes.headers) || null);
        if (parsed) {
          quotaTracker.update_quota(provider, modelId, {
            total: parsed.total,
            used: parsed.used,
            remaining: parsed.remaining,
            reset_at: parsed.reset_at,
            account_id: account && account.id,
          });
        }
        quotaTracker.log_request(provider, modelId, 0, 0, 0, account && account.id);
      }
    } catch {}
    if (!account) return;
    try {
      if (statusCode >= 400) accountManager.mark_error(account.id, statusCode, '');
      else accountManager.mark_success(account.id);
    } catch {}
  }

  function send(body: string): void {
    const headers = pick();
    headers['Content-Length'] = String(Buffer.byteLength(body));
    const upReq = transport.request(
      u,
      { method: 'POST', headers },
      (upRes) => {
        if (upRes.statusCode === 400 && body !== rawBody) {
          upRes.resume();
          const retryReq = transport.request(
            u,
            { method: 'POST', headers: { ...pick(), 'Content-Length': String(Buffer.byteLength(rawBody)) } },
            (res2) => {
              streamBack(res2, res);
              recordHistory(pathOnly, modelId, stats, upstreamUrl, rawBody, outBody, null);
              finish(res2.statusCode || 0, res2);
            }
          );
          retryReq.on('error', () => {
            try {
              respondJson(res, 502, {
                error: { message: 'Proxy upstream failed', type: 'proxy_error', code: 'upstream_failed', upstream: upstreamUrl },
              });
            } catch {}
          });
          retryReq.write(rawBody);
          retryReq.end();
          return;
        }
        streamBack(upRes, res);
        recordHistory(pathOnly, modelId, stats, upstreamUrl, rawBody, outBody, style);
        finish(upRes.statusCode || 0, upRes);
      }
    );
    upReq.on('error', () => {
      finish(0, null);
      try {
        respondJson(res, 502, {
          error: { message: 'Proxy upstream failed', type: 'proxy_error', code: 'upstream_failed', upstream: upstreamUrl },
        });
      } catch {}
    });
    upReq.write(body);
    upReq.end();
  }

  send(outBody);
}

function forwardGet(req: http.IncomingMessage, res: http.ServerResponse, pathOnly: string): void {
  const def = defaultUpstream();
  const url = def.base + canonicalEndpoint(pathOnly);
  const u = new URL(url);
  const transport = u.protocol === 'https:' ? https : http;
  const upReq = transport.request(u, { method: 'GET', headers: pickHeaders(req.headers) }, (upRes) =>
    streamBack(upRes, res)
  );
  upReq.on('error', () => {
    try {
      respondJson(res, 502, {
        error: { message: 'Proxy upstream failed', type: 'proxy_error', code: 'upstream_failed', upstream: url },
      });
    } catch {}
  });
  upReq.end();
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const pathOnly = (req.url || '').split('?')[0];

  // Control API /api/* (before any LLM traffic handling)
  if (pathOnly.startsWith('/api/')) {
    const handled = await handleControlApi(req, res, pathOnly);
    if (handled) return;
  }

  if (req.method === 'GET' && (pathOnly === '/health' || pathOnly === '/status')) {
    return respondJson(res, 200, status());
  }
  if (req.method === 'GET' && pathOnly.endsWith('/models')) {
    return forwardGet(req, res, pathOnly);
  }
  if (req.method !== 'POST') {
    return respondJson(res, 405, {
      error: { message: 'method not allowed', type: 'proxy_error', code: 'method_not_allowed' },
    });
  }

  readBody(req, (err, raw) => {
    if (err || raw === undefined) {
      return respondJson(res, 400, {
        error: { message: err ? err.message : 'no body', type: 'proxy_error', code: 'bad_request' },
      });
    }

    let data: RequestBody | null = null;
    try {
      data = JSON.parse(raw);
    } catch {}

    let modelId = (data && (data.model || '')) || '';
    if (data && typeof data.model === 'string' && data.model.includes('/')) {
      const prefix = data.model.split('/', 1)[0];
      if (prefix && (providerBaseUrl(prefix) || prefix === 'opencode' || prefix === 'opencode_go' || prefix === 'opencode-go')) {
        data.model = data.model.slice(prefix.length + 1);
      }
    }
    // Daily limit guard: OFF by default. A reached limit never blocks or reroutes the
    // proxy — the user is asked to choose "reset" (clear counters) or "stay blocked",
    // and only an explicit "blocked" decision for today may reroute to the free model.
    let budgetEnforced = false;
    let originalModelId = modelId;
    let enforcedFallback: string | null = null;
    const guardAllowed = process.env.TOKENSAVER_BUDGET_ENFORCE !== '0';
    if (data) {
      try {
        const check = budget.shouldEnforceBudget();
        if (guardAllowed && check.enforce && check.fallbackModel) {
          // only enforce if original model is not already the fallback
          const fallbackShort = check.fallbackModel.includes('/') ? check.fallbackModel.split('/').slice(1).join('/') : check.fallbackModel;
          const currentShort = String(data.model || modelId).split('/').pop() || '';
          const fallbackProvider = check.fallbackModel.split('/')[0];
          const currentProvider = modelProvider(modelId);
          // enforce if different provider or different model
          if (fallbackShort !== currentShort || fallbackProvider !== currentProvider) {
            enforcedFallback = check.fallbackModel;
            originalModelId = modelId;
            // data.model should be short id for OpenAI-compatible APIs
            data.model = fallbackShort;
            modelId = check.fallbackModel;
            budgetEnforced = true;
            console.log(`[budget] user chose "blocked" (${check.reason}) — routing ${originalModelId} → ${check.fallbackModel}`);
            emitEvent(EVENT_TOPICS.budgetExceeded, {
              reason: check.reason,
              fallbackModel: check.fallbackModel,
              originalModel: originalModelId,
            });
          }
        } else if (check.limitReached) {
          // Ask (once per day) but forward the request untouched to the configured model.
          promptDailyLimitChoice();
        }
      } catch {}
    }
    // Rate-limit aware routing: transparently reroute to a healthy provider when
    // the requested provider is marked rate-limited (kills client retry loops).
    let rateLimitReroutedFrom: string | null = null;
    if (data && !budgetEnforced && process.env.TOKENSAVER_RATELIMIT_FALLBACK !== '0') {
      try {
        const reqProvider = modelProvider(modelId);
        if (reqProvider && quotaTracker.is_rate_limited(reqProvider)) {
          const fb = pickHealthyFallback(reqProvider);
          if (fb) {
            const fbProvider = fb.split('/')[0];
            const fbShort = fb.split('/').slice(1).join('/');
            rateLimitReroutedFrom = modelId;
            data.model = fbShort;
            modelId = fb;
            console.log(`[ratelimit] ${reqProvider} is rate-limited — rerouting ${rateLimitReroutedFrom} → ${fb}`);
            emitEvent(EVENT_TOPICS.providerRatelimited, {
              provider: reqProvider,
              reroutedTo: fb,
              originalModel: rateLimitReroutedFrom,
            });
          }
        }
      } catch {}
    }
    const resolved = resolveUpstream(modelId, pathOnly);
    let upstreamUrl = resolved.url;
    if (!upstreamUrl) {
      return respondJson(res, 502, {
        error: {
          message: `Proxy has no upstream URL configured for path ${pathOnly} (model '${modelId}')`,
          type: 'proxy_error',
          code: 'no_upstream',
        },
      });
    }

    let account: routing.Account | null = null;
    try {
      const provider = modelProvider(modelId);
      const strategy = loadConfig().account_strategy || 'round-robin';
      account = accountManager.select_account(provider, strategy, 1, modelId);
      if (account && account.base_url) {
        upstreamUrl = String(account.base_url).replace(/\/+$/, '') + canonicalEndpoint(pathOnly);
      }
    } catch {}

    // Credential precedence: a configured account wins, then the client's own
    // header, then whatever we hold locally for the provider we are actually
    // calling. A reroute changes the receiving provider, so the client's key is
    // no longer valid for it and must be replaced.
    const rerouted = !!rateLimitReroutedFrom || budgetEnforced;
    let credentialKey = '';
    try {
      if (account && account.api_key) {
        credentialKey = String(account.api_key);
      } else {
        if (rerouted) {
          const local = apiKeyForProvider(resolved.pid);
          if (local) credentialKey = local;
          else console.log(`[auth] no local API key for '${resolved.pid}' — client credential passed through unchanged`);
        } else if (!clientCredential(req.headers)) {
          // The client had no credential to offer, so an unauthenticated request
          // would reach the upstream and come back as "invalid api key".
          credentialKey = apiKeyForProvider(resolved.pid);
        }
      }
    } catch {}
    if (rerouted && credentialKey) {
      account = {
        id: `authfile:${resolved.pid}`,
        provider: resolved.pid,
        api_key: credentialKey,
        base_url: '',
        priority: 1,
        enabled: true,
        consecutive_errors: 0,
        rate_limited_until: null,
      } as unknown as routing.Account;
    }

    _metrics.requestsServed += 1;
    _metrics.lastModel = modelId || 'unknown';
    if (account) _metrics.lastAccount = account.id;

    // Always-on output style (terse replies = fewer output tokens, the expensive
    // ones). Runs on every chat request while the proxy is up, escalating the
    // level once the request's own context is large.
    const appliedStyle = applyAlwaysOnStyle(pathOnly, data);
    if (appliedStyle) {
      _metrics.styleApplied += 1;
      if (appliedStyle.escalated) _metrics.styleEscalated += 1;
    }

    let outBody = raw;
    let stats: CompressStats | null = null;
    const forceRewrite = budgetEnforced || !!rateLimitReroutedFrom || !!appliedStyle;
    if (data) {
      const compressed = rtk.compress_messages(data, true);
      if (compressed) {
        const serialized = JSON.stringify(data);
        if (forceRewrite || serialized.length < raw.length) {
          outBody = serialized;
          stats = compressed;
          const log = rtk.format_rtk_log(stats);
          if (log) console.log(log);
          if (compressed.bytesBefore !== compressed.bytesAfter) {
            _metrics.hits += 1;
            _metrics.totalSavedBytes += Math.max(0, compressed.bytesBefore - compressed.bytesAfter);
          }
        }
      } else if (forceRewrite) {
        outBody = JSON.stringify(data);
      }
    }

    forward(req, res, upstreamUrl, outBody, raw, pathOnly, modelId, stats, account, credentialKey, resolved.pid, appliedStyle);
  });
}

export function status(): ProxyStatus {
  const cfg = loadConfig();
  let actualPort = _port;
  try {
    if (_server && _server.address()) actualPort = Number((_server.address() as any).port);
  } catch {}
  return {
    running: !!_server,
    port: actualPort,
    enabled: !!cfg.enabled,
    requestsServed: _metrics.requestsServed,
    totalSavedBytes: _metrics.totalSavedBytes,
    compressionHits: _metrics.hits,
    lastModel: _metrics.lastModel,
    lastAccount: _metrics.lastAccount,
    startedAt: _metrics.startedAt,
    proxiedProviders: cfg.proxied_providers || [],
    upstreams: cfg.upstreams || {},
    caps: rtk.get_filter_caps(),
    outputStyle: _outputStyle.style === 'off' ? 'off' : _outputStyle.label,
    outputStyleApplied: _metrics.styleApplied,
    outputStyleEscalate: _styleEscalate,
    outputStyleEscalated: _metrics.styleEscalated,
  };
}

function _httpGet(urlStr: string, timeoutMs: number): Promise<{ ok: boolean; code: number; error?: string; body?: string }> {
  return new Promise((resolve) => {
    let u: URL;
    try {
      u = new URL(urlStr);
    } catch {
      return resolve({ ok: false, code: 0, error: 'invalid url' });
    }
    const transport = u.protocol === 'https:' ? https : http;
    const req = transport.request(
      u,
      { method: 'GET', headers: { Accept: 'application/json' } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 20000) req.destroy();
        });
        res.on('end', () =>
          resolve({ ok: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 600, code: res.statusCode || 0, body })
        );
      }
    );
    req.on('error', (e) => resolve({ ok: false, code: 0, error: e.message }));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

export interface ProxyTestResult {
  running: boolean;
  port?: number;
  health?: { ok: boolean; code: number; error?: string };
  forward?: Record<string, any> | null;
}

export async function testConnection(): Promise<ProxyTestResult> {
  if (!_server) return { running: false };
  const port = (_server.address() && (_server.address() as any).port) || _port;
  const base = `http://127.0.0.1:${port}`;
  const health = await _httpGet(`${base}/health`, 4000);
  let forward: Record<string, any> | null = null;
  if (health.code === 200) {
    const def = defaultUpstream();
    forward = await _httpGet(`${base}/v1/models`, 10000);
    forward.upstream = def ? `${def.pid} -> ${def.base}` : null;
  }
  return {
    running: true,
    port,
    health: { ok: health.code === 200, code: health.code, error: health.error },
    forward,
  };
}

export interface ProxifyResult {
  added: string[];
  already: string[];
  skipped: string[];
  rewritten: string[];
}

export function ensureProxiedProviders(port?: number, rewriteConfig = false): ProxifyResult {
  const cfg = loadConfig();
  const targetPort = port !== undefined && port !== null ? port : cfg.port || DEFAULT_PORT;
  const proxyUrl = `http://127.0.0.1:${targetPort}/v1`;

  const set = new Set<string>();
  for (const pid of cfg.proxied_providers || []) set.add(pid);
  for (const pid of Object.keys(cfg.saved_base_urls || {})) set.add(pid);
  for (const pid of Object.keys(cfg.upstreams || {})) set.add(pid);
  const opencfg = read_config();
  if (opencfg && typeof opencfg.provider === 'object') {
    for (const pid of Object.keys(opencfg.provider)) set.add(pid);
  }
  const curPid = modelProvider(get_current_model());
  if (curPid) set.add(curPid);

  const added: string[] = [];
  const already: string[] = [];
  const skipped: string[] = [];
  for (const pid of [...set].sort()) {
    if (cfg.saved_base_urls?.[pid] || cfg.upstreams?.[pid]) {
      already.push(pid);
      continue;
    }
    let base = opencfg && opencfg.provider?.[pid]
      ? String((opencfg.provider[pid].options || {}).baseURL || '').replace(/\/+$/, '')
      : '';
    if (base && /127\.0\.0\.1:\d+|localhost:\d+/.test(base)) {
      already.push(pid);
      continue;
    }
    if (!base) base = PROVIDER_BASE_URLS[pid] || '';
    if (!base) {
      skipped.push(pid);
      continue;
    }
    cfg.saved_base_urls = cfg.saved_base_urls || {};
    cfg.upstreams = cfg.upstreams || {};
    cfg.saved_base_urls[pid] = base;
    cfg.upstreams[pid] = base;
    if (!cfg.proxied_providers) cfg.proxied_providers = [];
    if (!cfg.proxied_providers.includes(pid)) cfg.proxied_providers.push(pid);
    added.push(pid);
  }
  if (added.length || already.length) {
    cfg.proxied_providers = [...new Set(cfg.proxied_providers || [])].sort();
    try {
      saveConfig(cfg);
    } catch {}
  }

  const rewritten: string[] = [];
  if (rewriteConfig) {
    try {
      rewritten.push(...set_provider_base_urls(proxyUrl, [...added, ...already]));
    } catch {}
  }
  return { added, already, skipped, rewritten };
}

export function start(port?: number): Promise<ProxyStatus> {
  return new Promise((resolve, reject) => {
    if (_server) return resolve(status());
    // Daily limits never block by default: the user answers "reset" / "stay blocked" from the UI.
    // Set TOKENSAVER_BUDGET_ENFORCE=0 to hard-disable the guard even after the user opted in.
    if (process.env.TOKENSAVER_RATELIMIT_FALLBACK === undefined) process.env.TOKENSAVER_RATELIMIT_FALLBACK = '1';
    const targetPort = port !== undefined && port !== null ? port : loadConfig().port || DEFAULT_PORT;
    rtk.set_filter_caps && rtk.set_filter_caps(loadConfig().caps || {});
    // Output style is ALWAYS ON while the proxy runs (terse replies = fewer output
    // tokens). Override with TOKENSAVER_OUTPUT_STYLE or proxy.json "output_style".
    const style = setOutputStyle(undefined);
    _styleLogged = false;
    console.log(
      style.style === 'off'
        ? '[style] output style OFF — responses will be at full length'
        : `[style] output style: ${style.label} (always on while the proxy runs · ~${tokens.count_tokens(style.prompt)} tokens/request · TOKENSAVER_OUTPUT_STYLE=off to disable)`
    );
    const proxify = ensureProxiedProviders(targetPort, true);
    if (proxify.rewritten.length) {
      console.log(`[proxy] routed through proxy: ${proxify.rewritten.join(', ')} (restart opencode if running)`);
    }
    const server = http.createServer(handleRequest);
    server.on('error', (e) => {
      _server = null;
      reject(e);
    });
    // Initialize control API (REST + WS) on the same server
    initControlApi(server, targetPort);
    server.listen(targetPort, '127.0.0.1', () => {
      _server = server;
      _port = (server.address() as any).port as number;
      _metrics.startedAt = nowIso();
      console.log(`[proxy] listening on http://127.0.0.1:${_port}`);
      resolve(status());
    });
  });
}

function exportSessionSummary(): void {
  try {
    const memDir = path.join(os.homedir(), '.claude', 'projects', 'C--Users-zinzi-Desktop-Bloody', 'memory');
    ensureDir(memDir);
    const s = status();
    const today = new Date().toISOString().slice(0, 10);
    const summaryPath = path.join(memDir, `proxy-session-${today}.md`);
    const budgetStatus = budget.getBudgetStatus() as unknown as Record<string, any>;
    const rateLimitedProviders: string[] = [];
    // Check each known provider for rate-limit status
    const cfg = loadConfig();
    for (const pid of Object.keys(cfg.upstreams || {})) {
      if (quotaTracker.is_rate_limited(pid)) rateLimitedProviders.push(pid);
    }
    const lines: string[] = [
      `## Proxy Session — ${today}`,
      '',
      `- Port: ${s.port}`,
      `- Requests served: ${s.requestsServed}`,
      `- Compression hits: ${s.compressionHits}`,
      `- Bytes saved: ${(s.totalSavedBytes || 0).toLocaleString()}B`,
      `- Last model: ${s.lastModel || '—'}`,
      `- Proxied providers: ${(s.proxiedProviders || []).join(', ') || '—'}`,
      `- Budget spent today: $${Number(budgetStatus?.spentUSD || 0).toFixed(4)}`,
      `- Rate-limited providers: ${rateLimitedProviders.length ? rateLimitedProviders.join(', ') : 'none'}`,
    ];
    fs.writeFileSync(summaryPath, lines.join('\n') + '\n', 'utf-8');
  } catch {}
}

export function restoreDirectUrls(): string[] {
  const cfg = loadConfig();
  const saved = cfg.saved_base_urls || {};
  return restore_provider_base_urls(saved);
}

export function stop(): Promise<ProxyStatus> {
  return new Promise((resolve) => {
    if (!_server) return resolve(status());
    const server = _server;
    // restore the real upstream URLs so clients work without the proxy running
    try {
      const restored = restoreDirectUrls();
      if (restored.length) console.log(`[proxy] restored direct URLs for: ${restored.join(', ')} (clients no longer need this proxy)`);
    } catch {}
    server.close(() => {
      if (_server === server) _server = null;
      emitEvent(EVENT_TOPICS.proxyStopped, { ts: Date.now() });
      exportSessionSummary();
      resolve(status());
    });
  });
}

export function enable(enabled: boolean, port?: number): ProxyConfig {
  const cfg = loadConfig();
  cfg.enabled = !!enabled;
  if (port) cfg.port = Number(port);
  saveConfig(cfg);
  return cfg;
}
