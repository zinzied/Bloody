// Design System Tokens - Semantic design tokens for the Bloody desktop app
// Extends the TUI theme (src/tui/theme.ts) with full desktop token set
// All values are immutable constants for build-time CSS variable generation

export const tokens = {
  // Color system - maps to CSS custom properties in theme.css
  color: {
    // Brand & accent (from TUI theme)
    brand: 'var(--color-brand)',           // Magenta - app identity
    accent: 'var(--color-accent)',         // Cyan - primary actions, focus
    section: 'var(--color-section)',       // Yellow - section headers
    ok: 'var(--color-ok)',                 // Green - success, positive
    err: 'var(--color-err)',               // Red - errors, destructive
    dim: 'var(--color-dim)',               // Gray - muted text, inactive
    fg: 'var(--color-fg)',                 // White - primary text
    bg: 'var(--color-bg)',                 // Dark - main background
    bgElevated: 'var(--color-bg-elevated)', // Elevated surfaces (cards, modals)
    border: 'var(--color-border)',         // Borders, dividers

    // Extended semantic colors
    fgMuted: 'var(--color-fg-muted)',      // Secondary text
    fgSubtle: 'var(--color-fg-subtle)',    // Tertiary/placeholder text
    overlay: 'var(--color-overlay)',       // Modal/backdrop overlay
    focusRing: 'var(--color-focus-ring)',  // Focus indicator

    // State colors
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    info: 'var(--color-info)',

    // Chart/visualization palette (categorical)
    chart: [
      'var(--color-chart-0)',  // Cyan
      'var(--color-chart-1)',  // Magenta
      'var(--color-chart-2)',  // Yellow
      'var(--color-chart-3)',  // Green
      'var(--color-chart-4)',  // Red
      'var(--color-chart-5)',  // Orange
      'var(--color-chart-6)',  // Purple
    ],

    // Badge variants
    badge: {
      ok: { bg: 'var(--color-badge-ok-bg)', fg: 'var(--color-badge-ok-fg)' },
      warn: { bg: 'var(--color-badge-warn-bg'), fg: 'var(--color-badge-warn-fg)' },
      err: { bg: 'var(--color-badge-err-bg'), fg: 'var(--color-badge-err-fg)' },
      neutral: { bg: 'var(--color-badge-neutral-bg'), fg: 'var(--color-badge-neutral-fg)' },
    },

    // Progress/meter
    progress: {
      bg: 'var(--color-progress-bg)',
      fill: 'var(--color-progress-fill)',
      fillWarn: 'var(--color-progress-fill-warn)',
      fillErr: 'var(--color-progress-fill-err)',
    },
  },

  // Spacing scale (base 4px)
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
    6: 32,
    7: 48,
    8: 64,
    9: 96,
  } as const,

  // Typography
  font: {
    mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    sizes: {
      xs: 11,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      '2xl': 20,
      '3xl': 24,
      '4xl': 30,
    } as const,
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    } as const,
    lineHeights: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    } as const,
  },

  // Border radius
  radius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 20,
    full: 9999,
  } as const,

  // Shadows
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.6)',
    focus: '0 0 0 3px var(--color-focus-ring)',
  },

  // Transitions
  transition: {
    fast: '120ms ease',
    normal: '200ms ease',
    slow: '300ms ease',
  },

  // Z-index layers
  zIndex: {
    base: 0,
    dropdown: 100,
    sticky: 200,
    modal: 200,
    toast: 300,
    tooltip: 400,
    popover: 500,
  },

  // Breakpoints (for responsive Grid)
  breakpoint: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  } as const,
} as const;

// Type helpers
export type ColorToken = keyof typeof tokens.color;
export type SpaceToken = keyof typeof tokens.space;
export type FontSizeToken = keyof typeof tokens.font.sizes;
export type FontWeightToken = keyof typeof tokens.font.weights;
export type RadiusToken = keyof typeof tokens.radius;
export type ShadowToken = keyof typeof tokens.shadow;
export type TransitionToken = keyof typeof tokens.transition;
export type ZIndexToken = keyof typeof tokens.zIndex;
export type BreakpointToken = keyof typeof tokens.breakpoint;

// Token accessor helpers (for use in style objects)
export const getColor = (token: ColorToken): string => tokens.color[token];
export const getSpace = (token: SpaceToken): number => tokens.space[token];
export const getFontSize = (token: FontSizeToken): number => tokens.font.sizes[token];
export const getRadius = (token: RadiusToken): number => tokens.radius[token];
export const getShadow = (token: ShadowToken): string => tokens.shadow[token];
export const getTransition = (token: TransitionToken): string => tokens.transition[token];
export const getZIndex = (token: ZIndexToken): number => tokens.zIndex[token];