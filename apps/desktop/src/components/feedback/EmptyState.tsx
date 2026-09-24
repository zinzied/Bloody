import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { Button } from '../forms/Button';
import { cn } from '../../design/utils';

export interface EmptyStateProps {
  /** Icon or illustration */
  icon?: React.ReactNode;
  /** Title */
  title: string;
  /** Description */
  description?: string;
  /** Action button */
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  /** Additional className */
  className?: string;
}

/**
 * EmptyState — Empty state illustration with action
 *
 * @example
 * <EmptyState
 *   title="No data"
 *   description="Get started by adding your first item"
 *   action={{ label: 'Add item', onClick: handleAdd }}
 * />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap="md"
      padding="xxl"
      textAlign="center"
      className={cn('empty-state', className)}
      style={{ minHeight: '300px' }}
    >
      {icon && (
        <Box
          className="empty-state-icon"
          style={{
            fontSize: '64px',
            lineHeight: 1,
            opacity: 0.5,
          }}
        >
          {icon}
        </Box>
      )}
      <Box flexDirection="column" gap="sm" style={{ maxWidth: '320px' }}>
        <Text fontSize="xl" fontWeight="bold" fg="fg">
          {title}
        </Text>
        {description && (
          <Text fontSize="base" fg="fgMuted">
            {description}
          </Text>
        )}
        {action && (
          <Button
            variant={action.variant ?? 'primary'}
            onClick={action.onClick}
            style={{ marginTop: 'var(--space-md)' }}
          >
            {action.label}
          </Button>
        )}
      </Box>
    </Box>
  );
}