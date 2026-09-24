import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { Button } from '../forms/Button';
import { cn } from '../../design/utils';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface BreadcrumbsProps {
  /** Breadcrumb items */
  items: BreadcrumbItem[];
  /** Separator */
  separator?: React.ReactNode;
  /** Max items before collapsing */
  maxItems?: number;
  /** Additional className */
  className?: string;
}

/**
 * Breadcrumbs — Hierarchical navigation
 *
 * @example
 * <Breadcrumbs
 *   items={[
 *     { label: 'Home', onClick: () => router.push('/') },
 *     { label: 'Settings', onClick: () => router.push('/settings') },
 *     { label: 'Profile', disabled: true },
 *   ]}
 * />
 */
export function Breadcrumbs({
  items,
  separator = <Text fg="fgMuted" mono>/</Text>,
  maxItems = 5,
  className,
}: BreadcrumbsProps) {
  const visibleItems = items.length > maxItems
    ? [items[0], { label: '...', disabled: true }, ...items.slice(-maxItems + 1)]
    : items;

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      gap="xs"
      className={cn('breadcrumbs', className)}
      style={{ flexWrap: 'wrap', gap: 'var(--space-xs)' }}
    >
      {visibleItems.map((item, index) => (
        <Box key={index} flexDirection="row" alignItems="center" gap="xs">
          {index > 0 && <Box fg="fgMuted">{separator}</Box>}
          {item.onClick && !item.disabled ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={item.onClick}
              className="breadcrumb-link"
              disabled={item.disabled}
            >
              <Text fontSize="sm" fg={item.disabled ? 'fgSubtle' : 'fgMuted'}>
                {item.label}
              </Text>
            </Button>
          ) : (
            <Text fontSize="sm" fg={item.disabled ? 'fgSubtle' : 'fg'} block>
              {item.label}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}