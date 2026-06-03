'use client';

/**
 * @module @enterstellar-ai/react/hooks/use-enterstellar-context
 * @description Hook to access core Enterstellar services from the nearest `<Provider>`.
 *
 * Returns `{ registry, compiler, store, telemetry, cache, adapters }` — the
 * core services plus optional cache and adapters.
 * The agent connection is accessed separately via `useEnterstellarAgent()` per RE9
 * (different lifecycle).
 *
 * **Throws** if called outside an `<Provider>` — no silent degradation (RE5).
 *
 * @see Design Choice RE9 — `useEnterstellar()` returns core services only
 * @see Design Choice RE5 — throws outside provider
 *
 * @example
 * ```tsx
 * import { useEnterstellar } from '@enterstellar-ai/react';
 *
 * function MyComponent() {
 *   const { registry, compiler, store, telemetry } = useEnterstellar();
 *   const components = registry.list();
 *   // ...
 * }
 * ```
 */

import { useContext } from 'react';

import type { EnterstellarRegistry } from '@enterstellar-ai/registry';
import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import type { EnterstellarStore } from '@enterstellar-ai/state';
import type { TelemetryCollector } from '@enterstellar-ai/telemetry';
import type { RenderCache } from '@enterstellar-ai/cache';
import { EnterstellarError } from '@enterstellar-ai/types';

import { EnterstellarContext, Enterstellar_CONTEXT_NONE } from '../provider.js';
import type { EnterstellarAdapters } from '../types.js';

// ---------------------------------------------------------------------------
// Return Type
// ---------------------------------------------------------------------------

/**
 * Shape returned by `useEnterstellar()`.
 *
 * Contains the four core Enterstellar services. Agent connection is deliberately
 * excluded — use `useEnterstellarAgent()` for that.
 *
 * @see Design Choice RE9
 */
export type UseEnterstellarContextResult = {
    /** The component registry instance. */
    readonly registry: EnterstellarRegistry;
    /** The UI compiler instance. */
    readonly compiler: EnterstellarCompiler;
    /** The state store instance. */
    readonly store: EnterstellarStore;
    /** The telemetry collector instance. */
    readonly telemetry: TelemetryCollector;
    /**
     * The render cache instance, or `null` if not provided.
     * @see Design Choice CA3 — global cache, opt-in via provider.
     */
    readonly cache: RenderCache | null;
    /**
     * The adapters object. Defaults to `{}` when not provided.
     * All fields are optional — consume via `adapters.error`, etc.
     * @see Design Choice AD1 — adapter injection via provider.
     */
    readonly adapters: EnterstellarAdapters;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Accesses the core Enterstellar services from the nearest `<Provider>`.
 *
 * Returns `{ registry, compiler, store, telemetry }`. These are the
 * same instances that `<Zone>` uses internally — hooks give consumers
 * access for custom integrations, testing, and advanced workflows.
 *
 * **Init-phase behavior:** This hook throws `ENS-3001` both when called
 * outside an `<Provider>` AND during async provider initialization
 * (when store/telemetry are still being created). Components that need
 * to handle the init phase gracefully (e.g., showing a loading state)
 * should use `useContext(EnterstellarContext)` directly and check for `null`.
 *
 * @returns The core Enterstellar services.
 * @throws {EnterstellarError} `ENS-3001` if called outside an `<Provider>`,
 *   or during async provider initialization when context is `null`.
 *
 * @see Design Choice RE9 — core services only, agent is separate
 * @see Design Choice RE5 — throws, no silent degradation
 */
export function useEnterstellar(): UseEnterstellarContextResult {
    const context = useContext(EnterstellarContext);

    if (context === null || context === Enterstellar_CONTEXT_NONE) {
        throw new EnterstellarError(
            'ENS-3001',
            'react',
            'useEnterstellar() must be used within an <Provider>. No EnterstellarContext found.',
            false,
        );
    }

    return {
        registry: context.registry,
        compiler: context.compiler,
        store: context.store,
        telemetry: context.telemetry,
        cache: context.cache,
        adapters: context.adapters,
    };
}
