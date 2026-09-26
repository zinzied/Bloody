import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sha256Hex, md5Hex, nowIso, ensureDir, readJson, writeJson } from './utils.js';
export { ensureDir } from './utils.js';

export const TS_VERSION = '10.0.0';

const BASE_HOME = process.env.TOKENSAVER_HOME || os.homedir();

export const CONFIG_PATH = path.join(BASE_HOME, '.config', 'opencode', 'opencode.jsonc');
/**
 * Every config file OpenCode loads, in its own precedence order.
 *
 * OpenCode merges `config.json`, `opencode.json` and `opencode.jsonc` at
 * startup, so a provider can be defined in more than one of them. Rewriting
 * only `opencode.jsonc` leaves the other copy still pointing at the real
 * upstream, and whichever file wins the merge decides whether the proxy is
 * used at all — and a request that skipped the proxy's per-provider path
 * arrives with no hint about which provider it belongs to.
 */
export function config_paths(): string[] {
  return [
    path.join(BASE_HOME, '.config', 'opencode', 'config.json'),
    path.join(BASE_HOME, '.config', 'opencode', 'opencode.json'),
    path.join(BASE_HOME, '.config', 'opencode', 'opencode.jsonc'),
  ];
}
export const BACKUP_DIR = path.join(BASE_HOME, '.config', 'opencode');
export const CACHE_PATH = path.join(BASE_HOME, '.config', 'opencode', 'models_cache.json');
export const SNAPSHOT_PATH = path.join(BASE_HOME, '.config', 'opencode', 'models_snapshot.json');
export const CACHE_TTL = 86400;
export const MAX_BACKUPS = 5;

export const COMPRESS_DIR = path.join(BASE_HOME, '.config', 'opencode', 'compress');
export const CONTENT_CACHE = path.join(COMPRESS_DIR, 'cache');
export const CONTENT_STORE = path.join(COMPRESS_DIR, 'store');
export const LEDGER_PATH = path.join(COMPRESS_DIR, 'savings_ledger.json');
export const BUDGET_PATH = path.join(COMPRESS_DIR, 'budget.json');
export const PROXY_CONFIG = path.join(COMPRESS_DIR, 'proxy.json');
export const FALLBACK_PATH = path.join(COMPRESS_DIR, 'fallback.json');
export const DASHBOARD_CONFIG = path.join(COMPRESS_DIR, 'dashboard.json');
export const QUOTA_TRACKER_PATH = path.join(COMPRESS_DIR, 'quota_tracker.json');
export const ACCOUNTS_PATH = path.join(COMPRESS_DIR, 'accounts.json');
export const COST_PRICING_PATH = path.join(COMPRESS_DIR, 'proxy_pricing.json');
export const SAVER_POLICY_PATH = path.join(COMPRESS_DIR, 'saver_policy.json');
export const INDEX_DB_PATH = path.join(COMPRESS_DIR, 'index.db');

ensureDir(COMPRESS_DIR);
ensureDir(CONTENT_CACHE);
ensureDir(CONTENT_STORE);

