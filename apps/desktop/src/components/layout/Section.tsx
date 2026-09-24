import React from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface SectionProps {
  /** Section title */
  title: string;
  /** Section content */
  children: React.ReactNode;
  /** Optional action in header */
  action?: React.ReactNode;
  /** Start collapsed */
  defaultCollapsed?: boolean;
  /** Allow user to collapse/expand */
  collapsible?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Section — Collapsible content section with header
 * Mirrors the TUI's Section component from src/tui/components.tsx
 *
 * @example
 * <Section title="Providers">
 *   <Table columns={...} data={providers} />
 * </Section>
 */
export function Section({
  title,
  children,
  action,
  defaultCollapsed = false,
  collapsible = false,
  className,
}: SectionProps) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  return (
    <Box flexDirection="column" className={cn('section', className)}>
      <Box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingBottom="sm"
        borderBottom="solid"
        borderColor="border"
        className="section-header"
      >
        <Text fontSize="sm" fontWeight="bold" fg="section" className="section-title">
          {title}
        </Text>
        {collapsible && (
          <Box
            display="flex"
            alignItems="center"
            gap="xs"
            className="section-toggle"
            onClick={() => setCollapsed(!collapsed)}
            style={{ cursor: 'pointer' }}
          >
            <Text fontSize="xs" fg="fgMuted" mono>
              {collapsed ? '▶' : '▼'}
            </Text>
          </Box>
        )}
        {action && (
          <Box className="section-action">
            {action}
          </Box>
        )}
      </Box>
      {!collapsed && (
        <Box paddingTop="lg" className="section-content">
          {children}
        </Box>
      )}
    </Box>
  );
}