import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-style-'));
process.env.TOKENSAVER_HOME = TMP;

const prompts = await import('../src/core/prompts.js');
const proxy = await import('../src/core/proxy.js');

const CAVEMAN_LITE_MARKER = prompts.CAVEMAN_PROMPTS.lite.slice(0, 40);

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as any).port));
  });
}

function request(
  method: string,
  port: number,
  pathname: string,
  body?: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: chunks }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function controlToken(): string {
  const file = path.join(TMP, '.config', 'opencode', 'compress', 'control.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')).token;
}

function mockUpstream(seen: { body: string; path: string }[]) {
  return http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      seen.push({ body: chunks, path: req.url || '' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'ok', choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
    });
  });
}

// ---------------------------------------------------------------------------
// resolveOutputStyle
// ---------------------------------------------------------------------------

test('output style defaults to caveman-lite (always on)', () => {
  const s = prompts.resolveOutputStyle(undefined);
  assert.strictEqual(s.style, 'caveman');
  assert.strictEqual(s.level, 'lite');
  assert.strictEqual(s.label, 'caveman-lite');
  assert.ok(s.prompt.includes('Respond tersely'));
  assert.strictEqual(prompts.resolveOutputStyle('').label, 'caveman-lite');
  assert.strictEqual(prompts.resolveOutputStyle('banana').label, 'caveman-lite');
});

test('output style understands every documented level', () => {
  assert.strictEqual(prompts.resolveOutputStyle('caveman-full').level, 'full');
  assert.strictEqual(prompts.resolveOutputStyle('caveman-ultra').level, 'ultra');
  assert.strictEqual(prompts.resolveOutputStyle('caveman-wenyan-lite').level, 'wenyan-lite');
  assert.strictEqual(prompts.resolveOutputStyle('wenyan_ultra').level, 'wenyan-ultra');
  assert.strictEqual(prompts.resolveOutputStyle('ponytail-lite').style, 'ponytail');
  assert.strictEqual(prompts.resolveOutputStyle('ponytail-ultra').label, 'ponytail-ultra');
  assert.ok(prompts.resolveOutputStyle('ponytail').prompt.includes('lazy senior developer'));
});

// ---------------------------------------------------------------------------
// apply_output_style (idempotent, format aware)
// ---------------------------------------------------------------------------

test('apply_output_style injects once per request', () => {
  const setting = prompts.resolveOutputStyle('caveman-lite');
  const body: any = { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] };
  assert.strictEqual(prompts.apply_output_style(body, setting), true);
  assert.strictEqual(body.messages[0].role, 'system');
  assert.ok(body.messages[0].content.includes(CAVEMAN_LITE_MARKER));
  assert.strictEqual(body.messages.length, 2);
  // second call must not duplicate the prompt
  assert.strictEqual(prompts.apply_output_style(body, setting), false);
  assert.strictEqual(body.messages.length, 2);
  assert.strictEqual(prompts.has_output_style(body, setting), true);
});

test('apply_output_style respects claude and gemini formats', () => {
  const setting = prompts.resolveOutputStyle('caveman-lite');
  const claude: any = { system: 'be concise', messages: [{ role: 'user', content: 'x' }] };
  assert.strictEqual(prompts.apply_output_style(claude, setting), true);
  assert.ok(claude.system.includes('be concise'));
  assert.ok(claude.system.includes(CAVEMAN_LITE_MARKER));

  const gemini: any = {
    system_instruction: { parts: [{ text: 'orig' }] },
    contents: [{ role: 'user', parts: [{ text: 'x' }] }],
  };
  assert.strictEqual(prompts.apply_output_style(gemini, setting), true);
  assert.strictEqual(gemini.system_instruction.parts.length, 2);
  assert.strictEqual(prompts.apply_output_style(gemini, setting), false);
});

test('apply_output_style is a no-op when disabled', () => {
  const body: any = { messages: [{ role: 'user', content: 'hi' }] };
  assert.strictEqual(prompts.apply_output_style(body, prompts.resolveOutputStyle('off')), false);
  assert.strictEqual(body.messages.length, 1);
});

// ---------------------------------------------------------------------------
// styleEligible — only chat/completion requests, never embeddings
// ---------------------------------------------------------------------------

