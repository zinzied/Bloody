import { test } from 'node:test';
import assert from 'node:assert';

// The TUI renders to a terminal and has no render harness, so this covers only
// the pure helpers reachable without one. `fmt` decides what every stat on every
// page reads as, so its missing-value case is worth pinning down.
const { fmt } = await import('../src/tui/components.js');

test('fmt renders a missing value as a dash, not as zero', () => {
  // The regression: `Number(null)` and `Number('')` are both 0 and finite, so the
  // `—` branch was unreachable and absent quota fields displayed as a real
  // measurement of zero.
  assert.strictEqual(fmt(null), '—');
  assert.strictEqual(fmt(undefined), '—');
  assert.strictEqual(fmt(''), '—');
});

test('fmt still formats real numbers and passes odd values through', () => {
  // Grouping is locale-dependent by design (`toLocaleString()` with no locale
  // follows the machine), so the expectation is built the same way rather than
  // hard-coding '1,500'.
  const loc = (n: number) => n.toLocaleString();
  assert.strictEqual(fmt(0), loc(0));
  assert.strictEqual(fmt(1500), loc(1500));
  assert.strictEqual(fmt(-3), loc(-3));
  assert.strictEqual(fmt(12.5), loc(12.5));
  assert.strictEqual(fmt('4096'), loc(4096));
  assert.strictEqual(fmt('n/a'), 'n/a');
  assert.strictEqual(fmt(NaN), 'NaN');
  assert.strictEqual(fmt(Infinity), 'Infinity');
});
