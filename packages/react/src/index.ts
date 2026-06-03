'use client';

/**
 * @module @enterstellar-ai/react
 * @description React integration for Enterstellar OS — Provider, Zone,
 * lifecycle management, cache integration, adapters, hooks, and renderer registry.
 *
 * This barrel file exports the full public API surface of `@enterstellar-ai/react`.
 * Consumers import from `@enterstellar-ai/react` — internal modules are not part
 * of the public API.
 *
 * ## Quick Start
 *
 * ```tsx
 * import {
 *   Provider,
 *   Zone,
 *   defineComponent,
 *   useEnterstellar,
 *   useEnterstellarAgent,
 *   useEnterstellarStore,
 *   useEnterstellarTrace,
 *   useEnterstellarAdapters,
 *   useSpatialContext,
 * } from '@enterstellar-ai/react';
 * ```
 *
 * ## Architecture
 *
 * - **`Provider`** — Root context provider. Accepts optional cache,
 *   adapters, compiler, store, and telemetry.
 * - **`Zone`** — Renders AI-generated content within a determinism-
 *   controlled, error-isolated container. Integrates LifecycleManager,
 *   RenderCache, StreamingAssembler, and ErrorAdapter.
 * - **`LifecycleWrapper`** — Internal state → component resolver (LC7).
 * - **`EnterstellarSkeleton`/`EnterstellarErrorCard`/`EnterstellarEmptyState`** — Default state
 *   components (LC8, LC9).
 * - **`defineComponent()`** — Pairs a `ComponentContract` with a
 *   React renderer (convenience wrapper).
 * - **`rendererRegistry`** — Module-level singleton for React component
 *   lookups. Decoupled from `EnterstellarRegistry` (pure data) per L15.
 * - **Hooks** — `useEnterstellar`, `useEnterstellarAgent`, `useEnterstellarStore`,
 *   `useEnterstellarTrace`, `useEnterstellarAdapters`, `useSpatialContext`.
 *
 * @see Bible §5.3
 * @see Design Choices RE1–RE18, CA1–CA7, LC1–LC9, AD1–AD5
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export { Provider } from './provider.js';
export { Zone } from './zone.js';
export { ProvenanceBadge } from './provenance-badge.js';
export { ZoneErrorBoundary } from './zone-error-boundary.js';

// ---------------------------------------------------------------------------
// Factories & Registries
// ---------------------------------------------------------------------------

export { defineComponent } from './define-component.js';
export type { DefineComponentConfig, DefineComponentResult } from './define-component.js';

export {
    rendererRegistry,
    registerRenderer,
    createRendererRegistry,
} from './renderer-registry.js';
export type { RendererRegistry } from './renderer-registry.js';

// ---------------------------------------------------------------------------
// Lifecycle & Default State Components (LC7, LC8, LC9)
// ---------------------------------------------------------------------------

export { LifecycleWrapper } from './lifecycle-wrapper.js';
export type { LifecycleWrapperProps } from './lifecycle-wrapper.js';
export { EnterstellarSkeleton } from './defaults/skeleton.js';
export { EnterstellarErrorCard } from './defaults/error-card.js';
export type { EnterstellarErrorCardProps } from './defaults/error-card.js';
export { EnterstellarEmptyState } from './defaults/empty-state.js';
export { GenericCard } from './defaults/generic-card.js';
export type { GenericCardProps } from './defaults/generic-card.js';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export { useEnterstellar } from './hooks/use-enterstellar.js';
export type { UseEnterstellarContextResult } from './hooks/use-enterstellar.js';

export { useEnterstellarAgent } from './hooks/use-agent.js';

export { useEnterstellarStore } from './hooks/use-store.js';

export { useEnterstellarTrace } from './hooks/use-trace.js';

export { useEnterstellarAdapters } from './hooks/use-adapters.js';

export { useSpatialContext } from './hooks/use-spatial-context.js';

// ---------------------------------------------------------------------------
// Types (public API surface)
// ---------------------------------------------------------------------------

export type {
    ProviderProps,
    ZoneProps,
    RetryPolicy,
    EnterstellarAdapters,
    EnterstellarComponentRenderer,
} from './types.js';

export type { RenderCache } from '@enterstellar-ai/cache';

export type { ProvenanceBadgeProps } from './provenance-badge.js';
export type { ZoneErrorBoundaryProps } from './zone-error-boundary.js';

// ---------------------------------------------------------------------------
// Internal Context Exports (for testing and devtools)
// ---------------------------------------------------------------------------

export { EnterstellarContext, EnterstellarAgentContext } from './provider.js';