test('styleEligible only accepts chat-shaped requests', () => {
  assert.strictEqual(proxy.styleEligible('/v1/chat/completions', { messages: [{ role: 'user', content: 'hi' }] }), true);
  assert.strictEqual(proxy.styleEligible('/v1/responses', { input: [{ role: 'user', content: 'hi' }] }), true);
  assert.strictEqual(proxy.styleEligible('/v1/messages', { system: 'x', messages: [] }), true);
  assert.strictEqual(proxy.styleEligible('/v1beta/models/gemini-2.0:generateContent', { contents: [] }), false);
  assert.strictEqual(
    proxy.styleEligible('/v1beta/models/gemini-2.0:generateContent', { systemInstruction: { parts: [] }, contents: [] }),
    true
  );
  // embeddings payloads must never be touched
  assert.strictEqual(proxy.styleEligible('/v1/embeddings', { model: 'text-embedding-3-small', input: ['a', 'b'] }), false);
  assert.strictEqual(proxy.styleEligible('/v1/chat/completions', { messages: [] }), false);
  assert.strictEqual(proxy.styleEligible('/v1/models', null), false);
});

// ---------------------------------------------------------------------------
// End to end through the proxy
// ---------------------------------------------------------------------------

test('proxy applies the output style to every chat request while it runs', async () => {
  delete process.env.TOKENSAVER_OUTPUT_STYLE;
  const seen: { body: string; path: string }[] = [];
  const mock = mockUpstream(seen);
  const mockPort = await listen(mock);
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['openai'],
    saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` },
  });

  proxy.setOutputStyle(undefined); // env → config → always-on default
  await proxy.start(0);
  try {
    // 1. small chat request (no RTK compression possible) still gets the style
    const chat = await request(
      'POST',
      proxy.status().port,
      '/v1/chat/completions',
      JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] })
    );
    assert.strictEqual(chat.status, 200);
    const forwarded = JSON.parse(seen[0].body);
    assert.strictEqual(forwarded.messages[0].role, 'system', 'a system prompt must be injected upstream');
    assert.ok(forwarded.messages[0].content.includes(CAVEMAN_LITE_MARKER), 'caveman-lite must be applied');
    assert.strictEqual(forwarded.messages[1].content, 'hi', 'user content must survive untouched');
    assert.strictEqual(proxy.status().outputStyle, 'caveman-lite');
    assert.strictEqual(proxy.status().outputStyleApplied, 1);

    // 2. embeddings must not be rewritten
    await request(
      'POST',
      proxy.status().port,
      '/v1/embeddings',
      JSON.stringify({ model: 'openai/text-embedding-3-small', input: ['alpha', 'beta'] })
    );
    const embedded = JSON.parse(seen[1].body);
    assert.deepStrictEqual(embedded.input, ['alpha', 'beta'], 'embeddings payload must stay pristine');
    assert.strictEqual(embedded.messages, undefined);
    assert.strictEqual(proxy.status().outputStyleApplied, 1, 'non-chat requests are not counted');

    // 3. turning the style off restores the untouched body
    proxy.setOutputStyle('off');
    await request(
      'POST',
      proxy.status().port,
      '/v1/chat/completions',
      JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] })
    );
    const plain = JSON.parse(seen[2].body);
    assert.strictEqual(plain.messages.length, 1, 'no system prompt when the style is off');
    assert.strictEqual(plain.messages[0].role, 'user');
    assert.strictEqual(proxy.status().outputStyle, 'off');
    assert.strictEqual(proxy.status().outputStyleApplied, 1);
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('TOKENSAVER_OUTPUT_STYLE=off disables the style at start', async () => {
  process.env.TOKENSAVER_OUTPUT_STYLE = 'off';
  try {
    await proxy.start(0);
    try {
      assert.strictEqual(proxy.status().outputStyle, 'off');
      assert.strictEqual(proxy.outputStyle().label, 'off');
    } finally {
      await proxy.stop();
    }
  } finally {
    delete process.env.TOKENSAVER_OUTPUT_STYLE;
    proxy.setOutputStyle('caveman-lite');
  }
});

test('/api/style reports and changes the active style', async () => {
  proxy.setOutputStyle('caveman-lite');
  await proxy.start(0);
  try {
    const port = proxy.status().port;
    const headers = { 'X-Token-Saver': controlToken() };

    const before = await request('GET', port, '/api/style', undefined, headers);
    assert.strictEqual(before.status, 200);
    assert.strictEqual(JSON.parse(before.body).outputStyle, 'caveman-lite');

    const change = await request('POST', port, '/api/style', JSON.stringify({ style: 'ponytail-ultra' }), headers);
    assert.strictEqual(change.status, 200);
    assert.strictEqual(JSON.parse(change.body).setting.label, 'ponytail-ultra');

    const after = await request('GET', port, '/api/style', undefined, headers);
    assert.strictEqual(JSON.parse(after.body).outputStyle, 'ponytail-ultra');
    assert.strictEqual(proxy.loadConfig().output_style, 'ponytail-ultra', 'the choice is persisted for the next start');
  } finally {
    await proxy.stop();
    proxy.setOutputStyle('caveman-lite');
  }
});

test('output style can be turned off explicitly', () => {
  for (const value of ['off', 'OFF', 'none', '0', 'false', 'disabled']) {
    const s = prompts.resolveOutputStyle(value);
    assert.strictEqual(s.style, 'off', `${value} should disable the style`);
    assert.strictEqual(s.prompt, '');
    assert.strictEqual(s.label, 'off');
  }
});

// ---------------------------------------------------------------------------
// Context-aware escalation
// ---------------------------------------------------------------------------

test('escalateOutputStyle steps the level up as the context grows', () => {
  const base = prompts.resolveOutputStyle('caveman-lite');
  // Below the first threshold: unchanged.
  assert.strictEqual(prompts.escalateOutputStyle(base, 0).label, 'caveman-lite');
  assert.strictEqual(prompts.escalateOutputStyle(base, 19999).label, 'caveman-lite');
  // Past the first threshold: one rung up.
  assert.strictEqual(prompts.escalateOutputStyle(base, 20000).label, 'caveman-full');
  // Past both: top of the ladder.
  assert.strictEqual(prompts.escalateOutputStyle(base, 60000).label, 'caveman-ultra');
  // Never steps past the top, however big the request gets.
  assert.strictEqual(prompts.escalateOutputStyle(base, 10_000_000).label, 'caveman-ultra');
});

test('escalateOutputStyle honours custom thresholds', () => {
  const base = prompts.resolveOutputStyle('caveman-lite');
  // Each threshold crossed buys exactly one rung.
  assert.strictEqual(prompts.escalateOutputStyle(base, 99, [100, 200]).label, 'caveman-lite');
  assert.strictEqual(prompts.escalateOutputStyle(base, 150, [100, 200]).label, 'caveman-full');
  assert.strictEqual(prompts.escalateOutputStyle(base, 250, [100, 200]).label, 'caveman-ultra');
  // A single threshold means a single step, no matter how far past it.
  assert.strictEqual(prompts.escalateOutputStyle(base, 999999, [1]).label, 'caveman-full');
});

test('escalateOutputStyle starts from wherever the configured level already is', () => {
  // Already mid-ladder: the first threshold takes it to the top, not further.
  assert.strictEqual(prompts.escalateOutputStyle(prompts.resolveOutputStyle('caveman-full'), 20000).label, 'caveman-ultra');
  assert.strictEqual(prompts.escalateOutputStyle(prompts.resolveOutputStyle('caveman-ultra'), 999999).label, 'caveman-ultra');
});

test('escalateOutputStyle never crosses a family or register boundary', () => {
  // Wenyan stays wenyan — no silent switch to plain caveman.
  const w = prompts.resolveOutputStyle('caveman-wenyan-lite');
  assert.strictEqual(prompts.escalateOutputStyle(w, 20000).label, 'caveman-wenyan');
  assert.strictEqual(prompts.escalateOutputStyle(w, 60000).label, 'caveman-wenyan-ultra');
  // Ponytail stays ponytail.
  const p = prompts.resolveOutputStyle('ponytail-lite');
  assert.strictEqual(prompts.escalateOutputStyle(p, 60000).label, 'ponytail-ultra');
});

test('escalateOutputStyle leaves off and unknown levels alone', () => {
  const off = prompts.resolveOutputStyle('off');
  assert.strictEqual(prompts.escalateOutputStyle(off, 900000).label, 'off');
  assert.strictEqual(prompts.escalateOutputStyle(off, 900000).prompt, '');
  // A garbage size must not throw or change anything.
  const base = prompts.resolveOutputStyle('caveman-lite');
  assert.strictEqual(prompts.escalateOutputStyle(base, NaN).label, 'caveman-lite');
});

test('resolveEscalateAt sanitizes garbage and defaults when empty', () => {
  assert.deepStrictEqual(prompts.resolveEscalateAt(['20000', 60000, 'x', -5, 0]), [20000, 60000]);
  assert.deepStrictEqual(prompts.resolveEscalateAt('30000, 1000'), [1000, 30000], 'sorted ascending');
  assert.deepStrictEqual(prompts.resolveEscalateAt([]), [...prompts.DEFAULT_ESCALATE_AT]);
  assert.deepStrictEqual(prompts.resolveEscalateAt(undefined), [...prompts.DEFAULT_ESCALATE_AT]);
  assert.deepStrictEqual(prompts.resolveEscalateAt('nonsense'), [...prompts.DEFAULT_ESCALATE_AT]);
});




// ---------------------------------------------------------------------------
// Cache stability
// ---------------------------------------------------------------------------

test('every level has its own dedupe marker', () => {
  const labels = [
    ...Object.keys(prompts.CAVEMAN_PROMPTS).map((l) => `caveman-${l}`),
    ...Object.keys(prompts.PONYTAIL_PROMPTS).map((l) => `ponytail-${l}`),
  ];
  const markers = labels.map((l) => prompts.outputStyleMarker(prompts.resolveOutputStyle(l)));
  for (const m of markers) assert.ok(m && m.length > 0, 'every level needs a marker');
  assert.strictEqual(
    new Set(markers).size,
    markers.length,
    'markers must be unique per level, otherwise escalating a level looks "already applied"'
  );
  // Stable across calls — required for prompt caching.
  const first = prompts.outputStyleMarker(prompts.resolveOutputStyle('ponytail-full'));
  assert.strictEqual(prompts.outputStyleMarker(prompts.resolveOutputStyle('ponytail-full')), first);
});

test('the ponytail levels that share a prefix stay distinguishable', () => {
  // All three ponytail prompts open with the same sentence — the case a
  // fixed-length prefix marker got wrong.
  const lite = prompts.resolveOutputStyle('ponytail-lite');
  const full = prompts.resolveOutputStyle('ponytail-full');
  const ultra = prompts.resolveOutputStyle('ponytail-ultra');
  assert.notStrictEqual(prompts.outputStyleMarker(lite), prompts.outputStyleMarker(full));
  assert.notStrictEqual(prompts.outputStyleMarker(full), prompts.outputStyleMarker(ultra));

  // A body carrying `full` must not be mistaken for already carrying `lite`.
  const body: any = { messages: [{ role: 'user', content: 'hi' }] };
  assert.strictEqual(prompts.apply_output_style(body, full), true);
  assert.strictEqual(prompts.has_output_style(body, lite), false);
  // ...and escalating onto it must not stack a second, contradictory prompt.
  const before = body.messages.length;
  assert.strictEqual(prompts.apply_output_style(body, ultra), false);
  assert.strictEqual(body.messages.length, before);
});

test('the injected claude system block is cache-friendly', () => {
  const setting = prompts.resolveOutputStyle('caveman-lite');
  const prompt = prompts.CAVEMAN_PROMPTS.lite;

  // No breakpoint in the request → the style block becomes one, so the stable
  // system prefix is a cache read on the next turn instead of re-sent tokens.
  const bare: any = { system: [{ type: 'text', text: 'be concise' }], messages: [] };
  assert.strictEqual(prompts.apply_output_style(bare, setting), true);
  const injected = bare.system.find((b: any) => b.text === prompt);
  assert.ok(injected, 'style block was injected');
  assert.deepStrictEqual(injected.cache_control, { type: 'ephemeral' });

  // An existing breakpoint → slide in before it, so it is covered by the
  // breakpoint the client already pays for, and spend none of our own.
  const withBreak: any = {
    system: [
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b', cache_control: { type: 'ephemeral' } },
    ],
    messages: [],
  };
  assert.strictEqual(prompts.apply_output_style(withBreak, setting), true);
  assert.strictEqual(withBreak.system.length, 3);
  assert.strictEqual(withBreak.system[1].text, prompt, 'inserted just before the existing breakpoint');
  assert.strictEqual(withBreak.system[1].cache_control, undefined, 'no extra breakpoint spent');
  assert.strictEqual(withBreak.system.filter((b: any) => b.cache_control).length, 1);
});

test('the injected style bytes are identical on every request', () => {
  // The ladder only works because the prompt is a frozen constant, so the cached
  // prefix never shifts between turns.
  const a = prompts.resolveOutputStyle('caveman-lite');
  const b = prompts.resolveOutputStyle('caveman-lite');
  assert.strictEqual(a.prompt, b.prompt);
  assert.ok(Object.isFrozen(prompts.CAVEMAN_PROMPTS.lite), 'prompt tables must be frozen');
});

// ---------------------------------------------------------------------------
// End to end: escalation through the proxy
// ---------------------------------------------------------------------------

test('proxy escalates the level once the request context is large', async () => {
  delete process.env.TOKENSAVER_OUTPUT_STYLE;
  const seen: { body: string; path: string }[] = [];
  const mock = mockUpstream(seen);
  const mockPort = await listen(mock);
  const prev = proxy.loadConfig();
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['openai'],
    saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` },
  });
  proxy.setOutputStyle('caveman-lite');
  // Shrink the ladder so the test doesn't need a 20k-token body. Persist it, since
  // start() re-reads the policy from config.
  proxy.saveConfig({ ...proxy.loadConfig(), output_style: 'caveman-lite', output_style_escalate_at: [50, 5000] });

  await proxy.start(0);
  try {
    assert.deepStrictEqual(proxy.outputStyleEscalation().at, [50, 5000]);
    const port = proxy.status().port;
    const post = (content: string) =>
      request(
        'POST',
        port,
        '/v1/chat/completions',
        JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content }] })
      );

    assert.strictEqual((await post('hi')).status, 200);
    assert.strictEqual((await post('x'.repeat(2000))).status, 200);

    const sent = seen.map((s) => JSON.parse(s.body));
    assert.strictEqual(sent.length, 2);
    assert.ok(sent[0].messages[0].content.includes(prompts.CAVEMAN_PROMPTS.lite), 'small request uses the base level');
    assert.ok(
      sent[1].messages[0].content.includes(prompts.CAVEMAN_PROMPTS.full),
      'large request escalates to the next rung'
    );

    const s = proxy.status();
    assert.ok((s.outputStyleEscalated ?? 0) >= 1, 'escalation is counted');

    // The escalated level must be reported, not the configured one.
    const hist = proxy.loadConfig().history || [];
    const last = hist[hist.length - 1];
    assert.strictEqual(last.output_style, 'caveman-full');
    assert.strictEqual(last.style_escalated, true);
    assert.ok((last.style_tokens ?? 0) > 0);
  } finally {
    await proxy.stop();
    mock.close();
    proxy.setOutputStyleEscalation(true);
    proxy.setOutputStyle('caveman-lite');
    proxy.saveConfig(prev);
  }
});

