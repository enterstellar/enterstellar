/**
 * Enterstellar Playground — Tooltip Primitive
 *
 * A lightweight CSS-only tooltip for displaying contextual hints
 * on hover. Used for latency breakdown details, pipeline step
 * descriptions, scene chip descriptions, and icon button labels.
 *
 * CSS-only implementation avoids an external tooltip library dependency.
 * Uses `group` + `group-hover` Tailwind pattern for zero-JS rendering.
 *
 * @example
 * ```tsx
 * <Tooltip content="LLM: 42ms | Compile: 3ms | Render: 2ms">
 *   <Badge variant="outline" size="sm">47ms</Badge>
 * </Tooltip>
 *
 * <Tooltip content="Toggle EnterstellarDevTools" side="bottom">
 *   <Button variant="ghost" size="icon">⚙️</Button>
 * </Tooltip>
 * ```
 *
 * @module components/ui/tooltip
 */
'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for the {@link Tooltip} component.
 *
 * @property content - Text displayed in the tooltip popup.
 * @property side - Tooltip placement relative to the trigger element.
 *   Defaults to `'top'`.
 * @property children - The trigger element that shows the tooltip on hover.
 */
export interface TooltipProps {
  /** Text content displayed in the tooltip popup */
  readonly content: string;
  /** Tooltip placement relative to the trigger */
  readonly side?: 'top' | 'bottom';
  /** Additional CSS classes for the wrapper */
  readonly className?: string;
  /** The trigger element */
  readonly children: ReactNode;
}

/**
 * CSS-only tooltip component.
 *
 * Wraps any trigger element and shows a small text popup on hover.
 * Uses Tailwind's `group`/`group-hover` pattern for pure-CSS reveal
 * with opacity + translate transition for a smooth entrance.
 *
 * Positioned above (default) or below the trigger element.
 * Automatically constrains width and wraps long content.
 */
function Tooltip({
  content,
  side = 'top',
  className,
  children,
}: TooltipProps): React.JSX.Element {
  return (
    <span className={cn('relative inline-flex group', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'absolute left-1/2 -translate-x-1/2 z-50',
          'px-2 py-1 rounded-md',
          'bg-neutral-800 text-neutral-200 text-[11px] font-medium',
          'border border-playground-border',
          'whitespace-nowrap max-w-[240px]',
          'opacity-0 scale-95 pointer-events-none',
          'group-hover:opacity-100 group-hover:scale-100',
          'transition-all duration-150 ease-out',
          side === 'top' && 'bottom-full mb-1.5',
          side === 'bottom' && 'top-full mt-1.5',
        )}
      >
        {content}
      </span>
    </span>
  );
}

Tooltip.displayName = 'Tooltip';

export { Tooltip };
