import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface MeterProps {
  /** Current value (0-max) */
  value: number;
  /** Maximum value */
  max: number;
  /** Optional label above the meter */
  label?: string;
  /** Thresholds for color changes (as percentages 0-100) */
  thresholds?: { warn: number; error: number };
  /** Show percentage text inside the bar */
  showPercent?: boolean;
  /** Show value/max text */
  showValue?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Meter — Progress bar with threshold-based colors
 * Used for quota usage, budget consumption, compression ratios
 *
 * @example
 * <Meter value={750} max={1000} label="Daily Budget" thresholds={{ warn: 80, error: 95 }} />
 * <Meter value={45} max={100} showPercent />
 */
export function Meter({
  value,
  max,
  label,
  thresholds = { warn: 80, error: 95 },
  showPercent = false,
  showValue = false,
  className,
}: MeterProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  // Determine color based on thresholds
  let variant: 'default' | 'warning' | 'error' = 'default';
  if (percentage >= thresholds.error) {
    variant = 'error';
  } else if (percentage >= thresholds.warn) {
    variant = 'warning';
  }

  const colors: Record<string, string> = {
    default: 'bg-accent',
    warning: 'bg-section',
    error: 'bg-err',
  };

  return (
    <Box flexDirection="column" gap="xs" className={cn('meter', className)}>
      {label && (
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Text fontSize="sm" fg="fgMuted">{label}</Text>
          {showValue && (
            <Text fontSize="sm" fg="fg" mono>
              {value} / {max}
            </Text>
          )}
        </Box>
      )}

      {/* Track */}
      <Box
        bg="bg"
        border="rounded"
        borderColor="border"
        className="meter-track"
        style={{
          height: '12px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Fill */}
        <Box
          className={cn('meter-fill', colors[variant])}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${percentage}%`,
            transition: 'width 0.3s ease',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {showPercent && (
            <Box
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                fontSize="xs"
                fontWeight="bold"
                block
                className="meter-percent-text"
                style={{
                  color: percentage > 50 ? 'var(--color-fg)' : 'var(--color-bg)',
                  textShadow: percentage > 50 ? 'none' : '0 0 2px var(--color-fg)',
                }}
              >
                {Math.round(percentage)}%
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {!label && showValue && (
        <Text fontSize="xs" fg="fgMuted" mono block>
          {value} / {max}
        </Text>
      )}
    </Box>
  );
}