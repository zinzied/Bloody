import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-limits-'));
process.env.NOBLEED_HOME = TMP;

const budget = await import('../src/core/budget.js');
const proxy = await import('../src/core/proxy.js');
const { eventBus, EVENT_TOPICS } = await import('../src/core/control-api.js');
const insights = await import('../src/core/insights.js');

const FREE_LIMIT = 100000;

function resetAll() {
  budget.resetDailyForTests();
  budget.clearLimitDecision();
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as any).port));
  });
}

function post(port: number, pathname: string, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: chunks }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

test('a reached daily limit never blocks the proxy on its own', () => {
  resetAll();
  budget.recordDailySpend({ tokens: FREE_LIMIT + 1 });

  const status = budget.getBudgetStatus();
  assert.strictEqual(status.limitReached, true, 'limit must be reported as reached');
  assert.strictEqual(status.choiceRequired, true, 'user must be asked to choose');
  assert.strictEqual(status.decision, null, 'nothing chosen yet');
  assert.strictEqual(status.blockingActive, false, 'blocking must stay off until the user opts in');
  assert.strictEqual(status.enforcementActive, false);

  const check = budget.shouldEnforceBudget();
  assert.strictEqual(check.enforce, false, 'proxy must NOT be blocked without an explicit choice');
  assert.strictEqual(check.reason, null);
  assert.strictEqual(check.fallbackModel, null);
  assert.strictEqual(check.limitReached, true);
  assert.strictEqual(check.choiceRequired, true);
  assert.strictEqual(budget.isBudgetExceeded(), false);
});

test('choosing "reset" clears the counters and keeps the configured model', () => {
  resetAll();
  budget.recordDailySpend({ tokens: FREE_LIMIT + 5, cost: 0.5, tokensOut: 10 });

  const decision = budget.setLimitDecision('reset');
  assert.strictEqual(decision.choice, 'reset');
  // Deliberately not persisted: "reset" is an action, not a standing answer.
  assert.strictEqual(budget.loadLimitDecision(), null, 'a reset must not stay on record for the rest of the day');

  const status = budget.getBudgetStatus();
  assert.strictEqual(status.limitReached, false, 'counters are cleared so nothing is "reached" anymore');
  assert.strictEqual(status.spentTokens, 0);
  assert.strictEqual(status.spentUSD, 0);
  assert.strictEqual(status.daily.requests, 0);
  assert.strictEqual(status.choiceRequired, false);
  assert.strictEqual(status.blockingActive, false);
  assert.strictEqual(status.decision, null);
  assert.strictEqual(budget.shouldEnforceBudget().enforce, false);

  // The regression: with the answer left on file for the day, reaching the limit
  // again asked nothing (choiceRequired needs `!decision`) and the guard could
  // never be armed (blockingActive needs `choice === 'blocked'`).
  budget.recordDailySpend({ tokens: FREE_LIMIT + 5, cost: 0.5, tokensOut: 10 });
  const again = budget.getBudgetStatus();
  assert.strictEqual(again.limitReached, true);
  assert.strictEqual(again.choiceRequired, true, 'the user is asked again after spending past the limit');
  budget.setLimitDecision('blocked');
  assert.strictEqual(budget.getBudgetStatus().blockingActive, true, 'and can still choose to be blocked');
});

test('choosing "stay blocked" is the only way to activate the guard', () => {
  resetAll();
  budget.recordDailySpend({ tokens: FREE_LIMIT + 1 });

  budget.setLimitDecision('blocked');
  const status = budget.getBudgetStatus();
  assert.strictEqual(status.limitReached, true);
  assert.strictEqual(status.blockingActive, true);
  assert.strictEqual(status.choiceRequired, false);
  assert.strictEqual(status.decision!.choice, 'blocked');

  const check = budget.shouldEnforceBudget();
  assert.strictEqual(check.enforce, true, 'the guard activates only after the user opted in');
  assert.ok(check.reason, 'reason is surfaced when the guard is active');
  assert.ok(check.fallbackModel, 'a fallback model is offered when the guard is active');
});

