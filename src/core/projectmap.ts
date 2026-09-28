import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { COMPRESS_DIR } from './config.js';
import { sha256Hex, readJson, writeJson, ensureDir, envValue } from './utils.js';
import { inject_system_prompt, system_strings } from './prompts.js';
import * as tokens from './tokens.js';
import type { RequestBody } from './types.js';

// ---------------------------------------------------------------------------
// Project map — a free orientation brief for a repository.
//
// Orienting on a large codebase is the single most expensive thing an agent
// does before its first real edit: a `ls`, a `tree`, a README, a package.json,
// a few greps for entry points, all of it re-read per session and re-read
// again after every compaction. None of it needs a model.
//
// So this module does that work locally, with no tokens: one bounded filesystem
// walk produces a compact Markdown brief (size, stack, layout, entry points,
// commands, key modules, tests, config) that gets injected into the request's
// system block ONCE per session. After that the model carries it in its own
// conversation history, so the cost is a single small prompt rather than dozens
// of exploratory tool calls.
//
// Two properties are load-bearing:
//   1. Byte stability. The injected text is cached and only rebuilt when the
//      project's *shape* changes, so it sits in the provider's prompt cache the
//      same way the output-style block does. Nothing volatile (no timestamps, no
//      git log, no absolute build paths) is allowed into the text itself.
//   2. Bounded work. The walk is capped by entry count, depth, per-file size and
//      a total content-read budget, so pointing this at a monorepo or a tree
//      with a symlink loop still returns promptly.
// ---------------------------------------------------------------------------

export type MapLevel = 'off' | 'lite' | 'standard' | 'full';

export const DEFAULT_MAP_LEVEL: MapLevel = 'standard';

/** Sentinel that identifies an injected map. Stable, unique, cheap to match. */
export const PROJECT_MAP_MARKER = '[nobleed:project-map]';

export const MAP_DIR = path.join(COMPRESS_DIR, 'map');
const CACHE_VERSION = 1;

/** Never re-walk the tree more often than this (ms) while the proxy is serving. */
export const REBUILD_MIN_INTERVAL_MS = 20_000;

/** Hard ceilings, independent of level. A pathological tree still terminates. */
const MAX_ENTRIES = 20_000;
const MAX_WALK_DEPTH = 12;
const MAX_FILE_BYTES = 1_500_000;
/** Total bytes of file content the scan is allowed to read. */
const CONTENT_READ_BUDGET = 24 * 1024 * 1024;
const MAX_DIR_READS = 4_000;

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  'vendor', 'venv', '.venv', 'env', '__pycache__', '.next', '.nuxt',
  '.svelte-kit', '.turbo', '.cache', '.parcel-cache', 'coverage', '.nyc_output',
  '.pytest_cache', '.mypy_cache', '.tox', '.gradle', 'bower_components',
  'Pods', '.dart_tool', 'site-packages', '.terraform', 'cdk.out', '.idea',
  '.vscode', 'tmp', 'temp', '.tmp',
]);

const IGNORED_FILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'npm-shrinkwrap.json',
  'bun.lockb', 'Cargo.lock', 'poetry.lock', 'composer.lock', 'Gemfile.lock',
  'go.sum', '.DS_Store',
]);

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.icns', '.svg',
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.tar', '.jar', '.war',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.mov', '.avi',
  '.wav', '.ogg', '.webm', '.wasm', '.so', '.dylib', '.dll', '.exe', '.class',
  '.pyc', '.pyo', '.bin', '.dat', '.db', '.sqlite', '.sqlite3', '.lock',
]);

const LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JavaScript',
  '.rs': 'Rust', '.py': 'Python', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.c': 'C', '.h': 'C', '.cc': 'C++',
  '.cpp': 'C++', '.hpp': 'C++', '.swift': 'Swift', '.m': 'Objective-C',
  '.mm': 'Objective-C', '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell',
  '.ps1': 'PowerShell', '.sql': 'SQL', '.md': 'Markdown', '.mdx': 'Markdown',
  '.json': 'JSON', '.yml': 'YAML', '.yaml': 'YAML', '.toml': 'TOML',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.vue': 'Vue', '.svelte': 'Svelte',
  '.graphql': 'GraphQL', '.proto': 'Protobuf', '.tf': 'Terraform',
};

/** Extensions we are willing to count lines in / read for symbols. */
const TEXT_EXTS = new Set([
  ...Object.keys(LANGUAGES), '.env', '.txt', '.conf', '.ini', '.cfg', '.gradle',
  '.tex', '.r', '.jl', '.ex', '.exs', '.hs', '.clj', '.lua', '.dart', '.scala',
  '.vbs', '.bat', '.cmd',
]);

/** Dependency name → what it says the project is. Order matters (first match wins per name). */
const KNOWN_DEPS: Record<string, string> = {
  react: 'React', 'react-dom': 'React', next: 'Next.js', vue: 'Vue', svelte: 'Svelte',
  'solid-js': 'Solid', '@angular/core': 'Angular', express: 'Express', fastify: 'Fastify',
  koa: 'Koa', '@hapi/hapi': 'hapi', hono: 'Hono', '@trpc/server': 'tRPC',
  '@prisma/client': 'Prisma', prisma: 'Prisma', mongoose: 'MongoDB',
  'drizzle-orm': 'Drizzle', typeorm: 'TypeORM', sequelize: 'Sequelize', kysely: 'Kysely',
  'better-sqlite3': 'SQLite (native)', 'sqlite3': 'SQLite', pg: 'Postgres',
  mysql2: 'MySQL', redis: 'Redis', ioredis: 'Redis',
  ws: 'WebSocket', graphql: 'GraphQL', 'socket.io': 'Socket.IO', zod: 'Zod',
  yup: 'Yup', joi: 'Joi', ink: 'Ink (TUI)', 'ink-text-input': 'Ink (TUI)',
  commander: 'Commander (CLI)', yargs: 'Yargs (CLI)', chalk: 'Chalk',
  vitest: 'Vitest', jest: 'Jest', mocha: 'Mocha', ava: 'AVA', tap: 'TAP',
  'js-tiktoken': 'tiktoken', '@tauri-apps/api': 'Tauri', electron: 'Electron',
  playwright: 'Playwright', cypress: 'Cypress', esbuild: 'esbuild',
  vite: 'Vite', webpack: 'webpack', rollup: 'Rollup', tsup: 'tsup',
  turbo: 'Turborepo', rtk: 'RTK', 'ink-text-area': 'Ink (TUI)',
};

const TEST_DIR_NAMES = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'e2e']);
const TEST_FILE_RE = /(^|[._-])(test|spec)s?[._-]|\.test\.|\.spec\./i;

/** Languages worth listing under "key modules". Prose and stylesheets are not modules. */
const CODE_LANGS = new Set([
  'TypeScript', 'JavaScript', 'Rust', 'Python', 'Go', 'Java', 'Kotlin', 'Ruby',
  'PHP', 'C#', 'C', 'C++', 'Swift', 'Objective-C', 'Shell', 'PowerShell', 'SQL',
  'Vue', 'Svelte', 'Perl', 'Lua', 'Dart', 'Scala', 'Haskell', 'Elixir', 'R',
]);
const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'jsconfig.json', 'vite.config.ts',
  'vite.config.js', 'webpack.config.js', 'rollup.config.js', 'esbuild.config.js',
  'Cargo.toml', 'go.mod', 'pyproject.toml', 'requirements.txt', 'setup.py',
  'Gemfile', 'pom.xml', 'build.gradle', 'composer.json', 'Dockerfile',
  'docker-compose.yml', 'docker-compose.yaml', 'Makefile', 'justfile',
  'tauri.conf.json', 'next.config.js', 'next.config.mjs', 'nuxt.config.ts',
  '.env', '.env.example', '.env.sample', '.editorconfig', '.prettierrc',
  '.eslintrc', '.eslintrc.json', 'biome.json', 'ruff.toml', '.nvmrc',
]);

