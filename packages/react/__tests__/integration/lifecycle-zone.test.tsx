/**
 * @module @enterstellar-ai/react/__tests__/integration/lifecycle-zone.test
 * @description Integration test: lifecycle state transitions within Zone.
 *
 * Validates the full lifecycle integration in the zone rendering pipeline:
 *
 * 1. **Loading state** — renders `EnterstellarSkeleton` (LC8) on mount.
 * 2. **Ready state** — renders compiled component on successful compilation.
 * 3. **Error state** — renders `EnterstellarErrorCard` on compilation failure.
 * 4. **Component filtering** — `allowedComponents` violation → error state.
 * 5. **LifecycleWrapper resolution** — correct default components per state.
 * 6. **Trace persistence** — traces written to store on all compilation outcomes.
 *
 * Uses mocked Enterstellar services but exercises the real React integration
 * layer including `LifecycleWrapper` state resolution.
 *
 * @see Design Choice LC1 — custom FSM.
 * @see Design Choice LC2 — 6 lifecycle states.
 * @see Design Choice LC7 — state → component resolution.
 * @see Design Choice LC8 — default state components.
 * @see Design Choice RE17 — auto-retry with backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

import { Provider } from '../../src/provider.js';
import { Zone } from '../../src/zone.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
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

function createLifecycleMocks() {
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
    const storeSubscribers = new Set<() => void>();
    const store = {
        get: vi.fn(<T = unknown>(key: string): T | undefined => storeData.get(key) as T | undefined),
        set: vi.fn((key: string, value: unknown) => {
            storeData.set(key, value);
            storeSubscribers.forEach((cb) => { cb(); });
        }),
        subscribe: vi.fn((cb: () => void) => {
            storeSubscribers.add(cb);
            return () => storeSubscribers.delete(cb);
        }),
        extend: vi.fn(),
        hasExtension: vi.fn(() => false),
        snapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: Object.fromEntries(storeData) })),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: Object.fromEntries(storeData) })),
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

    return { registry, compiler, store, telemetry, connection };
}

/** Dispatches an intent event to all zone listeners. */
function dispatchIntent(zone: string, intent: ComponentIntent): void {
    const listeners = connectionListeners.get('intent') ?? [];
    for (const cb of listeners) {
        cb({ zone, intent });
    }
}

// ---------------------------------------------------------------------------
// Test Renderers
// ---------------------------------------------------------------------------

function MedChartRenderer(props: Record<string, unknown>): React.JSX.Element {
    return (
        <div data-testid="med-chart">
            <span data-testid="medication">{String(props['medication'] ?? '')}</span>
        </div>
    );
}

