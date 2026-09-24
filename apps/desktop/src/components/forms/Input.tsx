import React, { forwardRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Input label */
  label?: string;
  /** Helper text below input */
  hint?: string;
  /** Error message (shows red border) */
  error?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Input type */
  type?: 'text' | 'password' | 'number' | 'email' | 'url' | 'search';
  /** Additional className */
  className?: string;
}

/**
 * Input — Text input field with label, hint, and error states
 *
 * @example
 * <Input label="API Key" placeholder="sk-..." error={error} />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, placeholder, className, ...props }, ref) => {
    const id = React.useId();

    return (
      <Box flexDirection="column" gap="xs" className={cn('input-wrapper', className)}>
        {label && (
          <Text fontSize="xs" fontWeight="medium" fg="fgMuted" block>
            {label}
          </Text>
        )}
        <Box
          display="flex"
          alignItems="center"
          className={cn(
            'input-field',
            error && 'input-error',
            props.disabled && 'input-disabled'
          )}
          style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid',
            borderColor: error ? 'var(--color-err)' : 'var(--color-border)',
            borderRadius: 'var(--radius-md)',
            transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          }}
        >
          <input
            ref={ref}
            id={id}
            type={props.type ?? 'text'}
            placeholder={placeholder}
            disabled={props.disabled}
            className={cn('input-inner')}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-fg)',
              caretColor: 'var(--color-accent)',
            }}
            {...props}
          />
        </Box>
        {(error || hint) && (
          <Text fontSize="xs" fg={error ? 'err' : 'fgMuted'} block>
            {error || hint}
          </Text>
        )}
      </Box>
    );
  }
);

Input.displayName = 'Input';