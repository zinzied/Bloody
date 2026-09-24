import React, { forwardRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Checkbox label */
  label?: string;
  /** Helper text below checkbox */
  hint?: string;
  /** Error message */
  error?: string;
  /** Indeterminate state */
  indeterminate?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Checkbox — Checkbox input with label and indeterminate support
 *
 * @example
 * <Checkbox label="Enable feature" checked={enabled} onChange={setEnabled} />
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, hint, error, indeterminate, className, ...props }, ref) => {
    const id = React.useId();

    React.useEffect(() => {
      const input = ref.current;
      if (input && indeterminate) {
        input.indeterminate = true;
      }
    }, [indeterminate, ref]);

    return (
      <Box
        display="flex"
        alignItems="center"
        gap="sm"
        className={cn('checkbox-wrapper', className)}
      >
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          className={cn(
            'checkbox-input',
            error && 'checkbox-error',
            props.disabled && 'checkbox-disabled'
          )}
          style={{
            width: '18px',
            height: '18px',
            border: '2px solid',
            borderColor: error ? 'var(--color-err)' : 'var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: props.checked ? 'var(--color-accent)' : 'transparent',
            color: props.checked ? 'var(--color-bg)' : 'transparent',
            transition: 'all var(--transition-fast)',
            cursor: props.disabled ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {props.checked && (
            <Text fontSize="xs" bold fg="fg" mono>
              ✓
            </Text>
          )}
        </Box>
        {label && (
          <Text fontSize="sm" fg={props.disabled ? 'fgSubtle' : 'fg'} block>
            {label}
          </Text>
        )}
        <input
          ref={ref}
          type="checkbox"
          id={id}
          checked={props.checked}
          disabled={props.disabled}
          className="checkbox-hidden"
          style={{
            position: 'absolute',
            opacity: 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
          {...props}
        />
      </Box>
    );
  }
);

Checkbox.displayName = 'Checkbox';