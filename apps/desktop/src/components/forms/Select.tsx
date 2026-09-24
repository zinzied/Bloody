import React, { forwardRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Input label */
  label?: string;
  /** Helper text below select */
  hint?: string;
  /** Error message (shows red border) */
  error?: string;
  /** Options for the dropdown */
  options: SelectOption[];
  /** Selected value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Additional className */
  className?: string;
}

/**
 * Select — Dropdown select field with label, hint, and error states
 *
 * @example
 * <Select
 *   label="Provider"
 *   options={[
 *     { value: 'openai', label: 'OpenAI' },
 *     { value: 'anthropic', label: 'Anthropic' },
 *   ]}
 *   value={provider}
 *   onChange={setProvider}
 * />
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, options, value, onChange, className, ...props }, ref) => {
    const id = React.useId();

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e.target.value);
    };

    return (
      <Box flexDirection="column" gap="xs" className={cn('select-wrapper', className)}>
        {label && (
          <Text fontSize="xs" fontWeight="medium" fg="fgMuted" block>
            {label}
          </Text>
        )}
        <Box
          display="flex"
          alignItems="center"
          className={cn(
            'select-field',
            error && 'select-error',
            props.disabled && 'select-disabled'
          )}
          style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid',
            borderColor: error ? 'var(--color-err)' : 'var(--color-border)',
            borderRadius: 'var(--radius-md)',
            transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
            position: 'relative',
          }}
        >
          <select
            ref={ref}
            id={id}
            value={value}
            disabled={props.disabled}
            className={cn('select-inner')}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              padding: 'var(--space-sm) var(--space-md)',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-fg)',
              appearance: 'none',
              cursor: props.disabled ? 'not-allowed' : 'pointer',
            }}
            {...props}
            onChange={handleChange}
          >
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <Text
            fontSize="xs"
            fg="fgMuted"
            className="select-arrow"
            style={{
              position: 'absolute',
              right: 'var(--space-md)',
              pointerEvents: 'none',
            }}
          >
            ▼
          </Text>
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

Select.displayName = 'Select';