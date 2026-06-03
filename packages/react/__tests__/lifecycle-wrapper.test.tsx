/**
 * @module @enterstellar-ai/react/__tests__/lifecycle-wrapper.test
 * @description Unit tests for `<LifecycleWrapper>`.
 *
 * Covers all 6 lifecycle states with correct component resolution:
 * - `idle` → renders fallback or null.
 * - `loading` → default `EnterstellarSkeleton` or custom contract renderer.
 * - `streaming` → partial render with streaming props or skeleton fallback.
 * - `ready` → pass-through of compiled element.
 * - `error` → default `EnterstellarErrorCard` with onRetry or custom contract renderer.
 * - `empty` → default `EnterstellarEmptyState` or custom contract renderer.
 * - Contract is null → always uses defaults.
 * - Registry lookup for custom state renderers.
 *
 * @see Design Choice LC7 — state → component resolution.
 * @see Design Choice LC8 — default state components.
 * @see Design Choice LC9 — error card receives `onRetry`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { LifecycleWrapper } from '../src/lifecycle-wrapper.js';
import type { LifecycleWrapperProps } from '../src/lifecycle-wrapper.js';
import { rendererRegistry } from '../src/renderer-registry.js';
import type { RendererRegistry } from '../src/renderer-registry.js';
import type { ComponentContract } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds default `LifecycleWrapperProps` for testing.
 * Override any field via the `overrides` parameter.
 */
function makeProps(overrides?: Partial<LifecycleWrapperProps>): LifecycleWrapperProps {
    return {
        state: 'idle',
        contract: null,
        compiledElement: null,
        streamingProps: {},
        streamingComponentName: null,
        error: null,
        onRetry: vi.fn(),
        rendererRegistry: rendererRegistry as RendererRegistry,
        fallback: undefined,
        ...overrides,
    };
}

/**
 * Builds a minimal `ComponentContract` with custom state renderer names.
 */