export const KNOWN_PROVIDER_ENV_VARS: Record<string, string[]> = {
  openai: ['OPENAI_API_KEY', 'OPENAI_ORG_ID', 'OPENAI_BASE_URL'],
  anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENAI_API_KEY'],
  vertex: ['VERTEX_CREDENTIALS', 'VERTEX_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS'],
  aws: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  azure: ['AZURE_API_KEY', 'AZURE_OPENAI_API_KEY', 'AZURE_API_BASE'],
  cohere: ['COHERE_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  groq: ['GROQ_API_KEY'],
  together: ['TOGETHER_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  fireworks: ['FIREWORKS_API_KEY'],
  perplexity: ['PERPLEXITY_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN', 'REPLICATE_API_KEY'],
  huggingface: ['HUGGINGFACE_API_KEY', 'HUGGINGFACE_TOKEN', 'HF_API_KEY'],
  xai: ['XAI_API_KEY'],
  github: ['GITHUB_TOKEN', 'GITHUB_API_KEY'],
  github_models: ['GITHUB_TOKEN'],
  claudinio: ['CLAUDINIO_API_KEY'],
  qwen: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
  siliconflow: ['SILICONFLOW_API_KEY'],
  deepinfra: ['DEEPINFRA_API_KEY'],
  novita: ['NOVITA_API_KEY'],
  sambanova: ['SAMBANOVA_API_KEY'],
  nvidia: ['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY'],
  zenmux: ['ZENMUX_API_KEY'],
  nara: ['NARA_API_KEY'],
  venice: ['VENICE_API_KEY'],
  llmgateway: ['LLMGATEWAY_API_KEY', 'LLM_GATEWAY_API_KEY'],
  zai: ['ZAI_API_KEY'],
  nano_gpt: ['NANO_GPT_API_KEY', 'NANOGPT_API_KEY'],
  opencode: ['OPENCODE_ZEN_API_KEY', 'OPENCODE_API_KEY'],
};

const API_KEY_ENV_PATTERNS: [RegExp, (name: string) => string][] = [
  [/_(?:API_)?KEY$/, (name) => name.replace(/_API_KEY$/, '').replace(/_KEY$/, '').toLowerCase()],
  [/_(?:API_)?AUTH_TOKEN$/, (name) => name.replace(/_AUTH_TOKEN$/, '').toLowerCase()],
  [/_(?:API_)?API_TOKEN$/, (name) => name.replace(/_API_TOKEN$/, '').toLowerCase()],
  [/_(?:API_)?TOKEN$/, (name) => name.replace(/_TOKEN$/, '').toLowerCase()],
];

export function get_providers_from_env(): string[] {
  const detected = new Set<string>();
  for (const [providerId, envVars] of Object.entries(KNOWN_PROVIDER_ENV_VARS)) {
    for (const v of envVars) {
      const val = process.env[v] || '';
      if (val && val.trim().length > 0) {
        detected.add(providerId);
        break;
      }
    }
  }
  for (const [key, val] of Object.entries(process.env)) {
    if (!val || !val.trim()) continue;
    const upper = key.toUpperCase();
    for (const [pattern, extract] of API_KEY_ENV_PATTERNS) {
      if (pattern.test(upper)) {
        const provider = extract(key);
        if (['', 'api', 'secret', 'key', 'auth', 'token', 'bearer'].includes(provider)) continue;
        detected.add(provider);
        break;
      }
    }
  }
  return [...detected].sort();
}

export function modelHistoryPaths(): string[] {
  return [
    path.join(BASE_HOME, '.config', 'opencode', 'state', 'opencode', 'model.json'),
    path.join(BASE_HOME, '.local', 'state', 'opencode', 'model.json'),
  ];
}

export function get_providers_from_model_history(): string[] {
  const providers = new Set<string>();
  for (const p of modelHistoryPaths()) {
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      for (const entry of data.recent || []) {
        const pid = entry.providerID || '';
        if (pid) providers.add(pid);
      }
      for (const entry of data.favorite || []) {
        const pid = entry.providerID || '';
        if (pid) providers.add(pid);
      }
      for (const key of Object.keys(data.variant || {})) {
        if (key.includes('/')) {
          const pid = key.split('/')[0];
          if (pid) providers.add(pid);
        }
      }
    } catch {}
  }
  return [...providers].sort();
}

export function get_providers_from_auth(): string[] {
  const detected = new Set<string>();
  const paths = [
    path.join(BASE_HOME, '.local', 'share', 'opencode', 'auth.json'),
    path.join(BASE_HOME, '.config', 'opencode', 'auth.json'),
  ];
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (!data || typeof data !== 'object') continue;
      for (const [pid, entry] of Object.entries(data)) {
        const e = entry as Record<string, unknown>;
        if (!e || typeof e !== 'object') continue;
        if (e.type === 'api' && e.key) detected.add(pid);
        else if (['oauth', 'refresh'].includes(String(e.type)) && e.refresh) detected.add(pid);
      }
    } catch {}
  }
  return [...detected].sort();
}

export function get_current_model(): string {
  for (const p of modelHistoryPaths()) {
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      const recent = data.recent || [];
      if (recent.length && typeof recent[0] === 'object') {
        const pid = recent[0].providerID || '';
        const mid = recent[0].modelID || '';
        if (pid && mid) return `${pid}/${mid}`;
      }
    } catch {}
  }
  const cfg = read_config() || {};
  return cfg.model || cfg.small_model || '';
}

