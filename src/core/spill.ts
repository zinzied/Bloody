import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { COMPRESS_DIR } from './config.js';

export interface SpillConfig {
  thresholdChars: number;
  previewHeadChars: number;
  previewTailChars: number;
  spillDir: string;
}

export const DEFAULT_SPILL_CONFIG: SpillConfig = {
  thresholdChars: 16384,
  previewHeadChars: 2048,
  previewTailChars: 512,
  spillDir: path.join(COMPRESS_DIR, '..', 'spill'),
};

const SPILL_MARKER = '\n\n[... full output spilled to disk ...]\n\n';

export interface SpillResult {
  spilled: boolean;
  content: string;
  spillPath?: string;
  originalSize: number;
  previewSize: number;
}

export function initSpillDir(config: SpillConfig = DEFAULT_SPILL_CONFIG): void {
  if (!fs.existsSync(config.spillDir)) {
    fs.mkdirSync(config.spillDir, { recursive: true });
  }
}

export function spillIfNeeded(
  text: string,
  config: SpillConfig = DEFAULT_SPILL_CONFIG,
): SpillResult {
  const originalSize = text.length;
  if (originalSize <= config.thresholdChars) {
    return { spilled: false, content: text, originalSize, previewSize: originalSize };
  }

  initSpillDir(config);

  const id = crypto.randomBytes(8).toString('hex');
  const filename = `spill-${id}.txt`;
  const spillPath = path.join(config.spillDir, filename);

  fs.writeFileSync(spillPath, text, 'utf8');

  const head = text.slice(0, config.previewHeadChars);
  const tail = text.slice(-config.previewTailChars);
  const preview = head + SPILL_MARKER + tail;

  return {
    spilled: true,
    content: preview,
    spillPath,
    originalSize,
    previewSize: preview.length,
  };
}

export function spillIdToPath(id: string): string {
  const clean = id.replace(/^spill-/, '').replace(/\.txt$/, '');
  return path.join(DEFAULT_SPILL_CONFIG.spillDir, `spill-${clean}.txt`);
}

export function resolveSpillFile(target: string): string | null {
  const candidates: string[] = [target, spillIdToPath(target)];
  if (!path.isAbsolute(target)) {
    candidates.push(path.join(DEFAULT_SPILL_CONFIG.spillDir, target));
  }
  for (const c of candidates) {
    const abs = path.isAbsolute(c) ? c : path.resolve(c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

export function readSpill(spillPath: string): string | null {
  try {
    return fs.readFileSync(spillPath, 'utf8');
  } catch {
    return null;
  }
}

export function cleanSpills(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const config = DEFAULT_SPILL_CONFIG;
  if (!fs.existsSync(config.spillDir)) return 0;
  const now = Date.now();
  let cleaned = 0;
  for (const file of fs.readdirSync(config.spillDir)) {
    if (!file.startsWith('spill-') || !file.endsWith('.txt')) continue;
    const fp = path.join(config.spillDir, file);
    try {
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(fp);
        cleaned++;
      }
    } catch { /* ignore */ }
  }
  return cleaned;
}
