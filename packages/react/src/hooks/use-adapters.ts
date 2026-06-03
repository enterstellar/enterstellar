'use client';

/**
 * @module @enterstellar-ai/react/hooks/use-enterstellar-adapters
 * @description Convenience hook for accessing Enterstellar adapters from context.
 *
 * Returns the `EnterstellarAdapters` object from the nearest `<Provider>`.
 * This is a thin ergonomic alias over `useEnterstellar().adapters` for
 * consumers who only need adapter access without destructuring the full
 * context value.
 *
 * The canonical source of truth for adapters remains `useEnterstellar()`.
 * This hook simply forwards to it.
 *
 * **Throws** if called outside an `<Provider>` — inherits the
 * `ENS-3001` guard from `useEnterstellar()` (RE5: no silent degradation).
 *
 * @see Design Choice AD1 — adapter injection via context.
 * @see Design Choice RE5 — throws outside provider.
 * @see Design Choice RE9 — `useEnterstellar()` returns core services.
 *
 * @example
 * ```tsx
 * import { useEnterstellarAdapters } from '@enterstellar-ai/react';
 *
 * function MyComponent() {
 *   const adapters = useEnterstellarAdapters();
 *
 *   // Each adapter is optional — check before use
 *   if (adapters.error !== undefined) {
 *     await adapters.error.report(someError, { zone: 'sidebar' });
 *   }
 *
 *   if (adapters.data !== undefined) {
 *     const result = await adapters.data.query('patients', { limit: 10 });
 *   }
 * }
 * ```
 */

import { useEnterstellar } from './use-enterstellar.js';
import type { EnterstellarAdapters } from '../types.js';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the Enterstellar adapters from the nearest `<Provider>`.
 *
 * Returns the `EnterstellarAdapters` object containing optional adapter instances
 * for authentication, data fetching, error handling, and analytics.
 * All adapter fields are optional — consumers must check availability
 * before invoking adapter methods.
 *
 * This is a convenience alias over `useEnterstellar().adapters`.
 * The canonical source of truth remains `useEnterstellar()`.
 *
 * @returns The `EnterstellarAdapters` object from context. Defaults to `{}`
 *   (empty object) when no adapters are provided to `<Provider>`.
 *
 * @throws `EnterstellarError` with code `ENS-3001` if called outside an
 *   `<Provider>` — inherited from `useEnterstellar()`.
 *
 * @see {@link EnterstellarAdapters} — type definition with all adapter interfaces.
 * @see Design Choice AD1 — adapter injection via context.
 */
export function useEnterstellarAdapters(): EnterstellarAdapters {
    return useEnterstellar().adapters;
}