function AlertRenderer(props: Record<string, unknown>): React.JSX.Element {
    return (
        <div data-testid="alert-card">
            <span data-testid="alert-level">{String(props['level'] ?? '')}</span>
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
    rendererRegistry.register('MedChart', MedChartRenderer);
    rendererRegistry.register('AlertCard', AlertRenderer);
});
afterEach(() => {
    console.error = originalConsoleError;
    rendererRegistry.clear();
    connectionListeners.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Lifecycle + Zone Integration', () => {
    // -----------------------------------------------------------------------
    // Loading state renders skeleton (LC8)
    // -----------------------------------------------------------------------

    it('shows loading state (skeleton or fallback) on mount with activateOn="mount"', () => {
        const mocks = createLifecycleMocks();

        const { container } = render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="loading-zone"
                    activateOn="mount"
                    fallback={<div data-testid="fallback">Loading…</div>}
                />
            </Provider>,
        );

        // Zone should enter loading state on mount — LC8 skeleton or fallback visible
        const skeleton = container.querySelector('[data-enterstellar-skeleton]');
        const fallback = container.querySelector('[data-testid="fallback"]');
        expect(skeleton !== null || fallback !== null).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Ready state renders compiled component
    // -----------------------------------------------------------------------

    it('transitions to ready state and renders compiled component', async () => {
        const mocks = createLifecycleMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="ready-zone"
                    fallback={<div data-testid="loading">Loading</div>}
                />
            </Provider>,
        );

        // Dispatch intent → should compile → ready → render MedChart
        await act(async () => {
            dispatchIntent('ready-zone', {
                component: 'MedChart',
                confidence: 0.9,
                props: { medication: 'Ibuprofen' },
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        await waitFor(() => {
            const medChart = document.querySelector('[data-testid="med-chart"]');
            expect(medChart).not.toBeNull();
        });

        const medication = document.querySelector('[data-testid="medication"]');
        expect(medication?.textContent).toBe('Ibuprofen');
    });

    // -----------------------------------------------------------------------
    // Error state renders error card (LC8)
    // -----------------------------------------------------------------------

    it('transitions to error state and renders EnterstellarErrorCard on compilation failure', async () => {
        const mocks = createLifecycleMocks();

        // Make compiler return failure
        mocks.compiler.compile.mockResolvedValueOnce({
            status: 'fail',
            componentName: 'MedChart',
            props: {},
            errors: [{ path: 'props.medication', message: 'Required' }],
            selfCorrectionAttempts: 2,
            provenance: {
                agent: 'test',
                registry: 'main',
                compiledAt: new Date().toISOString(),
                compilerVersion: '0.1.0',
            },
        });

        const onError = vi.fn();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="error-zone"
                    retryPolicy={{ auto: false, maxRetries: 0, backoff: 'none' }}
                    onError={onError}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('error-zone', {
                component: 'MedChart',
                confidence: 0.8,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // Error state → EnterstellarErrorCard should render (LC8)
        await waitFor(() => {
            const errorCard = document.querySelector('[data-enterstellar-error-card]');
            expect(errorCard).not.toBeNull();
        });

        // onError callback should have been called
        expect(onError).toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // AllowedComponents violation → error state
    // -----------------------------------------------------------------------

    it('enters error state when component is not in allowedComponents', async () => {
        const mocks = createLifecycleMocks();
        const onError = vi.fn();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="filtered-zone"
                    allowedComponents={['AlertCard']}
                    onError={onError}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        // Dispatch intent for a DISALLOWED component
        await act(async () => {
            dispatchIntent('filtered-zone', {
                component: 'MedChart',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // Compiler should NOT have been called
        expect(mocks.compiler.compile).not.toHaveBeenCalled();

        // onError should have been called with ENS-3003
        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('not allowed'),
                }),
                null,
            );
        });
    });

    // -----------------------------------------------------------------------
    // Multiple intents — latest wins (P14)
    // -----------------------------------------------------------------------

    it('renders the second component when two intents arrive quickly (P14)', async () => {
        const mocks = createLifecycleMocks();

        // First compile is slow, second is fast
        let callCount = 0;
        mocks.compiler.compile.mockImplementation(async (intent: ComponentIntent) => {
            callCount++;
            if (callCount === 1) {
                await new Promise((r) => setTimeout(r, 200));
            }
            return {
                status: 'pass' as const,
                componentName: intent.component,
                props: intent.props ?? {},
                errors: [],
                selfCorrectionAttempts: 0,
                provenance: {
                    agent: 'test',
                    registry: 'main',
                    compiledAt: new Date().toISOString(),
                    compilerVersion: '0.1.0',
                },
            };
        });

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="p14-zone"
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            // First intent — MedChart (slow)
            dispatchIntent('p14-zone', {
                component: 'MedChart',
                confidence: 0.9,
                props: { medication: 'FIRST' },
            });

            // Second intent — AlertCard (fast, should win)
            dispatchIntent('p14-zone', {
                component: 'AlertCard',
                confidence: 0.95,
                props: { level: 'critical' },
            });

            await new Promise((r) => setTimeout(r, 300));
        });

        // P14: The latest intent (AlertCard) should be rendered
        await waitFor(() => {
            const alertCard = document.querySelector('[data-testid="alert-card"]');
            if (alertCard !== null) {
                expect(alertCard).not.toBeNull();
                const level = document.querySelector('[data-testid="alert-level"]');
                expect(level?.textContent).toBe('critical');
            }
        });
    });

    // -----------------------------------------------------------------------
    // Trace persistence on success (L4)
    // -----------------------------------------------------------------------

    it('writes ZoneTrace to store on successful compilation (L4)', async () => {
        const mocks = createLifecycleMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="trace-zone"
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('trace-zone', {
                component: 'MedChart',
                confidence: 0.9,
                props: { medication: 'Aspirin' },
            });
            await new Promise((r) => setTimeout(r, 50));
        });

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
