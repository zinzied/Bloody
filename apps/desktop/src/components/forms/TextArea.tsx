import React, { forwardRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Input label */
  label?: string;
  /** Helper text below textarea */
  hint?: string;
  /** Error message (shows red border) */
  error?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Additional className */
  className?: string;
}

/**
 * TextArea — Multi-line text input with label, hint, and error states
 *
 * @example
 * <TextArea label="Description" placeholder="Enter details..." rows={4} />
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, hint, error, placeholder, className, ...props }, ref) => {
    const id = React.useId();

    return (
      <Box flexDirection="column" gap="xs" className={cn('textarea-wrapper', className)}>
        {label && (
          <Text fontSize="xs" fontWeight="medium" fg="fgMuted" block>
            {label}
          </Text>
        )}
        <Box
          display="flex"
          alignItems="flex-start"
          className={cn(
            'textarea-field',
            error && 'textarea-error',
            props.disabled && 'textarea-disabled'
          )}
          style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid',
            borderColor: error ? 'var(--color-err)' : 'var(--color-border)',
            borderRadius: 'var(--radius-md)',
            transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          }}
        >
          <textarea
            ref={ref}
            id={id}
            placeholder={placeholder}
            disabled={props.disabled}
            className={cn('textarea-inner')}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              minHeight: '80px',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-fg)',
              caretColor: 'var(--color-accent)',
              resize: 'vertical',
              lineHeight: 'var(--line-height-normal)',
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

TextArea.displayName = 'TextArea';