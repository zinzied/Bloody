import fs from 'node:fs';
import path from 'node:path';
import { BUDGET_PATH, COMPRESS_DIR, SAVER_POLICY_PATH, QUOTA_TRACKER_PATH } from './config.js';
import { readJson, writeJson, nowIso } from './utils.js';
import { read_saver_policy, get_user_models_sync } from './models.js';
import type { SaverPolicy } from './types.js';

export const BUDGET_DAILY_PATH = path.join(COMPRESS_DIR, 'budget_daily.json');
export const LIMIT_DECISION_PATH = path.join(COMPRESS_DIR, 'limit_decision.json');

/**
 * Explicit user decision for the current day when a daily limit is hit.
 * - 'reset'   → daily counters were cleared; the proxy keeps using the configured model.
 * - 'blocked' → the user opted in to the guard; the proxy may reroute to the free model.
 *
 * A missing/expired decision means "not answered yet" — in that case the routing
 * proxy NEVER blocks or reroutes on its own, it only asks the user.
 */
export type LimitChoice = 'reset' | 'blocked';

export interface LimitDecision {
  date: string; // YYYY-MM-DD
  choice: LimitChoice;
  decidedAt: string;
}

export interface DailyState {
  date: string; // YYYY-MM-DD
  costUSD: number;
  tokensIn: number;
  tokensOut: number;
  tokensTotal: number;
  requests: number;
  lastUpdated: string;
}

export interface BudgetStatus {
  policy: SaverPolicy;
  daily: DailyState;
  taskBudget: Record<string, unknown> | null;
  quota: Record<string, unknown>;
  spentUSD: number;
  remainingUSD: number;
  spentTokens: number;
  remainingTokens: number;
  exceeded: boolean;
  freeExceeded: boolean;
  enforcementActive: boolean;
  /** A daily limit (tokens / spend / task) has been reached — informational, never blocks by itself. */
  limitReached: boolean;
  /** True when a limit is reached and the user has not answered reset/blocked for today. */
  choiceRequired: boolean;
  /** Today's explicit user decision, or null when the user has not answered yet. */
  decision: LimitDecision | null;
  /** True only when the user explicitly chose "stay blocked" for today. */
  blockingActive: boolean;
  reason: string | null;
  fallbackModel: string | null;
}

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadDailyState(): DailyState {
  const raw = readJson<DailyState>(BUDGET_DAILY_PATH, null);
  const today = todayISODate();
  if (!raw || raw.date !== today) {
    return { date: today, costUSD: 0, tokensIn: 0, tokensOut: 0, tokensTotal: 0, requests: 0, lastUpdated: nowIso() };
  }
  return raw;
}

export function saveDailyState(state: DailyState): void {
  writeJson(BUDGET_DAILY_PATH, state);
}

/** Today's explicit user decision, or null when the user has not answered yet. */
export function loadLimitDecision(): LimitDecision | null {
  const raw = readJson<LimitDecision>(LIMIT_DECISION_PATH, null);
  if (!raw || raw.date !== todayISODate()) return null;
  if (raw.choice !== 'reset' && raw.choice !== 'blocked') return null;
  return raw;
}

/**
 * Record the user's answer for today's reached limit.
 * `reset` also zeroes the daily counters so the configured model keeps working.
 */
export function setLimitDecision(choice: LimitChoice): LimitDecision {
  if (choice === 'reset') resetDailyCounters();
  const decision: LimitDecision = { date: todayISODate(), choice, decidedAt: nowIso() };
  writeJson(LIMIT_DECISION_PATH, decision);
  return decision;
}

export function clearLimitDecision(): void {
  try {
    fs.unlinkSync(LIMIT_DECISION_PATH);
  } catch {}
}

/** Zero today's counters (tokens + spend + requests). */
export function resetDailyCounters(): DailyState {
  const state: DailyState = {
    date: todayISODate(),
    costUSD: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensTotal: 0,
    requests: 0,
    lastUpdated: nowIso(),
  };
  saveDailyState(state);
  return state;
}

export function recordDailySpend(opts: { cost?: number; tokensIn?: number; tokensOut?: number; tokens?: number }): DailyState {
  const state = loadDailyState();
  if (opts.cost) state.costUSD = Number((state.costUSD + opts.cost).toFixed(6));
  const tIn = opts.tokensIn ?? opts.tokens ?? 0;
  const tOut = opts.tokensOut ?? 0;
  state.tokensIn += tIn;
  state.tokensOut += tOut;
  state.tokensTotal += tIn + tOut;
  state.requests += 1;
  state.lastUpdated = nowIso();
  saveDailyState(state);
  return state;
}