function makeContract(
    stateOverrides?: Partial<ComponentContract['states']>,
): ComponentContract {
    return {
        name: 'TestComponent',
        id: 'test-component' as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        description: 'Test component',
        category: 'data-display',
        tags: ['test'],
        props: {} as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        tokens: {},
        accessibility: { role: 'region', ariaLabel: 'Test', announceOnUpdate: false },
        states: {
            loading: 'CustomLoading',
            error: 'CustomError',
            empty: 'CustomEmpty',
            ready: 'TestComponent',
            ...stateOverrides,
        },
        examples: [],
        _meta: { forged: false, version: '1.0.0', createdAt: '2026-01-01T00:00:00Z' },
    };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

beforeEach(() => {
    rendererRegistry.clear();
});

afterEach(() => {
    cleanup();
    rendererRegistry.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<LifecycleWrapper>', () => {
    // -----------------------------------------------------------------------
    // Idle State
    // -----------------------------------------------------------------------

    describe('state="idle"', () => {
        it('renders null when no fallback is provided', () => {
            const { container } = render(
                <LifecycleWrapper {...makeProps({ state: 'idle' })} />,
            );

            expect(container.innerHTML).toBe('');
        });

        it('renders fallback when provided', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'idle',
                        fallback: <div data-testid="custom-fallback">Waiting…</div>,
                    })}
                />,
            );

            expect(container.textContent).toContain('Waiting…');
        });
    });

    // -----------------------------------------------------------------------
    // Loading State (LC8)
    // -----------------------------------------------------------------------

    describe('state="loading"', () => {
        it('renders default EnterstellarSkeleton when no contract', () => {
            const { container } = render(
                <LifecycleWrapper {...makeProps({ state: 'loading' })} />,
            );

            const skeleton = container.querySelector('[data-enterstellar-skeleton]');
            expect(skeleton).not.toBeNull();
        });

        it('renders default EnterstellarSkeleton when contract exists but custom renderer not registered', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'loading',
                        contract: makeContract(),
                    })}
                />,
            );

            // CustomLoading is not registered → fallback to EnterstellarSkeleton
            const skeleton = container.querySelector('[data-enterstellar-skeleton]');
            expect(skeleton).not.toBeNull();
        });

        it('renders custom loading component when registered in contract (LC7)', () => {
            // Register custom loading renderer
            function CustomLoading(): React.JSX.Element {
                return <div data-custom-loading>Custom loading…</div>;
            }
            rendererRegistry.register('CustomLoading', CustomLoading);

            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'loading',
                        contract: makeContract(),
                    })}
                />,
            );

            const customLoading = container.querySelector('[data-custom-loading]');
            expect(customLoading).not.toBeNull();
            expect(container.textContent).toContain('Custom loading…');
        });
    });

    // -----------------------------------------------------------------------
    // Streaming State (LC6)
    // -----------------------------------------------------------------------

    describe('state="streaming"', () => {
        it('renders skeleton when no streaming component name is available', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'streaming',
                        streamingComponentName: null,
                    })}
                />,
            );

            const skeleton = container.querySelector('[data-enterstellar-skeleton]');
            expect(skeleton).not.toBeNull();
        });

        it('renders with partial streaming props when component is registered', () => {
            function StreamableCard(props: Record<string, unknown>): React.JSX.Element {
                return <div data-streamable>{String(props['title'] ?? '')}</div>;
            }
            rendererRegistry.register('StreamableCard', StreamableCard);

            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'streaming',
                        streamingComponentName: 'StreamableCard',
                        streamingProps: { title: 'Partial title' },
                    })}
                />,
            );

            const streamable = container.querySelector('[data-streamable]');
            expect(streamable).not.toBeNull();
            expect(container.textContent).toContain('Partial title');
        });
    });

    // -----------------------------------------------------------------------
    // Ready State
    // -----------------------------------------------------------------------

    describe('state="ready"', () => {
        it('renders the compiled element (pass-through)', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'ready',
                        compiledElement: <div data-compiled>Compiled output</div>,
                    })}
                />,
            );

            const compiled = container.querySelector('[data-compiled]');
            expect(compiled).not.toBeNull();
            expect(container.textContent).toContain('Compiled output');
        });

        it('renders null when compiledElement is null', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'ready',
                        compiledElement: null,
                    })}
                />,
            );

            expect(container.innerHTML).toBe('');
        });
    });

    // -----------------------------------------------------------------------
    // Error State (LC8, LC9)
    // -----------------------------------------------------------------------

    describe('state="error"', () => {
        it('renders default EnterstellarErrorCard when no contract', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'error',
                        error: new Error('Test error'),
                    })}
                />,
            );

            const errorCard = container.querySelector('[data-enterstellar-error-card]');
            expect(errorCard).not.toBeNull();
        });

        it('displays error message in default error card', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'error',
                        error: new Error('Something broke'),
                    })}
                />,
            );

            expect(container.textContent).toContain('Something broke');
        });

        it('passes onRetry to default error card (LC9)', () => {
            const onRetry = vi.fn();

            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'error',
                        error: new Error('Fail'),
                        onRetry,
                    })}
                />,
            );

            const retryButton = container.querySelector('[data-enterstellar-retry]') as HTMLElement;
            fireEvent.click(retryButton);
            expect(onRetry).toHaveBeenCalledTimes(1);
        });

        it('renders custom error component when registered in contract (LC7)', () => {
            function CustomError(props: Record<string, unknown>): React.JSX.Element {
                return (
                    <div data-custom-error>
                        Custom error: {(props['error'] as Error)?.message}
                    </div>
                );
            }
            rendererRegistry.register('CustomError', CustomError);

            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'error',
                        error: new Error('Custom failure'),
                        contract: makeContract(),
                    })}
                />,
            );

            const customError = container.querySelector('[data-custom-error]');
            expect(customError).not.toBeNull();
            expect(container.textContent).toContain('Custom failure');
        });

        it('provides defensive fallback when error is null', () => {
            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'error',
                        error: null,
                    })}
                />,
            );

            // Should still render error card with fallback message
            const errorCard = container.querySelector('[data-enterstellar-error-card]');
            expect(errorCard).not.toBeNull();
            expect(container.textContent).toContain('An unknown error occurred');
        });
    });

    // -----------------------------------------------------------------------
    // Empty State (LC8)
    // -----------------------------------------------------------------------

    describe('state="empty"', () => {
        it('renders default EnterstellarEmptyState when no contract', () => {
            const { container } = render(
                <LifecycleWrapper {...makeProps({ state: 'empty' })} />,
            );

            const emptyState = container.querySelector('[data-enterstellar-empty-state]');
            expect(emptyState).not.toBeNull();
        });

        it('renders custom empty component when registered in contract (LC7)', () => {
            function CustomEmpty(): React.JSX.Element {
                return <div data-custom-empty>No data found</div>;
            }
            rendererRegistry.register('CustomEmpty', CustomEmpty);

            const { container } = render(
                <LifecycleWrapper
                    {...makeProps({
                        state: 'empty',
                        contract: makeContract(),
                    })}
                />,
            );

            const customEmpty = container.querySelector('[data-custom-empty]');
            expect(customEmpty).not.toBeNull();
            expect(container.textContent).toContain('No data found');
        });
    });
});
