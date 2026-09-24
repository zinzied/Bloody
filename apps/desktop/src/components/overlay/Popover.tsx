import React, { useState, useRef, useEffect } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface PopoverProps {
  /** Popover content */
  content: React.ReactNode;
  /** Trigger element */
  children: React.ReactElement;
  /** Position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Width */
  width?: string | number;
  /** Additional className */
  className?: string;
}

/**
 * Popover — Click-triggered floating panel
 *
 * @example
 * <Popover
 *   content={<Menu items={items} />}
 *   position="bottom"
 * >
 *   <Button>Options</Button>
 * </Popover>
 */
export function Popover({
  content,
  children,
  position = 'bottom',
  width = '280px',
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);

  const toggle = () => setOpen((o) => !o);
  const close = () => setOpen(false);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  // Position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    top: { bottom: 'calc(100% + 8px)', left: '0', transform: 'none' },
    bottom: { top: 'calc(100% + 8px)', left: '0', transform: 'none' },
    left: { right: 'calc(100% + 8px)', top: '0', transform: 'none' },
    right: { left: 'calc(100% + 8px)', top: '0', transform: 'none' },
  };

  return (
    <Box
      className={cn('popover-wrapper', className)}
      style={{ display: 'inline-block', position: 'relative' }}
    >
      <Box
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        style={{ cursor: 'pointer' }}
      >
        {children}
      </Box>

      {open && (
        <Box
          ref={popoverRef}
          className={cn('popover', `popover-${position}`, className)}
          style={{
            ...positionStyles[position],
            position: 'absolute',
            zIndex: 500,
            width: typeof width === 'number' ? `${width}px` : width,
            backgroundColor: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            padding: 'var(--space-md)',
            animation: 'fadeIn var(--transition-fast)',
          }}
        >
          {content}
        </Box>
      )}
    </Box>
  );
}