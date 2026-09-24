import React, { useEffect, useState, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { useScreenInput, type KeyEvent } from './input.js';
import { theme } from './theme.js';

export const fmt = (n: unknown): string => {
  const num = Number(n);
  if (Number.isFinite(num)) return num.toLocaleString();
  return n === null || n === undefined || n === '' ? '—' : String(n);
};

export const price = (m: { is_free?: boolean; input_price?: number; output_price?: number } | null | undefined): string => {
  if (!m) return '';
  if (m.is_free) return 'FREE';
  return `$${m.input_price}/${m.output_price} per M`;
};

export const countdown = (iso?: string | null): string => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const secs = Math.floor((ms - Date.now()) / 1000);
  if (secs <= 0) return 'resetting now';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `reset in ${h ? `${h}h ` : ''}${m ? `${m}m ` : ''}${s}s`;
};

export const uptime = (startedAt?: string | null): string => {
  if (!startedAt) return '—';
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return `up ${h}h ${m % 60}m`;
  if (m) return `up ${m}m ${s % 60}s`;
  return `up ${s}s`;
};

export function Page({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Text bold color={theme.accent}>
        {title}
      </Text>
      {sub ? <Text color={theme.dim}>{sub}</Text> : null}
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}

export function Section({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={theme.section}>
        {title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  );
}

export function Row({ children }: { children?: ReactNode }) {
  return (
    <Box flexDirection="row" flexWrap="wrap">
      {children}
    </Box>
  );
}

export function Stat({ label, value, sub, width = 26, color }: { label: string; value?: ReactNode; sub?: string; width?: number; color?: string }) {
  return (
    <Box flexDirection="column" width={width} marginRight={2} marginBottom={1}>
      <Text color={theme.dim}>{label}</Text>
      <Text bold color={color}>{value === undefined || value === null ? '—' : value}</Text>
      {sub ? <Text color={theme.dim}>{sub}</Text> : null}
    </Box>
  );
}

export function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <Text backgroundColor={ok ? theme.ok : theme.err} color={theme.inverse}>
      {' '}
      {children}{' '}
    </Text>
  );
}

export function Hint({ children }: { children?: ReactNode }) {
  return <Text color={theme.dim}>{children}</Text>;
}

export function ErrorLine({ children }: { children?: ReactNode }) {
  return <Text color={theme.err}>{children}</Text>;
}

export function SuccessLine({ children }: { children?: ReactNode }) {
  return <Text color={theme.ok}>{children}</Text>;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Animated braille spinner. Keep it in a leaf so its tick doesn't re-render whole pages. */
export function Spinner({ label = 'Loading…', intervalMs = 90 }: { label?: string; intervalMs?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return (
    <Text color={theme.accent}>
      {SPINNER_FRAMES[frame]} <Text color={theme.dim}>{label}</Text>
    </Text>
  );
}

const METER_BLOCKS = ['█', '▓', '▒', '░'];

function meterColor(ratio: number): string {
  if (ratio >= 0.85) return theme.err;
  if (ratio >= 0.6) return theme.section;
  return theme.ok;
}

/** Graphical utilization bar: filled block chars scaled to `cols`, colored by threshold. */
export function Meter({ value, max, label, cols = 20, suffix }: { value: number; max: number; label?: string; cols?: number; suffix?: string }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(ratio * cols);
  const partialIdx = filled >= cols ? 0 : Math.min(METER_BLOCKS.length - 1, Math.floor((ratio * cols - filled) * METER_BLOCKS.length));
  const bar = '█'.repeat(filled) + (filled < cols && ratio > 0 ? METER_BLOCKS[partialIdx] : '') + '░'.repeat(Math.max(0, cols - filled - (ratio > 0 && filled < cols ? 1 : 0)));
  const pct = `${Math.round(ratio * 100)}%`;
  return (
    <Box>
      {label ? <Text color={theme.dim}>{`${label} `}</Text> : null}
      <Text color={meterColor(ratio)}>{bar}</Text>
      <Text color={theme.dim}>{suffix ? ` ${pct} ${suffix}` : ` ${pct}`}</Text>
    </Box>
  );
}

export interface Cell {
  text: string;
  color?: string;
  bold?: boolean;
}

export const T = (text: unknown, color?: string, bold?: boolean): Cell => ({
  text: text === null || text === undefined ? '—' : String(text),
  color,
  bold,
});

function visibleWidth(text: string): number {
  return stringWidth(text);
}

function padVisible(text: string, width: number): string {
  const vw = visibleWidth(text);
  return text + ' '.repeat(Math.max(0, width - vw));
}

function renderCell(cellValue: Cell, width: number, isHead: boolean): ReactNode {
  const text = isHead ? cellValue.text.toUpperCase() : cellValue.text;
  const padded = padVisible(text, width + 2);
  if (isHead) {
    return (
      <Text key={`${cellValue.text}-${width}`} bold color={theme.accent}>
        {padded}
      </Text>
    );
  }
  return (
    <Text key={`${cellValue.text}-${width}`} color={cellValue.color || undefined} bold={cellValue.bold}>
      {padded}
    </Text>
  );
}

export function Table({ head, rows }: { head: string[]; rows: Cell[][] }) {
  if (!rows.length) return <Hint>No data yet.</Hint>;
  const widths = head.map((h, i) =>
    Math.max(visibleWidth(h), ...rows.map((r) => (r[i] ? visibleWidth(r[i].text) : 0)))
  );
  const heads = head.map((h) => ({ text: h })) as Cell[];
  return (
    <Box flexDirection="column">
      <Box flexDirection="row">{heads.map((c, i) => renderCell(c, widths[i], true))}</Box>
      {rows.map((r, i) => (
        <Box key={i} flexDirection="row">
          {r.map((c, j) => renderCell(c, widths[j], false))}
        </Box>
      ))}
    </Box>
  );
}

export function TextField({
  label,
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  mask,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit?: (v: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  mask?: string;
}) {
  useScreenInput((k: KeyEvent) => {
    if (k.enter) {
      if (onSubmit) onSubmit(value);
      return true;
    }
    if (k.esc) {
      if (onCancel) onCancel();
      return true;
    }
    if (k.backspace) {
      onChange(value.slice(0, -1));
      return true;
    }
    if (k.left || k.right || k.up || k.down || k.tab || k.shiftTab) return false;
    if (k.ctrl) return true;
    if (k.input) {
      onChange(value + k.input);
      return true;
    }
    return true;
  });

  const shown = mask ? mask.repeat(value.length) : value;
  const display = shown || (placeholder ? placeholder : ' ');
  return (
    <Box>
      <Text color={theme.accent}>{label}: </Text>
      <Text backgroundColor="black">{display}</Text>
      <Text> </Text>
    </Box>
  );
}

export function Form({
  title,
  fields,
  onDone,
  onCancel,
}: {
  title: string;
  fields: { label: string; get: () => string; set: (v: string) => void }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = React.useState(0);
  const [values, setValues] = React.useState<string[]>(fields.map(() => ''));
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color="yellow">
        {title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <TextField
          label={fields[step].label}
          value={values[step]}
          onChange={(v) => {
            const next = [...values];
            next[step] = v;
            setValues(next);
            fields[step].set(v);
          }}
          onSubmit={() => {
            if (step < fields.length - 1) setStep(step + 1);
            else {
              fields.forEach((f, i) => f.set(values[i]));
              onDone();
            }
          }}
          onCancel={onCancel}
        />
      </Box>
      <Hint>Enter: next field / submit · Esc: cancel</Hint>
    </Box>
  );
}
