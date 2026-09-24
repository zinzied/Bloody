import React, { useState, useCallback } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface NavItem {
  id: string;
  label: string;
  icon?: string;
}

export interface SidebarProps {
  /** Navigation items */
  items: NavItem[];
  /** Currently active item ID */
  activeId: string;
  /** Click handler for navigation */
  onNavigate: (id: string) => void;
  /** App title/brand */
  brand: string;
  /** App version */
  version?: string;
  /** Start collapsed (icon-only) */
  defaultCollapsed?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Sidebar — Collapsible navigation rail with brand header
 * Mirrors the TUI sidebar from src/tui/App.tsx with desktop enhancements
 *
 * @example
 * <Sidebar
 *   items={NAV}
 *   activeId={active}
 *   onNavigate={setActive}
 *   brand="Bloody"
 *   version="10.0.0"
 * />
 */
export function Sidebar({
  items,
  activeId,
  onNavigate,
  brand,
  version = '',
  defaultCollapsed = false,
  className,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleNavClick = useCallback(
    (id: string) => {
      onNavigate(id);
    },
    [onNavigate]
  );

  return (
    <Box
      flexDirection="column"
      bg="bgElevated"
      border="solid"
      borderColor="borderStrong"
      className={cn('sidebar', collapsed && 'sidebar-collapsed', className)}
      style={{
        width: collapsed ? '64px' : '220px',
        height: '100vh',
        overflow: 'hidden',
        transition: 'width var(--transition-normal)',
        flexShrink: 0,
      }}
    >
      {/* Brand Header */}
      <Box
        padding="md"
        borderBottom="solid"
        borderColor="border"
        className="sidebar-brand"
        onClick={() => setCollapsed(!collapsed)}
        style={{ cursor: 'pointer' }}
      >
        <Text fontSize="lg" fontWeight="bold" fg="brand" block>
          {brand}
        </Text>
        {!collapsed && version && (
          <Text fontSize="xs" fg="fgMuted" block>
            v{version}
          </Text>
        )}
      </Box>

      {/* Navigation Items */}
      <Box flexDirection="column" padding="sm" gap="xs" className="sidebar-nav">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <Box
              key={item.id}
              display="flex"
              flexDirection="row"
              alignItems="center"
              gap="sm"
              padding="sm"
              className={cn(
                'sidebar-item',
                isActive && 'sidebar-item-active'
              )}
              onClick={() => handleNavClick(item.id)}
              style={{
                cursor: 'pointer',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isActive ? 'var(--color-bg)' : 'transparent',
                borderLeft: isActive
                  ? '3px solid var(--color-accent)'
                  : '3px solid transparent',
                paddingLeft: isActive ? 'var(--space-sm)' : 'var(--space-md)',
                transition: 'all var(--transition-fast)',
              }}
              title={collapsed ? item.label : undefined}
            >
              {item.icon && (
                <Text
                  fontSize="base"
                  fg={isActive ? 'accent' : 'fgMuted'}
                  mono
                >
                  {item.icon}
                </Text>
              )}
              {!collapsed && (
                <Text
                  fontSize="sm"
                  fontWeight={isActive ? 'semibold' : 'normal'}
                  fg={isActive ? 'accent' : 'fg'}
                  block
                >
                  {item.label}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Collapse Toggle Hint */}
      {!collapsed && (
        <Box
          padding="xs"
          marginTop="auto"
          className="sidebar-hint"
          onClick={() => setCollapsed(true)}
          style={{ cursor: 'pointer' }}
        >
          <Text fontSize="xs" fg="fgMuted" block>
            Click brand to collapse ▲
          </Text>
        </Box>
      )}
    </Box>
  );
}