import fs from 'node:fs';
import path from 'node:path';
import { BUDGET_PATH, COMPRESS_DIR, SAVER_POLICY_PATH, QUOTA_TRACKER_PATH } from './config.js';
import { readJson, writeJson, nowIso } from './utils.js';
import { read_saver_policy, get_user_models_sync } from './models.js';
import type { SaverPolicy } from './types.js';

export const BUDGET_DAILY_PATH = path.join(COMPRESS_DIR, 'budget_daily.json');

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
  const enforcementActive = policy.mode !== undefined; // always active, can be toggled via env

  let reason: string | null = null;
  let fallbackModel: string | null = null;
  if (exceeded) reason = `Daily budget $${policy.daily_budget_usd} exceeded (spent $${spentUSD.toFixed(4)})`;
  else if (freeExceeded && policy.mode === 'free') reason = `Free daily token limit ${freeLimit} exceeded (used ${spentTokens})`;
  else if (taskExceeded) reason = 'Task budget exhausted';

  if (reason) {
    fallbackModel = pickFreeFallbackModel();
  }

  return {
    policy,
    daily,
    taskBudget,
    quota: quota as Record<string, unknown>,
    spentUSD,
    remainingUSD,
    spentTokens,
    remainingTokens,
    exceeded: exceeded || freeExceeded || taskExceeded,
    freeExceeded,
    enforcementActive,
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

export function shouldEnforceBudget(): { enforce: boolean; reason: string | null; fallbackModel: string | null } {
  const policy = read_saver_policy();
  const daily = loadDailyState();
  const spentUSD = daily.costUSD;
  const spentTokens = daily.tokensTotal;
  const exceeded = policy.daily_budget_usd > 0 && spentUSD >= policy.daily_budget_usd;
  const freeExceeded = policy.free_daily_token_limit > 0 && spentTokens >= policy.free_daily_token_limit;
  if (exceeded) {
    return { enforce: true, reason: `Daily budget $${policy.daily_budget_usd} exceeded (spent $${spentUSD.toFixed(4)})`, fallbackModel: pickFreeFallbackModel() };
  }
  if (policy.mode === 'free' && freeExceeded) {
    return { enforce: true, reason: `Free token limit ${freeLimit(policy)} exceeded`, fallbackModel: pickFreeFallbackModel() };
  }
  // also check task budget json remaining
  const taskBudget = readJson<Record<string, unknown>>(BUDGET_PATH, null);
  if (taskBudget && typeof taskBudget.remaining === 'number' && Number(taskBudget.remaining) <= 0) {
    return { enforce: true, reason: 'Task budget exhausted', fallbackModel: pickFreeFallbackModel() };
  }
  return { enforce: false, reason: null, fallbackModel: null };
}

function freeLimit(policy: SaverPolicy): number {
  return policy.free_daily_token_limit ?? 100000;
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
