import React, { useState } from 'react';
import { api, type CompressResult } from '../api';
import { fmt } from '../fmt';

export function CompressScreen({ enginePort }: { enginePort: number | null }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<CompressResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('auto');

  const run = async () => {
    if (!text.trim()) return;
    setError('');
    setLoading(true);
    try {
      const r = await api.compress(text);
      setResult(r as CompressResult);
    } catch (e) {
      setError(String((e as Error).message || e));
    }
    setLoading(false);
  };

  const loadSample = async (sample: 'diff' | 'log') => {
    const s = sample === 'diff'
      ? `diff --git a/src/app.ts b/src/app.ts\nindex abc123..def456 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,20 +1,25 @@\n-import old from './old';\n+import next from './next';\n function hello() {\n-  console.log("old");\n+  console.log("new");\n+  console.log("added line 1");\n+  console.log("added line 2");\n }\n`.repeat(60)
      : `npm warn deprecated inflight@1.0.6: deprecated\nCompiling foo.ts\nCompiling bar.ts\nDownloading package 1/100\nERROR: Something failed\nwarning: unused variable\nBUILD FAILED\n`.repeat(80);
    setText(s);
    await run();
  };

  const truncate = (s: string, n: number) => s.length <= n ? s : s.slice(0, n) + `… [+${s.length - n} chars]`;

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Compress</h1>
        <p className="page-subtitle">RTK compression lab with accurate tiktoken counts</p>
      </header>

      {error && <div className="error-line">{error}</div>}
      {loading && <div className="spinner"><span className="spinner-frame">⠋</span>Compressing…</div>}

      {!loading && !result && (
        <div className="hint">
          <p>Enter tool output (git diff, build log, ls -la, etc.) and press <strong>Run</strong>.</p>
          <p style={{ marginTop: '8px' }}>
            <button onClick={() => loadSample('diff')} className="badge ok" style={{ cursor: 'pointer', marginRight: '8px' }}>Load Diff Demo</button>
            <button onClick={() => loadSample('log')} className="badge ok" style={{ cursor: 'pointer' }}>Load Log Demo</button>
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste git diff / log / ls -la …"
          style={{
            flex: 1,
            minHeight: '120px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            padding: '12px',
            background: 'var(--color-bg)',
            color: 'var(--color-fg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '140px' }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              background: 'var(--color-bg-elevated)',
              color: 'var(--color-fg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <option value="auto">Auto-detect</option>
            <option value="git-diff">Git Diff</option>
            <option value="terminal">Terminal/Logs</option>
            <option value="json">JSON</option>
            <option value="stacktrace">Stack Trace</option>
            <option value="code">Code</option>
          </select>
          <button onClick={run} disabled={loading || !text.trim()} className="badge ok" style={{ cursor: 'pointer', padding: '8px 16px' }}>
            {loading ? 'Running…' : 'Run'}
          </button>
          <button onClick={() => { setText(''); setResult(null); setError(''); }} className="badge warn" style={{ cursor: 'pointer', padding: '8px 16px' }}>Clear</button>
        </div>
      </div>

      {result && (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Filter</div>
              <div className="stat-value">{result.detected || 'none'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Chars In</div>
              <div className="stat-value">{fmt(result.length)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Chars Out</div>
              <div className="stat-value">{fmt(result.compressed_length)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Saved</div>
              <div className="stat-value">{fmt(result.saved)} ({result.pct}%)</div>
              <div className="stat-sub" style={{ color: result.pct > 30 ? 'var(--color-ok)' : 'var(--color-dim)' }}>
                {result.pct > 30 ? 'Good compression' : result.pct > 0 ? 'Modest' : 'No savings'}
              </div>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Tokens (Accurate)</div>
              <div className="stat-value">{fmt(result.tokensIn)} → {fmt(result.tokensOut)}</div>
              <div className="stat-sub">saved {fmt(result.tokensSaved)} ({result.tokensPct}%) · {result.tokenizer?.available ? result.tokenizer.encoding : 'heuristic'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Tokens (Heuristic)</div>
              <div className="stat-value">{fmt(result.heuristicIn)} → {fmt(result.heuristicOut)}</div>
              <div className="stat-sub">{result.heuristicIn ? `${Math.max(0, result.heuristicIn - result.heuristicOut)} saved` : ''}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Est. Cost Saved</div>
              <div className="stat-value">${(result.tokensSaved * 3 / 1_000_000).toFixed(4)}</div>
              <div className="stat-sub">@ $3/M blended · ×1k req = ${(result.tokensSaved * 3 / 1_000).toFixed(2)}k</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Tokenizer</div>
              <div className="stat-value" style={{ color: result.tokenizer?.available ? 'var(--color-ok)' : 'var(--color-section)' }}>
                {result.tokenizer?.available ? '✓ cl100k_base' : '⚠ heuristic'}
              </div>
            </div>
          </div>

          {result.tooSmall && (
            <div className="hint mt-2">
              Input is below MIN_COMPRESS_SIZE ({result.min} chars) — small inputs are passed through.
            </div>
          )}

          {!result.detected && !result.tooSmall && (
            <div className="hint mt-2">No filter matched. Long, dedupable logs get smart-truncated automatically.</div>
          )}

          <section className="section">
            <h2 className="section-title">Split-pane Comparison</h2>
            <div className="table-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '12px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-section)' }}>
                  Original — {fmt(result.length)} chars · {fmt(result.tokensIn)} tok · {fmt(result.heuristicIn)} tok (heuristic)
                </div>
                <pre style={{ padding: '12px', margin: 0, fontSize: '11px', lineHeight: 1.5, overflow: 'auto', maxHeight: '400px', color: 'var(--color-dim)', fontFamily: 'var(--font-mono)' }}>
                  {truncate((result.originalText || '').replace(/\r/g, ''), 2000)}
                </pre>
              </div>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '12px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: result.compressed ? 'var(--color-ok)' : 'var(--color-err)' }}>
                  {result.compressed
                    ? `Compressed via ${result.detected} — ${fmt(result.compressed_length)} chars`
                    : 'No compression (output = input)'}
                  · {fmt(result.tokensOut)} tok
                </div>
                <pre style={{ padding: '12px', margin: 0, fontSize: '11px', lineHeight: 1.5, overflow: 'auto', maxHeight: '400px', color: result.compressed ? 'var(--color-fg)' : 'var(--color-dim)', fontFamily: 'var(--font-mono)' }}>
                  {result.compressed ? truncate(result.compressed.replace(/\r/g, ''), 2000) : truncate((result.originalText || '').replace(/\r/g, ''), 2000)}
                </pre>
              </div>
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Budget Hints</h2>
            <div className="hint">
              Huge outputs are auto-pruned at 10000 chars → head 3000 + tail 2000.
              Budget enforcement uses accurate counts to stay within daily ${result.tokenizer?.available ? '(tiktoken)' : '(heuristic fallback)'}.
            </div>
          </section>

          {result.compressed && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <span className={result.pct > 50 ? 'badge ok' : 'badge warn'}>{result.pct}% chars saved</span>
              <span className={result.tokensPct > 50 ? 'badge ok' : 'badge warn'}>{result.tokensPct}% tokens saved</span>
              <span className={result.tokensPct > 30 ? 'badge ok' : 'badge warn'}>{fmt(result.tokensSaved)} tok saved</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}