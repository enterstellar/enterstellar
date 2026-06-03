/**
 * @module @enterstellar-ai/normalizer/types
 * @description Public types for the `@enterstellar-ai/normalizer` module.
 *
 * Defines the `ProtocolNormalizer` interface (T1: interface for objects
 * with methods), configuration types, and AG-UI event shapes.
 *
 * @see Bible §4.9
 * @see Design Choices N1–N6
 * @see Design Choice T1 — interfaces for objects with methods
 */

import type { ComponentIntent, IntentProtocol } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Protocol Normalizer Interface
// ---------------------------------------------------------------------------

/**
 * A protocol-specific adapter that converts raw events into `ComponentIntent`.
 *
 * One adapter per protocol. Each adapter declares which protocol it handles,
 * provides `canHandle()` for lightweight structural detection, and
 * `normalize()` for the actual conversion.
 *
 * The interface follows the Enterstellar convention (T1): interfaces are used for
 * objects with methods, types for data shapes.
 *
 * @example
 * ```ts
 * const myAdapter: ProtocolNormalizer = {
 *   protocol: 'custom',
 *   canHandle: (event) => typeof event === 'object' && event !== null,
 *   normalize: (event) => ({
 *     component: 'MyComponent',
 *     props: {},
 *     confidence: 0.9,
 *   }),
 * };
 * ```
 *
 * @see Bible §4.9
 * @see Design Choice N3 — explicit factory, no auto-detection
 */
export interface ProtocolNormalizer {
    /** The protocol this normalizer handles. Read-only once created. */
    readonly protocol: IntentProtocol;

    /**
     * Lightweight structural check: can this normalizer handle the given event?
     *
     * Must be synchronous and fast — no parsing, no async, no side effects.
     * Used by `createNormalizer()` to dispatch events to the correct adapter.
     *
     * @param event - Raw event from the protocol transport, typed as `unknown`.
     * @returns `true` if this adapter can normalize the event.
     */
    canHandle(event: unknown): boolean;

    /**
     * Convert a raw protocol event into a `ComponentIntent`.
     *
     * Returns `null` if the event has no UI implication (e.g., AG-UI
     * `RunStartedEvent` maps to a lifecycle signal, not a component intent).
     *
     * The returned `ComponentIntent` is validated by `createNormalizer()`
     * against `ComponentIntentSchema` before being returned to the consumer.
     *
     * @param event - Raw event from the protocol transport, typed as `unknown`.
     * @returns A normalized `ComponentIntent`, or `null` if no UI intent.
     */
    normalize(event: unknown): ComponentIntent | null;
}

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the `createNormalizer()` factory.
 *
 * @see Bible §4.9
 * @see Design Choice N3
 */
export type NormalizerConfig = {
    /**
     * Ordered list of protocol adapters.
     *
     * When an event is dispatched, adapters are checked in order.
     * The first adapter whose `canHandle()` returns `true` processes the event.
     * Order matters — place the most specific adapter first.
     */
    readonly adapters: readonly ProtocolNormalizer[];
};

/**
 * The dispatch function returned by `createNormalizer()`.
 *
 * Accepts a raw protocol event (typed as `unknown`) and returns a
 * validated `ComponentIntent` or `null` if the event has no UI implication.
 *
 * @param event - Raw event from any protocol transport.
 * @returns A validated `ComponentIntent`, or `null`.
 *
 * @throws EnterstellarError `ENS-6001` if no adapter can handle the event.
 * @throws EnterstellarError `ENS-6002` if the matched adapter's `normalize()` fails.
 * @throws EnterstellarError `ENS-6003` if the assembled intent fails Zod validation.
 */
export type NormalizerDispatch = (event: unknown) => ComponentIntent | null;

// ---------------------------------------------------------------------------
// AG-UI Adapter Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the AG-UI protocol adapter.
 *
 * @see Design Choice N4 — AG-UI event mapping
 * @see Design Choice N5 — buffer-and-assemble streaming
 */
export type AGUIAdapterConfig = {
    /**
     * Default confidence score for intents from AG-UI tool calls (0.0–1.0).
     *
     * Used when the agent does not provide an explicit confidence value.
     * Must be between 0.0 and 1.0 inclusive.
     *
     * @default 0.8
     */
    readonly defaultConfidence?: number;
};

// ---------------------------------------------------------------------------
// Custom Adapter Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a custom protocol adapter.
 *
 * The consumer provides a normalization function that converts their
 * proprietary protocol messages into `ComponentIntent`.
 *
 * @example
 * ```ts
 * const config: CustomAdapterConfig = {
 *   normalize: (msg) => {
 *     const typed = msg as { action: string; data: Record<string, unknown> };
 *     return {
 *       component: typed.action,
 *       props: typed.data,
 *       confidence: 0.9,
 *     };
 *   },
 *   canHandle: (msg) => typeof msg === 'object' && msg !== null && 'action' in msg,
 * };
 * ```
 *
 * @see Design Choice N2 — custom normalizer signature
 */
export type CustomAdapterConfig = {
    /**
     * The user-provided normalization function.
     *
     * Receives a raw protocol message (typed as `unknown`) and must return
     * a `ComponentIntent` or `null` if the message doesn't map to a UI intent.
     *
     * @see Design Choice N2
     */
    readonly normalize: (message: unknown) => ComponentIntent | null;

    /**
     * Optional structural check for whether this adapter handles the message.
     *
     * If not provided, defaults to a function that always returns `true` —
     * meaning this adapter acts as a catch-all. Place it last in the
     * adapter list to avoid shadowing more specific adapters.
     */
    readonly canHandle?: (message: unknown) => boolean;
};

// ---------------------------------------------------------------------------
// AG-UI Event Shapes (N4)
// ---------------------------------------------------------------------------

/**
 * Shape of AG-UI events that may produce a `ComponentIntent`.
 *
 * These are structural types for runtime detection — NOT the full AG-UI SDK
 * types (which are an external dependency we don't import per L15).
 *
 * @see Design Choice N4
 */
export type AGUIToolCallEvent = {
    /** Event type discriminator. */
    readonly type: 'tool_call_start';
    /** Unique identifier for this tool call. */
    readonly toolCallId: string;
    /** Name of the tool being invoked — maps to component name. */
    readonly toolName: string;
    /** Arguments for the tool call — maps to component props. */
    readonly args: Record<string, unknown>;
    /** Run identifier — used as `correlationId` (P2). */
    readonly runId?: string;
};

/**
 * Shape of AG-UI text message events.
 *
 * Text messages don't directly map to component intents in v1 —
 * they're handled by the chat layer. The normalizer returns `null`
 * for these events.
 *
 * @see Design Choice N4
 */
export type AGUITextMessageEvent = {
    /** Event type discriminator. */
    readonly type: 'text_message_start';
    /** Message identifier. */
    readonly messageId: string;
    /** Text content of the message. */
    readonly content?: string;
    /** Run identifier — used as `correlationId` (P2). */
    readonly runId?: string;
};

/**
 * Shape of AG-UI lifecycle events — these produce lifecycle signals,
 * NOT component intents.
 *
 * @see Design Choice N4
 */
export type AGUILifecycleEvent = {
    /** Event type discriminator. */
    readonly type: 'run_started' | 'run_finished' | 'run_error';
    /** Run identifier. */
    readonly runId?: string;
};

/**
 * Union of all AG-UI event shapes handled by the normalizer.
 */
export type AGUIEvent =
    | AGUIToolCallEvent
    | AGUITextMessageEvent
    | AGUILifecycleEvent;
