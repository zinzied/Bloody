import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-insights-'));
process.env.TOKENSAVER_HOME = TMP;

const proxy = await import('../src/core/proxy.js');

function bigDiff() {
  return Array.from(
    { length: 30 },
    (_, i) =>
      `diff --git a/file${i}.js b/file${i}.js\n--- a/file${i}.js\n+++ b/file${i}.js\n@@ -1,2 +1,2 @@\n-old line ${i}\n+new line ${i}\n`
  ).join('');
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as any).port));
  });
}

function post(
  port: number,
  pathname: string,
  body: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, ...extraHeaders },
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

/** Raw header lines as they went out on the wire, so duplicates stay visible. */
function rawHeaderLines(req: http.IncomingMessage): string[] {
  const lines: string[] = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  return lines;
}

/**
 * Point the auth-file lookups at a throwaway home so one test's auth.json cannot
 * influence the others. config.ts binds its own paths at import time, but the
 * proxy resolves the auth locations per call.
 */
async function withIsolatedAuthHome<T>(auth: Record<string, any>, fn: () => Promise<T>): Promise<T> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-auth-'));
  const dir = path.join(home, '.local', 'share', 'opencode');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify(auth), 'utf-8');
  const previous = process.env.TOKENSAVER_HOME;
  process.env.TOKENSAVER_HOME = home;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TOKENSAVER_HOME;
    else process.env.TOKENSAVER_HOME = previous;
  }
}

test('canonicalEndpoint normalizes /v1 paths', () => {
  assert.strictEqual(proxy.canonicalEndpoint('/v1/chat/completions'), '/chat/completions');
  assert.strictEqual(proxy.canonicalEndpoint('/chat/completions'), '/chat/completions');
  assert.strictEqual(proxy.canonicalEndpoint('/v1/responses'), '/responses');
  assert.strictEqual(proxy.canonicalEndpoint('/v1/messages'), '/messages');
  assert.strictEqual(proxy.canonicalEndpoint('/v1/models'), '/models');
  assert.strictEqual(proxy.canonicalEndpoint('/v1/embeddings'), '/v1/embeddings');
});

test('resolveUpstream routes model prefix to its provider base', () => {
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { openai: 'https://api.openai.com/v1' } });
  const r = proxy.resolveUpstream('openai/gpt-4o', '/v1/chat/completions');
  assert.strictEqual(r.pid, 'openai');
  assert.strictEqual(r.url, 'https://api.openai.com/v1/chat/completions');
});

test('resolveUpstream falls back to defaults for unknown models', () => {
  proxy.saveConfig({ port: 0, enabled: false });
  const r = proxy.resolveUpstream('unknown-model-x', '/v1/responses');
  assert.strictEqual(r.url, 'https://api.openai.com/v1/responses');
});

test('resolveUpstream routes bare catalog models to their provider', () => {
  const cfgDir = path.join(TMP, '.config', 'opencode');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, 'models_cache.json'),
    JSON.stringify({ opencode: { name: 'OpenCode', models: { 'big-pickle': {} } } }),
    'utf-8'
  );
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['opencode'],
    saved_base_urls: { opencode: 'https://opencode.ai/zen/v1' },
  });
  const r = proxy.resolveUpstream('big-pickle', '/v1/chat/completions');
  assert.strictEqual(r.pid, 'opencode');
  assert.strictEqual(r.url, 'https://opencode.ai/zen/v1/chat/completions');
});

test('enable writes config and status reports running state', async () => {
  proxy.saveConfig({ port: 0, enabled: false });
  const cfg = proxy.enable(true, 9999);
  assert.strictEqual(cfg.enabled, true);
  assert.strictEqual(cfg.port, 9999);
  const st = proxy.status();
  assert.strictEqual(st.enabled, true);
  assert.strictEqual(st.running, false);
});

