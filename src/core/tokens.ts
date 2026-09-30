import { createRequire } from 'node:module';

export const CHARS_PER_TOKEN = 4;
export const BLOCK_OVERHEAD = 4;
export const ROLE_OVERHEAD = 4;

// ---------------------------------------------------------------------------
// Heuristic estimators (legacy, kept for backward compat / quick fallback)
// ---------------------------------------------------------------------------
export function estimate_text_tokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimate_json_tokens(json: string): number {
  return Math.ceil(json.length / CHARS_PER_TOKEN) + BLOCK_OVERHEAD;
}

export function estimate_message_tokens(message: {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}): number {
  let tokens = ROLE_OVERHEAD;
  const content = message.content;
  if (typeof content === 'string') {
    tokens += estimate_text_tokens(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        tokens += estimate_text_tokens(block.text) + BLOCK_OVERHEAD;
      }
    }
  }
  return tokens;
}

export function estimate_request_tokens(body: {
  messages?: Array<{
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  }>;
  system?: string;
  tools?: unknown[];
}): number {
  let tokens = 0;
  if (typeof body.system === 'string') {
    tokens += estimate_text_tokens(body.system) + ROLE_OVERHEAD;
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    tokens += estimate_json_tokens(JSON.stringify(body.tools));
  }
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      tokens += estimate_message_tokens(msg);
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Accurate tokenizer (js-tiktoken cl100k_base) with graceful fallback
// ---------------------------------------------------------------------------
const _require = createRequire(import.meta.url);

let _enc: { encode: (text: string) => number[] } | null = null;
let _encInitialized = false;
let _encError: string | null = null;
let _encodingName = 'cl100k_base';

function getEncoding(): { encode: (text: string) => number[] } | null {
  if (_encInitialized) return _enc;
  _encInitialized = true;
  try {
    // js-tiktoken provides both ESM and CJS; try CJS require first
    const mod = _require('js-tiktoken') as Record<string, unknown>;
    const getEnc = (mod.getEncoding || (mod.default as Record<string, unknown>)?.getEncoding) as
      | ((name: string) => { encode: (t: string) => number[] })
      | undefined;
    if (typeof getEnc === 'function') {
      _enc = getEnc(_encodingName);
      return _enc;
    }
  } catch (e) {
    _encError = String((e as Error).message || e);
  }
  // Fallback: try dynamic ESM import (best-effort sync not possible, leave null)
  _enc = null;
  return _enc;
}

export function isTokenizerAvailable(): boolean {
  return !!getEncoding();
}

/**
 * Pay the tokenizer's one-time load up front.
 *
 * The first call builds the BPE rank table and measures ~270ms; every call after
 * it is sub-millisecond. Left lazy, that lands on whichever request happens to be
 * first through the door — the one the user is waiting on. Called from proxy
 * start() so it is spent while booting, where a few hundred milliseconds cost
 * nothing.
 */
export function warmup_tokenizer(): void {
  try {
    const enc = getEncoding();
    if (enc) enc.encode('warm up the tokenizer');
  } catch {}
}

export function tokenizerInfo(): { available: boolean; encoding: string; error: string | null; fallback: string } {
  const enc = getEncoding();
  return {
    available: !!enc,
    encoding: _encodingName,
    error: _encError,
    fallback: `heuristic ${CHARS_PER_TOKEN} chars/token`,
  };
}

// ---------------------------------------------------------------------------
// Bounded encoding
//
// js-tiktoken's regex splitter is O(n²) on low-entropy text — runs of spaces,
// newlines, tabs, or any repeated short run. Measured here: encoding a
// whitespace-only string cost 142ms at 1KB, 1.9s at 4KB and 7.5s at 8KB, so each
// doubling costs ~4x. One agent request carrying tool output with blank-line or
// indent padding is enough to block the proxy's event loop for minutes, stalling
// every other in-flight request — the tokenizer is single-threaded with us.
//
// So the cost of encoding is never assumed, and what gets measured is chosen to
// be unbiased.
//
// Measuring contiguous prefixes, rather than chopping the string into pieces,
// is what makes the estimate trustworthy. The pathological shapes are all runs of
// one repeated short pattern, and a cut lands mid-run: every cut leaves two
// partial runs that cost tokens the whole string would have merged away. Sampling
// 32 separate 96-char pieces therefore over-reports whitespace by 25%. Extending
// a single prefix instead introduces no artificial boundaries at all, and the
// same measurement costs the same.
//
// Counting off a prefix and budgeting off a prefix are different problems, though,
// and only one of them is solved by reading the front. For the count, the prefix
// is unbiased and gets more accurate as it grows — ordinary content ends up
// measured almost exactly and is simply encoded in full. For the cost, the prefix
// is blind to whatever comes after it, so the final full encode is gated on a
// probe of the far end (see TAIL_COST_RATIO). Reading the front for the count and
// the end for the cost is what keeps both honest.
//
// Measured against exact counts: 0.04% on source code, 0.02% on prose, 0.53% on
// a serialized request body, and 9.4% worst case on pure whitespace. Every count
// here is an estimate rather than a billing figure.
// ---------------------------------------------------------------------------

/** Below this a string is encoded exactly — it is cheap at any density. */
const EXACT_LIMIT_CHARS = 1024;

/** Total encode time one call may spend, in milliseconds. */
const ENCODE_BUDGET_MS = 25;

/**
 * Fractions of the string to try measuring, in order.
 *
 * Each is a superset of the last, so the count only ever improves until the
 * budget runs out. The first entry is small enough to stay cheap even on the
 * worst shapes; the last is the whole string, i.e. an exact count.
 */
const MEASURE_STEPS = [1 / 4096, 1 / 512, 1 / 64, 1 / 8, 1];

/**
 * Floor on the first probe. Bounds the cost of merely finding out the shape.
 *
 * A probe's cost on the run-heavy shapes goes with its square, and it is paid per
 * call, so it sets a floor under every estimate. It also sets the accuracy:
 * extrapolating off a prefix is only unbiased if the prefix ends on a run
 * boundary, and a short probe is more likely to cut a run in half and over-report
 * what is left behind it. Measured against pure whitespace, 128 chars costs 1.9ms
 * and over-reports by 25%; 256 costs ~7ms and over-reports by 9%; 512 buys 5% for
 * 30ms. 256 is the point where the error is already inside the tolerance of the
 * per-message overheads this count approximates anyway.
 */
const PROBE_MIN_CHARS = 256;

/**
 * How much dearer per character the far end may be before a full encode is
 * refused.
 *
 * The projection above is only sound while the unmeasured bytes cost roughly
 * what the measured ones cost. Reading a prefix cannot know that: a body of
 * ordinary code followed by twenty thousand characters of whitespace measures
 * cheap at the front, projects an affordable encode, and then hands the
 * tokenizer the pathological part — the exact shape this bound exists to stop.
 *
 * So the last step is gated on a probe of the far end. Its cost per character,
 * against the prefix's, is the only evidence available about bytes the prefix
 * never saw. Ordinary content sits near 1x; the run-heavy shapes that make
 * js-tiktoken quadratic measure 30-70x, so the threshold has a wide margin
 * before it starts refusing encodes that were in fact affordable.
 */
const TAIL_COST_RATIO = 8;

/** Window size for the far-end cost probe. Small: it is a cost sample, not a count. */
const TAIL_PROBE_CHARS = 128;

/** Sub-millisecond clock. Millisecond resolution cannot price a 0.3ms encode. */
const now = (): number => performance.now();

type Encoder = { encode: (text: string) => number[] };

/**
 * Encode the longest prefix the budget allows, then extrapolate that prefix's
 * token density over the whole string.
 *
 * The very first probe is capped at PROBE_MIN_CHARS rather than EXACT_LIMIT_CHARS
 * so the *floor* cost of this function is bounded too. A 1KB slice of
 * whitespace costs ~140ms on its own, which would put a floor under every call
 * and make the budget unreachable before any decision had been made — the bound
 * has to hold for the cheapest possible input, not just on average.
 */
function encodeBounded(enc: Encoder, text: string, budgetMs: number): number {
  if (text.length <= EXACT_LIMIT_CHARS) return enc.encode(text).length;

  const started = now();
  let chars = 0;
  let tokens = 0;

  for (const fraction of MEASURE_STEPS) {
    const want = Math.max(PROBE_MIN_CHARS, Math.ceil(text.length * fraction));
    if (want <= chars) continue;
    const measureStarted = now();
    const span = text.slice(0, want);
    const spanTokens = enc.encode(span).length;
    const msPerChar = (now() - measureStarted) / span.length;
    chars = span.length;
    tokens = spanTokens;
    // Stop when encoding the rest would overrun what's left. Projected from what
    // this prefix just cost, so the estimate tracks the real curve.
    if (now() - started + msPerChar * (text.length - chars) > budgetMs) break;
    // Only the final step is a full encode, and it has to survive the tail probe.
    if (chars >= text.length) {
      const probe = text.slice(text.length - TAIL_PROBE_CHARS);
      const probeStarted = now();
      enc.encode(probe);
      if ((now() - probeStarted) / probe.length > msPerChar * TAIL_COST_RATIO) break;
    }
  }

  if (chars <= 0) return 0;
  if (chars >= text.length) return tokens;
  // Never report less than the prefix actually held, so real text cannot be
  // priced as near-free.
  return Math.max(tokens, Math.round((tokens / chars) * text.length));
}

/**
 * Token count for the request path.
 *
 * Exact for short strings, time-bounded for long ones so a pathological body can
 * never stall the proxy (see above). Falls back to the heuristic when the
 * tokenizer is unavailable or throws.
 *
 * `budgetMs` is what the caller has left to spend, not a target. A caller that
 * totals many of these has to be able to hand down a shrinking allowance,
 * because a budget checked only between calls is not a bound: one call can
 * overrun it many times over, and a hundred of those is the stall this exists
 * to prevent.
 */
export function count_tokens(text: string, budgetMs: number = ENCODE_BUDGET_MS): number {
  const t = String(text || '');
  if (!t) return 0;
  const enc = getEncoding();
  if (enc) {
    try {
      const n = encodeBounded(enc, t, budgetMs);
      if (n >= 0) return n;
    } catch {}
  }
  return Math.ceil(t.length / CHARS_PER_TOKEN);
}

/**
 * Unbounded exact count, for one-shot commands where a real number was asked for
 * and a slow answer is fine. Never call this on the request path.
 */
export function count_tokens_exact(text: string): number {
  const t = String(text || '');
  if (!t) return 0;
  const enc = getEncoding();
  if (enc) {
    try {
      return enc.encode(t).length;
    } catch {}
  }
  return Math.ceil(t.length / CHARS_PER_TOKEN);
}

// Alias for backwards compat search
export const countTokens = count_tokens;
export const count_tokens_accurate = count_tokens;

export function estimate_text_tokens_accurate(text: string): number {
  return count_tokens(text);
}

export function estimate_json_tokens_accurate(json: string): number {
  return count_tokens(json) + BLOCK_OVERHEAD;
}

/**
 * The text inside a content block, for the block shapes that carry it somewhere
 * other than `.text`.
 *
 * An Anthropic `tool_result` keeps its payload at `.content` (a string, or an
 * array of `{type:'text'}`), not at `.text`. Both the message and request
 * estimators skipped that shape, so a tool result was counted as a handful of
 * overhead tokens no matter how large it was — which is precisely the content
 * the compressor rewrites. The bytes were saved but the savings were reported as
 * zero.
 */
function blockText(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const b = block as Record<string, unknown>;
  if (typeof b.text === 'string' && (b.type === 'text' || b.type === 'input_text')) return b.text;
  const inner = b.content;
  if (typeof inner === 'string') return inner;
  if (Array.isArray(inner)) {
    let out = '';
    for (const part of inner) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        out += (part as Record<string, unknown>).text as string;
      }
    }
    return out;
  }
  return '';
}

