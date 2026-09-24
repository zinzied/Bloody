import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface PageProps {
  /** Main page title */
  title: string;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Page content */
  children: React.ReactNode;
  /** Optional action buttons in header */
  actions?: React.ReactNode;
  /** Additional className */
  className?: string;
}

/**
 * Page — Top-level page wrapper with title and subtitle
 * Mirrors the TUI's Page component from src/tui/components.tsx
 *
 * @example
 * <Page title="Overview" subtitle="Token usage summary">
 *   <StatCard label="Tokens" value="1.2M" />
 * </Page>
 */
export function Page({
  title,
  subtitle,
  children,
  actions,
  className,
}: PageProps) {
  return (
    <Box flexDirection="column" gap="lg" padding="xl" className={cn('page', className)}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="flex-start" className="page-header">
        <Box flexDirection="column" gap="xs">
          <Text fontSize="2xl" fontWeight="bold" fg="accent">
            {title}
          </Text>
          {subtitle && (
            <Text fontSize="sm" fg="fgMuted">
              {subtitle}
            </Text>
          )}
        </Box>
        {actions && (
          <Box display="flex" gap="sm" className="page-actions">
            {actions}
          </Box>
        )}
      </Box>
      <Box flexDirection="column" gap="xl" className="page-content">
        {children}
      </Box>
    </Box>
  );
}