export function resetDailyForTests(): void {
  try {
    fs.unlinkSync(BUDGET_DAILY_PATH);
  } catch {}
  clearLimitDecision();
}

export function getBudgetStatus(): BudgetStatus {
  const policy = read_saver_policy();
  const daily = loadDailyState();
  const taskBudget = readJson<Record<string, unknown>>(BUDGET_PATH, null);
  const quota = readJson<Record<string, unknown>>(QUOTA_TRACKER_PATH, null) || { providers: {}, accounts: {} };

  const spentUSD = daily.costUSD;
  const remainingUSD = Math.max(0, policy.daily_budget_usd - spentUSD);
  const spentTokens = daily.tokensTotal;
  const freeLimit = policy.free_daily_token_limit ?? 100000;
  const remainingTokens = Math.max(0, freeLimit - spentTokens);

  const exceeded = policy.daily_budget_usd > 0 && spentUSD >= policy.daily_budget_usd;
  const freeExceeded = freeLimit > 0 && spentTokens >= freeLimit;
  const taskExceeded = taskBudget != null && typeof (taskBudget as Record<string, unknown>).remaining === 'number' && Number((taskBudget as Record<string, unknown>).remaining) <= 0;
  const limitReached = exceeded || freeExceeded || taskExceeded;

  // The reason is informational only — a reached limit NEVER blocks the proxy by itself.
  let reason: string | null = null;
  if (exceeded) reason = `Daily budget $${policy.daily_budget_usd} exceeded (spent $${spentUSD.toFixed(4)})`;
  else if (freeExceeded) reason = `Free daily token limit ${freeLimit} exceeded (used ${spentTokens})`;
  else if (taskExceeded) reason = 'Task budget exhausted';

  const decision = loadLimitDecision();
  // Enforcement is opt-in: only when the user explicitly answered "stay blocked" today.
  const blockingActive = limitReached && decision?.choice === 'blocked';
  const choiceRequired = limitReached && !decision;

  let fallbackModel: string | null = null;
  if (reason) fallbackModel = pickFreeFallbackModel();

  return {
    policy,
    daily,
    taskBudget,
    quota: quota as Record<string, unknown>,
    spentUSD,
    remainingUSD,
    spentTokens,
    remainingTokens,
    exceeded: limitReached,
    freeExceeded,
    enforcementActive: blockingActive,
    limitReached,
    choiceRequired,
    decision,
    blockingActive,
    reason,
    fallbackModel,
  };
}

// Simpler sync fallback: we can import at top but delay circular; instead we do lazy lookup via reading catalog
export function pickFreeFallbackModel(): string | null {
  try {
    const catalog = get_user_models_sync();
    const freeCandidates: { id: string; cost: number }[] = [];
    for (const g of Object.values(catalog)) {
      for (const m of g.models || []) {
        if (m.is_free) freeCandidates.push({ id: m.id, cost: 0 });
      }
    }
    if (freeCandidates.length) {
      // Prefer a known free provider ordering
      const priority = ['qwen', 'iflow', 'kimi', 'glm', 'zai', 'openai'];
      for (const pref of priority) {
        const found = freeCandidates.find((c) => c.id.startsWith(pref + '/'));
        if (found) return found.id;
      }
      return freeCandidates[0].id;
    }
  } catch {}
  return 'qwen/qwen-max';
}

export function shouldEnforceBudget(): {
  enforce: boolean;
  reason: string | null;
  fallbackModel: string | null;
  limitReached: boolean;
  choiceRequired: boolean;
} {
  const status = getBudgetStatus();
  // Never auto-block: the guard only activates when the user explicitly chose "stay blocked" for today.
  const enforce = status.blockingActive && !!status.fallbackModel;
  return {
    enforce,
    reason: enforce ? status.reason : null,
    fallbackModel: enforce ? status.fallbackModel : null,
    limitReached: status.limitReached,
    choiceRequired: status.choiceRequired,
  };
}

export function isBudgetExceeded(): boolean {
  return shouldEnforceBudget().enforce;
}

export function estimateCostForRequest(inputTokens: number, outputTokens: number, modelId: string): number {
  try {
    const catalog = get_user_models_sync();
    for (const g of Object.values(catalog)) {
      for (const m of g.models || []) {
        if (m.id === modelId) {
          return (inputTokens * m.input_price + outputTokens * m.output_price) / 1_000_000;
        }
      }
    }
  } catch {}
  // fallback: assume $1/M blended
  return (inputTokens + outputTokens) * 1 / 1_000_000;
}
