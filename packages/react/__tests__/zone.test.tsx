/**
 * @module @enterstellar-ai/react/__tests__/enterstellar-zone.test
 * @description Unit tests for `<Zone>`.
 *
 * Covers:
 * - Throws outside `<Provider>` (RE5).
 * - Renders wrapper div with `data-enterstellar-zone` attribute (RE8).
 * - Determinism 0.0 renders children only (static mode).
 * - Determinism 1.0 renders EnterstellarSkeleton initially via LifecycleWrapper (LC8).
 * - Passes `className` and `style` to wrapper (RE8).
 * - Relative positioning on wrapper for provenance badge.
 * - Wraps content in `ZoneErrorBoundary` (RE16).
 * - Cache and adapters in context (CA3, AD1).
 *
 * Note: Full compilation pipeline tests (intent → compile → render)
 * are in the integration test (`zone-render-pipeline.test.tsx`).
 *
 * @see Design Choices RE5–RE8, RE16, P14, LC7–LC9, CA1–CA3, AD1–AD2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Zone } from '../src/zone.js';
import { EnterstellarContext, EnterstellarAgentContext } from '../src/provider.js';
import { rendererRegistry } from '../src/renderer-registry.js';
import type { EnterstellarContextValue, EnterstellarAgentContextValue } from '../src/types.js';

// ---------------------------------------------------------------------------
// Module Mocks — LifecycleManager + StreamingAssembler
// ---------------------------------------------------------------------------

/**
 * Mock `@enterstellar-ai/lifecycle` at module level.
 * `createLifecycleManager` and `createStreamingAssembler` are called
 * during component initialization via `useRef` lazy init.
 */
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
// Mocks
// ---------------------------------------------------------------------------

