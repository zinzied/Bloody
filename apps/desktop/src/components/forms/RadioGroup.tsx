import React, { forwardRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  /** Radio group label */
  label?: string;
  /** Helper text */
  hint?: string;
  /** Error message */
  error?: string;
  /** Options */
  options: RadioOption[];
  /** Selected value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Direction */
  direction?: 'vertical' | 'horizontal';
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * RadioGroup — Group of radio buttons with label
 *
 * @example
 * <RadioGroup
 *   label="Mode"
 *   options={[
 *     { value: 'auto', label: 'Auto' },
 *     { value: 'manual', label: 'Manual' },
 *   ]}
 *   value={mode}
 *   onChange={setMode}
 * />
 */
export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  ({ label, hint, error, options, value, onChange, direction = 'vertical', disabled = false, className, ...props }, ref) => {
    const id = React.useId();

    return (
      <Box
        ref={ref}
        flexDirection={direction === 'horizontal' ? 'row' : 'column'}
        gap={direction === 'horizontal' ? 'md' : 'sm'}
        className={cn('radio-group', direction === 'horizontal' && 'radio-group-horizontal', className)}
      >
        {label && (
          <Text fontSize="xs" fontWeight="medium" fg="fgMuted" block>
            {label}
          </Text>
        )}
        <Box flexDirection={direction === 'horizontal' ? 'row' : 'column'} gap={direction === 'horizontal' ? 'md' : 'sm'}>
          {options.map((option) => (
            <Box
              key={option.value}
              display="flex"
              alignItems="center"
              gap="sm"
              className="radio-item"
              style={{ cursor: option.disabled || disabled ? 'not-allowed' : 'pointer' }}
            >
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={value === option.value}
                disabled={option.disabled || disabled}
                onChange={() => !option.disabled && !disabled && onChange?.(option.value)}
                className="radio-hidden"
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: 0,
                  height: 0,
                  pointerEvents: 'none',
                }}
              />
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                className={cn(
                  'radio-input',
                  option.disabled && 'radio-disabled'
                )}
                style={{
                  width: '18px',
                  height: '18px',
                  border: '2px solid',
                  borderColor: 'var(--color-border)',
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  transition: 'all var(--transition-fast)',
                  cursor: option.disabled || disabled ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                {value === option.value ? (
                  <Box
                    className="radio-dot"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-accent)',
                    }}
                  />
                ) : null}
              </Box>
              <Text fontSize="sm" fg="fg" block>
                {option.label}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }
);

RadioGroup.displayName = 'RadioGroup';