export function strip_jsonc(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^\s*\/\/.*/, ''));
  const joined = lines.join('\n');
  return joined.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function read_config(): Record<string, any> | null {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  } catch {
    return null;
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const clean = strip_jsonc(raw);
  try {
    return JSON.parse(clean) as Record<string, any>;
  } catch {
    return null;
  }
}

function read_config_file(filePath: string): Record<string, any> | null {
  const raw = read_raw_config_file(filePath);
  if (raw === null) return null;
  try {
    return JSON.parse(strip_jsonc(raw)) as Record<string, any>;
  } catch {
    return null;
  }
}

/** A config file's text with any byte-order mark removed, or null if unreadable. */
function read_raw_config_file(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  } catch {
    return null;
  }
}

/** Provider ids differ only by case and `-`/`_` spelling in the wild. */
export function provider_id_key(pid: string): string {
  return String(pid || '').trim().toLowerCase().replace(/-/g, '_');
}

/** The key a provider id is stored under in `providers`, or '' when absent. */
export function provider_key_in(providers: Record<string, any> | null | undefined, pid: string): string {
  if (!providers || typeof providers !== 'object' || !pid) return '';
  if (providers[pid] !== undefined) return pid;
  const target = provider_id_key(pid);
  if (!target) return '';
  for (const k of Object.keys(providers)) if (provider_id_key(k) === target) return k;
  return '';
}

/** A provider's entry in a `provider` map, matched case- and separator-insensitively. */
export function provider_entry(providers: Record<string, any> | null | undefined, pid: string): any {
  const key = provider_key_in(providers, pid);
  return key ? providers![key] : undefined;
}

const MAX_JSONC_DEPTH = 64;

/** One property found in a JSONC document, with the offsets needed to edit it. */
interface JsoncProperty {
  path: string[];
  valueStart: number;
  valueEnd: number;
  /** Offset of `{` for an object value, -1 otherwise. */
  objectStart: number;
  /** Offset of `}` for an object value, -1 otherwise. */
  objectEnd: number;
  childCount: number;
  /** Indentation of the line the object's first property starts on. */
  firstKeyIndent: string;
}

/**
 * Locate every property in a JSONC document without losing the original text.
 *
 * Comments and formatting are the user's, and they are not recoverable once a
 * document has been parsed and re-serialized — which is why editing a config
 * needs offsets into the original rather than a parse/stringify round trip.
 * Returns null when the text is not a JSONC object, so a caller can refuse to
 * touch a file it does not fully understand.
 */
