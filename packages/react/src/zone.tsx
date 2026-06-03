'use client';

/**
 * @module @enterstellar-ai/react/enterstellar-zone
 * @description The core zone component — renders AI-generated content within
 * a determinism-controlled, error-isolated container.
 *
 * `<Zone>` is the primary integration point for Enterstellar in a React app.
 * Each zone:
 *
 * 1. Wraps content in a `<div>` with `data-enterstellar-zone` (RE8).
 * 2. Enforces determinism rules (0.0 = static, 0.0–1.0 = hybrid, 1.0 = dynamic).
 * 3. Listens for intents from the agent connection.
 * 4. Checks the render cache before compilation (CA1, CA3).
 * 5. Compiles intents through the `EnterstellarCompiler` (L3 — never bypassed).
 * 6. Manages lifecycle state via `LifecycleManager` (LC1–LC3).
 * 7. Resolves the renderer from the `RendererRegistry` (RE13).
 * 8. Renders via `<LifecycleWrapper>` with state → component resolution (LC7).
 * 9. Wraps everything in a `ZoneErrorBoundary` for crash isolation (RE16).
 * 10. Wires `ErrorAdapter` for sanitize/report/shouldRetry (AD2, AD5).
 * 11. Optionally shows the provenance badge (RE7).
 *
 * **Latest-intent-wins (P14):** When a new intent arrives, the previous
 * compilation is discarded. No queue, no merge.
 *
 * **Activation strategies (RE6):**
 * - `'mount'` — call agent on mount (default).
 * - `'visible'` — call agent when zone enters viewport.
 * - `'manual'` — consumer controls activation programmatically.
 *
 * **Retry mechanisms (both coexist):**
 * - Auto-retry (RE17): programmatic with backoff, delegates to ErrorAdapter.
 * - User-initiated retry (LC9): `onRetry` from LifecycleWrapper error card.
 *
 * @see Bible §5.3
 * @see Design Choices RE5–RE8, RE13–RE18, CA1–CA7, LC1–LC9, AD2, AD5
 * @see Appendix E P6, P13, P14
 *
 * @example
 * ```tsx
 * <Zone
 *   name="patient-sidebar"
 *   determinism={1.0}
 *   fallback={<Loading />}
 *   showProvenance
 *   timeout={15000}
 *   onError={(err, trace) => console.error(err, trace)}
 * />
 * ```
 */

import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import type {
    ComponentIntent,
    CompilationResult,
    CompilationProvenance,
    CompilationStatus,
    ComponentContract,
    ZoneTrace,
} from '@enterstellar-ai/types';
import { EnterstellarError, createZoneId } from '@enterstellar-ai/types';
import { buildCacheKey } from '@enterstellar-ai/cache';
import { createLifecycleManager, createStreamingAssembler } from '@enterstellar-ai/lifecycle';
import type { LifecycleManager, LifecycleState, StreamingAssembler } from '@enterstellar-ai/lifecycle';

import { EnterstellarContext, EnterstellarAgentContext, Enterstellar_CONTEXT_NONE } from './provider.js';
import { ZoneErrorBoundary } from './zone-error-boundary.js';
import { ProvenanceBadge } from './provenance-badge.js';
import { LifecycleWrapper } from './lifecycle-wrapper.js';
import type {
    ZoneProps,
} from './types.js';
import {
    DEFAULT_RETRY_POLICY,
    DEFAULT_AGENT_TIMEOUT_MS,
} from './types.js';

// ---------------------------------------------------------------------------
// Zone Render State (internal — expanded to 6 phases)
// ---------------------------------------------------------------------------

/**
 * Internal discriminated union for a zone's render lifecycle.
 *
 * Aligns with `LifecycleState` vocabulary (6 states) but carries
 * React-specific render payloads (compilation results, props, errors).
 * The `LifecycleManager` is the FSM truth; this type carries the
 * render-side data that React needs to display the correct content.
 *
 * Changes from previous version:
 * - `rendered` renamed to `ready` for FSM alignment.
 * - Added `streaming` phase with partial props.
 * - Added `empty` phase.
 *
 * @see Design Choice RE15 — lifecycle loading state, NOT React Suspense.
 * @internal
 */
