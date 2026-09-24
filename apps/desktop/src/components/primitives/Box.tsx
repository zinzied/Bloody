import React from 'react';
import { cn } from '../../design/utils';

export interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Flexbox display */
  display?: 'flex' | 'grid' | 'block';
  /** Flex direction */
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  /** Flex wrap */
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  /** Flex grow */
  flexGrow?: 0 | 1;
  /** Flex shrink */
  flexShrink?: 0 | 1;
  /** Gap size (uses space tokens) */
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
  /** Padding (uses space tokens) */
  padding?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Margin (uses space tokens) */
  margin?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Background color token */
  bg?: 'bg' | 'bgElevated' | 'brand' | 'accent' | 'ok' | 'err' | 'dim';
  /** Foreground color token */
  fg?: 'fg' | 'fgMuted' | 'brand' | 'accent' | 'ok' | 'err' | 'section';
  /** Border style */
  border?: 'none' | 'solid' | 'rounded';
  /** Border color token */
  borderColor?: 'border' | 'borderStrong' | 'accent' | 'ok' | 'err';
}

/**
 * Box — The fundamental layout primitive
 * A flexbox/grid container with design token props
 *
 * @example
 * <Box flexDirection="row" gap="sm" padding="md">
 *   <StatCard label="Tokens" value="1.2M" />
 *   <StatCard label="Saved" value="45%" />
 * </Box>
 */
export function Box({
  display = 'block',
  flexDirection,
  flexWrap,
  flexGrow,
  flexShrink,
  gap,
  padding,
  margin,
  bg,
  fg,
  border = 'none',
  borderColor = 'border',
  className,
  style,
  children,
  ...rest
}: BoxProps) {
  const classes = cn(
    display === 'flex' && 'display-flex',
    display === 'grid' && 'display-grid',
    flexDirection === 'row' && 'flex-row',
    flexDirection === 'column' && 'flex-column',
    flexDirection === 'row-reverse' && 'flex-row-reverse',
    flexDirection === 'column-reverse' && 'flex-column-reverse',
    flexWrap === 'wrap' && 'flex-wrap',
    flexWrap === 'wrap-reverse' && 'flex-wrap-reverse',
    flexGrow !== undefined && `flex-grow-${flexGrow}`,
    flexShrink !== undefined && `flex-shrink-${flexShrink}`,
    gap && `gap-${gap}`,
    padding && `padding-${padding}`,
    margin && `margin-${margin}`,
    bg && `bg-${bg}`,
    fg && `fg-${fg}`,
    border === 'solid' && 'border-solid',
    border === 'rounded' && 'border-rounded',
    borderColor && `border-color-${borderColor}`,
    className
  );

  const inlineStyle: React.CSSProperties = {
    ...style,
  };

  return (
    <div className={classes} style={inlineStyle} {...rest}>
      {children}
    </div>
  );
}