test('proxy compresses outgoing tool results', async () => {
  let receivedBody: string | null = null;
  const mock = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      receivedBody = chunks;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ message: { role: 'assistant', content: 'ok' } }] })
      );
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` } });

  const toolResult = bigDiff();
  const body = JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      { role: 'user', content: 'run the tests' },
      { role: 'assistant', content: 'on it' },
      { role: 'tool', content: toolResult },
    ],
  });

  await proxy.start(0);
  try {
    const s = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s.status, 200);
    assert.ok(JSON.parse(s.body).id === 'x');
    const parsed = JSON.parse(receivedBody!);
    // the proxy also injects the always-on terse-output system prompt, so look the
    // tool result up by role instead of by a fixed index
    const toolMsg = parsed.messages.find((m: any) => m.role === 'tool');
    assert.ok(toolMsg, 'the tool result must be forwarded');
    assert.ok(toolMsg.content.length < toolResult.length);
    assert.strictEqual(parsed.messages[0].role, 'system', 'the output style prompt is always applied');
    const st = proxy.status();
    assert.strictEqual(st.requestsServed, 1);
    assert.strictEqual(st.compressionHits, 1);
    assert.ok(st.totalSavedBytes > 0);
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('proxy retries with original body when upstream returns 400', async () => {
  let calls = 0;
  const bodies: string[] = [];
  const mock = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      calls += 1;
      bodies.push(chunks);
      if (calls === 1) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'bad request' } }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'retried', choices: [] }));
      }
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` } });

  const toolResult = bigDiff();
  const body = JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'tool', content: toolResult }] });

  await proxy.start(0);
  try {
    const s = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s.status, 200);
    assert.strictEqual(calls, 2);
    // the first attempt sends the rewritten body (compressed tool result + always-on style)
    assert.notStrictEqual(bodies[0], body);
    const firstTool = JSON.parse(bodies[0]).messages.find((m: any) => m.role === 'tool');
    assert.ok(firstTool.content.length < toolResult.length, 'the tool result is still compressed');
    // the retry must fall back to the original client body, byte for byte
    assert.strictEqual(bodies[1], body);
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('proxy reroutes to a healthy provider after the first returns 429', async () => {
  const dead: string[] = [];
  const healthy: { model: string | null; auth: string | null } = { model: null, auth: null };
  const deadMock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      dead.push(req.url || '');
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'FreeUsageLimitError', message: 'rate limit exceeded' } }));
    });
  });
  const healthyMock = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c: string) => (chunks += c));
    req.on('end', () => {
      healthy.model = JSON.parse(chunks).model;
      healthy.auth = req.headers['authorization'] || null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'fb', object: 'chat.completion', choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
    });
  });
  const deadPort = await listen(deadMock);
  const healthyPort = await listen(healthyMock);
  process.env.ZAI_API_KEY = 'test-zai-key';
  const cfgDir = path.join(TMP, '.config', 'opencode');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(
    path.join(cfgDir, 'opencode.jsonc'),
    JSON.stringify({ model: 'zai/glm-4.5-flash', small_model: 'zai/glm-4.5-flash' }),
    'utf-8'
  );
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['openai', 'zai'],
    saved_base_urls: {
      openai: `http://127.0.0.1:${deadPort}/v1`,
      zai: `http://127.0.0.1:${healthyPort}/v1`,
    },
  });
  const body = JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] });

  await proxy.start(0);
  try {
    const s1 = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s1.status, 429);
    assert.strictEqual(dead.length, 1, 'first request must hit the dead upstream');

    const s2 = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s2.status, 200);
    assert.strictEqual(healthy.model, 'glm-4.5-flash', 'rerouted request must carry the fallback model');
    assert.strictEqual(healthy.auth, 'Bearer test-zai-key', 'rerouted request must swap to the fallback credential');
    assert.strictEqual(dead.length, 1, 'no further traffic must reach the dead upstream');
  } finally {
    await proxy.stop();
    deadMock.close();
    healthyMock.close();
    delete process.env.ZAI_API_KEY;
    try {
      fs.unlinkSync(path.join(cfgDir, 'opencode.jsonc'));
    } catch {}
  }
});