type ZoneRenderState =
    | { readonly phase: 'idle' }
    | { readonly phase: 'loading' }
    | { readonly phase: 'streaming'; readonly partialProps: Record<string, unknown>; readonly componentName: string }
    | { readonly phase: 'ready'; readonly result: CompilationResult; readonly componentProps: Record<string, unknown> }
    | { readonly phase: 'error'; readonly error: Error }
    | { readonly phase: 'empty' };

/**
 * Internal type for intent events received from the agent connection.
 *
 * The raw `ComponentIntent` type has no `zone` field — zone targeting is
 * a transport-layer concern. The connection dispatches events with zone
 * metadata attached, which `Zone` uses to filter relevant intents.
 *
 * @internal
 */
type ZoneIntentEvent = {
    readonly zone: string;
    readonly intent: ComponentIntent;
};

/**
 * Runtime type guard for intent events received from the agent connection.
 *
 * Validates the shape of `unknown` data before treating it as a
 * `ZoneIntentEvent`. This replaces the previous unsafe `data as ZoneIntentEvent`
 * cast with proper runtime narrowing per L8.
 *
 * @param data - The unknown data received from `connection.on('intent', ...)`.
 * @returns `true` if the data has the expected `{ zone: string, intent: object }` shape.
 *
 * @internal
 */
