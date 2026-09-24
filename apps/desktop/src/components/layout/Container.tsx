import React from 'react';
import { Box } from '../primitives/Box';
import { cn } from '../../design/utils';

export interface ContainerProps {
  /** Maximum width constraint */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Center the container */
  center?: boolean;
  /** Padding */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Children */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

const maxWidthMap = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  full: '100%',
};

/**
 * Container — Responsive centered container with max-width
 *
 * @example
 * <Container maxWidth="lg" padding="lg">
 *   <Page title="Settings">...</Page>
 * </Container>
 */
export function Container({
  maxWidth = 'xl',
  center = true,
  padding = 'lg',
  children,
  className,
}: ContainerProps) {
  return (
    <Box
      width="100%"
      style={{
        maxWidth: maxWidthMap[maxWidth],
        marginLeft: center ? 'auto' : 0,
        marginRight: center ? 'auto' : 0,
        paddingLeft: padding === 'none' ? 0 : undefined,
        paddingRight: padding === 'none' ? 0 : undefined,
        paddingTop: padding === 'none' ? 0 : undefined,
        paddingBottom: padding === 'none' ? 0 : undefined,
      }}
      className={cn('container', className)}
    >
      {children}
    </Box>
  );
}