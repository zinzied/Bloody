// Design System Utilities — clsx/tw-merge style helpers for composing class names
// Pure function utilities with no React dependencies

/**
 * Simple className combiner — filters out falsy values and joins with spaces
 * Usage: cn('btn', large && 'btn-lg', disabled ? 'btn-disabled' : null)
 */
export function cn(...classes: Array<string | boolean | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Token accessor with type safety
 * Returns CSS variable reference for use in style prop
 *
 * @example
 * style={{ color: cssVar('color', 'fg') }}
 * style={{ '--bg-custom': cssVar('color', 'bgElevated') } as React.CSSProperties}
 */
export function cssVar(category: string, token: string): string {
  return `var(--${category}-${token})`;
}

/**
 * Get spacing value in pixels from space token
 * @example getSpace('sm') => 8
 */
export function getSpace(token: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'): number {
  const map: Record<string, number> = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
  return map[token];
}

/**
 * Get font size in pixels from typography token
 * @example getFontSize('base') => 14
 */
export function getFontSize(token: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl'): number {
  const map: Record<string, number> = { xs: 11, sm: 12, base: 14, lg: 16, xl: 18, '2xl': 24 };
  return map[token];
}

/**
 * Get border radius in pixels from radius token
 */
export function getRadius(token: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'): number {
  const map: Record<string, number> = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };
  return map[token];
}

/**
 * Get z-index value from layer token
 */
export function getZIndex(layer: 'base' | 'dropdown' | 'modal' | 'toast' | 'tooltip'): number {
  const map: Record<string, number> = { base: 0, dropdown: 100, modal: 200, toast: 300, tooltip: 400 };
  return map[layer];
}

/**
 * Generate inline style from token category and name
 * @example tokenStyle('color', 'fg') => { color: 'var(--color-fg)' }
 */
export function tokenStyle(category: string, token: string): React.CSSProperties {
  return { [category]: cssVar(category, token) } as React.CSSProperties;
}