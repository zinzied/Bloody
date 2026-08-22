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

export function tokenizerInfo(): { available: boolean; encoding: string; error: string | null; fallback: string } {
  const enc = getEncoding();
  return {
    available: !!enc,
    encoding: _encodingName,
    error: _encError,
    fallback: `heuristic ${CHARS_PER_TOKEN} chars/token`,
  };
}

/**
 * Accurate token count using js-tiktoken cl100k_base.
 * Falls back to heuristic (ceil(len/4)) if tokenizer unavailable.
 */
export function count_tokens(text: string): number {
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
      if (block?.type === 'text' && typeof block.text === 'string') {
        tokens += count_tokens(block.text) + BLOCK_OVERHEAD;
      } else if (block?.type === 'input_text' && typeof (block as Record<string, unknown>).text === 'string') {
        tokens += count_tokens(String((block as Record<string, unknown>).text)) + BLOCK_OVERHEAD;
      }
    }
  }
  return tokens;
}

export function estimate_request_tokens_accurate(body: {
  messages?: Array<{
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  }>;
  system?: string;
  tools?: unknown[];
  input?: unknown[];
}): number {
  let tokens = 0;
  if (typeof body.system === 'string') {
    tokens += count_tokens(body.system) + ROLE_OVERHEAD;
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    tokens += count_tokens(JSON.stringify(body.tools)) + BLOCK_OVERHEAD;
  }
  // OpenAI format: messages
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      tokens += estimate_message_tokens_accurate(msg as never);
    }
  }
  // Responses API: input array
  if (Array.isArray(body.input)) {
    for (const item of body.input as Array<Record<string, unknown>>) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as Record<string, unknown>).content;
      if (typeof content === 'string') tokens += count_tokens(content) + ROLE_OVERHEAD;
      else if (Array.isArray(content)) {
        for (const b of content as Array<Record<string, unknown>>) {
          if (b?.type === 'input_text' && typeof b.text === 'string') tokens += count_tokens(b.text) + BLOCK_OVERHEAD;
          else if (b?.type === 'text' && typeof b.text === 'string') tokens += count_tokens(b.text) + BLOCK_OVERHEAD;
        }
      } else {
        // fallback: stringify the whole item
        tokens += count_tokens(JSON.stringify(item)) + BLOCK_OVERHEAD;
      }
    }
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
