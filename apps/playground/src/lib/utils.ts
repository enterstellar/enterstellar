/**
 * Enterstellar Playground — Utility Functions
 *
 * Shared utility functions used across the playground application.
 * This module is the canonical import for className composition
 * and common formatting helpers.
 *
 * @module lib/utils
 */
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Composes CSS class names with Tailwind-aware deduplication.
 *
 * Combines `clsx` (conditional class joining) with `tailwind-merge`
 * (conflict resolution). This ensures that when multiple Tailwind
 * utilities target the same CSS property, the last one wins:
 *
 * @example
 * ```tsx
 * // Conditional classes — standard clsx behavior
 * cn('px-4', isActive && 'bg-primary-500', !isActive && 'bg-neutral-800')
 *
 * // Tailwind conflict resolution — twMerge behavior
 * cn('bg-red-500 text-white', 'bg-blue-500')
 * // → 'text-white bg-blue-500' (bg-red-500 removed, bg-blue-500 wins)
 * ```
 *
 * @param inputs - Any number of class values: strings, arrays, objects,
 *   or `undefined`/`null`/`false` (all falsy values are stripped).
 * @returns A single, deduplicated class string ready for `className`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a duration in milliseconds to a human-readable latency string.
 *
 * Used by the latency badge and pipeline visualizer to display
 * compilation and request timing with appropriate precision.
 *
 * @example
 * ```ts
 * formatLatency(3.214)  // → '3.2ms'
 * formatLatency(0.891)  // → '0.9ms'
 * formatLatency(42.0)   // → '42ms'
 * formatLatency(1523)   // → '1.5s'
 * ```
 *
 * @param ms - Duration in milliseconds.
 * @returns Formatted latency string with appropriate unit (ms or s).
 */
export function formatLatency(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms >= 10) {
    return `${String(Math.round(ms))}ms`;
  }
  return `${ms.toFixed(1)}ms`;
}

/**
 * Returns a Tailwind color class based on latency thresholds.
 *
 * Provides visual feedback for compilation speed:
 * - Green (success): Under 5ms — compiler overhead is negligible
 * - Amber (warning): Under 20ms — acceptable for most use cases
 * - Red (error): Over 20ms — atypical, may indicate issues
 *
 * @param ms - Compilation latency in milliseconds.
 * @returns Tailwind text color class string.
 */
export function latencyColor(ms: number): string {
  if (ms < 5) return 'text-success';
  if (ms < 20) return 'text-warning';
  return 'text-error';
}
