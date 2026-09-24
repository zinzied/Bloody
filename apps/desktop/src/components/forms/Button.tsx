import React, { forwardRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Full width button */
  fullWidth?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Additional className */
  className?: string;
}

const variants: Record<string, { bg: string; fg: string; border: string; hoverBg: string }> = {
  primary: {
    bg: 'var(--color-accent)',
    fg: 'var(--color-bg)',
    border: 'var(--color-accent)',
    hoverBg: 'var(--color-accent-hover)',
  },
  secondary: {
    bg: 'var(--color-bg-elevated)',
    fg: 'var(--color-fg)',
    border: 'var(--color-border)',
    hoverBg: 'var(--color-bg)',
  },
  danger: {
    bg: 'var(--color-err)',
    fg: 'var(--color-fg)',
    border: 'var(--color-err)',
    hoverBg: 'var(--color-danger)',
  },
  success: {
    bg: 'var(--color-ok)',
    fg: 'var(--color-bg)',
    border: 'var(--color-ok)',
    hoverBg: 'var(--color-success)',
  },
  ghost: {
    bg: 'transparent',
    fg: 'var(--color-fg)',
    border: 'transparent',
    hoverBg: 'var(--color-bg-elevated)',
  },
  outline: {
    bg: 'transparent',
    fg: 'var(--color-accent)',
    border: 'var(--color-accent)',
    hoverBg: 'var(--color-accent)',
  },
};

const sizes: Record<string, { padding: string; fontSize: string }> = {
  sm: { padding: 'var(--space-xs) var(--space-sm)', fontSize: 'var(--font-size-xs)' },
  md: { padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-size-sm)' },
  lg: { padding: 'var(--space-md) var(--space-lg)', fontSize: 'var(--font-size-base)' },
};

/**
 * Button — Primary action button with variants and loading state
 *
 * @example
 * <Button variant="primary" onClick={handleSave}>Save</Button>
 * <Button variant="danger" loading>Deleting...</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth, loading, children, className, ...props }, ref) => {
    const style = variants[variant];
    const sizeStyle = sizes[size];

    return (
      <button
        ref={ref}
        className={cn('button', `button-${variant}`, `button-${size}`, className)}
        style={{
          backgroundColor: style.bg,
          color: style.fg,
          border: `1px solid ${style.border}`,
          borderRadius: 'var(--radius-md)',
          padding: sizeStyle.padding,
          fontSize: sizeStyle.fontSize,
          fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--font-weight-medium)',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all var(--transition-fast)',
          width: fullWidth ? '100%' : undefined,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-xs)',
          outline: 'none',
          opacity: loading ? 0.6 : 1,
        }}
        {...props}
      >
        {loading && (
          <Box
            className="button-spinner"
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid',
              borderColor: style.fg,
              borderRadius: '50%',
              borderRightColor: 'transparent',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        )}
        <Text block>{children}</Text>
      </button>
    );
  }
);

Button.displayName = 'Button';

// Add spin keyframe
export const ButtonSpinnerStyle = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;