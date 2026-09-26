import type { RequestBody } from './types.js';

export const CAVEMAN_LEVELS = {
  LITE: 'lite',
  FULL: 'full',
  ULTRA: 'ultra',
  WENYAN_LITE: 'wenyan-lite',
  WENYAN: 'wenyan',
  WENYAN_ULTRA: 'wenyan-ultra',
} as const;

export const PONYTAIL_LEVELS = { LITE: 'lite', FULL: 'full', ULTRA: 'ultra' } as const;

const SHARED_BOUNDARIES =
  'Code blocks, file paths, commands, errors, URLs: keep exact. Security warnings, irreversible action confirmations, multi-step ordered sequences: write normal. Resume terse style after.';

const SHARED_EXAMPLES =
  'Not: "Sure! I\'d be happy to help you with that. The issue you\'re experiencing is likely caused by..." Yes: "Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:"';

const SHARED_AUTO_CLARITY =
  'Auto-Clarity: drop caveman for security warnings, irreversible actions, multi-step sequences where fragment ambiguity risks misread, or when user repeats a question. Resume after the clear part.';

const SHARED_PERSISTENCE =
  'ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure.';

const SHARED_NO_INVENTED_ABBREV =
  'No invented abbreviations. Standard well-known tech acronyms (DB, API, HTTP, URL, JSON, ID, OS, CPU) OK. Names of code symbols, function names, API names, error strings: keep verbatim.';

const SHARED_PRESERVE_LANGUAGE =
  "Preserve the user's dominant language. User wrote Vietnamese, reply Vietnamese. User wrote English, reply English. Wenyan/classical-Chinese levels override this language-preservation rule. Code identifiers, error strings, file paths, commands: keep in their original form regardless of language.";

const SHARED_NO_SELF_REFERENCE =
  'No self-reference. Do not name or announce the style (no "caveman mode", no "me caveman think", no "compressed mode active"). Just respond.';

const SHARED_NO_DECORATION =
  'No decorative emoji. No narrating tool calls ("I will now search", "I used X to find Y"). No status phrases ("Sure!", "Of course!", "I\'d be happy to"). No causal arrow shorthand ("A -> B -> fails"). State the thing, the action, the reason. Then next step.';

