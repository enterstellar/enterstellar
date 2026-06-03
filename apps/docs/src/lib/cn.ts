/**
 * Enterstellar Docs — Class Name Utility
 *
 * Re-exports `twMerge` from `tailwind-merge` as the canonical `cn()`
 * utility. Used across all components to merge and deduplicate Tailwind
 * CSS class strings with conflict resolution.
 *
 * @example
 * ```ts
 * import { cn } from '@/lib/cn';
 * cn('px-2 py-1', isActive && 'bg-fd-primary text-white');
 * ```
 *
 * @module
 */
export { twMerge as cn } from 'tailwind-merge';