function jsonc_properties(raw: string): { root: JsoncProperty; props: JsoncProperty[] } | null {
  const props: JsoncProperty[] = [];
  let broken = false;

  const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';

  const skipTrivia = (from: number): number => {
    let p = from;
    for (;;) {
      while (p < raw.length && isSpace(raw[p])) p++;
      if (raw[p] === '/' && raw[p + 1] === '/') {
        while (p < raw.length && raw[p] !== '\n') p++;
        continue;
      }
      if (raw[p] === '/' && raw[p + 1] === '*') {
        const end = raw.indexOf('*/', p + 2);
        if (end < 0) {
          broken = true;
          return p;
        }
        p = end + 2;
        continue;
      }
      return p;
    }
  };

  const lineIndentAt = (offset: number): string => {
    let start = offset;
    while (start > 0 && raw[start - 1] !== '\n') start--;
    let end = start;
    while (end < raw.length && (raw[end] === ' ' || raw[end] === '\t')) end++;
    return raw.slice(start, end);
  };

  const readString = (from: number): { value: string; end: number } | null => {
    if (raw[from] !== '"') return null;
    let p = from + 1;
    while (p < raw.length) {
      const c = raw[p];
      if (c === '\\') {
        p += 2;
        continue;
      }
      if (c === '"') {
        try {
          return { value: JSON.parse(raw.slice(from, p + 1)) as string, end: p + 1 };
        } catch {
          broken = true;
          return null;
        }
      }
      p++;
    }
    broken = true;
    return null;
  };

  interface Scan {
    end: number;
    objectStart: number;
    objectEnd: number;
    childCount: number;
    firstKeyIndent: string;
  }

  const scanValue = (from: number, path: string[], depth: number): Scan | null => {
    if (depth > MAX_JSONC_DEPTH) {
      broken = true;
      return null;
    }
    const c = raw[from];
    if (c === '{') {
      const obj = scanObject(from, path, depth);
      if (!obj) return null;
      return { end: obj.end, objectStart: from, objectEnd: obj.end - 1, ...obj.shape };
    }
    if (c === '[') {
      const arr = scanArray(from, path, depth);
      return arr ? { end: arr, objectStart: -1, objectEnd: -1, childCount: 0, firstKeyIndent: '' } : null;
    }
    if (c === '"') {
      const s = readString(from);
      return s ? { end: s.end, objectStart: -1, objectEnd: -1, childCount: 0, firstKeyIndent: '' } : null;
    }
    let p = from;
    while (p < raw.length && raw[p] !== ',' && raw[p] !== '}' && raw[p] !== ']' && !isSpace(raw[p])) p++;
    if (p === from) {
      broken = true;
      return null;
    }
    return { end: p, objectStart: -1, objectEnd: -1, childCount: 0, firstKeyIndent: '' };
  };

  const scanArray = (from: number, path: string[], depth: number): number | null => {
    let p = skipTrivia(from + 1);
    if (raw[p] === ']') return p + 1;
    for (;;) {
      const v = scanValue(p, path, depth + 1);
      if (!v) return null;
      p = skipTrivia(v.end);
      if (raw[p] === ',') {
        p = skipTrivia(p + 1);
        continue;
      }
      if (raw[p] === ']') return p + 1;
      broken = true;
      return null;
    }
  };

  function scanObject(
    from: number,
    path: string[],
    depth: number
  ): { end: number; shape: { childCount: number; firstKeyIndent: string } } | null {
    let p = skipTrivia(from + 1);
    let childCount = 0;
    let firstKeyIndent = '';
    for (;;) {
      if (p >= raw.length) {
        broken = true;
        return null;
      }
      if (raw[p] === '}') return { end: p + 1, shape: { childCount, firstKeyIndent } };
      if (raw[p] === ',') {
        p = skipTrivia(p + 1);
        continue;
      }
      const key = readString(p);
      if (!key) return null;
      if (childCount === 0) firstKeyIndent = lineIndentAt(p);
      childCount++;
      p = skipTrivia(key.end);
      if (raw[p] !== ':') {
        broken = true;
        return null;
      }
      p = skipTrivia(p + 1);
      const v = scanValue(p, [...path, key.value], depth + 1);
      if (!v) return null;
      props.push({
        path: [...path, key.value],
        valueStart: p,
        valueEnd: v.end,
        objectStart: v.objectStart,
        objectEnd: v.objectEnd,
        childCount: v.childCount,
        firstKeyIndent: v.firstKeyIndent,
      });
      p = skipTrivia(v.end);
    }
  }

  const start = skipTrivia(0);
  if (raw[start] !== '{') return null;
  const root = scanObject(start, [], 0);
  if (!root || broken) return null;
  return {
    root: {
      path: [],
      valueStart: start,
      valueEnd: root.end,
      objectStart: start,
      objectEnd: root.end - 1,
      childCount: root.shape.childCount,
      firstKeyIndent: root.shape.firstKeyIndent,
    },
    props,
  };
}

/** Whether `text` is a JSONC document this module can edit without guessing. */
function is_editable_jsonc(text: string): boolean {
  return jsonc_properties(text) !== null;
}

/**
 * Set one property in a JSONC document, leaving every other byte alone.
 *
 * Replaces the value in place when the property exists, and otherwise inserts it
 * into the closest enclosing object that does — so a commented config keeps its
 * comments, its key order and its formatting. Returns null when the path cannot
 * be placed, and the caller must then leave the file alone: guessing would mean
 * rewriting it from the parsed object, which is what loses the comments.
 */
