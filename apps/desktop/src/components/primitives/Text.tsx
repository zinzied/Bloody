import React from 'react';
import { cn } from '../../design/utils';

export interface TextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Font size token */
  fontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  /** Font weight */
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  /** Foreground color token */
  fg?: 'fg' | 'fgMuted' | 'fgSubtle' | 'brand' | 'accent' | 'section' | 'ok' | 'err' | 'dim';
  /** Monospace font toggle */
  mono?: boolean;
  /** Bold toggle (shortcut for fontWeight="bold") */
  bold?: boolean;
  /** Muted toggle (shortcut for fg="fgMuted") */
  muted?: boolean;
  /** Inline block behavior */
  block?: boolean;
}

/**
 * Text — Typography primitive with semantic color roles
 * Use for all text content with consistent styling
 *
 * @example
 * <Text fontSize="lg" fontWeight="bold" fg="accent">Page Title</Text>
 * <Text muted>This is secondary text</Text>
 * <Text mono className="code-snippet">const x = 1;</Text>
 */
export function Text({
  fontSize = 'base',
  fontWeight = 'normal',
  fg = 'fg',
  mono = false,
  bold = false,
  muted = false,
  block = false,
  className,
  style,
  children,
  ...rest
}: TextProps) {
  const Component = block ? 'div' : 'span';

  const classes = cn(
    `text-${fontSize}`,
    (bold || fontWeight === 'bold') && 'font-bold',
    fontWeight === 'medium' && 'font-medium',
    fontWeight === 'semibold' && 'font-semibold',
    (muted || fg === 'fgMuted') && 'fg-fgMuted',
    fg !== 'fgMuted' && !muted && `fg-${fg}`,
    mono && 'font-mono',
    className
  );

  const inlineStyle: React.CSSProperties = {
    ...style,
  };

  return (
    <Component className={classes} style={inlineStyle} {...rest}>
      {children}
    </Component>
  );
}