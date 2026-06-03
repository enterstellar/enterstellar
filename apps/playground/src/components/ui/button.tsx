/**
 * Enterstellar Playground — Button Primitive
 *
 * A polymorphic button component with variant and size support
 * via `class-variance-authority`. Dark-mode-first, designed for
 * the Enterstellar playground controls bar and prompt interface.
 *
 * @example
 * ```tsx
 * <Button variant="primary" size="sm" onClick={handleSend}>
 *   Send ⚡
 * </Button>
 *
 * <Button variant="ghost" size="icon">
 *   <Settings className="size-4" />
 * </Button>
 * ```
 *
 * @module components/ui/button
 */
'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button variant definitions using CVA.
 *
 * Variants:
 * - `primary`: Enterprise blue — CTAs, send button, active actions
 * - `secondary`: Subtle — mode toggles, tab triggers, non-primary actions
 * - `ghost`: Transparent — icon buttons, minimal UI elements
 * - `destructive`: Error red — cancel, dismiss, danger zone actions
 * - `success`: Green — confirmation, completion indicators
 * - `outline`: Border-only — secondary CTAs, filter toggles
 *
 * Sizes:
 * - `sm`: Compact (28px height) — controls bar, inline actions
 * - `default`: Standard (36px height) — primary interactions
 * - `lg`: Prominent (44px height) — hero CTAs
 * - `icon`: Square (36×36px) — icon-only buttons
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-lg font-medium',
    'transition-all duration-200 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-playground-bg',
    'disabled:pointer-events-none disabled:opacity-50',
    'cursor-pointer select-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary-500 text-white',
          'hover:bg-primary-400',
          'active:bg-primary-600 active:scale-[0.98]',
          'shadow-sm shadow-primary-500/25',
        ],
        secondary: [
          'bg-playground-surface text-neutral-200',
          'border border-playground-border',
          'hover:bg-playground-panel hover:text-white',
          'active:scale-[0.98]',
        ],
        ghost: [
          'text-playground-muted',
          'hover:bg-playground-surface hover:text-neutral-200',
          'active:scale-[0.98]',
        ],
        destructive: [
          'bg-error/15 text-error',
          'border border-error/25',
          'hover:bg-error/25',
          'active:scale-[0.98]',
        ],
        success: [
          'bg-success/15 text-success',
          'border border-success/25',
          'hover:bg-success/25',
          'active:scale-[0.98]',
        ],
        outline: [
          'border border-playground-border text-neutral-300',
          'hover:bg-playground-surface hover:text-white',
          'active:scale-[0.98]',
        ],
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        default: 'h-9 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

/**
 * Props for the {@link Button} component.
 *
 * Extends native `<button>` attributes with CVA variant props.
 * All native button attributes (onClick, disabled, type, etc.) pass through.
 */
export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/**
 * Enterstellar-branded button component.
 *
 * Provides consistent styling across the playground UI with
 * variant-based theming and accessible focus indicators.
 * Supports `ref` forwarding for integration with form libraries
 * and animation wrappers (Framer Motion).
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);

Button.displayName = 'Button';

export { Button, buttonVariants };