export function set_jsonc_value(raw: string, keyPath: string[], value: unknown): string | null {
  if (!keyPath.length) return null;
  const doc = jsonc_properties(raw);
  if (!doc) return null;

  const existing = doc.props.find(
    (p) => p.path.length === keyPath.length && p.path.every((seg, i) => seg === keyPath[i])
  );
  if (existing) {
    return raw.slice(0, existing.valueStart) + JSON.stringify(value) + raw.slice(existing.valueEnd);
  }

  let host: JsoncProperty = doc.root;
  let prefixLen = 0;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const child = doc.props.find((p) => p.path.length === i + 1 && p.path[i] === keyPath[i] && p.objectStart >= 0);
    if (!child) break;
    host = child;
    prefixLen = i + 1;
  }
  if (host.objectStart < 0) return null;

  // The host object supplies the outermost braces, so the text to insert is the
  // next key with the rest of the path nested inside it.
  let inner: unknown = value;
  for (let i = keyPath.length - 1; i > prefixLen; i--) inner = { [keyPath[i]]: inner };
  const literal = `${JSON.stringify(keyPath[prefixLen])}: ${JSON.stringify(inner)}`;

  if (host.childCount === 0) {
    // An empty object written across lines keeps its lines; `{}` on one line
    // gets the property inline.
    const inside = raw.slice(host.objectStart + 1, host.objectEnd);
    if (!inside.includes('\n') || inside.trim() !== '') {
      return raw.slice(0, host.objectEnd) + literal + raw.slice(host.objectEnd);
    }
    const closingIndent = inside.slice(inside.lastIndexOf('\n') + 1);
    return (
      raw.slice(0, host.objectStart + 1) +
      `\n${closingIndent}  ${literal}\n${closingIndent}` +
      raw.slice(host.objectEnd)
    );
  }

  // Put the separator ahead of the whitespace before the closing brace, so it
  // lands after the last property rather than on a line of its own.
  let at = host.objectEnd;
  while (at > host.objectStart + 1 && (raw[at - 1] === ' ' || raw[at - 1] === '\t' || raw[at - 1] === '\n' || raw[at - 1] === '\r')) {
    at--;
  }
  const lead = raw.slice(at, host.objectEnd).includes('\n') ? `,\n${host.firstKeyIndent}` : ', ';
  return raw.slice(0, at) + lead + literal + raw.slice(at);
}

/**
 * OpenCode's view of its config: every file it loads, merged, later files
 * winning. Provider entries are merged per provider rather than per file so a
 * provider defined in `opencode.json` is still visible when `opencode.jsonc`
 * only overrides one of its fields.
 *
 * Cached on each file's mtime: credential lookup runs per alias per provider on
 * every proxied request, and re-reading and re-parsing all three files each time
 * turned one chat completion into hundreds of synchronous reads. The result is
 * shared between callers, so treat it as read-only.
 */
let _mergedCache: Record<string, any> | null = null;
let _mergedCacheKey = '';

export function read_merged_config(): Record<string, any> {
  const files = config_paths();
  let key = '';
  for (const file of files) {
    try {
      const st = fs.statSync(file);
      key += `${file}:${st.mtimeMs}:${st.size};`;
    } catch {
      key += `${file}:-;`;
    }
  }
  if (_mergedCache && key === _mergedCacheKey) return _mergedCache;
  const out: Record<string, any> = {};
  for (const file of files) {
    const cfg = read_config_file(file);
    if (!cfg) continue;
    for (const [k, v] of Object.entries(cfg)) {
      if (k !== 'provider') {
        out[k] = v;
        continue;
      }
      const src = (v || {}) as Record<string, any>;
      const dst = (out.provider && typeof out.provider === 'object' ? out.provider : {}) as Record<string, any>;
      for (const [pid, p] of Object.entries(src)) {
        if (dst[pid] && typeof dst[pid] === 'object' && typeof p === 'object' && p !== null) {
          dst[pid] = { ...dst[pid], ...(p as Record<string, any>) };
        } else {
          dst[pid] = p;
        }
      }
      out.provider = dst;
    }
  }
  _mergedCache = out;
  _mergedCacheKey = key;
  return out;
}

/** The `{env:VAR}`-backed credential a provider declares in the user's config. */
export function config_env_credential(pid: string): string {
  const providers = read_merged_config()?.provider;
  if (!providers || typeof providers !== 'object') return '';
  for (const alias of [pid, pid.replace(/-/g, '_'), pid.replace(/_/g, '-')]) {
    const p = provider_entry(providers, alias);
    if (!p || typeof p !== 'object') continue;
    const raw = String((p as Record<string, any>).options?.apiKey ?? '');
    const m = /^\{env:([^}]+)\}$/.exec(raw.trim());
    const v = m ? process.env[m[1].trim()] : raw;
    if (v && v.trim() && !/^\{.*\}$/.test(v.trim())) return v.trim();
  }
  return '';
}

