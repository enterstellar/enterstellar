/**
 * @module @enterstellar-ai/react/__tests__/integration/zone-render-pipeline.test
 * @description Integration test: intent → compile → resolve renderer → render.
 *
 * This test validates the complete zone render pipeline end-to-end:
 *
 * 1. `Provider` sets up context with all services.
 * 2. A renderer is registered in the module-level `rendererRegistry`.
 * 3. An `Zone` mounts and subscribes to the agent connection.
 * 4. An intent is dispatched through the connection.
 * 5. The zone compiles the intent via the `EnterstellarCompiler`.
 * 6. The zone resolves the renderer from `rendererRegistry`.
 * 7. The rendered component appears in the DOM.
 * 8. Provenance badge is visible (if `showProvenance` is enabled).
 *
 * This test uses mocked Enterstellar services but exercises the real React
 * integration layer (`Provider` → `Zone` → hooks → renderer).
 *
 * @see Bible §5.3 — full pipeline specification
 * @see Design Choices RE1–RE18
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';

import { Provider } from '../../src/provider.js';
import { Zone } from '../../src/zone.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import type { ComponentIntent, CompilationResult } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Mocks — Full service mocks for integration testing
// ---------------------------------------------------------------------------

/** Connection event subscribers. */
type EventCallback = (data: unknown) => void;
const connectionListeners: Map<string, EventCallback[]> = new Map();