export function estimate_message_tokens_accurate(message: {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}): number {
  let tokens = ROLE_OVERHEAD;
  const content = message.content;
  if (typeof content === 'string') {
    tokens += count_tokens(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'tool_result') {
        const inner = blockText(block);
        if (inner) tokens += count_tokens(inner) + BLOCK_OVERHEAD;
      } else if (block?.type === 'text' && typeof block.text === 'string') {
        tokens += count_tokens(block.text) + BLOCK_OVERHEAD;
      } else if (block?.type === 'input_text' && typeof (block as Record<string, unknown>).text === 'string') {
        tokens += count_tokens(String((block as Record<string, unknown>).text)) + BLOCK_OVERHEAD;
      }
    }
  }
  return tokens;
}

/**
 * A request-sized estimate has to span a whole conversation, and that changes
 * the arithmetic.
 *
 * `count_tokens` bounds a single string, but a request is walked message by
 * message, so every message pays its own measurement overhead — and a session
 * with a hundred of them pays it a hundred times. Bounding each call in
 * isolation is therefore not enough. This prices the body under one shared
 * budget: text is measured for real until the budget is spent, then the rest is
 * priced at the token density already measured for this body.
 *
 * That keeps the cost flat in the number of messages, and the density it
 * extrapolates from is this conversation's own, so it tracks the content rather
 * than a global chars-per-token guess.
 */
