'use client';

/**
 * @module @enterstellar-ai/react/enterstellar-provider
 * @description Root context provider for the Enterstellar ecosystem in React.
 *
 * `<Provider>` wraps the application (or subtree) that uses Enterstellar zones.
 * It creates and manages the React contexts for all Enterstellar services:
 * - `EnterstellarRegistry` (required — the component deck)
 * - `EnterstellarCompiler` (auto-created if omitted — RE1)
 * - `EnterstellarStore` (auto-created if omitted — RE2)
 * - `TelemetryCollector` (auto-created if omitted — RE2)
 * - `EnterstellarAgentConnection` (optional — RE3, consumer manages transport)
 * - `RendererRegistry` (module-level singleton from `renderer-registry.ts`)
 *
 * **Client-side only** per RE4 — this is a `'use client'` component.
 *
 * @see Design Choices RE1, RE2, RE3, RE4
 * @see Appendix E P3 (threadId)
 *
 * @example
 * ```tsx
 * import { Provider } from '@enterstellar-ai/react';
 * import { createRegistry } from '@enterstellar-ai/registry';
 * import { createAgentConnection } from '@enterstellar-ai/connection';
 *
 * const registry = createRegistry({ components: [...] });
 * const connection = createAgentConnection({ url: 'wss://agent.example.com' });
 *
 * function App() {
 *   return (
 *     <Provider registry={registry} connection={connection} threadId="session-123">
 *       <Zone name="main" determinism={1.0} />
 *     </Provider>
 *   );
 * }
 * ```
 */

