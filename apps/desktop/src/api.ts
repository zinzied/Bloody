// API client for the Bloody control plane (REST + WS)
// All calls go to http://127.0.0.1:<port>/api/*

let cachedPort: number | null = null;
let cachedToken: string | null = null;

export function setEngineConfig(port: number, token: string) {
  cachedPort = port;
  cachedToken = token;
}

export function getEnginePort(): number | null {
  return cachedPort;
}

function getBaseUrl(): string {
  if (!cachedPort) throw new Error('Engine port not set');
  return `http://127.0.0.1:${cachedPort}/api`;
}

function authHeaders(): Record<string, string> {
  if (!cachedToken) throw new Error('Control token not set');
  return { 'X-Token-Saver': cachedToken, 'Content-Type': 'application/json' };
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  overview: () => fetchJson<any>('/overview'),
  quota: () => fetchJson<any>('/quota'),
  routing: () => fetchJson<any>('/routing'),
  providers: () => fetchJson<any>('/providers'),
  search: (q: string, limit = 25) => fetchJson<any>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  compress: (text: string) => fetchJson<any>('/compress', { method: 'POST', body: JSON.stringify({ text }) }),
  settings: {
    get: () => fetchJson<any>('/settings'),
    save: (opts: any) => fetchJson<any>('/settings', { method: 'POST', body: JSON.stringify(opts) }),
  },
  status: () => fetchJson<any>('/status'),
  models: () => fetchJson<any>('/models'),
  doctor: (fix = false) => fetchJson<any>(`/doctor?fix=${fix}`),
  budget: () => fetchJson<any>('/budget'),
  limits: {
    get: () => fetchJson<BudgetStatusData>('/limits'),
    /** Answer the daily-limit prompt: 'reset' (keep configured model) or 'blocked' (stay blocked). */
    answer: (action: 'reset' | 'blocked') => fetchJson<{ ok: boolean; action: string; status: BudgetStatusData }>('/limits', { method: 'POST', body: JSON.stringify({ action }) }),
  },
};

// Type-safe shorthand for the shapes we care about (subset of insights.ts return types)
export interface OverviewData {
  ledger: { entries: number; raw_tokens: number; saved_tokens: number };
  proxy: { requests: number; saved_tokens: number; saved_bytes: number; frost_saved: number };
  byKind: { kind: string; count: number; saved_tokens: number }[];
  perModel: { model: string; requests: number; saved_tokens: number; saved_bytes: number }[];
  recent: { ts: string; kind: string; description: string; saved: number; unit: string }[];
}

export interface QuotaData {
  quota: {
    providers: Record<string, { total_quota: number; remaining: number; rate_limited_until: string | null; reset_at: string | null; total_cost: number | null; last_checked: number | null; request_count: number }>;
    accounts: Record<string, { remaining: number; rate_limited_until: string | null; last_used: number | null }>;
  };
  budget: { task: string; budget_limit: number; total_allocated: number; remaining: number; allocation: Record<string, number>; task_tokens?: number } | null;
  budgetDaily: { date: string; tokensTotal: number; tokensIn: number; tokensOut: number; costUSD: number; requests: number; lastUpdated: string } | null;
  budgetStatus: BudgetStatusData | null;
}

export interface RoutingData {
  currentModel: string | null;
  upstream: { url: string; pid: string } | null;
  tier: string | null;
  accounts: { id: string; provider: string; status: string; priority: number }[];
  accountStrategy: string;
  tieredChain: string[];
  fallbackChain: string[];
  routing: { provider: string; configured: boolean; proxied: boolean; baseURL: string | null }[];
  upstreams: Record<string, string>;
}

export interface ProviderItem {
  provider: string;
  configured: boolean;
  working: boolean;
  envDetected: boolean;
  authDetected: boolean;
  inHistory: boolean;
  proxied: boolean;
  baseURL: string | null;
  envVars: string[];
}

export type ProvidersData = ProviderItem[];

export interface ModelProvider {
  name: string;
  id: string;
  configured: boolean;
  models: { name: string; context: number; tool_call: boolean; reasoning: boolean; is_free: boolean; input_price: number; output_price: number }[];
}

export type ModelsData = ModelProvider[];

export interface CompressResult {
  detected: string | null;
  tooSmall: boolean;
  min: number;
  length: number;
  compressed_length: number;
  saved: number;
  pct: number;
  compressed: string | null;
  tokensIn: number;
  tokensOut: number;
  tokensSaved: number;
  tokensPct: number;
  heuristicIn: number;
  heuristicOut: number;
  tokenizer: { available: boolean; encoding: string; fallback: string; error?: string };
  originalText?: string;
}

export interface StatusData {
  running: boolean;
  port: number;
  enabled: boolean;
  requestsServed: number;
  totalSavedBytes: number;
  compressionHits: number;
  lastModel: string;
  lastAccount: string;
  startedAt: string | null;
  proxiedProviders: string[];
  upstreams: Record<string, string>;
}

export interface LimitDecisionData {
  date: string;
  choice: 'reset' | 'blocked';
  decidedAt: string;
}

export interface BudgetStatusData {
  policy: { mode: string; daily_budget_usd: number; free_daily_token_limit: number; max_paid_cost_per_million: number };
  daily: { date: string; tokensTotal: number; tokensIn: number; tokensOut: number; costUSD: number; requests: number };
  spentUSD: number;
  remainingUSD: number;
  spentTokens: number;
  remainingTokens: number;
  exceeded: boolean;
  /** A daily limit has been reached — informational only; it never blocks the proxy by itself. */
  limitReached: boolean;
  /** True when a limit is reached and the user has not answered reset/blocked for today. */
  choiceRequired: boolean;
  /** Today's explicit answer, or null when the user has not answered yet. */
  decision: LimitDecisionData | null;
  /** True only when the user explicitly chose "stay blocked" for today. */
  blockingActive: boolean;
  reason: string | null;
  fallbackModel: string | null;
}