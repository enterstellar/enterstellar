/**
 * Enterstellar Playground — Card Primitive
 *
 * A composable card container with header, content, and footer slots.
 * Provides the glassmorphism-accented panel aesthetic used across
 * the playground's expanded trace panels, compilation detail views,
 * and demo zone components.
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Compilation Result</CardTitle>
 *     <CardDescription>MetricCard — 3.2ms</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <pre>{JSON.stringify(result, null, 2)}</pre>
 *   </CardContent>
 * </Card>
 * ```
 *
 * @module components/ui/card
 */
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Root card container.
 *
 * Renders a dark elevated panel with subtle border and rounded corners.
 * Supports all native `<div>` attributes for layout composition.
 */
const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-playground-border',
        'bg-playground-surface',
        'shadow-sm shadow-black/20',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

/**
 * Card header slot — contains title and optional description.
 */
const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

/**
 * Card title — primary heading within the card header.
 */
const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-sm font-semibold text-neutral-100 leading-none', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

/**
 * Card description — secondary text below the title.
 */
const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-xs text-playground-muted', className)}
      {...props}
    />
  ),
);
CardDescription.displayName = 'CardDescription';

/**
 * Card content slot — main body area with standard padding.
 */
const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-4 pb-4', className)}
      {...props}
    />
  ),
);
CardContent.displayName = 'CardContent';

/**
 * Card footer slot — bottom area for actions or metadata.
 */
const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center px-4 py-3',
        'border-t border-playground-border',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
