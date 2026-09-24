// Desktop app theme tokens — mirrors the TUI theme in src/tui/theme.ts
// Semantic roles mapped to CSS custom properties for consistent visual language.
export const theme = {
  // Semantic roles
  brand: 'var(--color-brand)',      // app name, accent headers
  accent: 'var(--color-accent)',    // active nav, links, focus rings
  section: 'var(--color-section)',  // section headings
  ok: 'var(--color-ok)',            // success, positive metrics
  err: 'var(--color-err)',          // errors, negative states
  dim: 'var(--color-dim)',          // secondary text, hints
  fg: 'var(--color-fg)',            // default foreground
  bg: 'var(--color-bg)',            // default background
  bgElevated: 'var(--color-bg-elevated)', // cards, panels
  border: 'var(--color-border)',    // borders, dividers
} as const;

export type ThemeRole = keyof typeof theme;

// CSS custom properties (injected at :root via main.css)
export const cssVariables = {
  '--color-brand': '#c084fc',       // magenta-400
  '--color-accent': '#22d3ee',      // cyan-400
  '--color-section': '#fde047',     // yellow-300
  '--color-ok': '#4ade80',          // green-400
  '--color-err': '#f87171',         // red-400
  '--color-dim': '#9ca3af',         // gray-400
  '--color-fg': '#f3f4f6',          // gray-100
  '--color-bg': '#111827',          // gray-900
  '--color-bg-elevated': '#1f2937', // gray-800
  '--color-border': '#374151',      // gray-700
} as const;