// Design System — Barrel Export
// Import tokens, theme CSS, and utilities from a single entry point

export { tokens } from './tokens';
export type {
  ColorToken,
  SpaceToken,
  FontSizeToken,
  RadiusToken,
  ShadowToken,
  TransitionToken,
  ZIndexToken,
} from './tokens';

export { cn, cssVar, getSpace, getFontSize, getRadius, getZIndex, tokenStyle } from './utils';

// Re-export CSS by convention — import this file in main.tsx or global.css
// import './theme.css' is handled in the app entry point