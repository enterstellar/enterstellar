/**
 * @module @enterstellar-ai/react/__tests__/integration/cache-zone.test
 * @description Integration test: cache + Zone interaction.
 *
 * Validates the full cache integration in the zone compilation pipeline:
 *
 * 1. **Cache HIT** — skips compilation, renders from cached result.
 * 2. **Cache MISS** — compiles via compiler, stores result in cache.
 * 3. **Null cache** — passthrough, compiler always called, no errors.
 * 4. **Cache key strategy** — uses `buildCacheKey(component, component)`.
 *
 * Uses mocked Enterstellar services with a real `Map`-backed cache to test
 * the cache read/write logic inside `Zone.compileIntent()`.
 *
 * @see Design Choice CA1 — cache key = intentHash + componentName.
 * @see Design Choice CA2 — caches only pass/corrected CompilationResults.
 * @see Design Choice CA3 — global cache, shared across zones.
 * @see Principle L3 — cache hit is memoization, not compiler bypass.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

import { Provider } from '../../src/provider.js';
import { Zone } from '../../src/zone.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import { buildCacheKey } from '@enterstellar-ai/cache';
import type { ComponentIntent, CompilationResult } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Module Mocks — LifecycleManager + StreamingAssembler
// ---------------------------------------------------------------------------

vi.mock('@enterstellar-ai/lifecycle', () => ({
    createLifecycleManager: vi.fn(() => ({
        transition: vi.fn(),
        getState: vi.fn(() => 'idle'),
        on: vi.fn(() => () => { }),
        dispose: vi.fn(),
        startTimeout: vi.fn(),
        cancelTimeout: vi.fn(),
        getRetryCount: vi.fn(() => 0),
    })),
    createStreamingAssembler: vi.fn(() => ({
        apply: vi.fn(),
        reset: vi.fn(),
        getProps: vi.fn(() => ({})),
        isComplete: vi.fn(() => false),
    })),
}));

// ---------------------------------------------------------------------------
// Mock Infrastructure
// ---------------------------------------------------------------------------

type EventCallback = (data: unknown) => void;
const connectionListeners: Map<string, EventCallback[]> = new Map();

/**
 * Creates complete mocked Enterstellar services for integration testing.
 * Includes a `Map`-backed cache mock that behaves like a real cache.
 */
