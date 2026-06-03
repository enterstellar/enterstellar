/**
 * Enterstellar Playground — Badge Primitive
 *
 * A status badge component with severity-aware coloring.
 * Used for pipeline step indicators, latency labels,
 * compilation status, and mode identifiers throughout
 * the playground controls bar.
 *
 * @example
 * ```tsx
 * <Badge variant="success">✅ Compiled</Badge>
 * <Badge variant="error">🔴 Caught</Badge>
 * <Badge variant="cloud">☁️ Forge</Badge>
 * <Badge variant="outline" size="sm">3.2ms</Badge>
 * ```
 *
 * @module components/ui/badge
 */
import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge variant definitions using CVA.
 *
 * Color variants map directly to the playground's mode accent tokens:
 * - `default`: Neutral — generic labels
 * - `success`: Green — healthy mode, compilation passed
 * - `error`: Red — hallucinating mode, compilation errors
 * - `warning`: Amber — self-correction in progress
 * - `cloud`: Purple — forge mode, cloud generation
 * - `outline`: Border-only — latency values, secondary info
 */
const badgeVariants = cva(
  [
    'inline-flex items-center gap-1',
    'rounded-md font-medium font-mono',
    'transition-colors duration-150',
  ],
  {
    variants: {
      variant: {
        default: 'bg-playground-surface text-neutral-300 border border-playground-border',
        success: 'bg-success/15 text-success border border-success/25',
        error: 'bg-error/15 text-error border border-error/25',
        warning: 'bg-warning/15 text-warning border border-warning/25',
        cloud: 'bg-cloud/15 text-cloud border border-cloud/25',
        outline: 'border border-playground-border text-playground-muted',
      },
      size: {
        sm: 'px-1.5 py-0.5 text-[10px] leading-tight',
        default: 'px-2 py-0.5 text-xs',
        lg: 'px-2.5 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

/**
 * Props for the {@link Badge} component.
 *
 * Extends native `<span>` attributes with CVA variant props.
 */
export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/**
 * Status badge component with mode-aware coloring.
 *
 * Renders inline badge labels that visually communicate
 * pipeline status, compilation results, and latency values.
 * Uses monospace font for numeric content (latency, counts).
 */
function Badge({ className, variant, size, ...props }: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

Badge.displayName = 'Badge';

export { Badge, badgeVariants };