/** Rotated backups for one config file name, newest first. */
function backup_candidates(name: string): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const prefix = name.replace(/(\.jsonc?)$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${prefix}\\.jsonc?\\..*\\.backup$`);
  try {
    return fs.readdirSync(BACKUP_DIR).filter((n) => re.test(n)).sort().reverse();
  } catch {
    return [];
  }
}

/**
 * The provider's real upstream, recovered when the live config already points at
 * the proxy and no URL was recorded.
 *
 * A local provider's genuine upstream is itself a loopback address, so "looks
 * local" cannot distinguish it from the proxy — only the proxy's own port can.
 * Without a recovery path an interrupted run leaves the provider permanently
 * unroutable, and requests then fall through to a catalog guess that forwards
 * the caller's key to an unrelated third party.
 */
export function find_original_provider_base_url(pid: string, selfPort?: number): string {
  const isProxy = (u: string) => {
    const s = String(u || '').trim();
    if (!s) return false;
    if (selfPort && new RegExp(`127\\.0\\.0\\.1:${selfPort}(/|$)|localhost:${selfPort}(/|$)`).test(s)) return true;
    return false;
  };
  const take = (cfg: Record<string, any> | null): string => {
    const p = cfg?.provider ? (cfg.provider as Record<string, any>)[pid] : undefined;
    if (!p || typeof p !== 'object') return '';
    const u = String((p as Record<string, any>).options?.baseURL || '').replace(/\/+$/, '');
    return u && !isProxy(u) ? u : '';
  };
  for (const file of config_paths()) {
    const found = take(read_config_file(file));
    if (found) return found;
  }
  for (const file of config_paths()) {
    for (const b of backup_candidates(path.basename(file))) {
      const found = take(read_config_file(path.join(BACKUP_DIR, b)));
      if (found) return found;
    }
  }
  return '';
}

function _sync_model_state(modelId: string, smallId: string): void {
  const statePath = path.join(BASE_HOME, '.local', 'state', 'opencode', 'model.json');
  if (!fs.existsSync(statePath)) return;
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    const newEntry = modelId.includes('/')
      ? { providerID: modelId.split('/', 1)[0], modelID: modelId.split('/', 1)[1] }
      : { providerID: 'opencode', modelID: modelId };
    let recent = data.recent || [];
    recent = recent.filter(
      (e: any) => !(e.providerID === newEntry.providerID && e.modelID === newEntry.modelID)
    );
    recent.unshift(newEntry);
    data.recent = recent.slice(0, 20);
    fs.writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

export function rotate_backup(target: string = CONFIG_PATH): void {
  if (!fs.existsSync(target)) return;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const name = path.basename(target);
  const prefix = name.replace(/(\.jsonc?)$/, '');
  const backup = path.join(BACKUP_DIR, `${name}.${ts}.backup`);
  fs.copyFileSync(target, backup);
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.jsonc?\\..*\\.backup$`);
  const old = fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => re.test(n))
    .sort()
    .reverse();
  for (const f of old.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    } catch {}
  }
}

export function write_config(modelId: string, smallId: string): void {
  const existing = read_config() || {};
  const providers = (existing.provider && typeof existing.provider === 'object' ? existing.provider : {}) as Record<string, any>;
  // A missing file needs a whole document; an existing one is edited in place.
  // Rewriting it from the parsed object would drop every key this function does
  // not set — theme, agent, permission, mcp, the user's comments — and this runs
  // on every model switch, from the CLI, the models page and insights alike.
  let next = read_raw_config_file(CONFIG_PATH) ?? '{\n}\n';
  const edits: Array<[string[], unknown]> = [
    [['model'], modelId],
    [['small_model'], smallId],
    [['compaction'], { auto: true, prune: true, reserved: 10000 }],
  ];
  for (const pid of Object.keys(providers)) {
    const p = providers[pid];
    if (typeof p !== 'object' || p === null) continue;
    const opts = p.options || {};
    if (opts.timeout === undefined) edits.push([['provider', pid, 'options', 'timeout'], 300000]);
    if (opts.chunkTimeout === undefined) edits.push([['provider', pid, 'options', 'chunkTimeout'], 60000]);
  }
  for (const [keyPath, value] of edits) {
    const spliced = set_jsonc_value(next, keyPath, value);
    if (spliced === null) {
      console.warn(`[config] cannot place ${keyPath.join('.')} in ${CONFIG_PATH} — left untouched`);
      continue;
    }
    next = spliced;
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  if (fs.existsSync(CONFIG_PATH)) rotate_backup();
  fs.writeFileSync(CONFIG_PATH, next.endsWith('\n') ? next : `${next}\n`, 'utf-8');
  _mergedCache = null;
  _sync_model_state(modelId, smallId);
}

export function list_backups(): [string, string][] {
  const result: [string, string][] = [];
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => /^opencode\.jsonc\..*\.backup$/.test(n))
    .sort()
    .reverse();
  for (const name of files) {
    const parts = name.split('.');
    if (parts.length >= 3) {
      const ts = parts[2];
      let label = ts;
      try {
        const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/.exec(ts);
        if (m) {
          const d = new Date(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6])
          );
          label = d.toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
        }
      } catch {}
      result.push([label, path.join(BACKUP_DIR, name)]);
    }
  }
  return result;
}

