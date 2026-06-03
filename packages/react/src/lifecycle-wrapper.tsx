'use client';

/**
 * @module @enterstellar-ai/react/lifecycle-wrapper
 * @description Maps lifecycle state to the correct React component.
 *
 * `LifecycleWrapper` is the rendering bridge between the `LifecycleManager`
 * (engine layer, framework-agnostic) and React. It receives the current
 * lifecycle state and resolves the appropriate component to render:
 *
 * **Resolution order per state (LC7):**
 * 1. Check the component contract's `states[phase]` renderer key in the
 *    `RendererRegistry`. If found, render the custom component.
 * 2. Fallback to the default component (`EnterstellarSkeleton`, `EnterstellarErrorCard`,
 *    `EnterstellarEmptyState`) shipped with `@enterstellar-ai/react` (LC8).
 *
 * **State → Component mapping:**
 * - `idle` → `fallback` prop or `null`.
 * - `loading` → contract loading renderer or `EnterstellarSkeleton`.
 * - `streaming` → partial render with accumulated props (LC6: no fake data).
 * - `ready` → pass through the compiled element.
 * - `error` → contract error renderer or `EnterstellarErrorCard` (with `onRetry` LC9).
 * - `empty` → contract empty renderer or `EnterstellarEmptyState`.
 *
 * This component is NOT exported to consumers — it is used internally
 * by `Zone` to render the current lifecycle phase.
 *
 * @see Design Choice LC7 — state → component resolution.
 * @see Design Choice LC8 — default state components.
 * @see Design Choice LC9 — error card receives `onRetry`.
 * @see Principle L9 — every component has loading, error, empty, ready states.
 *
 * @example
 * ```tsx
 * // Used internally by Zone:
 * <LifecycleWrapper
 *   state="loading"
 *   contract={contract}
 *   compiledElement={null}
 *   streamingProps={{}}
 *   streamingComponentName={null}
 *   error={null}
 *   onRetry={handleRetry}
 *   rendererRegistry={rendererRegistry}
 * />
 * ```
 */

import type { ReactNode } from 'react';

import type { ComponentContract } from '@enterstellar-ai/types';
import type { LifecycleState } from '@enterstellar-ai/lifecycle';

import type { RendererRegistry } from './renderer-registry.js';
import { EnterstellarSkeleton } from './defaults/skeleton.js';
import { EnterstellarErrorCard } from './defaults/error-card.js';
import { EnterstellarEmptyState } from './defaults/empty-state.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `LifecycleWrapper` component.
 *
 * Contains all data needed to resolve and render the correct component
 * for the current lifecycle state.
 *
 * @internal
 */
