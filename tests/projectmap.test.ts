import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-projectmap-'));
process.env.NOBLEED_HOME = TMP;

const pm = await import('../src/core/projectmap.js');
const prompts = await import('../src/core/prompts.js');

function makeProject(root: string): void {
  fs.mkdirSync(path.join(root, 'src', 'core'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-app',
        version: '1.2.3',
        description: 'A fixture project for testing',
        main: 'dist/index.js',
        bin: { fixture: 'dist/cli.js' },
        scripts: { start: 'node dist/index.js', test: 'node --test', build: 'tsc' },
        dependencies: { express: '^4.19.2', react: '^19.0.0' },
        devDependencies: { typescript: '^5.9.0' },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(root, 'README.md'),
    '# Fixture App\n\n![badge](https://img.shields.io/badge/test-blue)\n\nA fixture project for testing the project map.\n\n## Usage\n\nRun it with node.\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'index.ts'),
    'export function main(): void {\n  console.log("hello");\n}\nexport const VERSION = "1.0";\n'
  );
  fs.writeFileSync(
    path.join(root, 'src', 'core', 'server.ts'),
    'import http from "node:http";\nexport function createServer() {\n  return http.createServer();\n}\n'
  );
  fs.writeFileSync(
    path.join(root, 'tests', 'index.test.ts'),
    'import { test } from "node:test";\ntest("works", () => {});\n'
  );
}

test('resolveMapLevel normalizes values', () => {
  assert.strictEqual(pm.resolveMapLevel('lite'), 'lite');
  assert.strictEqual(pm.resolveMapLevel('standard'), 'standard');
  assert.strictEqual(pm.resolveMapLevel('full'), 'full');
  assert.strictEqual(pm.resolveMapLevel('off'), 'off');
  assert.strictEqual(pm.resolveMapLevel('OFF'), 'off');
  assert.strictEqual(pm.resolveMapLevel(''), 'standard');
  assert.strictEqual(pm.resolveMapLevel(undefined), 'standard');
  assert.strictEqual(pm.resolveMapLevel('bogus'), 'standard');
  assert.strictEqual(pm.resolveMapLevel('on'), 'standard');
  assert.strictEqual(pm.resolveMapLevel('light'), 'lite');
  assert.strictEqual(pm.resolveMapLevel('max'), 'full');
});

test('readmeExcerpt strips markdown chrome and truncates', () => {
  const md = '# Title\n\n![badge](https://img.shields.io/badge/x-blue)\n\n<!-- comment -->\n\nReal content here that matters.\n\n```ts\ncode\n```\n\n> blockquote\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
  const out = pm.readmeExcerpt(md, 200);
  assert.ok(out.includes('Real content here that matters'));
  assert.ok(!out.includes('badge'));
  assert.ok(!out.includes('<!--'));
  assert.ok(!out.includes('```'));
  assert.ok(!out.includes('> blockquote'));
  assert.ok(!out.includes('| a |'));

  const long = 'A'.repeat(500);
  const truncated = pm.readmeExcerpt(long, 100);
  assert.ok(truncated.length <= 102);
  assert.ok(truncated.endsWith('…'));
});

test('mergeProse dedupes overlapping descriptions', () => {
  const a = 'NoBleed v10 — stop the token bleed: reduce token waste and spending when using AI coding models (TypeScript + Ink TUI)';
  const b = 'Stop the token bleed: reduce token waste and spending when using AI coding models. Compare pricing across all providers.';
  const merged = pm.mergeProse(a, b);
  assert.ok(merged);
  assert.ok(merged!.includes('NoBleed v10'));
  assert.ok(merged!.includes('Compare pricing'));
  // The shared span must appear exactly once, not twice
  const occurrences = merged!.split('reduce token waste and spending').length - 1;
  assert.strictEqual(occurrences, 1);

  const noOverlap = pm.mergeProse('Completely different topic', 'Another unrelated thing');
  assert.strictEqual(noOverlap, null);
});

test('extractSymbols finds exported names', () => {
  const dir = fs.mkdtempSync(path.join(TMP, 'symbols-'));
  const file = path.join(dir, 'mod.ts');
  fs.writeFileSync(file, 'export function foo() {}\nexport class Bar {}\nexport const baz = 1;\nfunction hidden() {}\n');
  const syms = pm.extractSymbols(file, 10);
  assert.ok(syms.includes('foo'));
  assert.ok(syms.includes('Bar'));
  assert.ok(syms.includes('baz'));
  assert.ok(!syms.includes('hidden'));
});

test('scanProject builds a complete picture', () => {
  const root = path.join(TMP, 'scan-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  makeProject(root);

  const scan = pm.scanProject(root);
  assert.ok(scan);
  assert.strictEqual(scan!.root, fs.realpathSync(root));
  assert.ok(scan!.files >= 5);
  assert.ok(scan!.loc > 0);
  assert.ok(scan!.languages.some((l) => l.lang === 'TypeScript'));
  assert.strictEqual(scan!.manifest?.name, 'fixture-app');
  assert.strictEqual(scan!.manifest?.version, '1.2.3');
  assert.ok(scan!.readme);
  assert.ok(scan!.testFiles.some((f) => f.includes('index.test.ts')));
  assert.ok(scan!.testRunner === 'node:test');
  assert.ok(scan!.branch === null || typeof scan!.branch === 'string');
});

test('buildProjectMap renders within budget and caches', () => {
  const root = path.join(TMP, 'build-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  makeProject(root);

  for (const level of ['lite', 'standard', 'full'] as const) {
    const m = pm.buildProjectMap({ root, level, force: true });
    assert.ok(m, `no map for ${level}`);
    const budget = pm.MAP_BUDGETS[level].maxBytes;
    assert.ok(m!.bytes <= budget, `${level}: ${m!.bytes} > ${budget}`);
    assert.ok(m!.tokens > 0);
    assert.ok(m!.text.includes('fixture-app'));
    assert.ok(m!.text.includes('## Layout'));
    assert.ok(m!.text.includes('## Stack'));
    assert.ok(m!.text.toLowerCase().includes('express'));
    assert.ok(m!.text.includes('node --test'));
    if (level !== 'lite') {
      assert.ok(m!.text.includes('createServer'), `${level} should list key modules`);
    }
  }

  // Second call hits the cache
  const m2 = pm.buildProjectMap({ root: root, level: 'standard' });
  assert.ok(m2);
  assert.strictEqual(m2!.cached, true);
});

test('buildProjectMap skips nested git repos', () => {
  const root = path.join(TMP, 'nested-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  makeProject(root);
  // A nested clone with its own .git must not be walked
  const nested = path.join(root, 'vendor', 'clone');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, '.git'), 'gitdir: /elsewhere\n');
  for (let i = 0; i < 50; i++) {
    fs.writeFileSync(path.join(nested, `dup${i}.ts`), 'export const x = 1;\n');
  }

  const scan = pm.scanProject(root);
  assert.ok(scan);
  assert.ok(!scan!.fileStats.has('vendor/clone/dup0.ts'));
  assert.ok(scan!.files < 60);
});

test('applyProjectMap injects once and is idempotent', () => {
  const root = path.join(TMP, 'inject-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  makeProject(root);
  const m = pm.buildProjectMap({ root, level: 'lite', force: true });
  assert.ok(m);

  // OpenAI format
  const body1: any = { messages: [{ role: 'user', content: 'hi' }] };
  assert.strictEqual(pm.applyProjectMap(body1, m), true);
  assert.ok(pm.hasProjectMap(body1));
  assert.strictEqual(body1.messages[0].role, 'system');
  assert.ok(body1.messages[0].content.includes(pm.PROJECT_MAP_MARKER));
  assert.ok(body1.messages[0].content.includes('fixture-app'));
  // Second call is a no-op
  assert.strictEqual(pm.applyProjectMap(body1, m), false);
  assert.strictEqual(body1.messages.filter((x: any) => x.role === 'system').length, 1);

  // Claude format (system string)
  const body2: any = { system: 'be concise', messages: [{ role: 'user', content: 'hi' }] };
  assert.strictEqual(pm.applyProjectMap(body2, m), true);
  assert.ok(body2.system.includes('be concise'));
  assert.ok(body2.system.includes(pm.PROJECT_MAP_MARKER));

  // Gemini format
  const body3: any = {
    request: {
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      system_instruction: { parts: [{ text: 'be concise' }] },
    },
  };
  assert.strictEqual(pm.applyProjectMap(body3, m), true);
  const parts = body3.request.system_instruction.parts;
  assert.ok(parts.some((p: any) => p.text.includes(pm.PROJECT_MAP_MARKER)));

  // Responses API format
  const body4: any = { instructions: 'be concise', input: [{ role: 'user', content: 'hi' }] };
  assert.strictEqual(pm.applyProjectMap(body4, m), true);
  assert.ok(body4.instructions.includes(pm.PROJECT_MAP_MARKER));
});

test('rootFromPrompt recovers the project root', () => {
  const root = path.join(TMP, 'prompt-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  makeProject(root);

  const body: any = {
    system: `You are an agent.\nWorking directory: ${root}\nDo the thing.`,
    messages: [{ role: 'user', content: 'hi' }],
  };
  const found = pm.rootFromPrompt(body);
  assert.strictEqual(found, fs.realpathSync(root));

  // A path that does not exist must not be accepted
  const bad: any = { system: 'Working directory: /nonexistent/path/xyz', messages: [] };
  assert.strictEqual(pm.rootFromPrompt(bad), null);
});

test('findProjectRoot walks up to the nearest marker', () => {
  const root = path.join(TMP, 'walk-fixture');
  const deep = path.join(root, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  assert.strictEqual(pm.findProjectRoot(deep), fs.realpathSync(root));
  assert.strictEqual(pm.findProjectRoot(root), fs.realpathSync(root));
});

test('mapStatus reports without building', () => {
  const st = pm.mapStatus({ level: 'lite' });
  assert.strictEqual(st.level, 'lite');
  assert.ok(st.root.length > 0);
  assert.ok(Array.isArray(st.levels));
  assert.ok(st.levels.includes('off'));
});

test('clearMapFiles removes cached files', () => {
  const root = path.join(TMP, 'clear-fixture');
  fs.rmSync(root, { recursive: true, force: true });
  makeProject(root);
  pm.buildProjectMap({ root, level: 'lite', force: true });
  const removed = pm.clearMapFiles();
  assert.ok(removed > 0);
  assert.strictEqual(pm.cachedProjectMap(root, 'lite'), null);
});
