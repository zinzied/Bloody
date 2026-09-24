import React, { useState, useRef, useEffect } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface TooltipProps {
  /** Content to show in tooltip */
  content: React.ReactNode;
  /** Child element to attach tooltip to */
  children: React.ReactElement;
  /** Position */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Show delay in ms */
  delay?: number;
  /** Additional className */
  className?: string;
}

const positionStyles: Record<string, { tooltip: React.CSSProperties; arrow: React.CSSProperties }> = {
  top: {
    tooltip: { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
    arrow: { bottom: '-6px', left: '50%', transform: 'translateX(-50%)', borderTopColor: 'var(--color-bg)' },
  },
  bottom: {
    tooltip: { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
    arrow: { top: '-6px', left: '50%', transform: 'translateX(-50%)', borderBottomColor: 'var(--color-bg)' },
  },
  left: {
    tooltip: { right: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
    arrow: { right: '-6px', top: '50%', transform: 'translateY(-50%)', borderLeftColor: 'var(--color-bg)' },
  },
  right: {
    tooltip: { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' },
    arrow: { left: '-6px', top: '50%', transform: 'translateY(-50%)', borderRightColor: 'var(--color-bg)' },
  },
};

/**
 * Tooltip — Hover-triggered tooltip with arrow
 *
 * @example
 * <Tooltip content="Click to save" position="top">
 *   <Button>Save</Button>
 * </Tooltip>
 */
export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const childRef = useRef<HTMLElement>(null);

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  const handleMouseEnter = () => {
    if (!childRef.current) return;
    childRef.current.addEventListener('mouseleave', hide);
    childRef.current.addEventListener('blur', hide);
    show();
  };

  const handleMouseLeave = () => {
    hide();
  };

  // Clone child to add event handlers
  const childWithProps = React.isValidElement(children)
    ? React.cloneElement(children, {
        ref: childRef,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onFocus: show,
        onBlur: hide,
      } as React.HTMLAttributes<HTMLElement>)
    : children;

  return (
    <Box
      className={cn('tooltip-wrapper', className)}
      style={{ display: 'inline-block', position: 'relative' }}
    >
      {childWithProps}
      {visible && (
        <Box
          className={cn('tooltip', `tooltip-${position}`, className)}
          style={{
            ...positionStyles[position].tooltip,
            position: 'absolute',
            zIndex: 500,
            padding: 'var(--space-xs) var(--space-sm)',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-fg)',
            whiteSpace: 'nowrap',
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn var(--transition-fast)',
          }}
        >
          <Text fontSize="xs">{content}</Text>
          <Box
            className="tooltip-arrow"
            style={{
              ...positionStyles[position].arrow,
              position: 'absolute',
              width: 0,
              height: 0,
              borderWidth: '6px',
              borderStyle: 'solid',
              borderColor: 'transparent',
            }}
          />
        </Box>
      )}
    </Box>
  );
}