export type LifecycleWrapperProps = {
    /**
     * The current lifecycle state from the `LifecycleManager`.
     * Determines which component to render.
     */
    readonly state: LifecycleState;

    /**
     * The component contract for the current zone's component, or `null`
     * if no contract has been resolved yet (e.g., before first compilation).
     *
     * Used to look up custom state renderers via `contract.states[phase]`.
     */
    readonly contract: ComponentContract | null;

    /**
     * The fully compiled React element to render in `ready` state.
     * `null` when not yet compiled or in a non-ready state.
     */
    readonly compiledElement: ReactNode | null;

    /**
     * Accumulated streaming props from the `StreamingAssembler`.
     * Used to render partial content during `streaming` state.
     */
    readonly streamingProps: Readonly<Record<string, unknown>>;

    /**
     * The component name being streamed, or `null` if not streaming.
     * Used to look up the correct renderer for partial streaming display.
     */
    readonly streamingComponentName: string | null;

    /**
     * The error that caused the zone to enter `error` state, or `null`.
     * Passed to `EnterstellarErrorCard` or the contract's custom error renderer.
     */
    readonly error: Error | null;

    /**
     * Callback for user-initiated retry from the error card (LC9).
     * Triggers `LifecycleManager.transition('loading')` → recompilation.
     */
    readonly onRetry: () => void;

    /**
     * The `RendererRegistry` from context, used for component lookup.
     * Passed explicitly to avoid coupling `LifecycleWrapper` to context.
     */
    readonly rendererRegistry: RendererRegistry;

    /**
     * Optional fallback content to render in `idle` state.
     * Matches the zone's `fallback` prop.
     */
    readonly fallback?: ReactNode;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to resolve a custom renderer for a lifecycle state from the
 * component contract and renderer registry.
 *
 * Resolution: reads `contract.states[stateKey]` to get the renderer name,
 * then looks up that name in the `RendererRegistry`. Returns `null` if:
 * - No contract is available.
 * - The contract's state key doesn't map to a registered renderer.
 *
 * @param contract - The component contract, or `null`.
 * @param stateKey - The contract state key (`'loading'`, `'error'`, `'empty'`, `'ready'`).
 * @param registry - The renderer registry to look up the component.
 * @returns The resolved React component, or `null` if not found.
 *
 * @internal
 */
function resolveStateRenderer(
    contract: ComponentContract | null,
    stateKey: keyof ComponentContract['states'],
    registry: RendererRegistry,
): React.ComponentType<Record<string, unknown>> | null {
    if (contract === null) {
        return null;
    }

    const rendererName = contract.states[stateKey];

    // Check if the renderer is registered
    if (registry.has(rendererName)) {
        return registry.get(rendererName) ?? null;
    }

    return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Lifecycle state → React component resolver (LC7).
 *
 * Receives the current lifecycle state from `Zone` and renders the
 * appropriate component. Custom renderers are resolved from the component
 * contract's `states` field via the `RendererRegistry`. When no custom
 * renderer is found, the default components ship with `@enterstellar-ai/react` (LC8).
 *
 * @param props - {@link LifecycleWrapperProps}
 * @returns The rendered content for the current lifecycle state.
 *
 * @see Design Choice LC7 — state → component resolution.
 * @see Design Choice LC8 — default state components.
 * @see Design Choice LC9 — error card receives `onRetry`.
 *
 * @internal
 */
export function LifecycleWrapper(props: LifecycleWrapperProps): React.JSX.Element | null {
    const {
        state,
        contract,
        compiledElement,
        streamingProps,
        streamingComponentName,
        error,
        onRetry,
        rendererRegistry,
        fallback,
    } = props;

    switch (state) {
        // -----------------------------------------------------------------
        // Idle: render fallback or nothing
        // -----------------------------------------------------------------
        case 'idle': {
            return (fallback ?? null) as React.JSX.Element | null;
        }

        // -----------------------------------------------------------------
        // Loading: contract renderer or default EnterstellarSkeleton (LC8)
        // -----------------------------------------------------------------
        case 'loading': {
            // Attempt contract-defined custom loading renderer (LC7)
            const CustomLoading = resolveStateRenderer(contract, 'loading', rendererRegistry);
            if (CustomLoading !== null) {
                return <CustomLoading />;
            }

            // Fallback to default skeleton (LC8)
            return <EnterstellarSkeleton />;
        }

        // -----------------------------------------------------------------
        // Streaming: render partial content with accumulated props (LC6)
        // -----------------------------------------------------------------
        case 'streaming': {
            // If we have a streaming component name, look up its renderer
            // and render with the accumulated partial props.
            // LC6: no optimistic defaults — only render what's arrived so far.
            if (streamingComponentName !== null && rendererRegistry.has(streamingComponentName)) {
                const StreamingRenderer = rendererRegistry.get(streamingComponentName);
                if (StreamingRenderer !== undefined) {
                    return <StreamingRenderer {...streamingProps} />;
                }
            }

            // No component to stream yet — show loading skeleton.
            // This covers the early streaming phase before the component
            // name is known (e.g., first fragments haven't resolved yet).
            const CustomLoading = resolveStateRenderer(contract, 'loading', rendererRegistry);
            if (CustomLoading !== null) {
                return <CustomLoading />;
            }

            return <EnterstellarSkeleton />;
        }

        // -----------------------------------------------------------------
        // Ready: render the compiled element (pass-through)
        // -----------------------------------------------------------------
        case 'ready': {
            return (compiledElement ?? null) as React.JSX.Element | null;
        }

        // -----------------------------------------------------------------
        // Error: contract renderer or default EnterstellarErrorCard (LC8, LC9)
        // -----------------------------------------------------------------
        case 'error': {
            // The error must be non-null when state is 'error'.
            // Defensive fallback to generic Error if somehow null.
            const displayError = error ?? new Error('An unknown error occurred.');

            // Attempt contract-defined custom error renderer (LC7)
            const CustomError = resolveStateRenderer(contract, 'error', rendererRegistry);
            if (CustomError !== null) {
                // Custom error renderers receive error + onRetry (LC9)
                return <CustomError error={displayError} onRetry={onRetry} />;
            }

            // Fallback to default error card (LC8, LC9)
            return <EnterstellarErrorCard error={displayError} onRetry={onRetry} />;
        }

        // -----------------------------------------------------------------
        // Empty: contract renderer or default EnterstellarEmptyState (LC8)
        // -----------------------------------------------------------------
        case 'empty': {
            // Attempt contract-defined custom empty renderer (LC7)
            const CustomEmpty = resolveStateRenderer(contract, 'empty', rendererRegistry);
            if (CustomEmpty !== null) {
                return <CustomEmpty />;
            }

            // Fallback to default empty state (LC8)
            return <EnterstellarEmptyState />;
        }
        default: {
            // Exhaustive check — ensures compile-time error if a new
            // LifecycleState is added without handling it here.
            const _exhaustiveCheck: never = state;
            return _exhaustiveCheck;
        }
    }
}