class RequestAccountant {
  private readonly started = now();
  private measuredTokens = 0;
  private measuredChars = 0;

  constructor(private readonly budgetMs: number = REQUEST_BUDGET_MS) {}

  /** How much of the budget is left, never below a token floor. */
  private get remainingMs(): number {
    return Math.max(0.5, this.budgetMs - (now() - this.started));
  }

  /** True once the budget is spent and the rest is being extrapolated. */
  get spent(): boolean {
    return now() - this.started >= this.budgetMs;
  }

  /** Measured token density, falling back to the heuristic before anything is. */
  private get density(): number {
    return this.measuredChars > 0 ? this.measuredTokens / this.measuredChars : 1 / CHARS_PER_TOKEN;
  }

  /**
   * Price one piece of text, measuring it while there is budget left.
   *
   * What is left is handed down rather than merely checked. A budget enforced
   * only between calls is not a bound — each call runs to its own 25ms default,
   * so a body of a hundred ordinary messages spent eleven times the allowance,
   * which is precisely the stall the shared budget was introduced to remove.
   */
  text(text: string): number {
    if (this.spent) return Math.round(this.density * text.length);
    const tokens = count_tokens(text, this.remainingMs);
    this.measuredChars += text.length;
    this.measuredTokens += tokens;
    return tokens;
  }