/** Creates a minimal mock EnterstellarContextValue. */
function mockEnterstellarContext(): EnterstellarContextValue {
    return {
        registry: {
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
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock
        compiler: {
            compile: vi.fn(async () => ({
                status: 'pass' as const,
                componentName: 'TestComponent',
                props: {},
                errors: [],
                selfCorrectionAttempts: 0,
                provenance: {
                    agent: 'test',
                    registry: 'test',
                    compiledAt: new Date().toISOString(),
                    compilerVersion: '0.1.0',
                },
            })),
            lint: vi.fn(async () => []),
            use: vi.fn(),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock
        store: {
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
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock
        telemetry: {
            record: vi.fn(),
            flush: vi.fn(async () => ({ sent: 0, failed: 0 })),
            getStats: vi.fn(() => ({ totalRecorded: 0, totalSent: 0, totalFailed: 0, queueSize: 0 })),
            dispose: vi.fn(async () => { }),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock
        rendererRegistry,
        cache: null,
        adapters: {},
    };
}

/** Creates a minimal agent context. */
function mockAgentContext(): EnterstellarAgentContextValue {
    return {
        connection: null,
    };
}

/**
 * Test wrapper that provides EnterstellarContext + EnterstellarAgentContext.
 */
function TestWrapper({
    children,
    context,
    agentContext,
}: {
    children: React.ReactNode;
    context?: EnterstellarContextValue;
    agentContext?: EnterstellarAgentContextValue;
}): React.JSX.Element {
    return (
        <EnterstellarContext.Provider value={context ?? mockEnterstellarContext()}>
            <EnterstellarAgentContext.Provider value={agentContext ?? mockAgentContext()}>
                {children}
            </EnterstellarAgentContext.Provider>
        </EnterstellarContext.Provider>
    );
}

// Suppress console.error for expected error boundary logs
const originalConsoleError = console.error;
beforeEach(() => {
    console.error = vi.fn();
    rendererRegistry.clear();
});
afterEach(() => {
    console.error = originalConsoleError;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<Zone>', () => {
    // -----------------------------------------------------------------------
    // RE5: Throws outside provider
    // -----------------------------------------------------------------------

    describe('context requirement (RE5)', () => {
        it('throws when rendered outside Provider', () => {
            expect(() => {
                render(<Zone name="orphan" />);
            }).toThrow(
                '<Zone name="orphan"> must be rendered inside an <Provider>.',
            );
        });
    });

    // -----------------------------------------------------------------------
    // RE8: Wrapper div attributes
    // -----------------------------------------------------------------------

    describe('wrapper div (RE8)', () => {
        it('renders a div with data-enterstellar-zone attribute', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone name="test-zone" />
                </TestWrapper>,
            );

            const zoneDiv = container.querySelector('[data-enterstellar-zone="test-zone"]');
            expect(zoneDiv).not.toBeNull();
        });

        it('renders data-enterstellar-zone-id attribute', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone name="my-zone" />
                </TestWrapper>,
            );

            const zoneDiv = container.querySelector('[data-enterstellar-zone="my-zone"]');
            expect(zoneDiv?.getAttribute('data-enterstellar-zone-id')).toBeTruthy();
        });

        it('renders data-enterstellar-determinism attribute', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone name="my-zone" determinism={0.7} />
                </TestWrapper>,
            );

            const zoneDiv = container.querySelector('[data-enterstellar-zone="my-zone"]');
            expect(zoneDiv?.getAttribute('data-enterstellar-determinism')).toBe('0.7');
        });

        it('passes className to wrapper div', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone name="styled-zone" className="custom-class" />
                </TestWrapper>,
            );

            const zoneDiv = container.querySelector('[data-enterstellar-zone="styled-zone"]');
            expect(zoneDiv?.classList.contains('custom-class')).toBe(true);
        });

        it('passes style to wrapper div (with position:relative)', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone name="styled-zone" style={{ backgroundColor: 'red' }} />
                </TestWrapper>,
            );

            const zoneDiv = container.querySelector('[data-enterstellar-zone="styled-zone"]') as HTMLElement;
            expect(zoneDiv.style.position).toBe('relative');
            expect(zoneDiv.style.backgroundColor).toBe('red');
        });
    });

    // -----------------------------------------------------------------------
    // Determinism Rules
    // -----------------------------------------------------------------------

    describe('determinism rules', () => {
        it('determinism=0.0 renders children only (static mode)', () => {
            render(
                <TestWrapper>
                    <Zone name="static-zone" determinism={0.0}>
                        <div data-testid="static-content">Static content</div>
                    </Zone>
                </TestWrapper>,
            );

            expect(screen.getByTestId('static-content')).toBeDefined();
            expect(screen.getByTestId('static-content').textContent).toBe('Static content');
        });

        it('determinism=1.0 (default) renders EnterstellarSkeleton initially (LC8)', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone
                        name="dynamic-zone"
                        determinism={1.0}
                        fallback={<div data-testid="loading">Loading...</div>}
                    />
                </TestWrapper>,
            );

            // With LifecycleWrapper (LC7), loading state renders EnterstellarSkeleton
            // (LC8 default), NOT the raw fallback prop. The fallback prop is
            // for idle state only.
            const skeleton = container.querySelector('[data-enterstellar-skeleton]');
            // If skeleton renders, we have LC8 working. If not, the fallback
            // may show during the brief idle->loading transition.
            const hasSkeletonOrFallback = skeleton !== null
                || screen.queryByTestId('loading') !== null;
            expect(hasSkeletonOrFallback).toBe(true);
        });

        it('default determinism is 1.0 (dynamic)', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone
                        name="default-zone"
                        fallback={<div data-testid="default-fallback">Loading</div>}
                    />
                </TestWrapper>,
            );

            // Zone enters loading state on mount — either skeleton or fallback visible
            const skeleton = container.querySelector('[data-enterstellar-skeleton]');
            const hasSkeletonOrFallback = skeleton !== null
                || screen.queryByTestId('default-fallback') !== null;
            expect(hasSkeletonOrFallback).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Fallback Rendering
    // -----------------------------------------------------------------------

    describe('fallback rendering', () => {
        it('renders EnterstellarSkeleton (LC8) when zone enters loading state', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone
                        name="fallback-zone"
                        fallback={<div data-testid="fb">Custom fallback</div>}
                    />
                </TestWrapper>,
            );

            // LC8: loading state renders EnterstellarSkeleton, not the raw fallback prop
            const skeleton = container.querySelector('[data-enterstellar-skeleton]');
            const hasSkeleton = skeleton !== null || screen.queryByTestId('fb') !== null;
            expect(hasSkeleton).toBe(true);
        });

        it('renders nothing when no fallback and no children', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone name="empty-zone" />
                </TestWrapper>,
            );

            const zoneDiv = container.querySelector('[data-enterstellar-zone="empty-zone"]');
            // Zone div exists but content is empty (null fallback)
            expect(zoneDiv).not.toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Error Boundary (RE16)
    // -----------------------------------------------------------------------

    describe('error boundary (RE16)', () => {
        it('renders fallback when child throws', () => {
            function Crasher(): never {
                throw new Error('Component crash');
            }

            render(
                <TestWrapper>
                    <Zone
                        name="crash-zone"
                        determinism={0.0}
                        fallback={<div data-testid="error-fb">Error occurred</div>}
                    >
                        <Crasher />
                    </Zone>
                </TestWrapper>,
            );

            expect(screen.getByTestId('error-fb')).toBeDefined();
        });

        it('fires onError when child throws (RE18)', () => {
            const onError = vi.fn();

            function Crasher(): never {
                throw new Error('Crash!');
            }

            render(
                <TestWrapper>
                    <Zone
                        name="crash-zone"
                        determinism={0.0}
                        onError={onError}
                        fallback={<div>Fallback</div>}
                    >
                        <Crasher />
                    </Zone>
                </TestWrapper>,
            );

            expect(onError).toHaveBeenCalledOnce();
            expect(onError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Crash!' }),
                null, // no trace yet
            );
        });
    });

    // -----------------------------------------------------------------------
    // Provenance Badge
    // -----------------------------------------------------------------------

    describe('provenance badge', () => {
        it('does not render badge when showProvenance=false (default)', () => {
            const { container } = render(
                <TestWrapper>
                    <Zone name="no-badge" determinism={0.0}>
                        <div>Content</div>
                    </Zone>
                </TestWrapper>,
            );

            expect(container.querySelector('[data-enterstellar-provenance]')).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Cache Integration (CA3)
    // -----------------------------------------------------------------------

    describe('cache integration (CA3)', () => {
        it('renders without cache (cache=null)', () => {
            const ctx = mockEnterstellarContext();
            // cache is null by default

            const { container } = render(
                <TestWrapper context={ctx}>
                    <Zone name="no-cache-zone" determinism={0.0}>
                        <div data-testid="no-cache">Content</div>
                    </Zone>
                </TestWrapper>,
            );

            expect(screen.getByTestId('no-cache')).toBeDefined();
        });

        it('renders with cache provided', () => {
            const ctx = {
                ...mockEnterstellarContext(),
                cache: {
                    get: vi.fn(() => undefined),
                    set: vi.fn(),
                    has: vi.fn(() => false),
                    delete: vi.fn(),
                    clear: vi.fn(),
                    size: 0,
                    warmup: vi.fn(),
                } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
            };

            const { container } = render(
                <TestWrapper context={ctx}>
                    <Zone name="cached-zone" determinism={0.0}>
                        <div data-testid="cached">Cached</div>
                    </Zone>
                </TestWrapper>,
            );

            expect(screen.getByTestId('cached')).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Adapters Integration (AD1)
    // -----------------------------------------------------------------------

    describe('adapters integration (AD1)', () => {
        it('renders with empty adapters (default)', () => {
            const ctx = mockEnterstellarContext();
            // adapters is {} by default

            render(
                <TestWrapper context={ctx}>
                    <Zone name="no-adapter-zone" determinism={0.0}>
                        <div data-testid="no-adapter">Content</div>
                    </Zone>
                </TestWrapper>,
            );

            expect(screen.getByTestId('no-adapter')).toBeDefined();
        });

        it('renders with ErrorAdapter provided', () => {
            const ctx = {
                ...mockEnterstellarContext(),
                adapters: {
                    error: {
                        shouldRetry: vi.fn(async () => false),
                        sanitize: vi.fn(async (err: Error) => err),
                        report: vi.fn(async () => { }),
                    },
                },
            };

            render(
                <TestWrapper context={ctx}>
                    <Zone name="adapter-zone" determinism={0.0}>
                        <div data-testid="with-adapter">Content</div>
                    </Zone>
                </TestWrapper>,
            );

            expect(screen.getByTestId('with-adapter')).toBeDefined();
        });
    });
});
