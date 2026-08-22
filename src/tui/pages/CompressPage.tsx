import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { Page, Row, Stat, Hint, ErrorLine, TextField, Badge, fmt } from '../components.js';
import { useScreenInput } from '../input.js';
import { compressTest } from '../../core/insights.js';
import * as rtk from '../../core/filters/rtk.js';
import * as tokens from '../../core/tokens.js';
import fs from 'node:fs';

const FILTER_NAMES = ['auto', ...Object.keys(rtk.FILTER_REGISTRY)];
const SAMPLE_GIT_DIFF = `diff --git a/src/app.ts b/src/app.ts
index abc123..def456 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,20 +1,25 @@
-import old from './old';
+import next from './next';
 function hello() {
-  console.log("old");
+  console.log("new");
+  console.log("added line 1");
+  console.log("added line 2");
 }
`.repeat(60);
const SAMPLE_BUILD_LOG = `npm warn deprecated inflight@1.0.6: deprecated
Compiling foo.ts
Compiling bar.ts
Downloading package 1/100
ERROR: Something failed
warning: unused variable
BUILD FAILED
`.repeat(80);

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `… [+${s.length - n} chars]`;
}

function costForTokens(tok: number): string {
  // rough cost at $3/M (mixed) for display
  return `$${(tok * 3 / 1_000_000).toFixed(4)}`;
}

