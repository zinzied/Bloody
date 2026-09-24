import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface StatCardProps {
  /** The metric label (e.g., "Tokens Saved", "Requests") */
  label: string;
  /** The metric value — can be a number, formatted string, or React node */
  value: React.ReactNode;
  /** Optional subtext (e.g., percentage change, secondary info) */
  sub?: string;
  /** Color variant for the value */
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error';
  /** Fixed width in pixels (for grid layouts) */
  width?: number;
  /** Additional className */
  className?: string;
}

/**
 * StatCard — KPI metric tile
 * Mirrors the TUI's Stat component from src/tui/components.tsx
 * Used for dashboard metrics like tokens saved, requests, quota usage
 *
 * @example
 * <StatCard label="Tokens Saved" value="1.2M" sub="+15% vs last week" variant="success" />
 * <StatCard label="Avg Latency" value="245ms" variant="accent" />
 */
export function StatCard({
  label,
  value,
  sub,
  variant = 'default',
  width,
  className,
}: StatCardProps) {
  const valueColor: Record<string, string> = {
    default: 'fg',
    accent: 'accent',
    success: 'ok',
    warning: 'section',
    error: 'err',
  };

  return (
    <Box
      bg="bgElevated"
      border="rounded"
      borderColor="border"
      padding="md"
      className={cn('stat-card', className)}
      style={{ width: width ? `${width}px` : undefined, minWidth: '200px' }}
    >
      <Box flexDirection="column" gap="xs">
        <Text fontSize="sm" fg="fgMuted" block>
          {label}
        </Text>
        <Text fontSize="xl" fontWeight="bold" fg={valueColor[variant]} block>
          {value}
        </Text>
        {sub && (
          <Text fontSize="sm" fg="fgMuted" block>
            {sub}
          </Text>
        )}
      </Box>
    </Box>
  );
}