test('the decision is persisted per day and cleared on request', () => {
  resetAll();
  budget.recordDailySpend({ tokens: FREE_LIMIT + 1 });
  budget.setLimitDecision('blocked');
  assert.ok(fs.existsSync(budget.LIMIT_DECISION_PATH), 'decision file is written to disk');
  assert.strictEqual(budget.loadLimitDecision()!.choice, 'blocked');

  // simulate a stale decision from yesterday
  const raw = JSON.parse(fs.readFileSync(budget.LIMIT_DECISION_PATH, 'utf8'));
  raw.date = '2000-01-01';
  fs.writeFileSync(budget.LIMIT_DECISION_PATH, JSON.stringify(raw));
  assert.strictEqual(budget.loadLimitDecision(), null, 'yesterday\'s answer must not leak into today');
  assert.strictEqual(budget.getBudgetStatus().choiceRequired, true, 'user is asked again the next day');
  assert.strictEqual(budget.shouldEnforceBudget().enforce, false);

  // simulate a fresh answer for today, then clear it
  budget.setLimitDecision('blocked');
  budget.clearLimitDecision();
  assert.strictEqual(budget.loadLimitDecision(), null);
  assert.strictEqual(budget.shouldEnforceBudget().enforce, false);
});

test('proxy asks the user once per day and never blocks the request', () => {
  resetAll();
  budget.recordDailySpend({ tokens: FREE_LIMIT + 1 });

  const payloads: Record<string, unknown>[] = [];
  const onLimit = (payload: unknown) => payloads.push(payload as Record<string, unknown>);
  eventBus.on(EVENT_TOPICS.dailyLimitReached, onLimit);
  try {
    proxy.promptDailyLimitChoice();
    proxy.promptDailyLimitChoice();
    assert.strictEqual(payloads.length, 1, 'the prompt is emitted once per day');
    assert.deepStrictEqual(payloads[0].choices, ['reset', 'blocked']);
    assert.strictEqual(payloads[0].decision, null);
    assert.strictEqual(payloads[0].freeDailyTokenLimit, FREE_LIMIT);
    assert.match(String(payloads[0].message), /reset/);
  } finally {
    eventBus.off(EVENT_TOPICS.dailyLimitReached, onLimit);
  }

  // once the user answered, no further prompt is emitted
  budget.setLimitDecision('blocked');
  proxy.promptDailyLimitChoice();
  assert.strictEqual(payloads.length, 1, 'no prompt after the user answered');
});

test('proxy helpers answer the prompt like the CLI/UI do', () => {
  resetAll();
  budget.recordDailySpend({ tokens: FREE_LIMIT + 1 });

  proxy.blockDailyLimit();
  assert.strictEqual(budget.getBudgetStatus().decision!.choice, 'blocked');
  assert.strictEqual(budget.shouldEnforceBudget().enforce, true);

  proxy.resetDailyLimit();
  const status = budget.getBudgetStatus();
  assert.strictEqual(status.decision, null, 'a reset leaves no standing answer behind');
  assert.strictEqual(status.spentTokens, 0, 'reset clears counters');
  assert.strictEqual(budget.shouldEnforceBudget().enforce, false, 'after a reset nothing is blocked');
});