export function get_configured_providers(): string[] {
  const configured = new Set<string>();
  const cfg = read_config();
  if (cfg && cfg.provider) {
    Object.keys(cfg.provider).forEach((k) => configured.add(k));
  }
  get_providers_from_env().forEach((k) => configured.add(k));
  get_providers_from_model_history().forEach((k) => configured.add(k));
  get_providers_from_catalog_crossref().forEach((k) => configured.add(k));
  return [...configured].sort();
}

export function get_working_providers(): string[] {
  const working = new Set<string>();
  const cfg = read_config();
  if (cfg && typeof cfg.provider === 'object') {
    for (const [pid, pdata] of Object.entries(cfg.provider)) {
      if (typeof pdata === 'object' && pdata !== null) {
        const opts = (pdata as Record<string, any>).options || {};
        if (opts.baseURL) working.add(pid);
      }
    }
  }
  get_providers_from_env().forEach((k) => working.add(k));
  return [...working].sort();
}

export function get_config_provider_base_url(pid: string): string {
  const cfg = read_config();
  const p = provider_entry(cfg && cfg.provider ? cfg.provider : null, pid);
  if (typeof p === 'object' && p !== null) {
    const opts = (p as Record<string, any>).options || {};
    return String(opts.baseURL || '').replace(/\/+$/, '');
  }
  return '';
}

/**
 * Rewrite one `options.baseURL` per provider, in place, across every config file
 * that defines the provider.
 *
 * `edit` returns the new text, or null when the value must not change. The text
 * is spliced rather than re-serialized so a commented `opencode.jsonc` keeps its
 * comments, key order and formatting — a `JSON.stringify` rewrite destroys all
 * three, and these files belong to the user, not to this tool.
 */
function edit_provider_base_urls(
  providers: string[],
  edit: (pid: string, key: string, current: string) => string | null
): string[] {
  const changed: string[] = [];
  let wrote = false;
  for (const file of config_paths()) {
    const raw = read_raw_config_file(file);
    if (raw === null) continue;
    const cfg = read_config_file(file);
    if (!cfg || !cfg.provider) continue;

    let next = raw;
    const touched: string[] = [];
    for (const pid of providers) {
      const key = provider_key_in(cfg.provider, pid);
      const entry = key ? cfg.provider[key] : undefined;
      if (!key || !entry || typeof entry !== 'object') continue;
      const current = String((entry.options || {}).baseURL || '').replace(/\/+$/, '');
      const replacement = edit(pid, key, current);
      if (replacement === null) continue;
      const spliced = set_jsonc_value(next, ['provider', key, 'options', 'baseURL'], replacement);
      if (spliced === null) {
        console.warn(`[config] cannot place options.baseURL for '${pid}' in ${file} — left untouched`);
        continue;
      }
      next = spliced;
      touched.push(pid);
    }
    if (!touched.length || !is_editable_jsonc(next)) continue;
    try {
      rotate_backup(file);
      fs.writeFileSync(file, next, 'utf-8');
      wrote = true;
      for (const pid of touched) if (!changed.includes(pid)) changed.push(pid);
    } catch {
      continue;
    }
  }
  if (wrote) _mergedCache = null;
  return wrote ? changed : [];
}