function isZoneIntentEvent(data: unknown): data is ZoneIntentEvent {
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    const obj = data as Record<string, unknown>;
    return (
        typeof obj['zone'] === 'string' &&
        typeof obj['intent'] === 'object' &&
        obj['intent'] !== null
    );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of full `ZoneTrace` objects stored in the `'traces'`
 * extension before FIFO eviction.
 *
 * Matches the default `maxTraces` config in `createEnterstellarStore()` (S14).
 * When the trace array exceeds this limit, the oldest traces are discarded.
 *
 * @see Design Choice S14 — FIFO eviction, configurable via `maxTraces`.
 * @internal
 */
const MAX_ZONE_TRACES = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a component name is allowed in this zone.
 * Empty `allowedComponents` = all allowed.
 *
 * @internal
 */
function isComponentAllowed(
    componentName: string,
    allowedComponents: readonly string[] | undefined,
): boolean {
    if (allowedComponents === undefined || allowedComponents.length === 0) {
        return true;
    }
    return allowedComponents.includes(componentName);
}

/**
 * Calculates exponential backoff delay.
 *
 * @param attempt - Current attempt number (0-indexed).
 * @param backoff - Backoff strategy.
 * @returns Delay in milliseconds.
 *
 * @internal
 */
function getRetryDelay(
    attempt: number,
    backoff: 'exponential' | 'linear' | 'none',
): number {
    switch (backoff) {
        case 'exponential': {
            return Math.min(1000 * Math.pow(2, attempt), 30_000);
        }
        case 'linear': {
            return 1000 * (attempt + 1);
        }
        case 'none': {
            return 0;
        }
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * The core Enterstellar zone component.
 *
 * Each `<Zone>` is a self-contained container for AI-rendered content.
 * It handles intent reception, cache lookup, compilation, lifecycle
 * management, renderer resolution, ErrorAdapter wiring, and error isolation.
 *
 * @param props - {@link ZoneProps}
 *
 * @see Bible §5.3
 * @see Design Choices RE5–RE8, RE13–RE18, CA1–CA7, LC1–LC9
 */
export function Zone(props: ZoneProps): React.JSX.Element {
    const {
        name,
        determinism = 1.0,
        allowedComponents,
        fallback = null,
        fallbackComponent = 'GenericCard',
        activateOn = 'mount',
        showProvenance = false,
        timeout = DEFAULT_AGENT_TIMEOUT_MS,
        retryPolicy = DEFAULT_RETRY_POLICY,
        onError,
        className,
        style,
        children,
    } = props;

    // -----------------------------------------------------------------------
    // Context Access
    // -----------------------------------------------------------------------

    const enterstellarContext = useContext(EnterstellarContext);
    const agentContext = useContext(EnterstellarAgentContext);

    // RE5: Zone outside Provider → throw ENS-3001.
    // The Enterstellar_CONTEXT_NONE sentinel is the createContext default — only
    // received when no <Provider> exists above this zone.
    if (enterstellarContext === Enterstellar_CONTEXT_NONE) {
        throw new EnterstellarError(
            'ENS-3001',
            'react',
            `<Zone name="${name}"> must be rendered inside an <Provider>. No EnterstellarContext found.`,
            false,
        );
    }

    // When enterstellarContext is null, the provider is still initializing
    // (async store/telemetry creation per RE2). The init-state fallback
    // guard at the bottom of this component (before the main JSX return)
    // renders the fallback div and prevents side effects from firing.
    //
    // During the null-context render pass:
    // - useRef/useState calls below initialize with defaults (no context needed).
    // - useCallback closures capture `null` references but are never invoked
    //   (effects run AFTER render, and the init render returns early).
    // - useMemo computations either short-circuit (renderState.phase !== 'ready')
    //   or produce harmless null results.
    //
    // On the next render (after init), enterstellarContext is a valid EnterstellarContextValue
    // and all hooks re-execute with correct service references.
    const isInitializing = enterstellarContext === null;

    // Safe destructuring: provides typed null defaults during init.
    // These are NEVER used for actual operations — the fallback guard
    // below prevents any code path that would invoke them.
    const registry = isInitializing ? null : enterstellarContext.registry;
    const compiler = isInitializing ? null : enterstellarContext.compiler;
    const rendererRegistry = isInitializing ? null : enterstellarContext.rendererRegistry;
    const store = isInitializing ? null : enterstellarContext.store;
    const cache = isInitializing ? null : enterstellarContext.cache;
    const adapters = isInitializing ? {} as const : enterstellarContext.adapters;
    const { connection } = agentContext;

    // -----------------------------------------------------------------------
    // Refs & State
    // -----------------------------------------------------------------------

    const zoneRef = useRef<HTMLDivElement>(null);
    const errorBoundaryRef = useRef<ZoneErrorBoundary>(null);
    const compilationIdRef = useRef(0); // For P14: latest-intent-wins

    const [renderState, setRenderState] = useState<ZoneRenderState>({ phase: 'idle' });

    /**
     * F7-1 fix: Use a ref instead of state for latestTrace in the
     * compileIntent callback to prevent unnecessary agent re-subscriptions.
     * The state setter `setLatestTrace` was in the useCallback deps,
     * causing the callback identity to change on every compilation,
     * which triggered re-subscriptions in the agent connection effect.
     */
    const latestTraceRef = useRef<ZoneTrace | null>(null);

    /**
     * Current component contract resolved from the registry.
     * Used by `LifecycleWrapper` for custom state renderer lookup (LC7).
     * Updated after successful compilation.
     */
    const [currentContract, setCurrentContract] = useState<ComponentContract | null>(null);

    // -----------------------------------------------------------------------
    // LifecycleManager (LC1–LC3) — per-zone FSM
    // -----------------------------------------------------------------------

    /**
     * Per-zone lifecycle manager.
     * Created once on mount, disposed on unmount. The manager owns:
     * - State transitions with exhaustive validation (LC1, LC2).
     * - Internal timeout timer (LC3 — auto-transitions to error).
     * - Retry count tracking.
     *
     * @see Design Choice LC1 — custom FSM, not xstate.
     * @see Design Choice LC3 — timeout managed internally.
     */
    const lifecycleManagerRef = useRef<LifecycleManager | null>(null);

    lifecycleManagerRef.current ??= createLifecycleManager({
        timeoutMs: timeout,
        maxRetries: retryPolicy.maxRetries,
    });


    // -----------------------------------------------------------------------
    // StreamingAssembler (LC4–LC6) — per-zone prop accumulator
    // -----------------------------------------------------------------------

    /**
     * Per-zone streaming assembler.
     * Replaces the previous `useReducer(streamingReducer)` pattern.
     * Accumulates path-based prop fragments via `apply(fragment)` and
     * checks structural completeness via `isComplete(schema)`.
     *
     * @see Design Choice LC4 — raw prop fragments with path-based updates.
     * @see Design Choice LC5 — structural completeness via Zod.
     * @see Design Choice LC6 — no optimistic defaults.
     */
    const assemblerRef = useRef<StreamingAssembler | null>(null);

    assemblerRef.current ??= createStreamingAssembler();

    const assembler = assemblerRef.current;

    // -----------------------------------------------------------------------
    // LifecycleManager Cleanup (dispose on unmount)
    // -----------------------------------------------------------------------

    useEffect(() => {
        return () => {
            lifecycleManagerRef.current?.dispose();
        };
    }, []);

    /** Stable zone ID — generated once per mount. */
    const zoneId = useMemo(() => createZoneId(name), [name]);

    // -----------------------------------------------------------------------
    // User-Initiated Retry (LC9)
    // -----------------------------------------------------------------------

    /**
     * Stores the last received intent for user-initiated retry (LC9).
     * When the user clicks "Retry" in `EnterstellarErrorCard`, `stableHandleRetry`
     * reads this ref to re-trigger compilation.
     *
     * @see `stableHandleRetry` (line ~705) — the actual retry callback.
     */
    const lastIntentRef = useRef<ComponentIntent | null>(null);

    // -----------------------------------------------------------------------
    // Core Compilation Pipeline
    // -----------------------------------------------------------------------

    /**
     * Compiles an intent and updates the render state.
     *
     * This is the heart of `<Zone>`:
     * 1. Increment compilation ID (P14: latest intent wins).
     * 2. Set loading state (triggers LifecycleManager timeout).
     * 3. Validate allowed components.
     * 4. Check render cache (CA1: intentHash + componentName).
     * 5. Run through compiler (L3: never bypassed) on cache miss.
     * 6. Wire ErrorAdapter (AD2): sanitize, report, shouldRetry.
     * 7. Cache successful results (CA2).
     * 8. Set ready state with compiled props.
     *
     * @internal
     */
    const compileIntent = useCallback(
        async (intent: ComponentIntent, attempt = 0): Promise<void> => {
            // Init-state guard: during provider init, services are null.
            // This callback is never invoked during init (effects don't fire
            // on the fallback render), but TypeScript needs the guard.
            if (!store || !compiler) return;

            // Store intent for user-initiated retry (LC9)
            lastIntentRef.current = intent;

            // P14: latest intent wins — increment compilation ID only on
            // the initial attempt (attempt 0). Retries reuse the same ID
            // so they are also discarded if a newer intent arrives.
            const currentCompilationId = attempt === 0
                ? ++compilationIdRef.current
                : compilationIdRef.current;

            // Reset error boundary and assembler on initial attempt
            if (attempt === 0) {
                errorBoundaryRef.current?.resetErrorBoundary();
                assembler.reset();
            }

            setRenderState({ phase: 'loading' });

            const compilationStart = Date.now();

            try {
                // Check allowed components before compilation
                if (!isComponentAllowed(intent.component, allowedComponents)) {
                    const error = new EnterstellarError(
                        'ENS-3003',
                        'react',
                        `Component "${intent.component}" is not allowed in zone "${name}". ` +
                        `Allowed: [${allowedComponents?.join(', ') ?? 'all'}].`,
                        false,
                    );
                    setRenderState({ phase: 'error', error });
                    onError?.(error, null);
                    return;
                }

                // ---------------------------------------------------------
                // Cache Lookup (CA1, CA3 — before compilation, L3-safe)
                // ---------------------------------------------------------
                if (cache !== null) {
                    const cacheKey = buildCacheKey(intent.component, intent.component);
                    const cached = cache.get(cacheKey);

                    if (cached !== undefined) {
                        // Cache HIT — skip compilation entirely.
                        // L3 compliance: the compiler was run when this entry
                        // was originally cached. This is memoization, not bypass.

                        // P14: Discard if a newer intent arrived
                        if (currentCompilationId !== compilationIdRef.current) {
                            return;
                        }

                        // L4: Build trace with cache hit metadata
                        const trace: ZoneTrace = {
                            id: `${name}-${String(currentCompilationId)}-${String(Date.now())}`,
                            intent,
                            compilation: {
                                status: cached.compilationResult.status,
                                errors: cached.compilationResult.errors,
                                selfCorrectionAttempts: cached.compilationResult.selfCorrectionAttempts,
                            },
                            provenance: cached.compilationResult.provenance,
                            metrics: {
                                totalMs: Date.now() - compilationStart,
                                retryAttempt: 0,
                            },
                            timestamp: new Date().toISOString(),
                        };

                        latestTraceRef.current = trace;

                        // Write full ZoneTrace to 'traces' extension (L4, DT7, S14)
                        const existingTraces = store.get<readonly ZoneTrace[]>('traces') ?? [];
                        const updatedTraces = [...existingTraces, trace];
                        store.set(
                            'traces',
                            updatedTraces.length > MAX_ZONE_TRACES
                                ? updatedTraces.slice(updatedTraces.length - MAX_ZONE_TRACES)
                                : updatedTraces,
                        );

                        // Write trace ID to traceIds (S2 fixed schema, lightweight index)
                        const existingIds = store.get<readonly string[]>('traceIds') ?? [];
                        store.set('traceIds', [...existingIds, trace.id]);

                        // Render from cached compilation result
                        const compiledProps: Record<string, unknown> = { ...cached.compilationResult.props };
                        setRenderState({
                            phase: 'ready',
                            result: cached.compilationResult,
                            componentProps: compiledProps,
                        });
                        return;
                    }
                }

                // L3: Compile through the compiler — never bypassed
                const result: CompilationResult = await compiler.compile(intent, {
                    agent: 'enterstellar-zone',
                });

                // P14: Discard if a newer intent arrived while compiling
                if (currentCompilationId !== compilationIdRef.current) {
                    return;
                }

                // L4: Build zone-level trace from compilation result
                const trace: ZoneTrace = {
                    id: `${name}-${String(currentCompilationId)}-${String(Date.now())}`,
                    intent,
                    compilation: {
                        status: result.status,
                        errors: result.errors,
                        selfCorrectionAttempts: result.selfCorrectionAttempts,
                    },
                    provenance: result.provenance,
                    metrics: {
                        totalMs: Date.now() - compilationStart,
                        retryAttempt: attempt,
                    },
                    timestamp: new Date().toISOString(),
                };

                latestTraceRef.current = trace;

                // Write full ZoneTrace to 'traces' extension (L4, DT7, S14)
                const existingTraces = store.get<readonly ZoneTrace[]>('traces') ?? [];
                const updatedTraces = [...existingTraces, trace];
                store.set(
                    'traces',
                    updatedTraces.length > MAX_ZONE_TRACES
                        ? updatedTraces.slice(updatedTraces.length - MAX_ZONE_TRACES)
                        : updatedTraces,
                );

                // Write trace ID to traceIds (S2 fixed schema, lightweight index)
                const existingIds = store.get<readonly string[]>('traceIds') ?? [];
                store.set('traceIds', [...existingIds, trace.id]);

                // Handle compilation failure — retry with backoff (RE17)
                if (result.status === 'fail') {
                    // ---------------------------------------------------------
                    // ErrorAdapter wiring: shouldRetry (AD2)
                    // ---------------------------------------------------------
                    // If ErrorAdapter is available, delegate retry decision
                    // to it. Otherwise fallback to built-in retryPolicy.
                    // ---------------------------------------------------------
                    const failError = new EnterstellarError(
                        'ENS-3004',
                        'react',
                        `Compilation failed for "${intent.component}" in zone "${name}".`,
                        true,
                    );

                    let shouldRetry = retryPolicy.auto && attempt < retryPolicy.maxRetries;

                    if (adapters.error?.shouldRetry !== undefined) {
                        try {
                            shouldRetry = await adapters.error.shouldRetry(failError, attempt);
                        } catch {
                            // ErrorAdapter failure — fallback to built-in policy
                        }
                    }

                    if (shouldRetry) {
                        const delay = getRetryDelay(attempt, retryPolicy.backoff);
                        await new Promise<void>((resolve) => {
                            setTimeout(resolve, delay);
                        });

                        // P14: Re-check before retrying
                        if (currentCompilationId !== compilationIdRef.current) {
                            return;
                        }

                        await compileIntent(intent, attempt + 1);
                        return;
                    }

                    // All retries exhausted — surface the error
                    const errorMessage = result.errors
                        .map((e) => `${e.path}: ${e.message}`)
                        .join('; ');
                    const finalError = new EnterstellarError(
                        'ENS-3004',
                        'react',
                        `Compilation failed for "${intent.component}" in zone "${name}" ` +
                        `after ${String(attempt + 1)} attempt(s): ${errorMessage}`,
                        true,
                    );

                    // ---------------------------------------------------------
                    // ErrorAdapter wiring: sanitize + report (AD2, AD5)
                    // ---------------------------------------------------------
                    let sanitizedError: EnterstellarError = finalError;

                    if (adapters.error?.sanitize !== undefined) {
                        try {
                            const sanitizeResult = await adapters.error.sanitize(finalError);
                            // sanitize() returns Promise<Error> per AD2.
                            // Preserve EnterstellarError if returned, otherwise wrap.
                            sanitizedError = sanitizeResult instanceof EnterstellarError
                                ? sanitizeResult
                                : new EnterstellarError(
                                    finalError.code,
                                    finalError.module,
                                    sanitizeResult.message,
                                    finalError.recoverable,
                                    sanitizeResult,
                                );
                        } catch {
                            // Sanitize failure — use original error
                        }
                    }

                    if (adapters.error?.report !== undefined) {
                        try {
                            await adapters.error.report(sanitizedError, {
                                zone: name,
                                intent,
                                attempt,
                            });
                        } catch {
                            // Report failure — non-blocking
                        }
                    }

                    setRenderState({ phase: 'error', error: sanitizedError });
                    onError?.(sanitizedError, trace);
                    return;
                }

                // Look up contract for LifecycleWrapper state renderer resolution (LC7).
                // The contract registry (not the compiler) holds component contracts.
                try {
                    const contract = registry?.get(result.componentName);
                    if (contract !== undefined) {
                        setCurrentContract(contract);
                    }
                } catch {
                    // Contract lookup failure — non-blocking, defaults will be used
                }

                // Success: resolve props from compilation result
                const compiledProps: Record<string, unknown> = { ...result.props };

                // ---------------------------------------------------------
                // Cache Write (CA2 — cache CompilationResult on success)
                // ---------------------------------------------------------
                if (cache !== null) {
                    const cacheKey = buildCacheKey(intent.component, intent.component);
                    const now = Date.now();
                    cache.set(cacheKey, {
                        compiledIntent: intent,
                        compilationResult: result,
                        cachedAt: now,
                        expiresAt: now + 3_600_000, // 1 hour default hint
                    });
                }

                setRenderState({
                    phase: 'ready',
                    result,
                    componentProps: compiledProps,
                });
            } catch (err: unknown) {
                // P14: Discard if a newer intent arrived
                if (currentCompilationId !== compilationIdRef.current) {
                    return;
                }

                // RE17: Retry on unexpected errors with backoff
                let shouldRetry = retryPolicy.auto && attempt < retryPolicy.maxRetries;

                if (adapters.error?.shouldRetry !== undefined) {
                    try {
                        const errForAdapter = err instanceof EnterstellarError
                            ? err
                            : new EnterstellarError('ENS-3005', 'react', err instanceof Error ? err.message : String(err), true, err instanceof Error ? err : undefined);
                        shouldRetry = await adapters.error.shouldRetry(errForAdapter, attempt);
                    } catch {
                        // ErrorAdapter failure — fallback to built-in policy
                    }
                }

                if (shouldRetry) {
                    const delay = getRetryDelay(attempt, retryPolicy.backoff);
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, delay);
                    });

                    // P14: Re-check before retrying
                    if (currentCompilationId !== compilationIdRef.current) {
                        return;
                    }

                    await compileIntent(intent, attempt + 1);
                    return;
                }

                // All retries exhausted — surface the error
                const error = new EnterstellarError(
                    'ENS-3005',
                    'react',
                    err instanceof Error
                        ? err.message
                        : String(err),
                    true,
                    err instanceof Error ? err : undefined,
                );

                // ErrorAdapter wiring: sanitize + report (AD2, AD5)
                let sanitizedError: EnterstellarError = error;

                if (adapters.error?.sanitize !== undefined) {
                    try {
                        const sanitizeResult = await adapters.error.sanitize(error);
                        // sanitize() returns Promise<Error> per AD2.
                        // Preserve EnterstellarError if returned, otherwise wrap.
                        sanitizedError = sanitizeResult instanceof EnterstellarError
                            ? sanitizeResult
                            : new EnterstellarError(
                                error.code,
                                error.module,
                                sanitizeResult.message,
                                error.recoverable,
                                sanitizeResult,
                            );
                    } catch {
                        // Sanitize failure — use original error
                    }
                }

                if (adapters.error?.report !== undefined) {
                    try {
                        await adapters.error.report(sanitizedError, {
                            zone: name,
                            attempt,
                        });
                    } catch {
                        // Report failure — non-blocking
                    }
                }

                setRenderState({ phase: 'error', error: sanitizedError });
                onError?.(sanitizedError, latestTraceRef.current);
            }
        },
        // F7-1 fix: latestTrace removed from deps — now uses latestTraceRef.
        // This prevents compileIntent identity changes on every trace update,
        // which would re-subscribe to the agent connection unnecessarily.
        [compiler, store, cache, adapters, name, allowedComponents, onError, retryPolicy, assembler],
    );

    // -----------------------------------------------------------------------
    // Wire handleRetry to compileIntent (deferred reference)
    // -----------------------------------------------------------------------

    // Update handleRetry's reference to compileIntent. Since handleRetry
    // is created before compileIntent, we store compileIntent in a ref
    // that handleRetry can close over.
    const compileIntentRef = useRef(compileIntent);
    compileIntentRef.current = compileIntent;

    const stableHandleRetry = useCallback(() => {
        if (lastIntentRef.current !== null) {
            errorBoundaryRef.current?.resetErrorBoundary();
            assembler.reset();
            void compileIntentRef.current(lastIntentRef.current);
        }
    }, [assembler]);

    // -----------------------------------------------------------------------
    // Agent Connection Subscription
    // -----------------------------------------------------------------------

    useEffect(() => {
        // If determinism is 0.0, never call the agent — render children only
        if (determinism === 0.0 || connection === null) {
            return;
        }

        const unsubscribe = connection.on('intent', (data: unknown) => {
            // Runtime narrowing — replaces unsafe `data as ZoneIntentEvent` cast
            if (!isZoneIntentEvent(data)) {
                return;
            }

            // Only process intents targeted at this zone
            if (data.zone !== name) {
                return;
            }

            void compileIntent(data.intent);
        });

        return unsubscribe;
    }, [connection, name, determinism, compileIntent]);

    // -----------------------------------------------------------------------
    // Activation Strategy (RE6)
    // -----------------------------------------------------------------------

    useEffect(() => {
        // Static zones never activate
        if (determinism === 0.0) {
            return;
        }

        if (activateOn === 'mount') {
            setRenderState({ phase: 'loading' });
            // Agent will send intent via connection — we just enter loading state
        }

        if (activateOn === 'visible' && zoneRef.current !== null) {
            const observer = new IntersectionObserver(
                (entries) => {
                    const entry = entries[0];
                    if (entry?.isIntersecting === true) {
                        setRenderState((prev) => {
                            if (prev.phase === 'idle') {
                                return { phase: 'loading' };
                            }
                            return prev;
                        });
                        observer.disconnect();
                    }
                },
                { threshold: 0.1 },
            );

            observer.observe(zoneRef.current);
            return () => { observer.disconnect(); };
        }

        return undefined;
    }, [activateOn, determinism]);

    // -----------------------------------------------------------------------
    // NOTE: Agent Timeout (LC3) — handled by LifecycleManager internally
    // -----------------------------------------------------------------------
    // The manual setTimeout that was here has been removed (Verdict 6).
    // LifecycleManager.startTimeout() runs when entering 'loading' state
    // and auto-transitions to 'error' with ENS-3002 if the timer fires.
    // See state-machine.ts:startTimeout()
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Render Content via LifecycleWrapper (LC7)
    // -----------------------------------------------------------------------

    /**
     * Resolves the compiled React element for the `ready` phase.
     * Handles RE13 renderer lookup and fallback component resolution.
     *
     * @internal
     */
    const compiledElement = useMemo((): React.ReactNode | null => {
        // Init-state guard: during provider init, rendererRegistry is null.
        if (!rendererRegistry) return null;

        // Determinism 0.0 — fully static, render children only
        if (determinism === 0.0) {
            return children;
        }

        if (renderState.phase !== 'ready') {
            return null;
        }

        const { result, componentProps } = renderState;
        const componentName = result.componentName;

        // RE13: String-based renderer lookup from module-level singleton
        const Renderer = rendererRegistry.get(componentName);

        if (Renderer === undefined) {
            // No renderer registered — try fallback component
            const FallbackRenderer = rendererRegistry.get(fallbackComponent);
            if (FallbackRenderer !== undefined) {
                return <FallbackRenderer {...componentProps} />;
            }
            return null;
        }

        return <Renderer {...componentProps} />;
    }, [determinism, renderState, rendererRegistry, fallbackComponent, children]);

    // -----------------------------------------------------------------------
    // Provenance Data
    // -----------------------------------------------------------------------

    const provenance: CompilationProvenance | null = useMemo(() => {
        if (renderState.phase === 'ready') {
            return renderState.result.provenance;
        }
        return null;
    }, [renderState]);

    /** Compilation status for the provenance badge dot color. */
    const compilationStatus: CompilationStatus | null = useMemo(() => {
        if (renderState.phase === 'ready') {
            return renderState.result.status;
        }
        return null;
    }, [renderState]);

    // -----------------------------------------------------------------------
    // Streaming props for LifecycleWrapper
    // -----------------------------------------------------------------------

    const streamingProps: Readonly<Record<string, unknown>> = renderState.phase === 'streaming'
        ? renderState.partialProps
        : {};

    const streamingComponentName: string | null = renderState.phase === 'streaming'
        ? renderState.componentName
        : null;

    const currentError: Error | null = renderState.phase === 'error'
        ? renderState.error
        : null;

    // Map render phase to lifecycle state for LifecycleWrapper
    const lifecycleState: LifecycleState = renderState.phase === 'ready'
        ? 'ready'
        : renderState.phase;

    // -----------------------------------------------------------------------
    // Init-State Fallback (Bible §4.3 Rule 6)
    // -----------------------------------------------------------------------

    // When the provider is still initializing (enterstellarContext === null),
    // render the zone wrapper with the fallback content. All hooks above
    // have already run unconditionally (Rules of Hooks compliance).
    //
    // This path is entered on the first render frame when Provider's
    // async store/telemetry creation (RE2) hasn't completed yet.
    // On the next render, the provider supplies a full EnterstellarContextValue
    // and the zone proceeds normally.
    if (enterstellarContext === null) {
        return (
            <div
                ref={zoneRef}
                data-enterstellar-zone={name}
                data-enterstellar-zone-id={zoneId}
                data-enterstellar-determinism={determinism}
                className={className}
                style={style}
            >
                {fallback}
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Zone Wrapper (RE8)
    // -----------------------------------------------------------------------

    return (
        <div
            ref={zoneRef}
            data-enterstellar-zone={name}
            data-enterstellar-zone-id={zoneId}
            data-enterstellar-determinism={determinism}
            className={className}
            style={{ position: 'relative', ...style }}
        >
            <ZoneErrorBoundary
                ref={errorBoundaryRef}
                zoneName={name}
                fallback={fallback}
                {...(onError !== undefined ? { onError } : {})}
                latestTrace={latestTraceRef.current}
            >
                {determinism === 0.0
                    ? children
                    : (
                        <LifecycleWrapper
                            state={lifecycleState}
                            contract={currentContract}
                            compiledElement={compiledElement}
                            streamingProps={streamingProps}
                            streamingComponentName={streamingComponentName}
                            error={currentError}
                            onRetry={stableHandleRetry}
                            rendererRegistry={rendererRegistry as NonNullable<typeof rendererRegistry>}
                            fallback={fallback}
                        />
                    )
                }
            </ZoneErrorBoundary>

            {provenance !== null && compilationStatus !== null && (
                <ProvenanceBadge
                    provenance={provenance}
                    status={compilationStatus}
                    visible={showProvenance}
                />
            )}
        </div>
    );
}