const PROJECT_MARKERS = [
  '.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
  'pom.xml', 'build.gradle', 'composer.json', 'Gemfile', 'setup.py',
  'requirements.txt', 'Makefile', 'CMakeLists.txt',
];

const ENTRY_FILE_NAMES = [
  'index.ts', 'index.tsx', 'index.js', 'main.ts', 'main.tsx', 'main.js',
  'main.py', '__main__.py', 'app.ts', 'app.py', 'server.ts', 'server.js',
  'cli.ts', 'cli.js', 'mod.rs', 'lib.rs', 'main.rs', 'main.go', 'main.c',
  'main.cpp', 'Program.cs', 'start.js', 'entry.ts', 'entry.jsx',
];

/** Cheap, honest "what is this thing" signals. Detected, never guessed. */
const CAPABILITY_SIGNALS: { re: RegExp; label: string }[] = [
  { re: /\bcreateServer\s*\(|\bexpress\s*\(|\bfastify\s*\(|\bHono\s*\(|\.listen\s*\(/, label: 'HTTP server' },
  { re: /\bWebSocketServer\b|require\(['"]ws['"]\)|from ['"]ws['"]/, label: 'WebSocket server' },
  { re: /\bspawn(Sync)?\s*\(|\bexecFile(Sync)?\s*\(|\bchild_process\b/, label: 'spawns subprocesses' },
  { re: /better-sqlite3|node:sqlite|DatabaseSync|sqlite3/, label: 'SQLite storage' },
  { re: /from ['"]node:fs['"]|readFileSync|writeFileSync/, label: 'filesystem access' },
  { re: /from ['"]ink['"]|from ['"]react['"]/, label: 'React / Ink UI' },
  { re: /@tauri-apps|tauri::|tauri\.conf/, label: 'Tauri desktop shell' },
  { re: /process\.argv|commander|yargs|parseArgs/, label: 'CLI entry point' },
  { re: /tiktoken|count_tokens|estimate_tokens/, label: 'token accounting' },
  { re: /https?\.request\(|globalThis\.fetch|\bfetch\s*\(/, label: 'outbound HTTP client' },
  { re: /ProxyAgent|createProxyServer|https?\.createServer/, label: 'HTTP proxy / server' },
  { re: /node:test|\bdescribe\s*\(|\bit\s*\(/, label: 'test suite' },
];

const SCRIPT_PRIORITY = [
  'start', 'dev', 'serve', 'build', 'test', 'typecheck', 'lint', 'format', 'start:dev',
];

export interface MapBudget {
  /** hard byte ceiling for the rendered text */
  maxBytes: number;
  treeDepth: number;
  maxTreeDirs: number;
  /** largest files listed per directory before the rest fold into a count */
  maxTreeFiles: number;
  maxModules: number;
  maxSymbolsPerModule: number;
  readmeChars: number;
  maxLangs: number;
  maxDeps: number;
  capabilities: boolean;
  branch: boolean;
  envVars: boolean;
}

export const MAP_BUDGETS: Record<Exclude<MapLevel, 'off'>, MapBudget> = {
  lite: {
    maxBytes: 2_400, treeDepth: 3, maxTreeDirs: 20, maxTreeFiles: 3, maxModules: 0,
    maxSymbolsPerModule: 0, readmeChars: 0, maxLangs: 4, maxDeps: 6,
    capabilities: false, branch: false, envVars: false,
  },
  standard: {
    maxBytes: 5_200, treeDepth: 4, maxTreeDirs: 40, maxTreeFiles: 5, maxModules: 12,
    maxSymbolsPerModule: 5, readmeChars: 320, maxLangs: 6, maxDeps: 9,
    capabilities: true, branch: true, envVars: true,
  },
  full: {
    maxBytes: 9_500, treeDepth: 5, maxTreeDirs: 70, maxTreeFiles: 7, maxModules: 24,
    maxSymbolsPerModule: 8, readmeChars: 700, maxLangs: 10, maxDeps: 14,
    capabilities: true, branch: true, envVars: true,
  },
};

const OFF_VALUES = new Set(['off', 'none', 'false', 'no', '0', 'disabled']);

/** Normalize a user/env/config value into a level. Unknown/empty → the default. */
export function resolveMapLevel(value?: unknown): MapLevel {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, '');
  if (!raw) return DEFAULT_MAP_LEVEL;
  if (OFF_VALUES.has(raw)) return 'off';
  if (raw === 'lite' || raw === 'light' || raw === 'small') return 'lite';
  if (raw === 'standard' || raw === 'normal' || raw === 'default' || raw === 'on') return 'standard';
  if (raw === 'full' || raw === 'max' || raw === 'deep') return 'full';
  return DEFAULT_MAP_LEVEL;
}

const DETAIL_LEVELS: MapLevel[] = ['lite', 'standard', 'full'];

/** Every selectable level, including 'off' — used by the CLI to print the menu. */
export function mapLevelCycle(): MapLevel[] {
  return [...DETAIL_LEVELS, 'off'];
}

export function nextMapLevel(current?: string | null): MapLevel {
  const order = mapLevelCycle();
  const at = order.indexOf(resolveMapLevel(current));
  return order[(at + 1) % order.length];
}

// ---------------------------------------------------------------------------
// Filesystem scan
// ---------------------------------------------------------------------------

export interface ScanFile {
  rel: string;
  abs: string;
  size: number;
  ext: string;
  lang: string | null;
  loc: number;
}

export interface ScanDir {
  rel: string;
  abs: string;
  fileCount: number;
  loc: number;
  depth: number;
}

export interface ProjectScan {
  root: string;
  name: string;
  fingerprint: string;
  files: number;
  bytes: number;
  loc: number;
  dirs: number;
  truncated: boolean;
  languages: { lang: string; files: number; loc: number }[];
  dirStats: Map<string, ScanDir>;
  fileStats: Map<string, ScanFile>;
  manifest: Record<string, any> | null;
  readme: { rel: string; excerpt: string } | null;
  configFiles: string[];
  testFiles: string[];
  testDirs: string[];
  topFiles: ScanFile[];
  topDirs: ScanDir[];
  envVars: string[];
  capabilities: string[];
  branch: string | null;
  workspaces: string[];
  testRunner: string | null;
  graphSummaries: { file: string; summary: string }[];
}

// Dot-directories are NOT ignored wholesale: .github, .claude and .opencode are
// exactly the files an agent needs to find. Only the known-heavy ones are.
function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

function isTextFile(name: string, ext: string): boolean {
  if (BINARY_EXTS.has(ext)) return false;
  if (IGNORED_FILES.has(name)) return false;
  if (TEXT_EXTS.has(ext)) return true;
  // Extension-less config/marker files (Makefile, Dockerfile, LICENSE, …).
  if (!ext) return true;
  return false;
}

/**
 * One bounded breadth-first walk.
 *
 * Symlinked directories are never followed: a repo with a self-referential link
 * would otherwise loop forever, and a symlinked tree is not the project anyway.
 */
function walk(root: string): {
  files: { abs: string; rel: string; size: number }[];
  dirEntries: { rel: string; fileCount: number }[];
  truncated: boolean;
} {
  const files: { abs: string; rel: string; size: number }[] = [];
  const dirCounts = new Map<string, number>();
  let truncated = false;
  let reads = 0;
  const queue: { abs: string; rel: string; depth: number }[] = [{ abs: root, rel: '', depth: 0 }];

  while (queue.length) {
    if (files.length >= MAX_ENTRIES || reads >= MAX_DIR_READS) {
      truncated = true;
      break;
    }
    const cur = queue.shift()!;
    reads += 1;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    // A directory carrying its own .git is a separate project (a clone, a
    // vendored fork, an agent worktree). Walking into it double-counts the whole
    // codebase and drowns the real layout, so it is skipped wherever it sits —
    // but never the root itself, which is the project being mapped.
    if (cur.depth > 0 && entries.some((e) => e.name === '.git')) continue;
    for (const e of entries) {
      const abs = path.join(cur.abs, e.name);
      const rel = cur.rel ? `${cur.rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (isIgnoredDir(e.name)) continue;
        if (cur.depth + 1 > MAX_WALK_DEPTH) {
          truncated = true;
          continue;
        }
        dirCounts.set(rel, 0);
        queue.push({ abs, rel, depth: cur.depth + 1 });
        continue;
      }
      if (!e.isFile()) continue;
      let st: fs.Stats;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      files.push({ abs, rel, size: st.size });
      if (cur.rel) dirCounts.set(cur.rel, (dirCounts.get(cur.rel) || 0) + 1);
      else dirCounts.set('', (dirCounts.get('') || 0) + 1);
    }
  }

  return {
    files,
    dirEntries: [...dirCounts.entries()].map(([rel, fileCount]) => ({ rel, fileCount })),
    truncated,
  };
}

/** A manifest we can read facts out of, if this project has one. */
function findManifest(root: string, files: { rel: string; abs: string }[]): Record<string, any> | null {
  for (const name of ['package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod', 'composer.json']) {
    const hit = files.find((f) => f.rel === name);
    if (!hit) continue;
    try {
      const raw = fs.readFileSync(hit.abs, 'utf-8');
      if (name === 'package.json') {
        const parsed = JSON.parse(raw.replace(/^\s*﻿/, ''));
        if (parsed && typeof parsed === 'object') return parsed;
      }
      // Non-JSON manifests are summarized by key/value scraping at render time.
      return { __manifest_format: name, __manifest_raw: raw.slice(0, 8000) };
    } catch {}
  }
  return null;
}

function readReadme(root: string, files: { rel: string; abs: string; size: number }[]): { rel: string; excerpt: string } | null {
  const hit = files
    .filter((f) => /^readme(\.md|\.txt|\.rst)?$/i.test(f.rel))
    .sort((a, b) => a.rel.length - b.rel.length)[0];
  if (!hit) return null;
  try {
    const raw = fs.readFileSync(hit.abs, 'utf-8');
    return { rel: hit.rel, excerpt: raw };
  } catch {
    return null;
  }
}

/**
 * Strip Markdown chrome so the excerpt reads as prose the model can use.
 * Badges, HTML comments, code fences, headings markers and badge-only lines are
 * exactly what a README leads with, and they carry no information about purpose.
 */
export function readmeExcerpt(markdown: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^```/.test(t)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!t) {
      if (kept.length) kept.push('');
      continue;
    }
    if (/^<!--/.test(t)) continue;
    if (/^>/.test(t)) continue;
    // Badge walls and bare image/link lists are the first thing most READMEs
    // contain and the last thing worth spending a token on.
    if (/^(?:!?\[[^\]]*\]\([^)]*\)\s*)+$/.test(t)) continue;
    if (/^\[!\[/.test(t)) continue;
    if (/^<img|^<a\s|^<p>|^<div/i.test(t)) continue;
    if (/^[-=]{3,}$/.test(t)) continue;
    if (/^#{1,6}\s/.test(t)) continue;
    if (/^\|/.test(t)) continue;
    if (/^\s*[-*+]\s*$/.test(t)) continue;
    const plain = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/<[^>]+>/g, '');
    if (plain.trim()) kept.push(plain.trim());
  }
  const text = kept.join(' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  const body = (lastStop > maxChars * 0.4 ? cut.slice(0, lastStop + 1) : cut).trim();
  return `${body.replace(/[\s,;:]+$/, '').replace(/[—–-]+$/, '')}…`;
}

/** Scrape `name = "value"` out of a Cargo.toml / go.mod style manifest. */
function scrapeToml(raw: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const re = new RegExp(`^\\s*${key}\\s*[=:]\\s*["']?([^"'\\n]+)["']?`, 'im');
    const m = raw.match(re);
    if (m) out[key] = m[1].trim();
  }
  return out;
}

function gitBranch(root: string): string | null {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: root,
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    });
    const b = String(out).trim();
    return b && b !== 'HEAD' ? b : b ? '(detached)' : null;
  } catch {
    return null;
  }
}

const ENV_RE = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])|envValue\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g;

const RUNNER_MARKS: { re: RegExp; name: string }[] = [
  { re: /from ['"]node:test['"]|require\(['"]node:test['"]\)/, name: 'node:test' },
  { re: /from ['"]vitest['"]/, name: 'vitest' },
  { re: /from ['"]@jest\/globals['"]|require\(['"]jest['"]\)/, name: 'jest' },
  { re: /from ['"]mocha['"]/, name: 'mocha' },
  { re: /from ['"]ava['"]/, name: 'ava' },
  { re: /from ['"]tap['"]/, name: 'tap' },
  { re: /import \{ pytest \}|unittest\.TestCase/, name: 'pytest / unittest' },
  { re: /#\[test\]|mod tests \{/, name: 'cargo test' },
];

/** Identify the test runner from the imports of a handful of test files. */
function detectTestRunner(files: { abs: string }[], deps: Record<string, string>): string | null {
  for (const dep of ['vitest', 'jest', 'mocha', 'ava', 'tap']) {
    if (dep in deps) return dep;
  }
  for (const f of files.slice(0, 6)) {
    let raw: string;
    try {
      raw = fs.readFileSync(f.abs, 'utf-8').slice(0, 4000);
    } catch {
      continue;
    }
    for (const mark of RUNNER_MARKS) if (mark.re.test(raw)) return mark.name;
  }
  return null;
}

/** Build the full picture of a project. Local I/O only — no tokens spent. */
export function scanProject(root: string): ProjectScan | null {
  let realRoot = root;
  try {
    realRoot = fs.realpathSync(root);
    if (!fs.statSync(realRoot).isDirectory()) return null;
  } catch {
    return null;
  }

  const { files, dirEntries, truncated } = walk(realRoot);
  if (!files.length) return null;

  const fileStats = new Map<string, ScanFile>();
  const langTotals = new Map<string, { files: number; loc: number }>();
  const envSet = new Set<string>();
  const caps = new Set<string>();
  const testFiles: string[] = [];
  const testDirs = new Set<string>();
  const configFiles: string[] = [];
  let bytes = 0;
  let loc = 0;
  let readBudget = CONTENT_READ_BUDGET;

  for (const f of files) {
    const ext = path.extname(f.rel).toLowerCase();
    const base = path.basename(f.rel);
    if (isTextFile(base, ext)) configFiles.push(f.rel);
    if (TEST_FILE_RE.test(base)) testFiles.push(f.rel);
    const dirName = path.basename(path.dirname(f.rel));
    if (dirName && TEST_DIR_NAMES.has(dirName.toLowerCase())) testDirs.add(path.dirname(f.rel));

    const lang = LANGUAGES[ext] || null;
    const readable = isTextFile(base, ext) && f.size <= MAX_FILE_BYTES && readBudget > 0;
    let lines = 0;
    let content = '';
    if (readable) {
      try {
        content = fs.readFileSync(f.abs, 'utf-8');
        readBudget -= content.length;
      } catch {
        content = '';
      }
    }
    if (content) {
      lines = content.length ? content.split('\n').length : 0;
      if (lines > 1 && lines <= 400_000) {
        let m: RegExpExecArray | null;
        ENV_RE.lastIndex = 0;
        while ((m = ENV_RE.exec(content)) !== null) {
          envSet.add(m[1] || m[2] || m[3]);
          if (envSet.size > 60) break;
        }
        for (const sig of CAPABILITY_SIGNALS) {
          if (caps.size < 20 && sig.re.test(content)) caps.add(sig.label);
        }
      }
    }
    bytes += f.size;
    loc += lines;
    fileStats.set(f.rel, { rel: f.rel, abs: f.abs, size: f.size, ext, lang, loc: lines });
    if (lang) {
      const t = langTotals.get(lang) || { files: 0, loc: 0 };
      t.files += 1;
      t.loc += lines;
      langTotals.set(lang, t);
    }
  }

  // Per-directory rollups. A directory inherits the lines of its whole subtree so
  // the layout tree can print "src/ 42 files, 9k LOC" from one number.
  const dirStats = new Map<string, ScanDir>();
  for (const { rel, fileCount } of dirEntries) {
    if (!rel) continue;
    dirStats.set(rel, { rel, abs: path.join(realRoot, rel), fileCount, loc: 0, depth: rel.split('/').length });
  }
  for (const f of fileStats.values()) {
    const segs = f.rel.split('/');
    for (let i = 1; i < segs.length; i++) {
      const key = segs.slice(0, i).join('/');
      const d = dirStats.get(key);
      if (d) {
        d.fileCount += 1;
        d.loc += f.loc;
      }
    }
  }
  for (const d of dirStats.values()) d.depth = d.rel.split('/').length;

  const languages = [...langTotals.entries()]
    .map(([lang, t]) => ({ lang, files: t.files, loc: t.loc }))
    .sort((a, b) => b.loc - a.loc || b.files - a.files);

  const topDirs = [...dirStats.values()]
    .filter((d) => d.rel.includes('/'))
    .sort((a, b) => b.loc - a.loc || a.rel.localeCompare(b.rel));

  const rootFiles = [...fileStats.values()].filter((f) => !f.rel.includes('/'));
  const topFiles = [...rootFiles.sort((a, b) => b.loc - a.loc)];

  const manifest = findManifest(realRoot, files);
  const readme = readReadme(realRoot, files);

  let workspaces: string[] = [];
  if (manifest && Array.isArray(manifest.workspaces)) {
    workspaces = manifest.workspaces.filter((w: unknown): w is string => typeof w === 'string').slice(0, 12);
  }

  // Fingerprint on (path, size) only. Mtimes change on every agent edit, which
  // would invalidate the cache — and the injected block — continuously for edits
  // that cannot change a structural map. A same-size content edit leaves the
  // map briefly stale, which is the right trade: the map already says "snapshot,
  // re-read before editing".
  const fpInput = files
    .map((f) => `${f.rel}:${f.size}`)
    .sort()
    .join('\n');

  return {
    root: realRoot,
    name: path.basename(realRoot) || realRoot,
    fingerprint: sha256Hex(fpInput).slice(0, 32),
    files: files.length,
    bytes,
    loc,
    dirs: dirStats.size,
    truncated,
    languages,
    dirStats,
    fileStats,
    manifest,
    readme,
    configFiles: configFiles.sort().slice(0, 40),
    testFiles: testFiles.sort(),
    testDirs: [...testDirs].sort(),
    topFiles,
    topDirs,
    envVars: [...envSet].sort(),
    capabilities: [...caps].sort(),
    branch: gitBranch(realRoot),
    workspaces,
    testRunner: detectTestRunner(
      testFiles.map((rel) => fileStats.get(rel)!).filter(Boolean),
      manifestFacts(manifest).deps
    ),
    graphSummaries: (() => {
      const graph = readKnowledgeGraph(realRoot);
      return graph ? graphSummaries(graph, 8) : [];
    })(),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const kb = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

function manifestFacts(manifest: Record<string, any> | null): { name?: string; version?: string; description?: string; deps: Record<string, string> } {
  const deps: Record<string, string> = {};
  if (!manifest) return { deps };
  if (manifest.__manifest_format) {
    const raw = String(manifest.__manifest_raw || '');
    const facts = scrapeToml(raw, ['name', 'version', 'description']);
    return { name: facts.name, version: facts.version, description: facts.description, deps };
  }
  for (const bucket of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const obj = manifest[bucket];
    if (!obj || typeof obj !== 'object') continue;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string' && !(k in deps)) deps[k] = v;
    }
  }
  return {
    name: typeof manifest.name === 'string' ? manifest.name : undefined,
    version: typeof manifest.version === 'string' ? manifest.version : undefined,
    description: typeof manifest.description === 'string' ? manifest.description : undefined,
    deps,
  };
}

function knownStack(deps: Record<string, string>, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [dep, label] of Object.entries(KNOWN_DEPS)) {
    if (seen.has(label) || !(dep in deps)) continue;
    const version = String(deps[dep] || '').replace(/^[\^~]/, '');
    seen.add(label);
    out.push(version ? `${label} ${version}` : label);
    if (out.length >= max) break;
  }
  return out;
}

function scriptEntries(manifest: Record<string, any> | null, max: number): { name: string; cmd: string }[] {
  const scripts = manifest && typeof manifest.scripts === 'object' && manifest.scripts ? (manifest.scripts as Record<string, unknown>) : null;
  if (!scripts) return [];
  const named = SCRIPT_PRIORITY.filter((n) => typeof scripts[n] === 'string').map((n) => ({ name: n, cmd: String(scripts[n]) }));
  const rest = Object.keys(scripts)
    .filter((n) => !SCRIPT_PRIORITY.includes(n) && typeof scripts[n] === 'string')
    .sort()
    .map((n) => ({ name: n, cmd: String(scripts[n]) }));
  const merged = [...named, ...rest];
  const out: { name: string; cmd: string }[] = [];
  const seen = new Set<string>();
  for (const e of merged) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    const cmd = e.cmd.length > 96 ? `${e.cmd.slice(0, 93)}…` : e.cmd;
    out.push({ name: e.name, cmd });
    if (out.length >= max) break;
  }
  return out;
}

function entryPoints(scan: ProjectScan, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (line: string): void => {
    if (out.length >= max || seen.has(line)) return;
    seen.add(line);
    out.push(line);
  };
  const m = scan.manifest;
  if (m && !m.__manifest_format) {
    if (typeof m.main === 'string') push(`manifest main: ${m.main}`);
    if (typeof m.module === 'string') push(`manifest module: ${m.module}`);
    if (m.bin && typeof m.bin === 'object') {
      for (const [bin, rel] of Object.entries(m.bin as Record<string, unknown>).slice(0, 4)) {
        if (typeof rel === 'string') push(`bin ${bin} → ${rel}`);
      }
    }
  }
  if (m?.__manifest_format === 'Cargo.toml') {
    const raw = String(m.__manifest_raw || '');
    const bin = raw.match(/^\s*\[\[bin\]\][\s\S]{0,200}?path\s*=\s*"([^"]+)"/im);
    if (bin) push(`cargo bin: ${bin[1]}`);
  }
  for (const name of ENTRY_FILE_NAMES) {
    const f = scan.fileStats.get(name);
    if (f) push(`${name} (${kb(f.loc)} LOC)`);
  }
  for (const dir of scan.dirStats.keys()) {
    if (out.length >= max) break;
    const base = path.basename(dir);
    if (['bin', 'scripts', 'cmd'].includes(base)) {
      const d = scan.dirStats.get(dir)!;
      push(`${dir}/ — ${d.fileCount} executables`);
    }
  }
  return out;
}

/** Exported top-level names, for "what does this module actually do". */
export function extractSymbols(filePath: string, max: number): string[] {
  let raw: string;
  try {
    if (fs.statSync(filePath).size > MAX_FILE_BYTES) return [];
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  // TypeScript/JavaScript: use the compiler API for accurate AST extraction.
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
    try {
      const src = ts.createSourceFile(filePath, raw, ts.ScriptTarget.Latest, true);
      const names: string[] = [];
      const seen = new Set<string>();
      const isExported = (node: ts.Node): boolean => {
        const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
        return !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      };
      const visit = (node: ts.Node): void => {
        if (names.length >= max) return;
        let name: string | undefined;
        if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) name = node.name.text;
        else if (ts.isClassDeclaration(node) && node.name && isExported(node)) name = node.name.text;
        else if (ts.isInterfaceDeclaration(node) && node.name && isExported(node)) name = node.name.text;
        else if (ts.isTypeAliasDeclaration(node) && node.name && isExported(node)) name = node.name.text;
        else if (ts.isEnumDeclaration(node) && node.name && isExported(node)) name = node.name.text;
        else if (ts.isVariableStatement(node) && isExported(node)) {
          for (const d of node.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text) {
              const n = d.name.text;
              if (!n.startsWith('_') && !seen.has(n)) {
                seen.add(n);
                names.push(n);
                if (names.length >= max) return;
              }
            }
          }
        } else if (ts.isExportAssignment(node) && isExported(node)) {
          name = '(default export)';
        }
        if (name && !name.startsWith('_') && !seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
        ts.forEachChild(node, visit);
      };
      visit(src);
      if (names.length) return names;
    } catch {
      // fall through to regex
    }
  }

  // Fallback for non-TS languages: regex extraction.
  const names: string[] = [];
  const seen = new Set<string>();
  const re = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1];
    if (name.startsWith('_') || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= max) break;
  }
  if (!names.length && /^\s*export\s+(\{|\*)/m.test(raw)) return ['(re-exports)'];
  return names;
}

interface TreeNode {
  name: string;
  rel: string;
  isDir: boolean;
  children: TreeNode[];
  fileCount: number;
  loc: number;
  /** a stand-in for several directories at the depth limit — name says it all */
  collapsed?: boolean;
}

function buildTree(scan: ProjectScan, maxDepth: number): TreeNode {
  const root: TreeNode = { name: '', rel: '', isDir: true, children: [], fileCount: 0, loc: 0 };
  const nodes = new Map<string, TreeNode>([['', root]]);
  const ensure = (rel: string): TreeNode => {
    const existing = nodes.get(rel);
    if (existing) return existing;
    const parentRel = rel.split('/').slice(0, -1).join('/');
    const parent = nodes.get(parentRel) || root;
    const node: TreeNode = {
      name: path.basename(rel),
      rel,
      isDir: true,
      children: [],
      fileCount: 0,
      loc: 0,
    };
    nodes.set(rel, node);
    parent.children.push(node);
    return node;
  };
  for (const f of scan.fileStats.values()) {
    const segs = f.rel.split('/');
    for (let i = 1; i < segs.length; i++) ensure(segs.slice(0, i).join('/'));
    const parent = nodes.get(segs.slice(0, -1).join('/')) || root;
    parent.children.push({ name: segs[segs.length - 1], rel: f.rel, isDir: false, children: [], fileCount: 1, loc: f.loc });
  }

  // Roll subtree totals up so a directory can print "42 files, 9k LOC" in one hit.
  const rollUp = (node: TreeNode): { files: number; loc: number } => {
    let files = 0;
    let loc = 0;
    for (const c of node.children) {
      if (c.isDir) {
        const t = rollUp(c);
        c.fileCount = t.files;
        c.loc = t.loc;
      }
      files += c.fileCount;
      loc += c.loc;
    }
    return { files, loc };
  };
  rollUp(root);

  // Directories at the depth limit collapse into one summary line, and empty
  // directories drop out entirely rather than padding the map with noise.
  const prune = (node: TreeNode, depth: number): void => {
    const keep: TreeNode[] = [];
    const buried: TreeNode[] = [];
    for (const c of node.children) {
      if (!c.isDir) {
        keep.push(c);
        continue;
      }
      if (c.fileCount === 0) continue;
      if (depth >= maxDepth) {
        buried.push(c);
        continue;
      }
      prune(c, depth + 1);
      keep.push(c);
    }
    if (buried.length === 1) {
      // A single hidden subdirectory is almost always the interesting one.
      const only = buried[0];
      keep.push({ name: only.name, rel: only.rel, isDir: true, children: [], fileCount: only.fileCount, loc: only.loc });
    } else if (buried.length > 1) {
      // Several: one line, and the counts are already in the name.
      const files = buried.reduce((n, d) => n + d.fileCount, 0);
      keep.push({
        name: `… ${buried.length} more subdirs (${files} files, ${kb(buried.reduce((n, d) => n + d.loc, 0))} LOC)`,
        rel: '',
        isDir: true,
        collapsed: true,
        children: [],
        fileCount: files,
        loc: buried.reduce((n, d) => n + d.loc, 0),
      });
    }
    // Directories first, then files, each alphabetical — the order a human reads.
    keep.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children = keep;
  };
  prune(root, 1);
  return root;
}

/**
 * Render the layout tree.
 *
 * Files are the expensive part of a tree listing and the least useful: a
 * directory's own summary line already carries the file count and the line
 * count. So each directory shows only its largest files and folds the rest into
 * a count — which is what keeps a 5,000-file monorepo inside the same budget as
 * a 50-file app.
 */
function renderTree(root: TreeNode, budget: MapBudget): string[] {
  const lines: string[] = [];
  let dirBudget = budget.maxTreeDirs;

  const walk = (node: TreeNode, indent: number): void => {
    if (lines.length >= 140) return;
    const pad = '  '.repeat(indent);
    for (const child of node.children) {
      if (lines.length >= 140) return;
      if (!child.isDir) continue;
      if (dirBudget <= 0) {
        lines.push(`${pad}${child.name}/  (${child.fileCount} files)`);
        continue;
      }
      if (child.collapsed) {
        lines.push(`${pad}${child.name}`);
        continue;
      }
      dirBudget -= 1;
      lines.push(`${pad}${child.name}/  ${child.fileCount} files, ${kb(child.loc)} LOC`);
      walk(child, indent + 1);
    }
    // Largest files first: the big ones are the ones worth opening. The
    // allowance is per directory — a global pool would starve every directory
    // after the first, which is what turned this into a column of "… N more".
    const files = node.children
      .filter((c) => !c.isDir && c.loc > 0)
      .sort((a, b) => b.loc - a.loc || a.name.localeCompare(b.name));
    if (!files.length) return;
    const shown = files.slice(0, budget.maxTreeFiles);
    for (const f of shown) lines.push(`${pad}${f.name}  ${kb(f.loc)}`);
    if (files.length > shown.length) lines.push(`${pad}… ${files.length - shown.length} more file(s)`);
  };

  walk(root, 0);
  return lines;
}

/**
 * Fold two overlapping statements into one line.
 *
 * A package.json description is very often the README's opening sentence with a
 * different prefix, so printing both repeats the claim. When the opening of one
 * appears inside the other, the shared span is dropped from the second and only
 * the new information survives.
 */
export function mergeProse(a: string, b: string, overlap = 30): string | null {
  const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const A = clean(a);
  const B = clean(b);
  if (!A || !B) return null;
  if (B.toLowerCase().includes(A.toLowerCase())) return A;
  const head = B.slice(0, overlap).toLowerCase();
  const at = A.toLowerCase().indexOf(head);
  if (at === -1) return null;
  // The two versions can still diverge right after the shared span (a manifest
  // description often appends a "(TypeScript + Ink TUI)" the README does not
  // have), so the overlap has to be extended over whatever the first text
  // already says next — otherwise the tail is printed twice, mid-word.
  const tailOfA = A.slice(at + overlap);
  const rest = B.slice(overlap);
  let shared = 0;
  while (shared < rest.length && shared < tailOfA.length && rest[shared].toLowerCase() === tailOfA[shared].toLowerCase()) {
    shared += 1;
  }
  const remainder = clean(rest.slice(shared)).replace(/^[\s,.:;)\]]+/, '');
  return remainder ? `${clean(A.replace(/[\s,.:;]+$/, ''))} — ${remainder}` : A;
}

export interface KnowledgeGraphNode {
  id: string;
  type?: string;
  name?: string;
  summary?: string;
  description?: string;
  layer?: string;
  tags?: string[];
}

export interface KnowledgeGraph {
  nodes?: KnowledgeGraphNode[];
  edges?: { source: string; target: string; type?: string }[];
  [key: string]: unknown;
}

/**
 * Read a pre-built Understand-Anything knowledge graph, if present.
 *
 * This is a pure file read — zero tokens. The graph was generated by an
 * external LLM pipeline (understand-anything) and committed to the repo.
 * We consume its per-file summaries to enrich the map with semantic
 * descriptions that static analysis cannot produce.
 */
export function readKnowledgeGraph(root: string): KnowledgeGraph | null {
  const candidates = [
    path.join(root, '.ua', 'knowledge-graph.json'),
    path.join(root, '.understand-anything', 'knowledge-graph.json'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf-8');
      const parsed = JSON.parse(raw) as KnowledgeGraph;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes)) return parsed;
    } catch {}
  }
  return null;
}

/**
 * Extract per-file summaries from a knowledge graph, keyed by file path.
 * Returns at most `maxFiles` entries, sorted by summary length (most
 * descriptive first).
 */
export function graphSummaries(graph: KnowledgeGraph, maxFiles = 8): { file: string; summary: string }[] {
  const out: { file: string; summary: string }[] = [];
  for (const node of graph.nodes || []) {
    const file = node.id || node.name;
    const summary = node.summary || node.description;
    if (!file || !summary) continue;
    out.push({ file, summary: summary.slice(0, 200) });
  }
  out.sort((a, b) => b.summary.length - a.summary.length);
  return out.slice(0, maxFiles);
}

const DIRECTIVE =
  'This project map was generated locally from the filesystem — it costs no tokens and replaces re-exploring the tree. Prefer it over `ls`/`tree`/`find`/manifest reads to orient yourself. It is a structural snapshot, not a contract: re-read a file before editing it, and trust tools over the map whenever they disagree.';

function renderMapText(scan: ProjectScan, budget: MapBudget): string {
  const facts = manifestFacts(scan.manifest);
  const out: string[] = [];

  const title = [facts.name || scan.name, facts.version ? `v${facts.version}` : ''].filter(Boolean).join(' ');
  out.push(`# Project map — ${title}`);
  const sizeBits = [`${scan.files} files`, `${kb(scan.loc)} LOC`, `${scan.dirs} dirs`];
  if (scan.branch) sizeBits.push(`branch ${scan.branch}`);
  out.push(`${scan.root} (${sizeBits.join(', ')})`);
  out.push('');
  out.push(DIRECTIVE);
  out.push('');

  // --- what it is -----------------------------------------------------------
  const what: string[] = [];
  if (facts.description) what.push(facts.description);
  if (scan.readme && budget.readmeChars > 0) {
    const excerpt = readmeExcerpt(scan.readme.excerpt, budget.readmeChars);
    if (excerpt) {
      const merged = what.length ? mergeProse(what[0], excerpt) : null;
      if (merged) what[0] = merged;
      else what.push(excerpt);
    }
  }
  if (what.length) {
    out.push('## What it is');
    out.push(what.join(' — '));
    out.push('');
  }

  // --- stack ----------------------------------------------------------------
  const langs = scan.languages.slice(0, budget.maxLangs);
  const stack = langs.map((l) => `${l.lang} ${l.files}f/${kb(l.loc)}`);
  const deps = knownStack(facts.deps, budget.maxDeps);
  if (stack.length || deps.length) {
    out.push('## Stack');
    if (stack.length) out.push(`Languages: ${stack.join(', ')}`);
    if (deps.length) out.push(`Key dependencies: ${deps.join(', ')}`);
    if (scan.workspaces.length) out.push(`Workspaces: ${scan.workspaces.join(', ')}`);
    out.push('');
  }

  // --- layout ---------------------------------------------------------------
  const tree = renderTree(buildTree(scan, budget.treeDepth), budget);
  if (tree.length) {
    out.push('## Layout');
    out.push(...tree);
    out.push('');
  }
  // --- entry points ---------------------------------------------------------
  const entries = entryPoints(scan, 6);
  const scripts = scriptEntries(scan.manifest, budget.maxDeps);
  if (entries.length || scripts.length) {
    out.push('## Entry points & commands');
    for (const e of entries) out.push(`- ${e}`);
    for (const s of scripts) out.push(`- ${s.name}: ${s.cmd}`);
    if (!scripts.length) out.push('- (no package scripts found)');
    out.push('');
  }

  // --- key modules ----------------------------------------------------------
  if (budget.maxModules > 0) {
    // Rank by size, but let every directory contribute one representative file
    // so the map does not degenerate into "the six biggest files in core/".
    const ranked = [...scan.fileStats.values()]
      .filter((f) => f.lang && CODE_LANGS.has(f.lang) && f.loc > 0)
      .sort((a, b) => b.loc - a.loc || a.rel.localeCompare(b.rel));
    const modules: ScanFile[] = [];
    const represented = new Set<string>();
    for (const f of ranked) {
      const dir = f.rel.includes('/') ? path.dirname(f.rel) : '';
      if (dir && represented.has(dir)) continue;
      if (dir) represented.add(dir);
      modules.push(f);
      if (modules.length >= budget.maxModules) break;
    }
    if (modules.length) {
      out.push('## Key modules');
      for (const f of modules) {
        const syms = budget.maxSymbolsPerModule > 0 ? extractSymbols(f.abs, budget.maxSymbolsPerModule) : [];
        const tail = syms.length ? ` — ${syms.join(', ')}` : '';
        out.push(`- ${f.rel} (${kb(f.loc)} LOC)${tail}`);
      }
      out.push('');
    }
  }

  // --- knowledge graph summaries --------------------------------------------
  // Enrichment from a pre-built Understand-Anything graph (zero tokens —
  // just reads a committed JSON file). Only at standard+ levels.
  if (budget.capabilities && scan.graphSummaries.length) {
    out.push('## File summaries (from knowledge graph)');
    for (const { file, summary } of scan.graphSummaries.slice(0, 6)) {
      out.push(`- ${file}: ${summary}`);
    }
    out.push('');
  }

  // --- how it is wired ------------------------------------------------------
  if (budget.capabilities && scan.capabilities.length) {
    out.push('## Detected capabilities');
    out.push(scan.capabilities.slice(0, 10).join(', '));
    out.push('');
  }

  // --- tests ----------------------------------------------------------------
  if (scan.testFiles.length || scan.testDirs.length) {
    out.push('## Tests');
    out.push(
      `${scan.testFiles.length} test file(s)${scan.testDirs.length ? ` under ${scan.testDirs.slice(0, 4).join(', ')}` : ''}` +
        `${scan.testRunner ? ` — runner: ${scan.testRunner}` : ''}`
    );
    out.push('');
  }

  // --- config ---------------------------------------------------------------
  const configs = scan.configFiles.filter((f) => CONFIG_FILES.has(path.basename(f)) || /^\.env/.test(path.basename(f)));
  if (configs.length || (budget.envVars && scan.envVars.length)) {
    out.push('## Config & environment');
    if (configs.length) out.push(`Files: ${configs.slice(0, 10).join(', ')}`);
    if (budget.envVars && scan.envVars.length) out.push(`Env vars read: ${scan.envVars.slice(0, 14).join(', ')}`);
    out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Render at the requested level, shrinking sections until the budget is met. */
export function renderMap(scan: ProjectScan, level: Exclude<MapLevel, 'off'>): { text: string; truncated: boolean } {
  const base = MAP_BUDGETS[level];
  const scales = [1, 0.75, 0.5, 0.3];
  let text = '';
  for (const scale of scales) {
    const budget: MapBudget = {
      ...base,
      maxBytes: Math.round(base.maxBytes * scale),
      maxTreeDirs: Math.round(base.maxTreeDirs * scale),
      maxTreeFiles: Math.max(1, Math.round(base.maxTreeFiles * scale)),
      maxModules: Math.round(base.maxModules * scale),
      maxLangs: Math.max(2, Math.round(base.maxLangs * scale)),
      maxDeps: Math.max(3, Math.round(base.maxDeps * scale)),
      readmeChars: Math.round(base.readmeChars * scale),
    };
    text = renderMapText(scan, budget);
    if (Buffer.byteLength(text, 'utf-8') <= base.maxBytes) {
      return { text, truncated: scale < 1 };
    }
  }
  // Last resort: cut at a line boundary so a huge repo still yields valid Markdown.
  const bytes = base.maxBytes;
  const buf = Buffer.from(text, 'utf-8').subarray(0, bytes).toString('utf-8');
  const cut = buf.lastIndexOf('\n', buf.length - 200);
  return { text: `${(cut > 0 ? buf.slice(0, cut) : buf).trimEnd()}\n`, truncated: true };
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface ProjectMap {
  root: string;
  name: string;
  level: MapLevel;
  text: string;
  tokens: number;
  bytes: number;
  fingerprint: string;
  files: number;
  loc: number;
  buildMs: number;
  cached: boolean;
  builtAtMs: number;
  truncated: boolean;
  file: string;
}

function cacheKey(root: string, level: MapLevel): string {
  return sha256Hex(`${root}::${level}`).slice(0, 20);
}

function cachePaths(root: string, level: MapLevel): { record: string; markdown: string } {
  const key = cacheKey(root, level);
  return {
    record: path.join(MAP_DIR, `${key}.json`),
    markdown: path.join(MAP_DIR, `${key}.md`),
  };
}

interface MapCacheRecord {
  version: number;
  root: string;
  level: MapLevel;
  fingerprint: string;
  text: string;
  builtAtMs: number;
  buildMs: number;
  files: number;
  loc: number;
  truncated: boolean;
}

/** In-process memo: keyed by root+level, holding the fingerprint it was built from. */
const _memo = new Map<string, { fingerprint: string; at: number; map: ProjectMap }>();

export function clearMapCache(): void {
  _memo.clear();
}

/** Delete every cached map file from disk. */
export function clearMapFiles(): number {
  let removed = 0;
  try {
    const entries = fs.readdirSync(MAP_DIR);
    for (const e of entries) {
      try {
        fs.unlinkSync(path.join(MAP_DIR, e));
        removed += 1;
      } catch {}
    }
  } catch {}
  _memo.clear();
  return removed;
}

function readRecord(root: string, level: MapLevel): MapCacheRecord | null {
  const { record } = cachePaths(root, level);
  const data = readJson<MapCacheRecord>(record, null);
  if (!data || data.version !== CACHE_VERSION) return null;
  if (data.root !== root || data.level !== level) return null;
  return data;
}

function writeRecord(rec: MapCacheRecord): void {
  const { record, markdown } = cachePaths(rec.root, rec.level);
  try {
    ensureDir(MAP_DIR);
    writeJson(record, rec);
    fs.writeFileSync(markdown, rec.text, 'utf-8');
  } catch {}
}

function toProjectMap(rec: MapCacheRecord, cached: boolean): ProjectMap {
  const { markdown } = cachePaths(rec.root, rec.level);
  return {
    root: rec.root,
    name: path.basename(rec.root),
    level: rec.level,
    text: rec.text,
    tokens: tokens.count_tokens(rec.text),
    bytes: Buffer.byteLength(rec.text, 'utf-8'),
    fingerprint: rec.fingerprint,
    files: rec.files,
    loc: rec.loc,
    buildMs: rec.buildMs,
    cached,
    builtAtMs: rec.builtAtMs,
    truncated: rec.truncated,
    file: markdown,
  };
}

/** The cached map for a project, without touching the filesystem walk. */
export function cachedProjectMap(root: string, level: MapLevel = DEFAULT_MAP_LEVEL): ProjectMap | null {
  if (level === 'off') return null;
  let realRoot = root;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return null;
  }
  const rec = readRecord(realRoot, level);
  if (!rec) return null;
  return toProjectMap(rec, true);
}

export interface BuildOptions {
  root?: string;
  level?: MapLevel;
  force?: boolean;
}

/**
 * Build (or reuse) the map for a project.
 *
 * The walk runs at most once per REBUILD_MIN_INTERVAL_MS per project: the
 * proxy calls this on the request path, and a fingerprint check is cheaper than
 * a tree walk but not free, so within the window the previous build is reused
 * even if the project changed. A structural map changing mid-session is not
 * worth a synchronous walk on the hot path.
 */
export function buildProjectMap(opts: BuildOptions = {}): ProjectMap | null {
  const level = opts.level && opts.level !== 'off' ? opts.level : resolveMapLevel(opts.level);
  if (level === 'off') return null;
  const root = opts.root || process.cwd();
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return null;
  }

  const key = cacheKey(realRoot, level);
  const memo = _memo.get(key);
  const now = Date.now();
  if (memo && !opts.force && now - memo.at < REBUILD_MIN_INTERVAL_MS) {
    return { ...memo.map, cached: true };
  }

  const rec = readRecord(realRoot, level);
  if (rec && !opts.force) {
    // Cheap structural check: newest mtime under the root vs the record's age.
    // Not a full walk — just the top level, which catches nearly every edit.
    let newest = 0;
    try {
      const st = fs.statSync(realRoot);
      newest = st.mtimeMs;
    } catch {}
    const fresh = rec.builtAtMs >= newest;
    if (fresh || now - rec.builtAtMs < REBUILD_MIN_INTERVAL_MS) {
      const map = toProjectMap(rec, true);
      _memo.set(key, { fingerprint: rec.fingerprint, at: now, map });
      return map;
    }
  }

  const t0 = Date.now();
  const scan = scanProject(realRoot);
  if (!scan) return null;
  if (rec && rec.fingerprint === scan.fingerprint) {
    const map = toProjectMap(rec, true);
    _memo.set(key, { fingerprint: rec.fingerprint, at: now, map });
    return map;
  }

  const { text, truncated } = renderMap(scan, level);
  const buildMs = Date.now() - t0;
  const next: MapCacheRecord = {
    version: CACHE_VERSION,
    root: realRoot,
    level,
    fingerprint: scan.fingerprint,
    text,
    builtAtMs: Date.now(),
    buildMs,
    files: scan.files,
    loc: scan.loc,
    truncated,
  };
  writeRecord(next);
  const map = toProjectMap(next, false);
  _memo.set(key, { fingerprint: scan.fingerprint, at: now, map });
  return map;
}

// ---------------------------------------------------------------------------
// Project root discovery
// ---------------------------------------------------------------------------

/** Does this directory look like a project root rather than a random subdir? */
export function looksLikeProjectRoot(dir: string): boolean {
  for (const marker of PROJECT_MARKERS) {
    try {
      if (fs.existsSync(path.join(dir, marker))) return true;
    } catch {}
  }
  return false;
}

/** Walk up from `start` to the nearest directory that looks like a project. */
export function findProjectRoot(start: string): string {
  let dir = path.resolve(start);
  for (let i = 0; i < MAX_WALK_DEPTH; i++) {
    if (looksLikeProjectRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start);
}

const ROOT_PATTERNS: RegExp[] = [
  /(?:working directory|working dir|current directory|project root|project directory|repo(?:sitory)? root|cwd)\s*(?:is)?\s*[:=]?\s*[`"']?((?:[A-Za-z]:[\\/]|\/|~)[^\n`"'|]{1,200})/i,
  /"cwd"\s*:\s*"([^"]{1,200})"/i,
  /cwd\s*=\s*((?:[A-Za-z]:[\\/]|\/|~)\S{1,200})/i,
];

/**
 * Recover the project root from the agent's own system prompt.
 *
 * Every coding agent states its working directory there ("Working directory:
 * /home/me/app"), which is the only reliable signal available to a proxy that
 * has no other way to know which repo the request is about. A guess is only
 * accepted when the path exists and looks like a project root, so a stray
 * absolute path in a prompt can never point the map at the wrong tree.
 */
export function rootFromPrompt(body: RequestBody | null | undefined): string | null {
  if (!body || typeof body !== 'object') return null;
  let texts: string[];
  try {
    texts = system_strings(body as RequestBody);
  } catch {
    return null;
  }
  for (const text of texts) {
    for (const re of ROOT_PATTERNS) {
      const m = text.match(re);
      if (!m || !m[1]) continue;
      let candidate = m[1].trim().replace(/[.,;:)\]]+$/, '');
      if (candidate.startsWith('~')) candidate = path.join(process.env.HOME || process.env.USERPROFILE || '', candidate.slice(1));
      if (candidate.length < 2) continue;
      try {
        if (!fs.statSync(candidate).isDirectory()) continue;
      } catch {
        continue;
      }
      const real = fs.realpathSync(candidate);
      if (looksLikeProjectRoot(real)) return real;
      const found = findProjectRoot(real);
      if (looksLikeProjectRoot(found)) return found;
    }
  }
  return null;
}

/** Explicit override → env → nearest project ancestor of the cwd. */
export function resolveProjectRoot(explicit?: string | null): string {
  if (explicit && explicit.trim()) return findProjectRoot(explicit.trim());
  const env = envValue('PROJECT_ROOT');
  if (env && env.trim()) return findProjectRoot(env.trim());
  return findProjectRoot(process.cwd());
}

// ---------------------------------------------------------------------------
// Injection
// ---------------------------------------------------------------------------

/** The exact block the proxy injects: sentinel line, then the map. */
export function projectMapPrompt(map: ProjectMap): string {
  return `${PROJECT_MAP_MARKER} v${map.level}\n${map.text}`;
}

export function hasProjectMap(body: RequestBody | null | undefined): boolean {
  if (!body) return false;
  try {
    return system_strings(body as RequestBody).some((t) => t.includes(PROJECT_MAP_MARKER));
  } catch {
    return false;
  }
}

/**
 * Inject the map as a system block, at most once.
 *
 * Idempotency is the whole point: clients resend the entire conversation on
 * every request, so a system block added on the first request is still in the
 * body on the next one. Detecting the marker means the map is paid for once per
 * session instead of once per request, and — because the text is byte-identical
 * across requests for an unchanged project — it stays inside the provider's
 * prompt cache.
 */
export function applyProjectMap(body: RequestBody, map: ProjectMap | null | undefined): boolean {
  if (!body || !map || !map.text) return false;
  if (hasProjectMap(body)) return false;
  inject_system_prompt(body, projectMapPrompt(map));
  return hasProjectMap(body);
}

export interface MapStatus {
  level: MapLevel;
  root: string;
  built: boolean;
  files: number;
  loc: number;
  bytes: number;
  tokens: number;
  fingerprint: string;
  buildMs: number;
  builtAtMs: number;
  cached: boolean;
  truncated: boolean;
  file: string;
  levels: MapLevel[];
}

/** Everything the CLI needs to report, without rebuilding anything. */
export function mapStatus(opts: { root?: string; level?: MapLevel } = {}): MapStatus {
  const level = opts.level && opts.level !== 'off' ? opts.level : DEFAULT_MAP_LEVEL;
  const root = resolveProjectRoot(opts.root);
  const map = cachedProjectMap(root, level);
  return {
    level,
    root,
    built: !!map,
    files: map?.files ?? 0,
    loc: map?.loc ?? 0,
    bytes: map?.bytes ?? 0,
    tokens: map?.tokens ?? 0,
    fingerprint: map?.fingerprint ?? '',
    buildMs: map?.buildMs ?? 0,
    builtAtMs: map?.builtAtMs ?? 0,
    cached: map?.cached ?? false,
    truncated: map?.truncated ?? false,
    file: map?.file ?? path.join(MAP_DIR, `${cacheKey(root, level)}.md`),
    levels: mapLevelCycle(),
  };
}
