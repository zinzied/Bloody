import React, { useEffect, useRef } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { Button } from '../forms/Button';
import { cn } from '../../design/utils';

export interface ModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal description */
  description?: string;
  /** Modal content */
  children: React.ReactNode;
  /** Footer actions */
  footer?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Close on overlay click */
  closeOnOverlayClick?: boolean;
  /** Close on Escape key */
  closeOnEscape?: boolean;
  /** Additional className */
  className?: string;
}

const sizeStyles: Record<string, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[500px]',
  lg: 'max-w-[700px]',
  xl: 'max-w-[900px]',
  full: 'max-w-[90vw]',
};

/**
 * Modal — Dialog with focus trap and animations
 *
 * @example
 * <Modal
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   title="Confirm Action"
 *   footer={
 *     <>
 *       <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
 *       <Button variant="danger" onClick={handleConfirm}>Delete</Button>
 *     </>
 *   }
 * >
 *   Are you sure?
 * </Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus management
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
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
      className={cn('modal-overlay', className)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-lg)',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <Box
        ref={modalRef}
        tabIndex={-1}
        flexDirection="column"
        bg="bgElevated"
        border="rounded"
        borderColor="border"
        className={cn('modal', sizeStyles[size])}
        style={{
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          animation: 'slideUp 200ms ease',
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
            className="modal-header"
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
              aria-label="Close modal"
              className="modal-close"
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>✕</span>
            </Button>
          </Box>
        )}

        {/* Content */}
        <Box padding="lg" className="modal-content" style={{ overflow: 'auto', flex: 1 }}>
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
            className="modal-footer"
          >
            {footer}
          </Box>
        )}
      </Box>
    </Box>
  );
}