test('a reached limit without an answer still forwards to the configured model', async () => {
  resetAll();
  const seen: { model: string | null } = { model: null };
  const mock = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      seen.model = JSON.parse(chunks).model;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'ok', choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['openai'],
    saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` },
  });

  await proxy.start(0);
  try {
    budget.recordDailySpend({ tokens: FREE_LIMIT + 1 });
    const s = await post(
      proxy.status().port!,
      '/v1/chat/completions',
      JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] })
    );
    assert.strictEqual(s.status, 200, 'the request must never be blocked while the user has not answered');
    assert.strictEqual(seen.model, 'gpt-4o', 'must keep using the configured model (no silent reroute)');

    const status = budget.getBudgetStatus();
    assert.strictEqual(status.limitReached, true, 'the limit is still tracked');
    assert.strictEqual(status.choiceRequired, true, 'the user is asked to choose');
    assert.strictEqual(status.blockingActive, false, 'nothing is blocked');
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('a proxied request bills both sides of the exchange to the daily budget', async () => {
  // The regression: recordHistory() passed 0 for the output side to both
  // estimateCostForRequest() and recordDailySpend(), so `tokensOut` stayed 0 for
  // the life of the install and the reported spend ignored every reply — the
  // expensive half on any paid model.
  const reply = 'The answer is quite long indeed, and it repeats itself a little. '.repeat(40);
  const mock = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        })
      );
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['openai'],
    saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` },
  });

  resetAll();
  await proxy.start(0);
  try {
    const prompt = 'Please explain how a proxy server forwards an HTTP request. '.repeat(20);
    const s = await post(
      proxy.status().port!,
      '/v1/chat/completions',
      JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: prompt }] })
    );
    assert.strictEqual(s.status, 200);

    const status = budget.getBudgetStatus();
    assert.strictEqual(status.daily.requests, 1);
    assert.ok(status.daily.tokensIn > 0, 'the request side is counted');
    assert.ok(status.daily.tokensOut > 0, 'the reply side used to be counted as zero');
    assert.strictEqual(
      status.spentTokens,
      status.daily.tokensIn + status.daily.tokensOut,
      'the free-token limit sees both sides'
    );
    // Output is the dearer side, so the cost must exceed what the request alone
    // would have been charged for.
    assert.ok(
      status.spentUSD > status.daily.tokensIn / 1_000_000,
      `spend ${status.spentUSD} should exceed the input-only fallback ${status.daily.tokensIn / 1_000_000}`
    );

    // And the per-provider quota totals are no longer stuck at zero.
    const summary = insights.quotaSummary();
    const row = summary.quota.providers.openai;
    assert.ok(row, 'the provider is filed under its real id');
    assert.ok((row as any).total_tokens_in > 0, 'input tokens reach the quota tracker');
    assert.ok((row as any).total_tokens_out > 0, 'output tokens reach the quota tracker');
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('every proxied request records where its time went', async () => {
  // Without this split a slow turn cannot be attributed: the log said a request
  // happened and when, which is no use when a turn takes a minute. `prep` is the
  // proxy's own work, `upstream` is the provider, and the rest of the client's
  // stopwatch is time the proxy never saw.
  const UPSTREAM_DELAY = 120;
  const mock = http.createServer((req, res) => {
    req.on('data', () => {});
    req.on('end', () => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'x', choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
      }, UPSTREAM_DELAY);
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['openai'],
    saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` },
  });

  resetAll();
  await proxy.start(0);
  try {
    const body = JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hey' }] });
    const s = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s.status, 200);

    const hist = proxy.loadConfig().history || [];
    const last = hist[hist.length - 1];
    assert.ok(last, 'the request was recorded');

    assert.strictEqual(last.body_bytes, Buffer.byteLength(body), 'the size as received is recorded');
    assert.ok((last.sent_bytes ?? 0) > 0, 'the size sent upstream is recorded');
    assert.ok((last.duration_ms ?? 0) > 0, 'the total is recorded');

    // The mock deliberately stalls, so the provider's share must show up as
    // provider time and not be quietly absorbed into the proxy's own. The floor
    // is loose on purpose — the point is attribution, not timer precision.
    assert.ok(
      (last.upstream_ms ?? 0) >= UPSTREAM_DELAY - 40,
      `upstream_ms ${last.upstream_ms} should account for the ${UPSTREAM_DELAY}ms stall`
    );
    assert.ok(
      (last.prep_ms ?? -1) < 50,
      `prep ${last.prep_ms}ms is the proxy's own work and should stay negligible`
    );
    assert.ok(
      (last.ttfb_ms ?? 0) >= (last.upstream_ms ?? 0),
      'time to first byte cannot precede the headers'
    );
    assert.ok(
      (last.duration_ms ?? 0) >= (last.ttfb_ms ?? 0),
      'the total cannot be shorter than the wait for the first byte'
    );
  } finally {
    await proxy.stop();
    mock.close();
  }
});