/**
 * @module @enterstellar-ai/react/types
 * @description Internal type definitions for the `@enterstellar-ai/react` package.
 *
 * These types are NOT part of the public API surface. They define the
 * internal shapes used by `Provider`, `Zone`, hooks, and the
 * streaming prop handler.
 *
 * Public types (re-exported from `index.ts`):
 * - `ProviderProps`
 * - `ZoneProps`
 * - `RetryPolicy`
 * - `EnterstellarAdapters`
 *
 * @see Design Choices RE1–RE18, P1–P14
 * @internal
 */

import type { ReactNode, CSSProperties, ComponentType } from 'react';

import type {
    EnterstellarAgentConnection,
    ZoneTrace,
    AuthAdapter,
    DataAdapter,
    ErrorAdapter,
    AnalyticsAdapter,
} from '@enterstellar-ai/types';
import type { EnterstellarRegistry } from '@enterstellar-ai/registry';
import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import type { EnterstellarStore } from '@enterstellar-ai/state';
import type { TelemetryCollector } from '@enterstellar-ai/telemetry';
import type { RenderCache } from '@enterstellar-ai/cache';

import type { RendererRegistry } from './renderer-registry.js';

// ---------------------------------------------------------------------------
// React Context Value Types
// ---------------------------------------------------------------------------

/**
 * The shape stored in the Enterstellar React context (accessed via `useEnterstellar()`).
 *
 * Contains all core Enterstellar services. Agent connection is stored separately
 * because it has a different lifecycle (RE9 — may not exist if no agent).
 *
 * @internal
 */
export type EnterstellarContextValue = {
    /** The component registry instance. */
    readonly registry: EnterstellarRegistry;
    /** The UI compiler instance. */
    readonly compiler: EnterstellarCompiler;
    /** The state store instance. */
    readonly store: EnterstellarStore;
    /** The telemetry collector instance. */
    readonly telemetry: TelemetryCollector;
    /** The React-specific renderer registry (module-level singleton). */
    readonly rendererRegistry: RendererRegistry;
    /**
     * The render cache instance, or `null` if caching is not enabled.
     *
     * Cache is opt-in — consumers pass a `RenderCache` instance to
     * `<Provider cache={cache}>`. When `null`, zones skip cache
     * lookups and compile every intent from scratch.
     *
     * @see Design Choice CA3 — global cache, shared across all zones.
     */
    readonly cache: RenderCache | null;
    /**
     * The adapter bag for auth, data, error, and analytics integrations.
     *
     * Defaults to `{}` (empty object) when no adapters are provided.
     * All fields are optional — consumers wire only the adapters they need.
     *
     * @see Design Choice AD1 — adapter instances injected at provider level.
     */
    readonly adapters: EnterstellarAdapters;
};

/**
 * Separate context value for the agent connection.
 *
 * Split from `EnterstellarContextValue` per RE9 — the agent connection has a
 * different lifecycle and may not exist in all usage scenarios.
 *
 * @internal
 */
export type EnterstellarAgentContextValue = {
    /** The agent connection instance, or `null` if not provided. */
    readonly connection: EnterstellarAgentConnection | null;
};

// ---------------------------------------------------------------------------
// Adapter Bag
// ---------------------------------------------------------------------------

/**
 * Optional adapters passed to `<Provider>`.
 *
 * Each adapter plugs in a specific infrastructure concern:
 * - `auth` — user authentication and RBAC
 * - `data` — data fetching and mutations
 * - `error` — error handling and retry logic
 * - `analytics` — analytics event tracking
 *
 * @see Bible §3.6
 * @see Design Choice AD1
 */
export type EnterstellarAdapters = {
    /** Authentication adapter (getSession, hasRole, onAuthChange). */
    readonly auth?: AuthAdapter;
    /** Data adapter (query, mutate, subscribe via convention-based dot notation). */
    readonly data?: DataAdapter;
    /** Error adapter (report, shouldRetry, sanitize). */
    readonly error?: ErrorAdapter;
    /** Analytics adapter (track, identify, page). */
    readonly analytics?: AnalyticsAdapter;
};

// ---------------------------------------------------------------------------
// Retry Policy
// ---------------------------------------------------------------------------

/**
 * Retry configuration for agent call failures in `<Zone>`.
 *
 * Default: `{ auto: true, maxRetries: 3, backoff: 'exponential' }`.
 *
 * @see Design Choice RE17
 */
export type RetryPolicy = {
    /** Whether to auto-retry on agent failure. */
    readonly auto: boolean;
    /** Maximum number of retry attempts. */
    readonly maxRetries: number;
    /** Backoff strategy between retries. */
    readonly backoff: 'exponential' | 'linear' | 'none';
};

// ---------------------------------------------------------------------------
// Provider Props
// ---------------------------------------------------------------------------

/**
 * Props for the `<Provider>` component.
 *
 * - `registry` is required — the component contract deck.
 * - `compiler`, `store`, `telemetry` are auto-created if omitted (RE1, RE2).
 * - `connection` is optional — consumer manages the transport (RE3).
 * - `threadId` is optional — persists conversation thread across sessions (P3).
 *
 * @see Design Choices RE1, RE2, RE3, RE4
 * @see Appendix E P3 (threadId)
 */