export const CAVEMAN_PROMPTS: Record<string, string> = {
  lite: [
    'Respond tersely. Keep grammar and full sentences but drop filler, hedging and pleasantries (just/really/basically/sure/of course/I\'d be happy to).',
    'Pattern: state the thing, the action, the reason. Then next step.',
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(' '),

  full: [
    'Respond like terse caveman. All technical substance stay exact, only fluff die.',
    'Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries, hedging. Fragments OK. Short synonyms (big not extensive, fix not implement a solution for).',
    'Pattern: [thing] [action] [reason]. [next step].',
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(' '),

  ultra: [
    'Respond ultra-terse. Maximum compression. Telegraphic.',
    'Strip conjunctions. One word when one word enough.',
    'Pattern: [thing] [action] [reason]. [next step].',
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(' '),

  'wenyan-lite': [
    'Respond semi-classical. Drop filler/hedging but keep grammar structure, classical register.',
    'Use classical Chinese sentence patterns where natural. Keep English for technical terms.',
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(' '),

  wenyan: [
    'Respond classical Chinese (\u6587\u8a00\u6587). Maximum classical terseness. 80-90% character reduction.',
    'Classical sentence patterns, verbs precede objects, subjects often omitted, classical particles (\u4e4b/\u4e43/\u70ba/\u5176).',
    'Keep English for code, commands, function names, API names, error strings.',
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(' '),

  'wenyan-ultra': [
    'Respond extreme classical compression (\u6587\u8a00\u6587 ultra). Maximum compression, ultra terse.',
    'Same classical rules as wenyan-full but even more compressed. One classical particle per clause.',
    SHARED_EXAMPLES,
    SHARED_BOUNDARIES,
    SHARED_AUTO_CLARITY,
    SHARED_PERSISTENCE,
    SHARED_NO_INVENTED_ABBREV,
    SHARED_PRESERVE_LANGUAGE,
    SHARED_NO_SELF_REFERENCE,
    SHARED_NO_DECORATION,
  ].join(' '),
};

export const PONYTAIL_PROMPTS: Record<string, string> = {
  lite: [
    'You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.',
    "Lite: build what's asked, but name the lazier alternative in one line. User picks.",
    'Before writing code, stop at the first rung that holds: 1) Does this need to exist at all? (YAGNI) 2) Stdlib does it? Use it. 3) Native platform feature covers it? Use it (CSS over JS, DB constraint over app code). 4) Already-installed dependency solves it? Use it; never add a new one for what a few lines can do. 5) Can it be one line? One line. 6) Only then: the minimum code that works.',
    'No unrequested abstractions (no interface with one implementation, no factory for one product, no config for a value that never changes). No boilerplate or scaffolding "for later". Deletion over addition. Boring over clever. Fewest files possible; shortest working diff wins. Two stdlib options the same size: take the edge-case-correct one. Mark deliberate simplifications with a `ponytail:` comment naming the ceiling and upgrade path.',
    'Code first. Then at most three short lines: what was skipped, when to add it. No essays or design notes. Pattern: `[code] \u2192 skipped: [X], add when [Y].`',
    'Never simplify away: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested. Non-trivial logic leaves ONE runnable check behind (an assert-based self-check or one small test file; no frameworks). Trivial one-liners need no test.',
    'ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure.',
  ].join(' '),

  full: [
    'You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.',
    'Full: the ladder enforced. Stdlib and native first. Shortest diff, shortest explanation.',
    'Before writing code, stop at the first rung that holds: 1) Does this need to exist at all? (YAGNI) 2) Stdlib does it? Use it. 3) Native platform feature covers it? Use it (CSS over JS, DB constraint over app code). 4) Already-installed dependency solves it? Use it; never add a new one for what a few lines can do. 5) Can it be one line? One line. 6) Only then: the minimum code that works.',
    'No unrequested abstractions (no interface with one implementation, no factory for one product, no config for a value that never changes). No boilerplate or scaffolding "for later". Deletion over addition. Boring over clever. Fewest files possible; shortest working diff wins. Two stdlib options the same size: take the edge-case-correct one. Mark deliberate simplifications with a `ponytail:` comment naming the ceiling and upgrade path.',
    'Code first. Then at most three short lines: what was skipped, when to add it. No essays or design notes. Pattern: `[code] \u2192 skipped: [X], add when [Y].`',
    'Never simplify away: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested. Non-trivial logic leaves ONE runnable check behind (an assert-based self-check or one small test file; no frameworks). Trivial one-liners need no test.',
    'ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure.',
  ].join(' '),

  ultra: [
    'You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.',
    'Ultra: YAGNI extremist. Deletion before addition. Ship the one-liner and challenge the rest of the requirement in the same response.',
    'Before writing code, stop at the first rung that holds: 1) Does this need to exist at all? (YAGNI) 2) Stdlib does it? Use it. 3) Native platform feature covers it? Use it (CSS over JS, DB constraint over app code). 4) Already-installed dependency solves it? Use it; never add a new one for what a few lines can do. 5) Can it be one line? One line. 6) Only then: the minimum code that works.',
    'No unrequested abstractions (no interface with one implementation, no factory for one product, no config for a value that never changes). No boilerplate or scaffolding "for later". Deletion over addition. Boring over clever. Fewest files possible; shortest working diff wins. Two stdlib options the same size: take the edge-case-correct one. Mark deliberate simplifications with a `ponytail:` comment naming the ceiling and upgrade path.',
    'Code first. Then at most three short lines: what was skipped, when to add it. No essays or design notes. Pattern: `[code] \u2192 skipped: [X], add when [Y].`',
    'Never simplify away: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested. Non-trivial logic leaves ONE runnable check behind (an assert-based self-check or one small test file; no frameworks). Trivial one-liners need no test.',
    'ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure.',
  ].join(' '),
};

function _detect_format(body: RequestBody | null | undefined): string {
  if (!body) return 'openai';
  if (body.system !== undefined && body.system !== null) return 'claude';
  if (body.anthropic_version) return 'claude';
  if (Array.isArray(body.contents)) return 'gemini';
  if (typeof body.request === 'object' && body.request !== null && Array.isArray(body.request.contents)) {
    return 'antigravity';
  }
  return 'openai';
}

export function inject_system_prompt(body: RequestBody, prompt: string): void {
  if (!body || !prompt) return;

  const sep = '\n\n';
  const fmt = _detect_format(body);

  if (fmt === 'claude') {
    if (typeof body.system === 'string' && body.system) {
      body.system = `${body.system}${sep}${prompt}`;
      return;
    }
    if (Array.isArray(body.system)) {
      // Cache-friendly placement. The prompt bytes are constant, so it belongs
      // inside the cached prefix:
      //  - a cache_control already exists → slide in just before the last one, so
      //    the style is covered by the breakpoint the client already pays for
      //    (and no extra breakpoint is spent);
      //  - none exists → make our own block the breakpoint, so the whole stable
      //    system prefix becomes a cache read on the next turn instead of ~250
      //    re-sent tokens.
      let lastCacheIdx = -1;
      let breakpoints = 0;
      for (let i = body.system.length - 1; i >= 0; i--) {
        if (body.system[i].cache_control) {
          lastCacheIdx = i;
          breakpoints++;
        }
      }
      for (let i = 0; i < body.system.length; i++) {
        if (i < lastCacheIdx && body.system[i].cache_control) breakpoints++;
      }
      const block: Record<string, unknown> = { type: 'text', text: prompt };
      // Anthropic accepts at most 4 cache breakpoints; never risk a 400.
      if (breakpoints === 0) block.cache_control = { type: 'ephemeral' };
      if (lastCacheIdx >= 0) body.system.splice(lastCacheIdx, 0, block as never);
      else body.system.push(block as never);
      return;
    }
    body.system = prompt;
  } else if (fmt === 'gemini' || fmt === 'antigravity') {
    const target = body.request !== undefined && body.request !== null ? body.request : body;
    const useSnake = 'system_instruction' in target;
    const key = useSnake ? 'system_instruction' : 'systemInstruction';
    const sys = target[key];
    if (sys && Array.isArray(sys.parts)) {
      sys.parts.push({ text: prompt });
    } else {
      target[key] = { parts: [{ text: prompt }] };
    }
  } else {
    if (typeof body.instructions === 'string') {
      body.instructions = body.instructions ? `${body.instructions}${sep}${prompt}` : prompt;
      return;
    }

    let arr: RequestBody[] | null = null;
    if (Array.isArray(body.messages)) arr = body.messages;
    else if (Array.isArray(body.input)) arr = body.input;
    if (!arr) return;

    let idx: number | null = null;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && typeof arr[i] === 'object' && ['system', 'developer'].includes(arr[i].role)) {
        idx = i;
        break;
      }
    }

    if (idx !== null) _append_to_message(arr[idx], prompt, sep);
    else arr.unshift({ role: 'system', content: prompt });
  }
}

function _append_to_message(msg: RequestBody, prompt: string, sep = '\n\n'): void {
  if (typeof msg.content === 'string') {
    msg.content = `${msg.content}${sep}${prompt}`;
  } else if (Array.isArray(msg.content)) {
    msg.content.push({ type: 'input_text', text: prompt });
  } else {
    msg.content = prompt;
  }
}

export function inject_caveman(body: RequestBody, level = 'lite'): void {
  const prompt = CAVEMAN_PROMPTS[level];
  if (prompt) inject_system_prompt(body, prompt);
}

export function inject_ponytail(body: RequestBody, level = 'lite'): void {
  const prompt = PONYTAIL_PROMPTS[level];
  if (prompt) inject_system_prompt(body, prompt);
}

// ---------------------------------------------------------------------------
// Output style (terse-output prompt) — applied by the proxy to every chat
// request while it runs. Output tokens cost 3-8x input tokens, so this is the
// highest-leverage saving available. Kill switch: TOKENSAVER_OUTPUT_STYLE=off
// ---------------------------------------------------------------------------
export const DEFAULT_OUTPUT_STYLE = 'caveman-lite';

export interface OutputStyleSetting {
  /** normalized input value: 'caveman-lite', 'ponytail-ultra', 'off', … */
  raw: string;
  style: 'off' | 'caveman' | 'ponytail';
  level: string;
  /** display label: 'caveman-lite' | 'ponytail-full' | 'off' */
  label: string;
  /** system prompt text; empty when the style is off */
  prompt: string;
}

const OUTPUT_STYLE_OFF_VALUES = new Set(['off', 'none', 'false', 'no', '0', 'disabled']);

/**
 * Normalize a user/env/config value into a usable output style.
 * Unknown levels fall back to `lite` of the requested family; anything empty or
 * unrecognized falls back to DEFAULT_OUTPUT_STYLE (caveman-lite, always on).
 */
export function resolveOutputStyle(value?: string | null): OutputStyleSetting {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  const wanted = raw || DEFAULT_OUTPUT_STYLE;

  if (OUTPUT_STYLE_OFF_VALUES.has(wanted)) {
    return { raw: 'off', style: 'off', level: '', label: 'off', prompt: '' };
  }

  let style: 'caveman' | 'ponytail' = 'caveman';
  let level = wanted;
  if (wanted.startsWith('ponytail')) {
    style = 'ponytail';
    level = wanted.slice('ponytail'.length).replace(/^-/, '');
  } else if (wanted.startsWith('caveman')) {
    level = wanted.slice('caveman'.length).replace(/^-/, '');
  }

  const table = style === 'ponytail' ? PONYTAIL_PROMPTS : CAVEMAN_PROMPTS;
  if (!level || !table[level]) level = 'lite';

  return { raw: wanted, style, level, label: `${style}-${level}`, prompt: table[level] || '' };
}

/**
 * Stable, per-level dedupe markers.
 *
 * The prompt text itself is a frozen module constant, so the bytes are already
 * identical on every request — that is what keeps the injected block inside the
 * provider's prompt cache. The marker has to be stable for the same reason, and
 * it has to be UNIQUE per level: a fixed `slice(0, 40)` collides badly here,
 * because all three ponytail levels start with the identical sentence
 * "You are a lazy senior developer. Lazy means efficient…". Two different levels
 * then looked "already applied", and an escalated level would be silently skipped.
 *
 * So: take the shortest prefix that no sibling level shares.
 */
function _uniquePrefix(prompt: string, siblings: string[]): string {
  if (!prompt) return '';
  let cut = prompt.length;
  for (const other of siblings) {
    if (other === prompt) continue;
    let i = 0;
    const max = Math.min(other.length, prompt.length);
    while (i < max && other[i] === prompt[i]) i++;
    if (i < cut) cut = i;
  }
  return prompt.slice(0, Math.min(cut + 1, prompt.length));
}

const _styleMarkers = new Map<string, string>();

/** Short, stable snippet that identifies exactly this level. */
export function outputStyleMarker(setting: OutputStyleSetting): string {
  if (!setting || !setting.prompt) return '';
  const cached = _styleMarkers.get(setting.label);
  if (cached) return cached;
  const table = setting.style === 'ponytail' ? PONYTAIL_PROMPTS : CAVEMAN_PROMPTS;
  const siblings = Object.values(table);
  const marker = _uniquePrefix(setting.prompt, siblings);
  _styleMarkers.set(setting.label, marker);
  return marker;
}

/** Every string the model sees as instructions, across all supported formats. */
function _systemStrings(body: RequestBody): string[] {
  const out: string[] = [];
  if (!body || typeof body !== 'object') return out;

  const push = (v: unknown): void => {
    if (typeof v === 'string' && v) out.push(v);
  };
  const pushParts = (holder: unknown): void => {
    if (!holder || typeof holder !== 'object') return;
    const parts = (holder as Record<string, unknown>).parts;
    if (Array.isArray(parts)) {
      for (const p of parts) push((p as Record<string, unknown>)?.text);
    }
  };

  push(body.system);
  if (Array.isArray(body.system)) {
    for (const b of body.system) push((b as Record<string, unknown>)?.text);
  }
  push(body.instructions);
  pushParts(body.system_instruction);
  pushParts(body.systemInstruction);

  const req = body.request;
  if (req && typeof req === 'object') {
    pushParts((req as Record<string, unknown>).system_instruction);
    pushParts((req as Record<string, unknown>).systemInstruction);
  }

  const arr = Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : null;
  if (arr) {
    for (const m of arr) {
      if (!m || typeof m !== 'object') continue;
      const role = (m as Record<string, unknown>).role;
      if (role !== 'system' && role !== 'developer') continue;
      const content = (m as Record<string, unknown>).content;
      if (typeof content === 'string') out.push(content);
      else if (Array.isArray(content)) {
        for (const b of content) push((b as Record<string, unknown>)?.text);
      }
    }
  }

  return out;
}

/** True when the style prompt is already part of the request (never inject twice). */
export function has_output_style(body: RequestBody, setting: OutputStyleSetting): boolean {
  const marker = outputStyleMarker(setting);
  if (!marker) return false;
  return _systemStrings(body).some((text) => text.includes(marker));
}

/**
 * True when the request already carries ANY level of this style family.
 *
 * Needed because escalation can hand us a body that already has the milder base
 * level in it (a client that echoes its system prompt back, or a retry of a body
 * we already touched). Matching on the exact level alone would then append a
 * second, conflicting style prompt instead of recognising the existing one.
 */
export function has_any_output_style(body: RequestBody, setting: OutputStyleSetting): boolean {
  if (!setting || setting.style === 'off') return false;
  const table = setting.style === 'ponytail' ? PONYTAIL_PROMPTS : CAVEMAN_PROMPTS;
  const family = Object.values(table).map((p) => _uniquePrefix(p, Object.values(table)));
  const strings = _systemStrings(body);
  return family.some((marker) => marker && strings.some((text) => text.includes(marker)));
}

/**
 * Idempotently apply the output style to a chat request.
 * Returns true only when the prompt actually landed in the body.
 */
export function apply_output_style(body: RequestBody, setting: OutputStyleSetting): boolean {
  if (!body || !setting || setting.style === 'off' || !setting.prompt) return false;
  if (has_output_style(body, setting)) return false;
  // A different level of the same family is already there — leave it alone rather
  // than stacking a second, contradictory style prompt.
  if (has_any_output_style(body, setting)) return false;
  inject_system_prompt(body, setting.prompt);
  return has_output_style(body, setting);
}

// ---------------------------------------------------------------------------
// Context-aware escalation
//
// A flat level either wastes output tokens early in a session (short context,
// replies could afford detail) or under-saves later (long context, everything
// is already expensive). Stepping the level up as the request's own context
// grows gets most of the saving at a fraction of the flat cost.
//
// Escalation only ever moves UP the ladder, and never crosses a register
// boundary: 'caveman-lite' may become 'caveman-full'/'caveman-ultra' but never
// silently switches to Wenyan, and ponytail never turns caveman.
// ---------------------------------------------------------------------------

/** Ladders, mildest → most aggressive. Keys are `<family>` or `<family>:<register>`. */
export const OUTPUT_STYLE_LADDERS: Record<string, string[]> = {
  caveman: ['lite', 'full', 'ultra'],
  'caveman:wenyan': ['wenyan-lite', 'wenyan', 'wenyan-ultra'],
  ponytail: ['lite', 'full', 'ultra'],
};

/** Context sizes (tokens) at which the level steps up one rung. */
export const DEFAULT_ESCALATE_AT: readonly number[] = [20000, 60000];

/** The ladder a setting belongs to, or null when its level isn't on one. */
export function styleLadder(setting: OutputStyleSetting): string[] | null {
  if (!setting || setting.style === 'off') return null;
  const register = setting.level.startsWith('wenyan') ? ':wenyan' : '';
  return OUTPUT_STYLE_LADDERS[`${setting.style}${register}`] || null;
}

/** Sanitize a user/config threshold list: positive, ascending, at most ladder length. */
export function resolveEscalateAt(value?: unknown): number[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const nums = raw
    .map((v) => Number(String(v).trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return nums.length ? nums : [...DEFAULT_ESCALATE_AT];
}

/**
 * Step the configured level up according to how large the request's own context
 * already is. Never downgrades, never leaves the ladder, returns the input
 * setting untouched when escalation is off or the level is unknown.
 */
export function escalateOutputStyle(
  setting: OutputStyleSetting,
  contextTokens: number,
  thresholds: readonly number[] = DEFAULT_ESCALATE_AT
): OutputStyleSetting {
  if (!setting || setting.style === 'off' || !setting.prompt) return setting;
  if (!Number.isFinite(contextTokens) || contextTokens <= 0) return setting;
  const ladder = styleLadder(setting);
  if (!ladder) return setting;
  const idx = ladder.indexOf(setting.level);
  if (idx < 0) return setting;

  const t = resolveEscalateAt(thresholds as unknown[]);
  let steps = 0;
  for (const threshold of t) {
    if (contextTokens >= threshold) steps++;
    else break;
  }
  if (steps <= 0) return setting;

  const next = ladder[Math.min(ladder.length - 1, idx + steps)];
  if (!next || next === setting.level) return setting;
  return resolveOutputStyle(`${setting.style}-${next}`);
}

export const COMPACTION_CHECKPOINT_INSTRUCTION = `You are generating a structured conversation checkpoint. Condense the conversation into a concise checkpoint using EXACTLY this Markdown structure:

## Primary Request
[One sentence: what the user originally asked for]

## Key Technical Concepts
[Bullet list of frameworks, languages, patterns involved]

## Files and Code
[File paths and key code changes — keep function names, class names, variable names verbatim]

## Errors and Fixes
[Only if errors occurred — what broke and how it was fixed]

## Pending Jobs
[Bullet list of tasks not yet completed]

## Current Work
[Exact state of what was being worked on when checkpoint was created]

## Next Step
[The single most immediate next action]

## Critical Context
[Anything else essential to resume: env vars, config values, branch names, deployment targets]

Rules:
- Output ONLY the checkpoint above. No preamble, no commentary.
- Use short fragments. No sentences unless necessary for clarity.
- Preserve all file paths, function names, error messages verbatim.
- If a section has nothing to report, write [None].
- Max 800 words. Prefer 300-500.`;

export function format_compaction_checkpoint(data: {
  primaryRequest?: string;
  concepts?: string[];
  files?: string[];
  errors?: string[];
  pendingJobs?: string[];
  currentWork?: string;
  nextStep?: string;
  criticalContext?: string[];
}): string {
  const lines: string[] = ['## Primary Request', data.primaryRequest || '[None]', ''];
  lines.push('## Key Technical Concepts');
  if (data.concepts?.length) {
    for (const c of data.concepts) lines.push(`- ${c}`);
  } else {
    lines.push('[None]');
  }
  lines.push('', '## Files and Code');
  if (data.files?.length) {
    for (const f of data.files) lines.push(`- ${f}`);
  } else {
    lines.push('[None]');
  }
  lines.push('', '## Errors and Fixes');
  if (data.errors?.length) {
    for (const e of data.errors) lines.push(`- ${e}`);
  } else {
    lines.push('[None]');
  }
  lines.push('', '## Pending Jobs');
  if (data.pendingJobs?.length) {
    for (const j of data.pendingJobs) lines.push(`- ${j}`);
  } else {
    lines.push('[None]');
  }
  lines.push('', '## Current Work', data.currentWork || '[None]', '');
  lines.push('## Next Step', data.nextStep || '[None]', '');
  lines.push('## Critical Context');
  if (data.criticalContext?.length) {
    for (const c of data.criticalContext) lines.push(`- ${c}`);
  } else {
    lines.push('[None]');
  }
  return lines.join('\n');
}

export { _detect_format };
