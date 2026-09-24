import React, { useRef, useEffect } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface TabsProps {
  /** Tabs to display */
  items: TabItem[];
  /** Currently active tab ID */
  activeId: string;
  /** Change handler */
  onChange: (id: string) => void;
  /** Variant */
  variant?: 'line' | 'enclosed' | 'soft';
  /** Additional className */
  className?: string;
}

/**
 * Tabs — Tab navigation component
 *
 * @example
 * <Tabs
 *   items={[
 *     { id: 'overview', label: 'Overview' },
 *     { id: 'settings', label: 'Settings' },
 *   ]}
 *   activeId={activeTab}
 *   onChange={setActiveTab}
 * />
 */
export function Tabs({
  items,
  activeId,
  onChange,
  variant = 'line',
  className,
}: TabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const activeTab = items.find((item) => item.id === activeId);

  // Animate indicator to active tab
  useEffect(() => {
    if (!tabsRef.current || !indicatorRef.current || !activeTab) return;

    const tabsRect = tabsRef.current.getBoundingClientRect();
    const activeBtn = tabsRef.current.querySelector(`[data-tab-id="${activeId}"]`) as HTMLElement;
    if (!activeBtn) return;

    const activeRect = activeBtn.getBoundingClientRect();
    indicatorRef.current.style.transform = `translateX(${activeRect.left - tabsRect.left}px)`;
    indicatorRef.current.style.width = `${activeRect.width}px`;
  }, [activeId, items]);

  return (
    <Box
      ref={tabsRef}
      flexDirection="row"
      gap="sm"
      padding="xs"
      className={cn('tabs', `tabs-${variant}`, className)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {/* Indicator for line variant */}
      {variant === 'line' && (
        <Box
          ref={indicatorRef}
          className="tabs-indicator"
          style={{
            position: 'absolute',
            bottom: 0,
            height: '3px',
            backgroundColor: 'var(--color-accent)',
            borderRadius: 'var(--radius-full) 0 0 0',
            transition: 'transform 200ms ease, width 200ms ease',
            pointerEvents: 'none',
          }}
        />
      )}

      {items.map((item) => (
        <Button
          key={item.id}
          variant={variant === 'line' ? 'ghost' : variant === 'enclosed' ? 'secondary' : 'ghost'}
          size="sm"
          fullWidth={false}
          disabled={item.disabled}
          onClick={() => !item.disabled && onChange(item.id)}
          className={cn(
            'tab-btn',
            item.id === activeId && 'tab-btn-active',
            item.disabled && 'tab-btn-disabled'
          )}
          data-tab-id={item.id}
          style={{
            minWidth: '100px',
            justifyContent: 'center',
            gap: 'var(--space-xs)',
            fontWeight: item.id === activeId ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
          }}
        >
          {item.icon && <span style={{ fontSize: '14px' }}>{item.icon}</span>
          <Text fontSize="sm" block>{item.label}</Text>
        </Button>
      ))}
    </Box>
  );
}