test('testConnection reports health and upstream forwarding', async () => {
  const mock = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'm' }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` } });

  const idle = await proxy.testConnection();
  assert.strictEqual(idle.running, false);

  await proxy.start(0);
  try {
    const t = await proxy.testConnection();
    assert.strictEqual(t.running, true);
    assert.ok(t.port! > 0);
    assert.strictEqual(t.health!.ok, true);
    assert.strictEqual(t.health!.code, 200);
    assert.ok(t.forward);
    assert.strictEqual(t.forward.code, 200);
    assert.ok(t.forward.upstream.includes('127.0.0.1'));
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('proxy records python-style saved_tokens and writes index rows', async () => {
  const mock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'x', choices: [] }));
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` } });

  const toolResult = bigDiff();
  const body = JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [{ role: 'user', content: 'go' }, { role: 'tool', content: toolResult }],
  });

  await proxy.start(0);
  try {
    const s = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s.status, 200);

    const cfg = proxy.loadConfig();
    const entry = cfg.history![cfg.history!.length - 1];
    assert.ok(entry.saved_tokens! > 0, 'expected saved_tokens > 0');
    assert.strictEqual(entry.frost_saved, 0);
    assert.ok(typeof entry.timestamp === 'number');
    assert.strictEqual(cfg.total_saved_tokens, entry.saved_tokens);

    const index = await import('../src/core/index.js');
    const stats = index.proxyStats();
    assert.ok(stats!.total_requests >= 1);
    assert.ok(stats!.total_saved >= entry.saved_tokens!);
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('proxy rotates accounts and overrides auth + base url', async () => {
  const seen: any[] = [];
  const mock = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: chunks, count: seen.length + 1 });
      if (seen.length === 1) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'rate limit' } }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'ok' }));
      }
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({
    port: 0,
    enabled: false,
    saved_base_urls: { openai: `http://127.0.0.1:${mockPort}/v1` },
    account_strategy: 'round-robin',
  });
  const am = proxy.accountManager;
  am.add_account('openai', 'key-one', `http://127.0.0.1:${mockPort}/v1`, 0);
  am.add_account('openai', 'key-two', `http://127.0.0.1:${mockPort}/v1`, 0);

  const body = JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] });

  await proxy.start(0);
  try {
    const s1 = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s1.status, 429);
    assert.strictEqual(seen[0].auth, 'Bearer key-one');

    const s2 = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s2.status, 200);
    assert.strictEqual(seen[1].auth, 'Bearer key-two');
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('proxy strips provider prefix from forwarded model', async () => {
  let receivedBody = '';
  const mock = http.createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      receivedBody = chunks;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'x', choices: [] }));
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { opencode: `http://127.0.0.1:${mockPort}/v1` } });

  const body = JSON.stringify({ model: 'opencode/big-pickle', messages: [{ role: 'user', content: 'hello' }] });

  await proxy.start(0);
  try {
    const s = await post(proxy.status().port!, '/v1/chat/completions', body);
    assert.strictEqual(s.status, 200);
    const parsed = JSON.parse(receivedBody);
    assert.strictEqual(parsed.model, 'big-pickle');
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('providerIdAliases treats the opencode spellings as one provider', () => {
  assert.deepStrictEqual(proxy.normalizeProviderId('OpenCode-Go'), 'opencode_go');
  for (const pid of ['opencode', 'opencode-go', 'opencode_go']) {
    const aliases = proxy.providerIdAliases(pid);
    for (const expected of ['opencode', 'opencode_go', 'opencode-go']) {
      assert.ok(aliases.includes(expected), `${pid} should resolve to ${expected}`);
    }
  }
  assert.deepStrictEqual(proxy.providerIdAliases(''), []);
});

test('providerBaseUrl resolves the zen base for every opencode spelling', () => {
  proxy.saveConfig({ port: 0, enabled: false });
  for (const pid of ['opencode', 'opencode-go', 'opencode_go']) {
    assert.strictEqual(proxy.providerBaseUrl(pid), 'https://opencode.ai/zen/v1', `failed for ${pid}`);
  }
});

test('providerBaseUrl honours ANTHROPIC_BASE_URL instead of the public api', () => {
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: {} });
  process.env.ANTHROPIC_BASE_URL = 'https://gateway.internal/anthropic';
  try {
    assert.strictEqual(proxy.providerBaseUrl('anthropic'), 'https://gateway.internal/anthropic');
  } finally {
    delete process.env.ANTHROPIC_BASE_URL;
  }
});

test('proxy supplies the stored credential when the client sends none', async () => {
  // OpenCode keeps the zen key under `opencode-go` while the provider block is
  // `opencode`, so the client arrives with no key and upstream answers
  // "invalid api key" unless the proxy resolves the alias.
  const seen: http.IncomingHttpHeaders[] = [];
  const mock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push(req.headers);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'ok' }));
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { opencode: `http://127.0.0.1:${mockPort}/v1` } });
  const body = JSON.stringify({ model: 'opencode/big-pickle', messages: [{ role: 'user', content: 'hi' }] });

  await withIsolatedAuthHome({ 'opencode-go': { type: 'api', key: 'oc_sk_stored' } }, async () => {
    await proxy.start(0);
    try {
      const s = await post(proxy.status().port!, '/v1/chat/completions', body);
      assert.strictEqual(s.status, 200);
      assert.strictEqual(seen[0].authorization, 'Bearer oc_sk_stored');
    } finally {
      await proxy.stop();
    }
  });
  mock.close();
});