/**
 * Point each provider's baseURL at the local proxy.
 *
 * Each provider gets its own path (`/p/<provider>/v1`) instead of a shared
 * `/v1`, so a request that arrives through the proxy still says which provider
 * it came from. A shared path loses that: a model id without a provider prefix
 * (`big-pickle`) would be guessed, and a guess sends the request — and the
 * client's key — to the wrong upstream, which answers 401/403.
 */
export function set_provider_base_urls(proxyUrl: string, providers: string[]): string[] {
  const root = String(proxyUrl).replace(/\/+$/, '').replace(/\/v1$/, '');
  return edit_provider_base_urls(providers, (_pid, key, current) => {
    // A local upstream (a router on loopback, ollama) is rewritten on purpose:
    // the proxy records it in saved_base_urls first, so it still resolves, and
    // the request gets compressed instead of bypassing the proxy entirely.
    const target = `${root}/p/${key}/v1`;
    return current === target ? null : target;
  });
}

export function restore_provider_base_urls(saved: Record<string, string>): string[] {
  const selfHost = /127\.0\.0\.1:\d+|localhost:\d+/;
  return edit_provider_base_urls(Object.keys(saved), (pid, key, current) => {
    const realUrl = saved[pid] || saved[key];
    if (!realUrl) return null;
    // only restore entries that currently point at a local proxy address
    if (!current || !selfHost.test(current)) return null;
    return String(realUrl).replace(/\/+$/, '');
  });
}

export function get_providers_from_catalog_crossref(): string[] {
  const detected = new Set<string>();
  let catalog: Record<string, any> | null = null;
  if (fs.existsSync(CACHE_PATH)) {
    try {
      catalog = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    } catch {}
  }
  if (!catalog) return [];
  const catalogProviderIds = Object.keys(catalog);
  const envApikeys: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (!val || !val.trim()) continue;
    const upper = key.toUpperCase();
    for (const suffix of ['_API_KEY', '_AUTH_TOKEN', '_API_TOKEN', '_TOKEN', '_API_SECRET', '_SECRET_KEY', '_ACCESS_KEY', '_API', '_BASE_URL', '_ENDPOINT', '_KEY']) {
      if (upper.endsWith(suffix)) {
        envApikeys[key] = key.replace(suffix, '').toLowerCase().replace(/-/g, '_').replace(/ /g, '_');
        break;
      }
    }
    if (upper.includes('API') && (upper.includes('KEY') || upper.includes('TOKEN') || upper.includes('SECRET'))) {
      const generic = new Set(['api', 'key', 'token', 'secret', 'auth', 'bearer', 'access', 'endpoint', 'base', 'url', 'org', 'id', 'application', 'credentials', 'service', 'account']);
      const meaningful = key.toLowerCase().split('_').filter((p) => !generic.has(p) && p.length > 1);
      for (const potential of meaningful) envApikeys[`${key}::${potential}`] = potential;
    }
  }
  for (const [varName, extractedName] of Object.entries(envApikeys)) {
    void varName;
    if (catalogProviderIds.includes(extractedName)) detected.add(extractedName);
    const clean = extractedName.replace(/_/g, '');
    for (const cpid of catalogProviderIds) {
      if (clean === cpid.replace(/_/g, '').replace(/-/g, '')) {
        detected.add(cpid);
        break;
      }
    }
    for (const [cpid, pdata] of Object.entries(catalog)) {
      if (!pdata || typeof pdata !== 'object') continue;
      const pname = ((pdata.name || '') + '').toLowerCase().replace(/ /g, '_').replace(/-/g, '_');
      if (extractedName.includes(pname) || pname.includes(extractedName)) {
        detected.add(cpid);
        break;
      }
    }
  }
  const historyPath = path.join(BASE_HOME, '.config', 'opencode', 'state', 'opencode', 'prompt-history.jsonl');
  const altHist = path.join(BASE_HOME, '.local', 'state', 'opencode', 'prompt-history.jsonl');
  for (const hpath of [historyPath, altHist]) {
    if (fs.existsSync(hpath)) {
      try {
        const text = fs.readFileSync(hpath, 'utf-8');
        for (const cpid of catalogProviderIds) {
          if (text.toLowerCase().includes(cpid.toLowerCase())) detected.add(cpid);
        }
      } catch {}
    }
  }
  return [...detected].sort();
}

export { sha256Hex, md5Hex, nowIso, readJson, writeJson };
