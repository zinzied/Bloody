#!/usr/bin/env node
/**
 * Fail on the two ways a source file picks up damage that no test notices: a
 * byte-order mark in front of the first import, and text that was decoded as
 * latin-1 and written back as utf-8 (an em dash becomes three characters).
 *
 * Both compile, both run, and both leave a diff that reads like the author
 * chose those characters — so nothing else in the toolchain complains.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'tests', 'scripts', 'apps'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.jsonc', '.md']);
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage']);
const EXTRA_FILES = ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'README.md'];

/**
 * What mojibake of a given character looks like on disk: the character's utf-8
 * bytes decoded as latin-1, then encoded as utf-8 again. Derived rather than
 * pasted, so this file does not contain the damage it is looking for.
 */
function mojibakeOf(char) {
  return Buffer.from(Buffer.from(char, 'utf-8').toString('latin1'), 'utf-8');
}

const SUSPECT = [
  ['—', 'em dash'],
  ['–', 'en dash'],
  ['‘', 'left single quote'],
  ['’', 'right single quote'],
  ['“', 'left double quote'],
  ['”', 'right double quote'],
  ['→', 'rightwards arrow'],
  ['·', 'middle dot'],
  ['é', 'e-acute'],
].map(([char, name]) => ({ name, bytes: mojibakeOf(char) }));

const problems = [];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTS.has(path.extname(entry.name))) continue;
    check(full);
  }
}

function check(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.push(`${file}:1  byte-order mark before the first character`);
  }
  for (const { name, bytes: pattern } of SUSPECT) {
    const at = bytes.indexOf(pattern);
    if (at < 0) continue;
    const line = bytes.subarray(0, at).toString('utf-8').split('\n').length;
    problems.push(`${file}:${line}  mojibake ${name} (decoded as latin-1 at some point)`);
    break;
  }
}

for (const root of ROOTS) walk(root);
for (const file of EXTRA_FILES) {
  if (fs.existsSync(file)) check(file);
}

if (problems.length) {
  console.error('encoding check failed:');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nfix: strip the BOM, and re-type the characters as real utf-8');
  process.exit(1);
}
console.log('encoding check passed: no BOM, no mojibake');