export type ProviderProps = {
    /** The Enterstellar component registry. Required. */
    readonly registry: EnterstellarRegistry;
    /**
     * Optional compiler. If omitted, auto-created from `registry` with
     * default `onValidationFailure: { strategy: 'fallback', fallbackComponent: 'GenericCard' }`.
     *
     * @see Design Choice RE1
     */
    readonly compiler?: EnterstellarCompiler;
    /**
     * Optional agent connection. Consumer manages the transport.
     * If omitted, zones operate in static mode only.
     *
     * @see Design Choice RE3
     */
    readonly connection?: EnterstellarAgentConnection;
    /**
     * Optional state store. If omitted, auto-created with
     * `persistence: 'indexed-db'` and sensible defaults.
     *
     * @see Design Choice RE2
     */
    readonly store?: EnterstellarStore;
    /**
     * Optional telemetry collector. If omitted, auto-created with
     * `queueStrategy: 'indexedDB'`, `flushIntervalMs: 30000`.
     *
     * @see Design Choice RE2
     */
    readonly telemetry?: TelemetryCollector;
    /**
     * Optional thread ID for persistent conversation tracking.
     * When provided, stored in `store.session.threadId` and included
     * in all `AgentTrace` records and `dispatch()` signals.
     *
     * @see Appendix E P3
     */
    readonly threadId?: string;
    /** Optional adapter bag for auth, data, error, and analytics. */
    readonly adapters?: EnterstellarAdapters;
    /**
     * Optional render cache for compiled intent memoization.
     *
     * When provided, zones check the cache before calling the compiler.
     * The provider does NOT auto-create a cache — consumers opt in
     * explicitly because cache implies warmup strategies and invalidation
     * responsibility.
     *
     * @see Design Choice CA3 — global cache, shared across zones.
     * @see Design Choice CA7 — async warmup, never blocking.
     */
    readonly cache?: RenderCache;
    /** React children to render within the provider. */
    readonly children: ReactNode;
};

// ---------------------------------------------------------------------------
// Zone Props
// ---------------------------------------------------------------------------

/**
 * Default retry policy per RE17.
 * Auto-retry 3 times with exponential backoff.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
    auto: true,
    maxRetries: 3,
    backoff: 'exponential',
} as const;

/** Default agent timeout in milliseconds per LC3 (30s). */
export const DEFAULT_AGENT_TIMEOUT_MS = 30_000;

/** Default debounce values per P6. */
export const DEFAULT_DEBOUNCE = {
    click: 0,
    input: 300,
} as const;

/**
 * Props for the `<Zone>` component.
 *
 * Each zone renders a wrapper `<div>` with `data-enterstellar-zone` (RE8),
 * enforces determinism rules, and compiles intents via the compiler.
 *
 * @see Design Choices RE5–RE8, RE16–RE18
 * @see Appendix E P6 (debounce), P13 (spatial), P14 (latest-intent-wins)
 */
export type ZoneProps = {
    /** Zone name (kebab-case per coding rules). Unique within the app. */
    readonly name: string;
    /**
     * Determinism level (0.0–1.0). Default: 1.0 (fully dynamic).
     * - `0.0` — static only, agent never called.
     * - `0.0–1.0` — hybrid.
     * - `1.0` — fully dynamic/generative.
     *
     * @see Design Choice T13
     */
    readonly determinism?: number;
    /** Whitelist of component names allowed in this zone. Empty = all allowed. */
    readonly allowedComponents?: readonly string[];
    /** React fallback content rendered during loading/error. */
    readonly fallback?: ReactNode;
    /** Fallback component name from registry. Default: `'GenericCard'`. */
    readonly fallbackComponent?: string;
    /**
     * Zone activation strategy.
     * - `'mount'` — call agent on component mount (default).
     * - `'visible'` — call agent when zone enters viewport.
     * - `'manual'` — consumer calls `zone.activate()`.
     *
     * @see Design Choice RE6
     */
    readonly activateOn?: 'mount' | 'visible' | 'manual';
    /**
     * Whether to show the provenance badge (trust indicator).
     * Renders at `position: absolute; top: 4px; right: 4px` inside
     * the zone wrapper. Hidden in production if not set.
     *
     * @see Design Choice RE7
     */
    readonly showProvenance?: boolean;
    /**
     * Agent timeout in milliseconds. Default: 30000 (30s per LC3).
     * After timeout, renders fallback component.
     */
    readonly timeout?: number;
    /**
     * Per-interaction debounce in milliseconds.
     * Default: `{ click: 0, input: 300 }` per P6.
     */
    readonly debounce?: {
        readonly click?: number;
        readonly input?: number;
    };
    /**
     * Retry policy for agent call failures.
     * Default: `{ auto: true, maxRetries: 3, backoff: 'exponential' }`.
     *
     * @see Design Choice RE17
     */
    readonly retryPolicy?: RetryPolicy;
    /**
     * Error callback fired when the zone catches a render error or
     * agent failure. Receives the error and the current trace (if any).
     *
     * @see Design Choice RE18
     */
    readonly onError?: (error: Error, trace: ZoneTrace | null) => void;
    /**
     * CSS class name applied to the zone wrapper `<div>`.
     *
     * @see Design Choice RE8
     */
    readonly className?: string;
    /**
     * Inline styles applied to the zone wrapper `<div>`.
     *
     * @see Design Choice RE8
     */
    readonly style?: CSSProperties;
    /** Static children rendered inside the zone (for determinism 0.0 = static). */
    readonly children?: ReactNode;
};

// ---------------------------------------------------------------------------
// Internal Renderer Lookup
// ---------------------------------------------------------------------------

/**
 * A registered React component renderer.
 *
 * Accepts props as `Record<string, unknown>` because the actual prop shape
 * is validated by the compiler (Zod parse) before reaching the renderer.
 *
 * @internal
 */
export type EnterstellarComponentRenderer = ComponentType<Record<string, unknown>>;
