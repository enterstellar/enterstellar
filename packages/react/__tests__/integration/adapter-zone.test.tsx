/**
 * @module @enterstellar-ai/react/__tests__/integration/adapter-zone.test
 * @description Integration test: ErrorAdapter wiring within Zone.
 *
 * Validates ErrorAdapter integration in the zone compilation pipeline:
 *
 * 1. **`shouldRetry()`** — delegates retry decision to ErrorAdapter (AD2).
 * 2. **`sanitize()`** — transforms error before surfacing to user (AD5).
 * 3. **`report()`** — non-blocking error reporting for telemetry.
 * 4. **Graceful degradation** — ErrorAdapter failure falls back to built-in policy.
 * 5. **No ErrorAdapter** — built-in retry policy operates alone.
 *
 * Uses mocked Enterstellar services with configurable ErrorAdapter to test
 * the adapter wiring inside `Zone.compileIntent()`.
 *
 * @see Design Choice AD2 — ErrorAdapter.shouldRetry() is async.
 * @see Design Choice AD5 — adapters wrap vendor errors into EnterstellarError.
 * @see Design Choice RE17 — auto-retry with backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';

import { Provider } from '../../src/provider.js';
import { Zone } from '../../src/zone.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import { EnterstellarError } from '@enterstellar-ai/types';
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

function createAdapterMocks() {
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

    /** Compiler that always fails — forces error path. */
    const compiler = {
        compile: vi.fn(async (): Promise<CompilationResult> => ({
            status: 'fail' as const,
            componentName: 'FailComponent',
            props: {},
            errors: [{ code: 'ENS-2001', path: 'root', message: 'Intentional failure for adapter testing' }],
            selfCorrectionAttempts: 3,
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

    const store = {
        get: vi.fn(() => undefined),
        set: vi.fn(),
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
// Cleanup
// ---------------------------------------------------------------------------

const originalConsoleError = console.error;
beforeEach(() => {
    console.error = vi.fn();
    rendererRegistry.clear();
});
afterEach(() => {
    console.error = originalConsoleError;
    rendererRegistry.clear();
    connectionListeners.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorAdapter + Zone Integration', () => {
    // -----------------------------------------------------------------------
    // AD2: shouldRetry() delegation
    // -----------------------------------------------------------------------

    it('delegates retry decision to ErrorAdapter.shouldRetry() (AD2)', async () => {
        const mocks = createAdapterMocks();

        const shouldRetry = vi.fn(async () => false);
        const errorAdapter = {
            shouldRetry,
            sanitize: vi.fn(async (err: EnterstellarError) => err),
            report: vi.fn(async () => { }),
        };

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                adapters={{ error: errorAdapter }}
            >
                <Zone
                    name="shouldretry-zone"
                    retryPolicy={{ auto: true, maxRetries: 3, backoff: 'none' }}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('shouldretry-zone', {
                component: 'FailComponent',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 100));
        });

        // shouldRetry was called (AD2: adapter overrides built-in policy)
        await waitFor(() => {
            expect(shouldRetry).toHaveBeenCalled();
        });

        // Because shouldRetry returned false, compiler should only be called once
        // (no retries despite retryPolicy.auto=true, maxRetries=3)
        expect(mocks.compiler.compile).toHaveBeenCalledTimes(1);
    });

    // -----------------------------------------------------------------------
    // AD5: sanitize() transforms error
    // -----------------------------------------------------------------------

    it('sanitizes error via ErrorAdapter.sanitize() before surfacing (AD5)', async () => {
        const mocks = createAdapterMocks();
        const onError = vi.fn();

        const sanitize = vi.fn(async (err: EnterstellarError) => {
            // Replace the error with a sanitized version
            return new EnterstellarError(
                err.code,
                'react',
                'Sanitized: An error occurred. Please try again.',
                err.recoverable,
            );
        });

        const errorAdapter = {
            shouldRetry: vi.fn(async () => false),
            sanitize,
            report: vi.fn(async () => { }),
        };

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                adapters={{ error: errorAdapter }}
            >
                <Zone
                    name="sanitize-zone"
                    retryPolicy={{ auto: false, maxRetries: 0, backoff: 'none' }}
                    onError={onError}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('sanitize-zone', {
                component: 'FailComponent',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 100));
        });

        // sanitize was called
        await waitFor(() => {
            expect(sanitize).toHaveBeenCalled();
        });

        // onError should receive the SANITIZED error, not the original
        expect(onError).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Sanitized'),
            }),
            expect.anything(),
        );
    });

    // -----------------------------------------------------------------------
    // AD2: report() called non-blocking
    // -----------------------------------------------------------------------

    it('calls ErrorAdapter.report() non-blocking for telemetry (AD2)', async () => {
        const mocks = createAdapterMocks();

        const report = vi.fn(async () => { });
        const errorAdapter = {
            shouldRetry: vi.fn(async () => false),
            sanitize: vi.fn(async (err: EnterstellarError) => err),
            report,
        };

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                adapters={{ error: errorAdapter }}
            >
                <Zone
                    name="report-zone"
                    retryPolicy={{ auto: false, maxRetries: 0, backoff: 'none' }}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('report-zone', {
                component: 'FailComponent',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 100));
        });

        // report should have been called with the error and context
        await waitFor(() => {
            expect(report).toHaveBeenCalledWith(
                expect.any(EnterstellarError),
                expect.objectContaining({
                    zone: 'report-zone',
                }),
            );
        });
    });

    // -----------------------------------------------------------------------
    // Graceful degradation: ErrorAdapter failure → built-in policy
    // -----------------------------------------------------------------------

    it('falls back to built-in retry policy when ErrorAdapter.shouldRetry() throws', async () => {
        const mocks = createAdapterMocks();

        const shouldRetry = vi.fn(async () => {
            throw new Error('Adapter crash');
        });

        const errorAdapter = {
            shouldRetry,
            sanitize: vi.fn(async (err: EnterstellarError) => err),
            report: vi.fn(async () => { }),
        };

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                adapters={{ error: errorAdapter }}
            >
                <Zone
                    name="fallback-zone"
                    retryPolicy={{ auto: true, maxRetries: 1, backoff: 'none' }}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('fallback-zone', {
                component: 'FailComponent',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 200));
        });

        // shouldRetry threw → falls back to built-in: auto=true, maxRetries=1
        // So compiler should be called at least twice (initial + 1 retry)
        await waitFor(() => {
            expect(mocks.compiler.compile.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    // -----------------------------------------------------------------------
    // No ErrorAdapter — built-in policy alone
    // -----------------------------------------------------------------------

    it('retries with built-in policy when no ErrorAdapter is provided', async () => {
        const mocks = createAdapterMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="no-adapter-zone"
                    retryPolicy={{ auto: true, maxRetries: 1, backoff: 'none' }}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('no-adapter-zone', {
                component: 'FailComponent',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 200));
        });

        // Built-in: auto=true, maxRetries=1 → 2 calls (initial + 1 retry)
        await waitFor(() => {
            expect(mocks.compiler.compile).toHaveBeenCalledTimes(2);
        });
    });

    // -----------------------------------------------------------------------
    // sanitize() failure → use original error
    // -----------------------------------------------------------------------

    it('uses original error when ErrorAdapter.sanitize() throws', async () => {
        const mocks = createAdapterMocks();
        const onError = vi.fn();

        const errorAdapter = {
            shouldRetry: vi.fn(async () => false),
            sanitize: vi.fn(async () => {
                throw new Error('Sanitize crash');
            }),
            report: vi.fn(async () => { }),
        };

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
                adapters={{ error: errorAdapter }}
            >
                <Zone
                    name="sanitize-fail-zone"
                    retryPolicy={{ auto: false, maxRetries: 0, backoff: 'none' }}
                    onError={onError}
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('sanitize-fail-zone', {
                component: 'FailComponent',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 100));
        });

        // onError should still be called — with the ORIGINAL error (not sanitized)
        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Compilation failed'),
                }),
                expect.anything(),
            );
        });
    });
});