export function CompressPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [fileMode, setFileMode] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [filterIdx, setFilterIdx] = useState(0); // 0=auto
  const [tokenMode, setTokenMode] = useState<'accurate' | 'heuristic' | 'both'>('both');

  const filterName = FILTER_NAMES[filterIdx] || 'auto';

  const run = (overrideText?: string, overrideFilter?: string) => {
    setError('');
    const src = overrideText ?? text;
    const fname = overrideFilter ?? filterName;
    try {
      if (fname !== 'auto') {
        const fn = rtk.FILTER_REGISTRY[fname];
        if (!fn) throw new Error(`unknown filter ${fname}`);
        const out = rtk.safe_apply(fn, src);
        const same = !out || out.length >= src.length;
        const tokIn = tokens.count_tokens(src);
        const tokOut = same ? tokIn : tokens.count_tokens(out);
        setResult({
          detected: fname,
          tooSmall: src.length < rtk.MIN_COMPRESS_SIZE,
          min: rtk.MIN_COMPRESS_SIZE,
          length: src.length,
          compressed_length: same ? src.length : out.length,
          saved: same ? 0 : src.length - out.length,
          pct: same ? 0 : Number((((src.length - out.length) / src.length) * 100).toFixed(1)),
          compressed: same ? null : out,
          tokensIn: tokIn,
          tokensOut: tokOut,
          tokensSaved: same ? 0 : Math.max(0, tokIn - tokOut),
          tokensPct: same || tokIn === 0 ? 0 : Number((((tokIn - tokOut) / tokIn) * 100).toFixed(1)),
          heuristicIn: tokens.estimate_text_tokens(src),
          heuristicOut: same ? tokens.estimate_text_tokens(src) : tokens.estimate_text_tokens(out),
          tokenizer: tokens.tokenizerInfo(),
          originalText: src,
        });
      } else {
        const r = compressTest(src);
        setResult({ ...r, originalText: src });
      }
    } catch (e) {
      setError(String((e as Error).message || e));
    }
    setEditing(false);
    setFileMode(false);
  };

  useScreenInput((k) => {
    if (k.q || k.up || k.down || k.esc) return false;
    if (editing || fileMode) return false;
    if (k.input === 'e') {
      setEditing(true);
      return true;
    }
    if (k.input === 'o') {
      setFileMode(true);
      return true;
    }
    if (k.input === 'l') {
      const sample = filterIdx % 2 === 0 ? SAMPLE_GIT_DIFF : SAMPLE_BUILD_LOG;
      setText(sample);
      setTimeout(() => run(sample), 10);
      return true;
    }
    if (k.input === 'c' && result) {
      setResult(null);
      setText('');
      setError('');
      return true;
    }
    if (k.input === 't') {
      setTokenMode((m) => (m === 'both' ? 'accurate' : m === 'accurate' ? 'heuristic' : 'both'));
      return true;
    }
    if (k.input === 'f') {
      const next = (filterIdx + 1) % FILTER_NAMES.length;
      setFilterIdx(next);
      if (text) run(text, FILTER_NAMES[next]);
      return true;
    }
    if (k.input === 'r' && text) {
      run();
      return true;
    }
    if (k.input === 's' && text) {
      const demo = SAMPLE_GIT_DIFF;
      setText(demo);
      run(demo);
      return true;
    }
    return false;
  });

  const originalPreview = useMemo(() => {
    if (!result || !result.originalText) return '';
    return result.originalText as string;
  }, [result]);

  return (
    <Page title="Compress — Playground" sub="Split-pane RTK compression lab with accurate tiktoken counts and budget-aware cost estimates.">
      {error && <ErrorLine>{error}</ErrorLine>}

      {!editing && !fileMode && (
        <Hint>
          e: enter text · o: load file · l: demo sample · f: filter ({filterName}) · t: tokens ({tokenMode}) · r:
          rerun · c: clear · s: load large diff
        </Hint>
      )}

      {editing && (
        <TextField
          label="Tool output (single line; for multi-line use o:load file or l:demo)"
          value={text}
          onChange={setText}
          onSubmit={() => run()}
          onCancel={() => setEditing(false)}
          placeholder="paste git diff / log / ls -la … then Enter"
        />
      )}

      {fileMode && (
        <TextField
          label="File path"
          value={filePath}
          onChange={setFilePath}
          onSubmit={(v) => {
            try {
              const content = fs.readFileSync(v.trim(), 'utf-8');
              setText(content);
              run(content);
            } catch (e) {
              setError(String((e as Error).message || e));
              setFileMode(false);
            }
          }}
          onCancel={() => setFileMode(false)}
          placeholder="/tmp/log.txt or ./src/app.ts"
        />
      )}

      {result && (
        <>
          <Row>
            <Stat label="Filter" value={result.detected ?? 'none'} />
            <Stat label="Chars in" value={fmt(result.length)} />
            <Stat label="Chars out" value={fmt(result.compressed_length ?? result.length)} />
            <Stat label="Saved" value={`${fmt(result.saved ?? 0)} (${result.pct ?? 0}%)`} color={Number(result.pct) > 30 ? 'green' : undefined} />
          </Row>
          <Row>
            <Stat
              label="Tokens (accurate)"
              value={`${fmt(result.tokensIn ?? 0)} → ${fmt(result.tokensOut ?? result.tokensIn ?? 0)}`}
              sub={`saved ${fmt(result.tokensSaved ?? 0)} (${result.tokensPct ?? 0}%) · ${result.tokenizer?.available ? result.tokenizer.encoding : 'heuristic fallback'}`}
            />
            <Stat
              label="Tokens (heuristic)"
              value={`${fmt(result.heuristicIn ?? 0)} → ${fmt(result.heuristicOut ?? result.heuristicIn ?? 0)}`}
              sub={`${result.heuristicIn ? `${Math.max(0, result.heuristicIn - (result.heuristicOut ?? result.heuristicIn))} saved` : ''}`}
            />
            <Stat label="Est. cost saved" value={costForTokens(result.tokensSaved ?? 0)} sub="@ $3/M blended · ×1k req = $k" />
            <Stat label="Tokenizer" value={result.tokenizer?.available ? '✓ cl100k_base' : '⚠ heuristic'} color={result.tokenizer?.available ? 'green' : 'yellow'} />
          </Row>

          {result.tooSmall && (
            <Hint>
              Input is below MIN_COMPRESS_SIZE ({result.min} chars) — small inputs are passed through. Try l/demo
              or file load for realistic logs.
            </Hint>
          )}
          {!result.detected && !result.tooSmall && (
            <Hint>No filter matched. Long, dedupable logs get smart-truncated automatically.</Hint>
          )}

          {/* Split-pane comparison */}
          <Box flexDirection="row" width="100%" marginTop={1}>
            <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" padding={1} marginRight={1}>
              <Text bold color="yellow">
                Original — {fmt(result.length)} chars · {fmt(result.tokensIn)} tok (accurate) · {fmt(result.heuristicIn)} tok (heuristic)
              </Text>
              <Box marginTop={1}>
                <Text color="gray">{truncate(originalPreview.replace(/\r/g, ''), 700)}</Text>
              </Box>
              {originalPreview.length > 700 && <Text color="gray">… truncated preview ({fmt(originalPreview.length - 700)} more chars)</Text>}
            </Box>
            <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={result.compressed ? 'green' : 'red'} padding={1}>
              <Text bold color={result.compressed ? 'green' : 'red'}>
                {result.compressed ? `Compressed via ${result.detected} — ${fmt(result.compressed_length)} chars` : 'No compression (output = input)'} · {fmt(result.tokensOut ?? result.tokensIn)} tok
              </Text>
              <Box marginTop={1}>
                <Text color={result.compressed ? 'white' : 'gray'}>
                  {result.compressed ? truncate(result.compressed.replace(/\r/g, ''), 700) : truncate(originalPreview.replace(/\r/g, ''), 700)}
                </Text>
              </Box>
              {result.compressed && result.compressed.length > 700 && (
                <Text color="gray">… truncated preview ({fmt(result.compressed.length - 700)} more chars)</Text>
              )}
            </Box>
          </Box>

          <Box marginTop={1}>
            <Hint>
              Hint: huge outputs are auto-pruned at {rtk.TOOL_RESULT_PRUNE_THRESHOLD} chars → head {rtk.TOOL_RESULT_PRUNE_HEAD} + tail{' '}
              {rtk.TOOL_RESULT_PRUNE_TAIL}. Budget enforcement uses accurate counts to stay within daily $
              {result.tokenizer?.available ? ' (tiktoken)' : ' (heuristic fallback)'}.
            </Hint>
          </Box>
          {result.compressed && (
            <Box marginTop={1} flexDirection="row">
              <Badge ok={Number(result.pct) > 50}> {result.pct}% chars saved </Badge>
              <Text> </Text>
              <Badge ok={Number(result.tokensPct) > 50}> {result.tokensPct}% tokens saved </Badge>
              <Text> </Text>
              <Badge ok={Number(result.tokensPct) > 30}> {fmt(result.tokensSaved)} tok saved </Badge>
            </Box>
          )}
        </>
      )}

      {!result && !editing && !fileMode && (
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" padding={1}>
          <Text bold color="cyan">
            Try the playground
          </Text>
          <Text color="gray">• Press l to load a realistic git diff (~6k chars) and see live RTK + token stats</Text>
          <Text color="gray">• Press o to load any file from disk (build logs, grep output, ls)</Text>
          <Text color="gray">• Press f to cycle filters: {FILTER_NAMES.slice(0, 6).join(', ')} …</Text>
          <Text color="gray">• Press t to toggle token counts: accurate (tiktoken) ↔ heuristic (chars/4) ↔ both</Text>
        </Box>
      )}
    </Page>
  );
}
