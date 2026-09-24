import React, { useEffect, useRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { Button } from '../forms/Button';
import { cn } from '../../design/utils';

export interface DrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Drawer title */
  title?: string;
  /** Drawer description */
  description?: string;
  /** Drawer content */
  children: React.ReactNode;
  /** Footer actions */
  footer?: React.ReactNode;
  /** Position */
  position?: 'left' | 'right' | 'top' | 'bottom';
  /** Size */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Close on overlay click */
  closeOnOverlayClick?: boolean;
  /** Close on Escape key */
  closeOnEscape?: boolean;
  /** Additional className */
  className?: string;
}

const positionStyles: Record<string, { overlay: React.CSSProperties; panel: React.CSSProperties }> = {
  left: {
    overlay: { position: 'fixed', inset: 0, zIndex: 300 },
    panel: { position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 301 },
  },
  right: {
    overlay: { position: 'fixed', inset: 0, zIndex: 300 },
    panel: { position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 301 },
  },
  top: {
    overlay: { position: 'fixed', inset: 0, zIndex: 300 },
    panel: { position: 'fixed', left: 0, right: 0, top: 0, zIndex: 301 },
  },
  bottom: {
    overlay: { position: 'fixed', inset: 0, zIndex: 300 },
    panel: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 301 },
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { width: '320px' },
  md: { width: '480px' },
  lg: { width: '640px' },
  xl: { width: '800px' },
  full: { width: '100%' },
};

const horizontalPositions = ['left', 'right'] as const;
const verticalPositions = ['top', 'bottom'] as const;

/**
 * Drawer — Slide-over panel from screen edge
 *
 * @example
 * <Drawer
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   title="Settings"
 *   position="right"
 *   size="md"
 * >
 *   <SettingsForm />
 * </Drawer>
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  position = 'right',
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const isHorizontal = horizontalPositions.includes(position);
  const isVertical = verticalPositions.includes(position);

  // Focus management
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      panelRef.current?.focus();
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus();
    }
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEscape, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <Box
      className={cn('drawer-overlay', className)}
      style={positionStyles[position].overlay}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <Box
        ref={panelRef}
        tabIndex={-1}
        flexDirection="column"
        bg="bgElevated"
        border="rounded"
        borderColor="border"
        className={cn(
          'drawer',
          isHorizontal ? 'drawer-horizontal' : 'drawer-vertical',
          className
        )}
        style={{
          ...positionStyles[position].panel,
          ...sizeStyles[size],
          maxHeight: isHorizontal ? '100%' : undefined,
          maxWidth: isVertical ? '100%' : undefined,
          height: isVertical ? 'auto' : '100%',
          width: isHorizontal ? 'auto' : undefined,
          overflow: 'hidden',
          animation: 'slideIn 250ms ease',
          borderRadius: '0',
          borderWidth: '0 0 0 1px' // only left border for right/left
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || description) && (
          <Box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="flex-start"
            padding="lg"
            borderBottom="solid"
            borderColor="border"
            className="drawer-header"
          >
            <Box flexDirection="column" gap="xs" flexGrow={1}>
              {title && (
                <Text fontSize="lg" fontWeight="bold" fg="fg">
                  {title}
                </Text>
              )}
              {description && (
                <Text fontSize="sm" fg="fgMuted">
                  {description}
                </Text>
              )}
            </Box>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close drawer"
              className="drawer-close"
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>✕</span>
            </Button>
          </Box>
        )}

        {/* Content */}
        <Box padding="lg" className="drawer-content" style={{ overflow: 'auto', flex: 1 }}>
          {children}
        </Box>

        {/* Footer */}
        {footer && (
          <Box
            flexDirection="row"
            justifyContent="flex-end"
            gap="sm"
            padding="lg"
            borderTop="solid"
            borderColor="border"
            className="drawer-footer"
          >
            {footer}
          </Box>
        )}
      </Box>
    </Box>
  );
}