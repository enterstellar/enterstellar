/**
 * Enterstellar Playground — Input Primitive
 *
 * A styled text input for the playground prompt bar and
 * interactive component forms. Dark-mode-first with the
 * Enterstellar playground surface palette.
 *
 * @example
 * ```tsx
 * <Input
 *   placeholder='Try: "Show me a medical dashboard"'
 *   value={intent}
 *   onChange={(e) => setIntent(e.target.value)}
 *   onKeyDown={(e) => e.key === 'Enter' && handleSend()}
 * />
 * ```
 *
 * @module components/ui/input
 */
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for the {@link Input} component.
 *
 * Extends all native `<input>` attributes. No additional
 * custom props — composition is handled via className overrides.
 */
export type InputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Styled text input for the playground UI.
 *
 * Designed for the single-line prompt bar: full-width, transparent
 * background that blends with the prompt bar surface, with a subtle
 * border on focus. Uses `font-sans` (Inter) for natural-language input.
 *
 * Supports `ref` forwarding for programmatic focus management
 * (e.g., auto-focus after scene selection, focus after chip click).
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-lg px-3 py-2',
        'bg-playground-panel text-neutral-100 text-sm',
        'border border-playground-border',
        'placeholder:text-playground-muted',
        'transition-colors duration-150',
        'focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = 'Input';

export { Input };
