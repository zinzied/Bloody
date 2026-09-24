// Shared formatting utilities — mirrors src/tui/components.tsx fmt/price/countdown/uptime

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