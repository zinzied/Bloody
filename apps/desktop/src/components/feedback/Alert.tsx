import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface AlertProps {
  /** Alert variant */
  variant?: 'info' | 'success' | 'warning' | 'error';
  /** Alert title */
  title?: string;
  /** Alert message */
  children: React.ReactNode;
  /** Show dismiss button */
  dismissible?: boolean;
  /** Dismiss handler */
  onDismiss?: () => void;
  /** Additional className */
  className?: string;
}

const variantStyles: Record<string, { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'rgba(34, 211, 238, 0.1)',
    border: 'var(--color-info)',
    icon: 'ℹ️',
  },
  success: {
    bg: 'rgba(63, 185, 80, 0.1)',
    border: 'var(--color-success)',
    icon: '✅',
  },
  warning: {
    bg: 'rgba(210, 153, 34, 0.1)',
    border: 'var(--color-warning)',
    icon: '⚠️',
  },
  error: {
    bg: 'rgba(248, 81, 73, 0.1)',
    border: 'var(--color-error)',
    icon: '❌',
  },
};

/**
 * Alert — Inline alert message
 *
 * @example
 * <Alert variant="error" title="Error" onDismiss={() => setShow(false)}>
 *   Something went wrong
 * </Alert>
 */
export function Alert({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  className,
}: AlertProps) {
  const style = variantStyles[variant];

  return (
    <Box
      flexDirection="row"
      gap="sm"
      padding="md"
      border="solid"
      borderColor={style.border}
      className={cn('alert', `alert-${variant}`, className)}
      style={{
        backgroundColor: style.bg,
        borderWidth: '1px',
        borderRadius: 'var(--radius-md)',
        borderLeftWidth: '4px',
        borderLeftColor: style.border,
      }}
    >
      <Box flexShrink={0} style={{ fontSize: '18px', lineHeight: 1, marginTop: '2px' }}>
        {style.icon}
      </Box>
      <Box flexGrow={1} gap="xs" flexDirection="column">
        {title && (
          <Text fontSize="sm" fontWeight="bold" fg="fg">
            {title}
          </Text>
        )}
        <Text fontSize="sm" fg="fg">
          {children}
        </Text>
      </Box>
      {dismissible && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 'var(--space-xs)',
            color: 'var(--color-fgMuted)',
            fontSize: '18px',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
    </Box>
  );
}