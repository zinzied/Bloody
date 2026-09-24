import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface BadgeProps {
  /** The badge content (text or icon) */
  children: React.ReactNode;
  /** Status variant — maps to TUI's ok/fail badges */
  variant?: 'ok' | 'warning' | 'error' | 'neutral' | 'info';
  /** Additional className */
  className?: string;
  /** Click handler for interactive badges */
  onClick?: () => void;
}

/**
 * Badge — Status pill component
 * Mirrors the TUI's Badge from src/tui/components.tsx
 * Used for pass/fail states, budget status, quota warnings
 *
 * @example
 * <Badge variant="ok">Budget OK</Badge>
 * <Badge variant="error">Rate Limited</Badge>
 * <Badge variant="warning">85% Used</Badge>
 */
export function Badge({ children, variant = 'neutral', className, onClick }: BadgeProps) {
  const colors: Record<string, { bg: string; fg: string }> = {
    ok: { bg: 'bg-ok', fg: 'fg-fg' },
    warning: { bg: 'bg-section', fg: 'fg-fg' },
    error: { bg: 'bg-err', fg: 'fg-fg' },
    neutral: { bg: 'bg-dim', fg: 'fg-fgMuted' },
    info: { bg: 'bg-accent', fg: 'fg-fg' },
  };

  return (
    <Box
      display="flex"
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      padding="xs"
      className={cn(
        'badge',
        `badge-${variant}`,
        colors[variant].bg,
        colors[variant].fg,
        onClick && 'badge-interactive',
        className
      )}
      style={{
        borderRadius: 'var(--radius-full)',
        fontWeight: 'var(--font-weight-medium)',
        fontSize: 'var(--font-size-sm)',
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : undefined,
      }}
      onClick={onClick}
    >
      <Text fontSize="sm" fontWeight="medium" block>
        {children}
      </Text>
    </Box>
  );
}