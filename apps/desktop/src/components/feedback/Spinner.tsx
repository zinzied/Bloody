import React, { useEffect, useState } from 'react';
import { Box } from '../primitives/Box';
import { Text } from '../primitives/Text';
import { cn } from '../../design/utils';

export interface SpinnerProps {
  /** Optional label shown below the spinner */
  label?: string;
  /** Size of the spinner in pixels */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
}

const sizeMap = {
  sm: 16,
  md: 24,
  lg: 32,
};

/**
 * Spinner — Animated loading indicator
 * Replaces static "Loading…" text with a rotating spinner
 *
 * @example
 * <Spinner label="Loading catalog..." />
 * <Spinner size="lg" />
 */
export function Spinner({ label, size = 'md', className }: SpinnerProps) {
  const [frame, setFrame] = useState(0);
  const pixelSize = sizeMap[size];

  // Animation frames using braille characters for smooth rotation
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      gap="sm"
      padding="lg"
      className={cn('spinner', className)}
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        className="spinner-icon"
        style={{
          width: `${pixelSize}px`,
          height: `${pixelSize}px`,
          fontSize: `${pixelSize}px`,
          lineHeight: 1,
          color: 'var(--color-accent)',
        }}
      >
        <Text mono bold>
          {frames[frame]}
        </Text>
      </Box>
      {label && (
        <Text fontSize="sm" fg="fgMuted">
          {label}
        </Text>
      )}
    </Box>
  );
}