import {
    createContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import { createCompiler } from '@enterstellar-ai/compiler';
import type { EnterstellarStore } from '@enterstellar-ai/state';
import { createEnterstellarStore } from '@enterstellar-ai/state';
import type { TelemetryCollector } from '@enterstellar-ai/telemetry';
import { createTelemetryCollector } from '@enterstellar-ai/telemetry';
import { z } from 'zod';
import { ZoneTraceSchema } from '@enterstellar-ai/types';

import { rendererRegistry } from './renderer-registry.js';
import { GenericCard } from './defaults/generic-card.js';
import type {
    EnterstellarContextValue,
    EnterstellarAgentContextValue,
    ProviderProps,
    EnterstellarComponentRenderer,
} from './types.js';

// ---------------------------------------------------------------------------
// GenericCard Auto-Registration (RE1, R6)
// ---------------------------------------------------------------------------

/**
 * Auto-registers the `GenericCard` renderer in the module-level singleton.
 *
 * This runs at import time — before any `<Provider>` mounts — so the
 * fallback component is always available when `Zone` needs it.
 * The `has()` guard ensures idempotency during hot module replacement.
 *
 * @see Design Choice RE1 — auto-create with concrete `GenericCard` fallback.
 * @see Design Choice R6 — renderer registered separately from contract.
 */
if (!rendererRegistry.has('GenericCard')) {
    // Cast required: GenericCard accepts typed GenericCardProps, but the
    // RendererRegistry uses a generic Record<string, unknown> signature.
    // The compiler pipeline (C6) injects the correct props at runtime.
    rendererRegistry.register(
        'GenericCard',
        GenericCard as unknown as EnterstellarComponentRenderer,
    );
}

// ---------------------------------------------------------------------------
// React Contexts
// ---------------------------------------------------------------------------

/**
 * Sentinel value used as the `createContext` default for `EnterstellarContext`.
 *
 * **Purpose:** Distinguishes "no `<Provider>` in the tree" from
 * "provider exists but is still initializing (async store/telemetry)."
 *
 * - `Enterstellar_CONTEXT_NONE` → no provider at all → zone throws `ENS-3001` (RE5).
 * - `null` → provider is initializing → zone renders `fallback` (Bible §4.3 Rule 6).
 * - `EnterstellarContextValue` → provider is ready → normal operation.
 *
 * This is NOT exported from the package's public API. It is exported from
 * this module so that `enterstellar-zone.tsx` can import it for the sentinel check.
 *
 * @see Design Choice RE5 — no silent degradation.
 * @see Bible §4.3 Rule 6 — render fallback during init.
 * @see Design Choice L5 — incrementally adoptable.
 *
 * @internal
 */
export const Enterstellar_CONTEXT_NONE: unique symbol = Symbol('no-enterstellar-provider');

/**
 * React context for core Enterstellar services.
 *
 * The default value is `Enterstellar_CONTEXT_NONE` — a sentinel symbol that tells
 * zones "there is no `<Provider>` above you" (throw `ENS-3001`).
 *
 * During provider init, the value is `null` — zones detect this and render
 * their fallback prop per Bible §4.3 Rule 6.
 *
 * After init, the value is a fully-populated `EnterstellarContextValue`.
 *
 * @internal
 */
export const EnterstellarContext = createContext<EnterstellarContextValue | null | typeof Enterstellar_CONTEXT_NONE>(Enterstellar_CONTEXT_NONE);

/**
 * React context for the agent connection.
 *
 * Separated from `EnterstellarContext` per RE9 — the connection has a different
 * lifecycle and may not exist.
 *
 * @internal
 */
export const EnterstellarAgentContext = createContext<EnterstellarAgentContextValue>({
    connection: null,
});

// ---------------------------------------------------------------------------
// Auto-Creation Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a default `EnterstellarCompiler` from the registry with fallback strategy.
 *
 * @see Design Choice RE1 — auto-create with `GenericCard` fallback.
 *
 * @internal
 */
function createDefaultCompiler(
    registry: ProviderProps['registry'],
): EnterstellarCompiler {
    return createCompiler({
        registry,
        onValidationFailure: {
            strategy: 'fallback',
            maxRetries: 2,
            fallbackComponent: 'GenericCard',
        },
    });
}

/**
 * Creates a default `TelemetryCollector` with sensible defaults.
 *
 * Async because `createTelemetryCollector()` opens an IndexedDB connection
 * when `queueStrategy: 'indexedDB'` (TL4). The provider tracks initialization
 * state via `useState` + `useEffect`, matching the `createEnterstellarStore()` pattern.
 *
 * @see Design Choice RE2 — `queueStrategy: 'indexedDB'`, `flushIntervalMs: 30000`.
 * @see Design Choice TL4 — IndexedDB queue uses separate `enterstellar-telemetry` DB.
 *
 * @internal
 */
async function createDefaultTelemetry(
    registrySize: number,
): Promise<TelemetryCollector> {
    return createTelemetryCollector({
        platform: 'web',
        registrySize,
        queueStrategy: 'indexedDB',
        flushIntervalMs: 30_000,
    });
}

// ---------------------------------------------------------------------------
// Trace Extension Schema
// ---------------------------------------------------------------------------

/**
 * Schema for the `'traces'` store extension.
 *
 * Uses the canonical `ZoneTraceSchema` from `@enterstellar-ai/types` (F.1 resolution).
 * Wrapped in `z.array()` because the store extension holds an array of traces.
 *
 * **Why the `Parameters<EnterstellarStore['extend']>[1]` cast?**
 * Zod v4 has two type surfaces — `classic` and `core`. Under
 * `exactOptionalPropertyTypes: true`, the classic `z.ZodType` annotation
 * is NOT structurally assignable to the core type used by `EnterstellarStore.extend()`.
 * Using `Parameters` extracts the exact parameter type from the interface,
 * guaranteeing type-level compatibility without unsafe casts.
 *
 * @see Design Choice S2 — typed extension point.
 * @see ZoneTraceSchema from `@enterstellar-ai/types/trace` — the canonical source.
 * @internal
 */
const ZONE_TRACE_ARRAY_SCHEMA = z.array(
    ZoneTraceSchema,
) as unknown as Parameters<EnterstellarStore['extend']>[1];

// ---------------------------------------------------------------------------
// Provider Component
// ---------------------------------------------------------------------------

/**
 * Root context provider for the Enterstellar ecosystem.
 *
 * Wraps the application (or subtree) that uses `<Zone>` components.
 * Auto-creates `EnterstellarCompiler`, `EnterstellarStore`, and `TelemetryCollector`
 * with sensible defaults if not explicitly provided.
 *
 * **Client-side only** — this component uses the `'use client'` directive
 * and requires browser APIs.
 *
 * @param props - {@link ProviderProps}
 *
 * @see Design Choices RE1 (auto-create compiler), RE2 (auto-create store/telemetry),
 *      RE3 (consumer manages connection), RE4 (client-side only)
 * @see Appendix E P3 (threadId)
 */
export function Provider(props: ProviderProps): React.JSX.Element {
    const {
        registry,
        compiler: compilerProp,
        connection,
        store: storeProp,
        telemetry: telemetryProp,
        threadId,
        cache: cacheProp,
        adapters: adaptersProp,
        children,
    } = props;

    // -----------------------------------------------------------------------
    // Auto-created instances (stable refs across renders)
    // -----------------------------------------------------------------------

    /**
     * Auto-create compiler if not provided (RE1).
     * Memoized on `registry` identity — recreated only if registry changes.
     */
    const compiler = useMemo<EnterstellarCompiler>(
        () => compilerProp ?? createDefaultCompiler(registry),
        [compilerProp, registry],
    );

    /**
     * Auto-create store if not provided (RE2).
     * `createEnterstellarStore()` is async — we track initialization state.
     */
    const [autoStore, setAutoStore] = useState<EnterstellarStore | null>(null);
    const storeInitRef = useRef(false);

    useEffect(() => {
        // Only auto-create if consumer didn't provide a store
        if (storeProp !== undefined || storeInitRef.current) {
            return;
        }
        storeInitRef.current = true;

        void (async () => {
            const created = await createEnterstellarStore({
                persistence: 'indexed-db',
                maxTraces: 100,
            });
            setAutoStore(created);
        })();
    }, [storeProp]);

    const store = storeProp ?? autoStore;

    /**
     * Auto-create telemetry if not provided (RE2).
     * `createTelemetryCollector()` is async (IndexedDB queue opening, TL4)
     * — same `useState` + `useEffect` + init ref pattern as store above.
     */
    const [autoTelemetry, setAutoTelemetry] = useState<TelemetryCollector | null>(null);
    const telemetryInitRef = useRef(false);

    useEffect(() => {
        // Only auto-create if consumer didn't provide a collector
        if (telemetryProp !== undefined || telemetryInitRef.current) {
            return;
        }
        telemetryInitRef.current = true;

        void (async () => {
            const created = await createDefaultTelemetry(registry.size);
            setAutoTelemetry(created);
        })();
    }, [telemetryProp, registry.size]);

    const telemetry = telemetryProp ?? autoTelemetry;

    // -----------------------------------------------------------------------
    // Trace Extension Registration (S2, DT7, Q1-resolved)
    // -----------------------------------------------------------------------

    /**
     * Registers the `'traces'` store extension for full `ZoneTrace` persistence.
     *
     * This runs once when the store becomes available. The provider owns the
     * store lifecycle, so it is the canonical place for extension registration
     * — not individual `Zone` instances (which would race on mount).
     *
     * The `hasExtension()` guard ensures idempotency for:
     * - React StrictMode double-mounts
     * - Consumer-provided stores that already registered the extension
     *
     * The schema uses `ZONE_TRACE_ARRAY_SCHEMA` — a `z.array(ZoneTraceSchema)`
     * wrapping the canonical `ZoneTraceSchema` imported from `@enterstellar-ai/types`
     * (F.1 resolved). Single-source-of-truth for trace validation.
     *
     * @see Design Choice S2 — typed extension point.
     * @see Design Choice DT7 — DevTools accesses data via EnterstellarStore.
     * @see Design Choice S14 — max 100 traces with FIFO eviction.
     */
    useEffect(() => {
        if (store === null) {
            return;
        }

        if (!store.hasExtension('traces')) {
            store.extend('traces', ZONE_TRACE_ARRAY_SCHEMA);
        }
    }, [store]);

    // -----------------------------------------------------------------------
    // Thread ID propagation (P3)
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (store === null || threadId === undefined) {
            return;
        }
        const currentSession = store.get<{ id: string; threadId?: string }>('session');
        if (currentSession !== undefined) {
            store.set('session', { ...currentSession, threadId });
        }
    }, [store, threadId]);

    // -----------------------------------------------------------------------
    // Cleanup on unmount
    // -----------------------------------------------------------------------

    useEffect(() => {
        return () => {
            // Only destroy auto-created instances (not consumer-provided)
            if (storeProp === undefined && autoStore !== null) {
                autoStore.destroy();
            }
            if (telemetryProp === undefined && autoTelemetry !== null) {
                void autoTelemetry.dispose();
            }
        };
    }, [storeProp, autoStore, telemetryProp, autoTelemetry]);

    // -----------------------------------------------------------------------
    // DevTools Hook (dev-only — DT3)
    // -----------------------------------------------------------------------

    /**
     * Exposes a global hook for the Chrome Extension's page-hook script.
     *
     * The `__Enterstellar_DEVTOOLS_HOOK__` object provides the bridge with access
     * to the store and trace data. Only set in non-production environments
     * to ensure zero runtime cost in production bundles.
     *
     * The hook is cleaned up on provider unmount to prevent stale references.
     *
     * @see @enterstellar-ai/apps-devtools-extension/bridge/page-hook — reads this hook
     * @see Design Choice DT3 — tree-shakeable, zero prod bytes
     */
    useEffect(() => {
        if (process.env['NODE_ENV'] === 'production') {
            return;
        }

        if (store === null) {
            return;
        }

        const currentStore = store;

        (window as unknown as Record<string, unknown>)['__Enterstellar_DEVTOOLS_HOOK__'] = {
            version: '0.0.0',
            getTraces: (): readonly unknown[] => {
                const traces: unknown = currentStore.get('traces');
                if (!Array.isArray(traces)) {
                    return [];
                }
                return traces as readonly unknown[];
            },
            getState: (): Readonly<Record<string, unknown>> => {
                return currentStore.getSnapshot();
            },
        };

        return () => {
            delete (window as unknown as Record<string, unknown>)['__Enterstellar_DEVTOOLS_HOOK__'];
        };
    }, [store]);

    // -----------------------------------------------------------------------
    // Context Values
    // -----------------------------------------------------------------------

    const contextValue = useMemo<EnterstellarContextValue | null>(() => {
        // Wait for both store and telemetry initialization before providing context.
        // Zones will detect the missing context and render their fallback.
        if (store === null || telemetry === null) {
            return null;
        }
        return {
            registry,
            compiler,
            store,
            telemetry,
            rendererRegistry,
            cache: cacheProp ?? null,
            adapters: adaptersProp ?? {},
        };
    }, [registry, compiler, store, telemetry, cacheProp, adaptersProp]);

    const agentContextValue = useMemo<EnterstellarAgentContextValue>(
        () => ({ connection: connection ?? null }),
        [connection],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    // Always wrap children in EnterstellarContext.Provider — even during init.
    //
    // During init (contextValue === null): zones detect null and render
    // their fallback prop (Bible §4.3 Rule 6: "never show empty zone").
    //
    // After init: zones receive a fully-populated EnterstellarContextValue and
    // proceed with normal compilation.
    //
    // Zones genuinely outside any <Provider> receive the
    // Enterstellar_CONTEXT_NONE sentinel (the createContext default) and throw
    // ENS-3001 per RE5 — no silent degradation.
    return (
        <EnterstellarContext.Provider value={contextValue}>
            <EnterstellarAgentContext.Provider value={agentContextValue}>
                {children}
            </EnterstellarAgentContext.Provider>
        </EnterstellarContext.Provider>
    );
}
