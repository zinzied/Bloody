import React, { useEffect, useState } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface ToastProps {
  /** Toast variant */
  variant?: 'info' | 'success' | 'warning' | 'error';
  /** Toast message */
  message: string;
  /** Auto-dismiss after ms (0 = no auto-dismiss) */
  duration?: number;
  /** On close callback */
  onClose?: () => void;
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
 * Toast — Transient notification toast
 * Used with a ToastProvider for global toast management
 *
 * @example
 * <Toast variant="success" message="Saved successfully" duration={3000} />
 */
export function Toast({
  variant = 'info',
  message,
  duration = 5000,
  onClose,
  className,
}: ToastProps) {
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    if (duration <= 0) return;

    const timer = setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const style = variantStyles[variant];

  return (
    <Box
      flexDirection="row"
      gap="sm"
      padding="md"
      border="solid"
      borderColor={style.border}
      className={cn('toast', `toast-${variant}`, className)}
      style={{
        backgroundColor: style.bg,
        borderWidth: '1px',
        borderRadius: 'var(--radius-md)',
        borderLeftWidth: '4px',
        borderLeftColor: style.border,
        boxShadow: 'var(--shadow-lg)',
        animation: 'slideIn 200ms ease',
        minWidth: '300px',
        maxWidth: '480px',
      }}
    >
      <Box flexShrink={0} style={{ fontSize: '18px', lineHeight: 1, marginTop: '2px' }}>
        {style.icon}
      </Box>
      <Box flexGrow={1}>
        <Text fontSize="sm" fg="fg">
          {message}
        </Text>
      </Box>
      <button
        onClick={() => {
          onClose?.();
        }}
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
    </Box>
  );
}