test('escalation can be pinned off, and the setting round-trips', async () => {
  await proxy.start(0);
  try {
    const port = proxy.status().port;
    const headers = { 'X-Token-Saver': controlToken() };

    const off = await request('POST', port, '/api/style', JSON.stringify({ escalate: false }), headers);
    assert.strictEqual(off.status, 200);
    assert.strictEqual(JSON.parse(off.body).escalate, false);
    assert.strictEqual(proxy.outputStyleEscalation().enabled, false);
    assert.strictEqual(proxy.loadConfig().output_style_escalate, false, 'persisted');

    const retune = await request('POST', port, '/api/style', JSON.stringify({ at: [8000, 40000] }), headers);
    assert.deepStrictEqual(JSON.parse(retune.body).escalateAt, [8000, 40000]);
    assert.strictEqual(
      proxy.outputStyleEscalation().enabled,
      false,
      'retuning thresholds does not silently re-enable it'
    );

    const bad = await request('POST', port, '/api/style', JSON.stringify({}), headers);
    assert.strictEqual(bad.status, 400, 'an empty body is still rejected');
  } finally {
    await proxy.stop();
    proxy.setOutputStyleEscalation(true);
  }
});

test('proxy style and escalation settings are restored from config on start', async () => {
  const cfg = proxy.loadConfig();
  proxy.saveConfig({
    ...cfg,
    output_style: 'ponytail-full',
    output_style_escalate: false,
    output_style_escalate_at: [1, 2],
  });
  await proxy.start(0);
  try {
    assert.strictEqual(proxy.outputStyle().label, 'ponytail-full');
    assert.strictEqual(proxy.outputStyleEscalation().enabled, false);
    assert.deepStrictEqual(proxy.outputStyleEscalation().at, [1, 2]);
  } finally {
    await proxy.stop();
    const c = proxy.loadConfig();
    proxy.saveConfig({ ...c, output_style: 'caveman-lite', output_style_escalate: true, output_style_escalate_at: undefined });
  }
});

test('escalation settings are read from config even without an explicit set', () => {
  // Regression: the read-only accessors used to report built-in defaults, so
  // `proxy style` and GET /api/style silently ignored what the user saved.
  const prev = proxy.loadConfig();
  proxy.saveConfig({
    ...prev,
    output_style: 'ponytail-full',
    output_style_escalate: true,
    output_style_escalate_at: [1234, 4321],
  });
  proxy.setOutputStyle(undefined);
  assert.strictEqual(proxy.outputStyle().label, 'ponytail-full');
  assert.strictEqual(proxy.outputStyleEscalation().enabled, true);
  assert.deepStrictEqual(proxy.outputStyleEscalation().at, [1234, 4321]);
  proxy.saveConfig(prev);
});