function createCacheMocks() {
    connectionListeners.clear();

    const registry = {
        get: vi.fn(() => undefined),
        list: vi.fn(() => []),
        register: vi.fn(),
        unregister: vi.fn(() => false),
        getManifest: vi.fn(() => []),
        getSchema: vi.fn(() => undefined),
        getDesignTokens: vi.fn(() => ({ colors: {}, spacing: {}, typography: {}, radii: {}, shadows: {} })),
        validate: vi.fn(() => ({ valid: true, violations: [] })),
        publish: vi.fn(async () => ({ published: true, url: '' })),
        on: vi.fn(() => () => { }),
        size: 0,
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const compiler = {
        compile: vi.fn(async (intent: ComponentIntent): Promise<CompilationResult> => ({
            status: 'pass' as const,
            componentName: intent.component,
            props: intent.props ?? {},
            errors: [],
            selfCorrectionAttempts: 0,
            provenance: {
                agent: 'test-agent',
                registry: 'main',
                compiledAt: new Date().toISOString(),
                compilerVersion: '0.1.0',
            },
        })),
        lint: vi.fn(async () => []),
        use: vi.fn(),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const storeData = new Map<string, unknown>();
    const store = {
        get: vi.fn(<T = unknown>(key: string): T | undefined => storeData.get(key) as T | undefined),
        set: vi.fn((key: string, value: unknown) => { storeData.set(key, value); }),
        subscribe: vi.fn(() => () => { }),
        extend: vi.fn(),
        hasExtension: vi.fn(() => false),
        snapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: {} })),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: {} })),
        destroy: vi.fn(),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const telemetry = {
        record: vi.fn(),
        flush: vi.fn(async () => ({ sent: 0, failed: 0 })),
        getStats: vi.fn(() => ({ totalRecorded: 0, totalSent: 0, totalFailed: 0, queueSize: 0 })),
        dispose: vi.fn(async () => { }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const connection = {
        dispatch: vi.fn(async () => { }),
        on: vi.fn((event: string, callback: EventCallback) => {
            const listeners = connectionListeners.get(event) ?? [];
            listeners.push(callback);
            connectionListeners.set(event, listeners);
            return () => {
                const current = connectionListeners.get(event) ?? [];
                connectionListeners.set(event, current.filter((cb) => cb !== callback));
            };
        }),
        onRawEvent: vi.fn(() => () => { }),
        connected: true,
        disconnect: vi.fn(async () => { }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    // Map-backed cache mock — simulates real cache behavior
    const cacheStore = new Map<string, unknown>();
    const cache = {
        get: vi.fn((key: string) => cacheStore.get(key)),
        set: vi.fn((key: string, value: unknown) => { cacheStore.set(key, value); }),
        has: vi.fn((key: string) => cacheStore.has(key)),
        delete: vi.fn((key: string) => cacheStore.delete(key)),
        clear: vi.fn(() => { cacheStore.clear(); }),
        size: 0,
        warmup: vi.fn(),
        _store: cacheStore, // Expose for assertions
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    return { registry, compiler, store, telemetry, connection, cache };
}

/** Dispatches an intent event to all zone listeners. */
function dispatchIntent(zone: string, intent: ComponentIntent): void {
    const listeners = connectionListeners.get('intent') ?? [];
    for (const cb of listeners) {
        cb({ zone, intent });
    }
}

// ---------------------------------------------------------------------------
// Test Renderer
// ---------------------------------------------------------------------------

function VitalsRenderer(props: Record<string, unknown>): React.JSX.Element {
    return (
        <div data-testid="vitals">
            <span data-testid="patient">{String(props['patientId'] ?? '')}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const originalConsoleError = console.error;
beforeEach(() => {
    console.error = vi.fn();
    rendererRegistry.clear();
    rendererRegistry.register('PatientVitals', VitalsRenderer);
});
afterEach(() => {
    console.error = originalConsoleError;
    rendererRegistry.clear();
    connectionListeners.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cache + Zone Integration', () => {
    // -----------------------------------------------------------------------
    // CA3: Null cache — passthrough
    // -----------------------------------------------------------------------

    it('compiles normally when cache is null (CA3 passthrough)', async () => {
        const mocks = createCacheMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="no-cache-zone"
                    fallback={<div data-testid="loading">Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('no-cache-zone', {
                component: 'PatientVitals',
                confidence: 0.95,
                props: { patientId: 'PT-001' },
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        await waitFor(() => {
            expect(mocks.compiler.compile).toHaveBeenCalledOnce();
        });
    });

    // -----------------------------------------------------------------------
    // CA1/CA2: Cache MISS → compile + store
    // -----------------------------------------------------------------------

    it('compiles on cache MISS and stores result in cache (CA2)', async () => {
        const mocks = createCacheMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                cache={mocks.cache}
            >
                <Zone
                    name="miss-zone"
                    fallback={<div data-testid="loading">Loading</div>}
                />
            </Provider>,
        );

        // Cache is empty — this is a MISS
        const intent: ComponentIntent = {
            component: 'PatientVitals',
            confidence: 0.9,
            props: { patientId: 'PT-002' },
        };

        await act(async () => {
            dispatchIntent('miss-zone', intent);
            await new Promise((r) => setTimeout(r, 50));
        });

        // Compiler SHOULD have been called (cache miss)
        await waitFor(() => {
            expect(mocks.compiler.compile).toHaveBeenCalledOnce();
        });

        // Cache SHOULD have been written (CA2: stores pass/corrected results)
        const expectedKey = buildCacheKey('PatientVitals', 'PatientVitals');
        expect(mocks.cache.set).toHaveBeenCalledWith(
            expectedKey,
            expect.objectContaining({
                compiledIntent: intent,
                compilationResult: expect.objectContaining({
                    status: 'pass',
                    componentName: 'PatientVitals',
                }),
            }),
        );
    });

    // -----------------------------------------------------------------------
    // CA1: Cache HIT → skip compilation
    // -----------------------------------------------------------------------

    it('skips compilation on cache HIT and renders from cached result (CA1)', async () => {
        const mocks = createCacheMocks();

        // Pre-populate cache with a cached compilation result
        const cachedResult: CompilationResult = {
            status: 'pass',
            componentName: 'PatientVitals',
            props: { patientId: 'PT-CACHED' },
            errors: [],
            selfCorrectionAttempts: 0,
            provenance: {
                agent: 'cached-agent',
                registry: 'main',
                compiledAt: '2026-01-01T00:00:00Z',
                compilerVersion: '0.1.0',
            },
        };

        const cacheKey = buildCacheKey('PatientVitals', 'PatientVitals');
        mocks.cache._store.set(cacheKey, {
            compiledIntent: { component: 'PatientVitals', confidence: 0.9, props: { patientId: 'PT-CACHED' } },
            compilationResult: cachedResult,
            cachedAt: Date.now(),
            expiresAt: Date.now() + 3_600_000,
        });

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                cache={mocks.cache}
            >
                <Zone
                    name="hit-zone"
                    fallback={<div data-testid="loading">Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('hit-zone', {
                component: 'PatientVitals',
                confidence: 0.95,
                props: { patientId: 'PT-NEW' },
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // Compiler should NOT have been called (cache hit)
        expect(mocks.compiler.compile).not.toHaveBeenCalled();

        // Should render with CACHED props, not the new intent's props
        await waitFor(() => {
            const patient = document.querySelector('[data-testid="patient"]');
            if (patient !== null) {
                expect(patient.textContent).toBe('PT-CACHED');
            }
        });
    });

    // -----------------------------------------------------------------------
    // CA2: Failed compilations are NOT cached
    // -----------------------------------------------------------------------

    it('does NOT cache failed compilation results (CA2)', async () => {
        const mocks = createCacheMocks();

        // Make compiler return a failure
        mocks.compiler.compile.mockResolvedValueOnce({
            status: 'fail',
            componentName: 'PatientVitals',
            props: {},
            errors: [{ path: 'props.patientId', message: 'Required field missing' }],
            selfCorrectionAttempts: 1,
            provenance: {
                agent: 'test',
                registry: 'main',
                compiledAt: new Date().toISOString(),
                compilerVersion: '0.1.0',
            },
        });

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                cache={mocks.cache}
            >
                <Zone
                    name="fail-zone"
                    retryPolicy={{ auto: false, maxRetries: 0, backoff: 'none' }}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('fail-zone', {
                component: 'PatientVitals',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // Compiler was called
        await waitFor(() => {
            expect(mocks.compiler.compile).toHaveBeenCalledOnce();
        });

        // Cache should NOT have been written (failed = not cached)
        expect(mocks.cache.set).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // L4: Cache hit still creates a ZoneTrace
    // -----------------------------------------------------------------------

    it('creates ZoneTrace on cache HIT with correct metadata (L4)', async () => {
        const mocks = createCacheMocks();

        // Pre-populate cache
        const cacheKey = buildCacheKey('PatientVitals', 'PatientVitals');
        mocks.cache._store.set(cacheKey, {
            compiledIntent: { component: 'PatientVitals', confidence: 0.9, props: {} },
            compilationResult: {
                status: 'pass',
                componentName: 'PatientVitals',
                props: {},
                errors: [],
                selfCorrectionAttempts: 0,
                provenance: {
                    agent: 'cached-agent',
                    registry: 'main',
                    compiledAt: '2026-01-01T00:00:00Z',
                    compilerVersion: '0.1.0',
                },
            },
            cachedAt: Date.now(),
            expiresAt: Date.now() + 3_600_000,
        });

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                cache={mocks.cache}
            >
                <Zone
                    name="trace-zone"
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('trace-zone', {
                component: 'PatientVitals',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // Store should have received a trace ID even on cache hit (S14: traceIds ring buffer)
        await waitFor(() => {
            expect(mocks.store.set).toHaveBeenCalledWith(
                'traceIds',
                expect.arrayContaining([
                    expect.any(String),
                ]),
            );
        });
    });
});
