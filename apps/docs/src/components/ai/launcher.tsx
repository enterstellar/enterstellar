/**
 * Enterstellar Docs — AI Chat Launcher Button Variants
 *
 * CVA (class-variance-authority) utility that generates variant-aware
 * Tailwind class strings for the AI chat launcher and its panel controls.
 *
 * This is a pure styling utility. The
 * generated class strings are consumed by the AI search panel
 * (`components/ai/search.tsx`) to style triggers, submit buttons,
 * and action controls with consistent variant/size combinations.
 *
 * The Core UI exports its own `buttonVariants`, but this local
 * version includes a `color` variant alias (mapping to the same
 * values as `variant`). Core UI uses `color` internally as
 * its primary key; this file exposes both for compatibility with
 * components that use either convention.
 *
 * @see components/ai/search.tsx — The single consumer of this utility
 *
 * @module
 */
import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Visual variant definitions for the AI launcher button.
 *
 * Each key maps to a Tailwind class string combining background,
 * text color, hover state, and disabled state styles. Uses Core
 * design tokens (`fd-primary`, `fd-accent`, `fd-secondary`).
 */
const variants = {
  primary:
    'bg-fd-primary text-fd-primary-foreground hover:bg-fd-primary/80 disabled:bg-fd-secondary disabled:text-fd-secondary-foreground',
  outline: 'border hover:bg-fd-accent hover:text-fd-accent-foreground',
  ghost: 'hover:bg-fd-accent hover:text-fd-accent-foreground',
  secondary:
    'border bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-accent hover:text-fd-accent-foreground',
} as const;

/**
 * CVA function that builds a complete button class string from variant
 * and size options.
 *
 * Base classes provide layout, typography, transition, disabled state,
 * and focus ring styles. Compound variants are applied on top.
 *
 * **Variant keys:**
 * - `variant` / `color` — Visual style (`primary`, `outline`, `ghost`, `secondary`).
 *   Both keys resolve to the same values; `color` is an alias for
 *   Core internal compatibility.
 * - `size` — Dimensional preset (`sm`, `icon`, `icon-sm`, `icon-xs`).
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md p-2 text-sm font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring',
  {
    variants: {
      variant: variants,
      color: variants,
      size: {
        sm: 'gap-1 px-2 py-1.5 text-xs',
        icon: 'p-1.5 [&_svg]:size-5',
        'icon-sm': 'p-1.5 [&_svg]:size-4.5',
        'icon-xs': 'p-1 [&_svg]:size-4',
      },
    },
  },
);

/**
 * Inferred variant prop types for the AI launcher button.
 *
 * Extracted from the CVA function signature. Consumers pass these
 * props to `buttonVariants()` to generate the appropriate class string.
 */
export type ButtonProps = VariantProps<typeof buttonVariants>;