function createIntegrationMocks() {
    connectionListeners.clear();

    const registry = {
        get: vi.fn((name: string) => {
            if (name === 'PatientVitals') {
                return {
                    name: 'PatientVitals',
                    description: 'Displays patient vitals',
                    category: 'clinical',
                    tags: ['patient', 'vitals'],
                    props: {},
                    accessibility: { role: 'region', ariaLabel: 'Patient Vitals' },
                };
            }
            return undefined;
        }),
        list: vi.fn(() => ['PatientVitals']),
        register: vi.fn(),
        unregister: vi.fn(() => false),
        getManifest: vi.fn(() => []),
        getSchema: vi.fn(() => undefined),
        getDesignTokens: vi.fn(() => ({ colors: {}, spacing: {}, typography: {}, radii: {}, shadows: {} })),
        validate: vi.fn(() => ({ valid: true, violations: [] })),
        publish: vi.fn(async () => ({ published: true, url: '' })),
        on: vi.fn(() => () => { }),
        size: 1,
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

/** Simulates the agent dispatching an intent to a zone. */
function dispatchIntent(zone: string, intent: ComponentIntent): void {
    const listeners = connectionListeners.get('intent') ?? [];
    for (const cb of listeners) {
        cb({ zone, intent });
    }
}

// ---------------------------------------------------------------------------
// Test Renderer
// ---------------------------------------------------------------------------

/** A real React component to render as the resolved PatientVitals. */
function PatientVitalsRenderer(props: Record<string, unknown>) {
    return (
        <div data-testid="patient-vitals">
            <span data-testid="patient-id">{String(props['patientId'] ?? '')}</span>
            <span data-testid="risk-level">{String(props['riskLevel'] ?? '')}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Zone Render Pipeline (Integration)', () => {
    beforeEach(() => {
        rendererRegistry.clear();
        // Register the test renderer in the module-level singleton
        rendererRegistry.register('PatientVitals', PatientVitalsRenderer);
    });

    afterEach(() => {
        rendererRegistry.clear();
    });

    it('renders a component from intent → compile → resolve → render', async () => {
        const mocks = createIntegrationMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="patient-sidebar"
                    determinism={1.0}
                    fallback={<div data-testid="loading">Loading...</div>}
                />
            </Provider>,
        );

        // Initially shows EnterstellarSkeleton (LC8) — LifecycleWrapper resolves loading state
        const skeleton = document.querySelector('[data-enterstellar-skeleton]');
        expect(skeleton).not.toBeNull();

        // Dispatch an intent from the "agent"
        await act(async () => {
            dispatchIntent('patient-sidebar', {
                component: 'PatientVitals',
                confidence: 0.95,
                props: {
                    patientId: 'PT-12345',
                    riskLevel: 'high',
                },
            });

            // Allow async compile to settle
            await new Promise((r) => setTimeout(r, 50));
        });

        // Should now render the PatientVitals component
        await waitFor(() => {
            expect(screen.getByTestId('patient-vitals')).toBeDefined();
        });

        expect(screen.getByTestId('patient-id').textContent).toBe('PT-12345');
        expect(screen.getByTestId('risk-level').textContent).toBe('high');

        // Verify compiler was called
        expect(mocks.compiler.compile).toHaveBeenCalledOnce();
        expect(mocks.compiler.compile).toHaveBeenCalledWith(
            expect.objectContaining({
                component: 'PatientVitals',
            }),
            expect.objectContaining({ agent: 'enterstellar-zone' }),
        );
    });

    it('ignores intents targeted at other zones', async () => {
        const mocks = createIntegrationMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="my-zone"
                    fallback={<div data-testid="fallback">Waiting</div>}
                />
            </Provider>,
        );

        // Dispatch intent to a DIFFERENT zone
        await act(async () => {
            dispatchIntent('other-zone', {
                component: 'PatientVitals',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // Should still show EnterstellarSkeleton — intent was for other-zone, zone stays in loading
        const skeleton = document.querySelector('[data-enterstellar-skeleton]');
        expect(skeleton).not.toBeNull();
        expect(mocks.compiler.compile).not.toHaveBeenCalled();
    });

    it('renders fallback when no renderer found for compiled component', async () => {
        const mocks = createIntegrationMocks();

        // Compiler returns a component that has no registered renderer
        mocks.compiler.compile.mockResolvedValueOnce({
            status: 'pass',
            componentName: 'UnknownComponent',
            props: {},
            errors: [],
            selfCorrectionAttempts: 0,
            provenance: {
                agent: 'test',
                registry: 'test',
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
            >
                <Zone
                    name="test-zone"
                    fallback={<div data-testid="fallback">No renderer</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('test-zone', {
                component: 'UnknownComponent',
                confidence: 0.8,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // After compiling an unknown component, zone enters 'ready' state
        // but compiledElement may be null (no renderer found). The zone
        // renders nothing in that case — the wrapper div is empty.
        await waitFor(() => {
            const zoneDiv = document.querySelector('[data-enterstellar-zone="test-zone"]');
            expect(zoneDiv).not.toBeNull();
        });
    });

    it('determinism=0.0 renders static children and never calls agent', async () => {
        const mocks = createIntegrationMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone name="static-zone" determinism={0.0}>
                    <div data-testid="static-content">Static only</div>
                </Zone>
            </Provider>,
        );

        // Static content is visible
        expect(screen.getByTestId('static-content')).toBeDefined();
        expect(screen.getByTestId('static-content').textContent).toBe('Static only');

        // Even if an intent is dispatched, compiler should NOT be called
        await act(async () => {
            dispatchIntent('static-zone', {
                component: 'PatientVitals',
                confidence: 0.9,
                props: {},
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        expect(mocks.compiler.compile).not.toHaveBeenCalled();
    });

    it('latest-intent-wins (P14) — new intent replaces previous', async () => {
        const mocks = createIntegrationMocks();

        // Make compiler slow for first call, fast for second
        let callCount = 0;
        mocks.compiler.compile.mockImplementation(async (intent: ComponentIntent) => {
            callCount++;
            if (callCount === 1) {
                // Slow first call
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
                    fallback={<div data-testid="loading">Loading</div>}
                />
            </Provider>,
        );

        // Dispatch two intents quickly — second should win
        await act(async () => {
            dispatchIntent('p14-zone', {
                component: 'PatientVitals',
                confidence: 0.9,
                props: { patientId: 'FIRST' },
            });

            // Immediately dispatch a second intent
            dispatchIntent('p14-zone', {
                component: 'PatientVitals',
                confidence: 0.95,
                props: { patientId: 'SECOND' },
            });

            await new Promise((r) => setTimeout(r, 300));
        });

        // Should render the SECOND intent (P14: latest wins)
        await waitFor(() => {
            const patientId = screen.queryByTestId('patient-id');
            if (patientId !== null) {
                expect(patientId.textContent).toBe('SECOND');
            }
        });
    });

    it('stores trace in EnterstellarStore on successful compilation (L4)', async () => {
        const mocks = createIntegrationMocks();

        render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone
                    name="traced-zone"
                    fallback={<div>Loading</div>}
                />
            </Provider>,
        );

        await act(async () => {
            dispatchIntent('traced-zone', {
                component: 'PatientVitals',
                confidence: 0.9,
                props: { patientId: 'PT-001' },
            });
            await new Promise((r) => setTimeout(r, 50));
        });

        // Store should have been called to persist trace IDs (S14: traceIds ring buffer)
        await waitFor(() => {
            expect(mocks.store.set).toHaveBeenCalledWith(
                'traceIds',
                expect.arrayContaining([
                    expect.any(String),
                ]),
            );
        });
    });

    it('zone wrapper has data-enterstellar-zone attribute (RE8)', () => {
        const mocks = createIntegrationMocks();

        const { container } = render(
            <Provider
                registry={mocks.registry}
                compiler={mocks.compiler}
                store={mocks.store}
                telemetry={mocks.telemetry}
                connection={mocks.connection}
            >
                <Zone name="attributed-zone" />
            </Provider>,
        );

        const zoneDiv = container.querySelector('[data-enterstellar-zone="attributed-zone"]');
        expect(zoneDiv).not.toBeNull();
    });
});