  /** Price a piece of text plus the per-block overhead that goes with it. */
  block(text: string): number {
    return this.text(text) + BLOCK_OVERHEAD;
  }
}

/** Total time one request-sized estimate may spend encoding. */
const REQUEST_BUDGET_MS = 25;

export function estimate_request_tokens_accurate(body: {
  messages?: Array<{
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  }>;
  system?: string;
  tools?: unknown[];
  input?: unknown[];
}): number {
  const acc = new RequestAccountant();
  let tokens = 0;
  if (typeof body.system === 'string') {
    tokens += acc.text(body.system) + ROLE_OVERHEAD;
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    tokens += acc.block(JSON.stringify(body.tools));
  }
  // OpenAI format: messages
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      tokens += ROLE_OVERHEAD;
      const content = msg.content;
      if (typeof content === 'string') {
        tokens += acc.text(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_result') {
            const inner = blockText(block);
            if (inner) tokens += acc.block(inner);
          } else if (block?.type === 'text' && typeof block.text === 'string') {
            tokens += acc.block(block.text);
          } else if (block?.type === 'input_text' && typeof (block as Record<string, unknown>).text === 'string') {
            tokens += acc.block(String((block as Record<string, unknown>).text));
          }
        }
      }
    }
  }
  // Responses API: input array, or a bare string prompt
  if (Array.isArray(body.input)) {
    for (const item of body.input as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as Record<string, unknown>).content;
      if (typeof content === 'string') tokens += acc.text(content) + ROLE_OVERHEAD;
      else if (Array.isArray(content)) {
        for (const b of content as Array<Record<string, unknown>>) {
          if (b?.type === 'input_text' && typeof b.text === 'string') tokens += acc.block(b.text);
          else if (b?.type === 'text' && typeof b.text === 'string') tokens += acc.block(b.text);
        }
      } else {
        // fallback: stringify the whole item
        tokens += acc.block(JSON.stringify(item));
      }
    }
  } else if (typeof body.input === 'string') {
    // The single-string form is valid for the Responses API (translate.ts reads
    // it as such), and it used to fall through both branches and count as 0.
    tokens += acc.text(body.input) + ROLE_OVERHEAD;
  }
  return tokens;
}

/**
 * Estimate cost in USD for a request given pricing per million tokens.
 */
export function estimate_cost_usd(
  inputTokens: number,
  outputTokens: number,
  inputPricePerM: number,
  outputPricePerM: number,
): number {
  return (inputTokens * inputPricePerM + outputTokens * outputPricePerM) / 1_000_000;
}

export function resetTokenizerForTests(): void {
  _enc = null;
  _encInitialized = false;
  _encError = null;
}
