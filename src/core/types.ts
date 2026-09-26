export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  input_price: number;
  output_price: number;
  cache_price: number | null;
  context: number;
  output_limit: number;
  is_free: boolean;
  tool_call: boolean;
  reasoning: boolean;
  open_weights: boolean;
  modalities: { input: string[]; output: string[] };
}

export interface ProviderGroup {
  id: string;
  configured: boolean;
  name: string;
  models: ModelInfo[];
}

export interface ProviderCatalog {
  [providerKey: string]: ProviderGroup;
}

export interface CatalogFetchResult {
  catalog: Record<string, unknown> | null;
  newModels: NewModelInfo[];
  source: 'cache' | 'network' | 'error';
  error?: string;
}

export interface NewModelInfo {
  provider: string;
  model_name: string;
  input_price: number;
  output_price: number;
  context: number;
  tool_call: boolean;
  is_free: boolean;
}

export interface SaverPolicy {
  mode: 'paid' | 'free';
  daily_budget_usd: number;
  free_daily_token_limit: number;
  max_paid_cost_per_million: number;
  last_applied: string | null;
}

export interface ChosenSaverModels {
  main: ModelInfo;
  small: ModelInfo;
  fallbacks: string[];
  configured_count: number;
  free_count: number;
  paid_allowed_count: number;
  error?: string;
}

export interface LedgerEntry {
  timestamp: string;
  kind?: string;
  description?: string;
  raw_tokens?: number;
  compressed_tokens?: number;
  saved_tokens?: number;
  compression_pct?: number;
  metadata?: unknown;
}

export interface ProxyHistoryEntry {
  path?: string;
  model?: string;
  saved_tokens?: number;
  saved_bytes?: number;
  frost_saved?: number;
  /** Terse-output style active for that request ('off' when disabled). */
  output_style?: string;
  /** Approximate tokens the injected style prompt added (0 when off). */
  style_tokens?: number;
  /** True when the style was escalated above the configured level for a long context. */
  style_escalated?: boolean;
  upstream?: string;
  timestamp?: number;
  ts_iso?: string;
}

export interface ProxyConfig {
  enabled?: boolean;
  port?: number;
  history?: ProxyHistoryEntry[];
  total_saved_bytes?: number;
  total_saved_tokens?: number;
  total_frost_saved?: number;
  frost_total_saved_tokens?: number;
  proxied_providers?: string[];
  upstreams?: Record<string, string>;
  saved_base_urls?: Record<string, string>;
  account_strategy?: string;
  caps?: Record<string, number>;
  /** Terse-output style applied to every chat request while the proxy runs:
   *  'caveman-lite' (default), 'caveman-full|ultra|wenyan*', 'ponytail-*', 'off'. */
  output_style?: string;
  /** Step the style up as the request's own context grows (default true).
   *  Set false (or TOKENSAVER_OUTPUT_STYLE_ESCALATE=off) to pin the level. */
  output_style_escalate?: boolean;
  /** Context sizes (in tokens) at which the level steps up. Default [20000, 60000]. */
  output_style_escalate_at?: number[];
}

/** What the proxy actually injected for one request. */
export interface AppliedStyle {
  /** effective level, e.g. 'caveman-full' ('off' when nothing was injected) */
  label: string;
  /** the level the user configured, before escalation */
  base: string;
  /** approximate tokens the injected prompt added */
  tokens: number;
  /** true when the effective level is more aggressive than the configured one */
  escalated: boolean;
}

export interface RtkHit {
  shape: string;
  filter: string;
  saved: number;
}

export interface CompressStats {
  bytesBefore: number;
  bytesAfter: number;
  hits: RtkHit[];
}

export interface ProxyStatus {
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
  caps?: Record<string, number | undefined>;
  /** Active terse-output style ('off' when disabled). */
  outputStyle: string;
  /** Number of requests the output style was injected into. */
  outputStyleApplied: number;
  /** Whether the level steps up as context grows. */
  outputStyleEscalate?: boolean;
  /** Requests that used a level above the configured one. */
  outputStyleEscalated?: number;
}

export interface SqliteRow {
  [key: string]: unknown;
}

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): SqliteRow | undefined;
    all(...params: unknown[]): SqliteRow[];
  };
  close(): void;
}

export type FilterFn = (text: string) => string;

export type RequestBody = Record<string, any>;