test("an OAuth access token is never used as a provider API key", async () => {
  const seen: http.IncomingHttpHeaders[] = [];
  const mock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push(req.headers);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'ok' }));
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { anthropic: `http://127.0.0.1:${mockPort}/v1` } });
  const body = JSON.stringify({ model: 'anthropic/claude-opus-4-6', messages: [{ role: 'user', content: 'hi' }] });

  await withIsolatedAuthHome({ anthropic: { type: 'oauth', access: 'oauth-access-token', refresh: 'r' } }, async () => {
    await proxy.start(0);
    try {
      const s = await post(proxy.status().port!, '/v1/chat/completions', body);
      assert.strictEqual(s.status, 200);
      assert.strictEqual(seen[0].authorization, undefined, 'must not present an OAuth token as a bearer key');
      assert.strictEqual(seen[0]['x-api-key'], undefined);
    } finally {
      await proxy.stop();
    }
  });
  mock.close();
});

test('anthropic upstreams get x-api-key and never a bearer token', async () => {
  const seen: string[] = [];
  const mock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push(...rawHeaderLines(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'ok' }));
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { anthropic: `http://127.0.0.1:${mockPort}/v1` } });
  proxy.accountManager.add_account('anthropic', 'sk-ant-account', '', 0);

  const body = JSON.stringify({ model: 'anthropic/claude-opus-4-6', messages: [{ role: 'user', content: 'hi' }] });

  await proxy.start(0);
  try {
    // The client still carries its own key; the account must fully replace it.
    const s = await post(proxy.status().port!, '/v1/chat/completions', body, { 'x-api-key': 'client-stale-key' });
    assert.strictEqual(s.status, 200);
    assert.ok(seen.includes('x-api-key: sk-ant-account'), 'expected the account key as x-api-key');
    assert.ok(
      !seen.some((l) => /^authorization:/i.test(l)),
      `anthropic must not receive a bearer header, got: ${seen.join(' | ')}`
    );
    assert.ok(!seen.some((l) => /client-stale-key/.test(l)), 'the stale client key must be cleared');
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('the control token is never forwarded to the upstream provider', async () => {
  const seen: string[] = [];
  const mock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      seen.push(...rawHeaderLines(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'ok' }));
    });
  });
  const mockPort = await listen(mock);
  proxy.saveConfig({ port: 0, enabled: false, saved_base_urls: { groq: `http://127.0.0.1:${mockPort}/v1` } });

  const body = JSON.stringify({ model: 'groq/llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'hi' }] });

  await proxy.start(0);
  try {
    const s = await post(proxy.status().port!, '/v1/chat/completions', body, {
      Authorization: 'Bearer client-key',
      'X-Token-Saver': 'secret-control-token',
    });
    assert.strictEqual(s.status, 200);
    assert.ok(!seen.some((l) => /x-token-saver/i.test(l)), `control token leaked upstream: ${seen.join(' | ')}`);
    assert.ok(seen.some((l) => /^authorization: Bearer client-key$/i.test(l)), 'the client credential still passes through');
  } finally {
    await proxy.stop();
    mock.close();
  }
});

test('a reroute clears the credential minted for the original provider', async () => {
  const healthy: string[] = [];
  const deadMock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'FreeUsageLimitError', message: 'rate limit exceeded' } }));
    });
  });
  const healthyMock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      healthy.push(...rawHeaderLines(req));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'ok' }));
    });
  });
  const deadPort = await listen(deadMock);
  const healthyPort = await listen(healthyMock);
  process.env.ZAI_API_KEY = 'test-zai-key';
  const cfgDir = path.join(TMP, '.config', 'opencode');
  fs.mkdirSync(cfgDir, { recursive: true });
  const cfgFile = path.join(cfgDir, 'opencode.jsonc');
  fs.writeFileSync(cfgFile, JSON.stringify({ model: 'zai/glm-4.5-flash', small_model: 'zai/glm-4.5-flash' }), 'utf-8');
  proxy.saveConfig({
    port: 0,
    enabled: false,
    proxied_providers: ['openai', 'zai'],
    saved_base_urls: {
      openai: `http://127.0.0.1:${deadPort}/v1`,
      zai: `http://127.0.0.1:${healthyPort}/v1`,
    },
  });
  const body = JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] });

  await proxy.start(0);
  try {
    await post(proxy.status().port!, '/v1/chat/completions', body, {
      Authorization: 'Bearer openai-client-key',
      'x-api-key': 'openai-client-key',
    });
    assert.ok(
      healthy.some((l) => /zai-key/i.test(l)),
      `the fallback credential should be used, got: ${healthy.join(' | ')}`
    );
    assert.ok(
      !healthy.some((l) => /openai-client-key/i.test(l)),
      `the dead provider's key must not survive the reroute, got: ${healthy.join(' | ')}`
    );
  } finally {
    await proxy.stop();
    deadMock.close();
    healthyMock.close();
    delete process.env.ZAI_API_KEY;
    try {
      fs.unlinkSync(cfgFile);
    } catch {}
  }
});
