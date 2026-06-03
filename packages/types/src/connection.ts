/**
 * @module @enterstellar-ai/types/connection
 * @description UserSignal and EnterstellarAgentConnection — the contract between
 * the UI layer and AI agents.
 *
 * `UserSignal` is the fire-and-forget message from a user interaction
 * (click, submit, input) back to the agent. `EnterstellarAgentConnection` is the
 * transport-agnostic interface for bidirectional agent communication.
 *
 * @see Bible §3.9, §3.10
 * @see Appendix E P1 (UserSignal), P7 (event whitelist), P11 (connection factory)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// String Union Types
// ---------------------------------------------------------------------------

/**
 * Type of user interaction signal dispatched to the agent.
 *
 * @see Appendix E P1
 */
export type UserSignalType =
    | 'click'
    | 'submit'
    | 'input'
    | 'custom';

/**
 * Agent-to-UI event types that trigger zone re-renders.
 * Internal agent events (graph node transitions, reducer internals)
 * are NOT surfaced.
 *
 * @see Appendix E P7
 */
export type AgentEventType =
    | 'intent'
    | 'lifecycle'
    | 'data'
    | 'message'
    | 'reconnect';

// ---------------------------------------------------------------------------
// UserSignal Type
// ---------------------------------------------------------------------------

/**
 * A user interaction signal dispatched from an Zone to the agent.
 *
 * Dispatched via `EnterstellarAgentConnection.dispatch()`. Fire-and-forget with
 * enqueue guarantee — the promise resolves when the signal is queued,
 * NOT when the agent processes it.
 *
 * @see Bible §3.9
 * @see Appendix E P1
 */
export type UserSignal = {
    /** Type of user interaction. */
    readonly type: UserSignalType;
    /** Name of the zone that originated this signal. */
    readonly zone: string;
    /** Name of the component that originated this signal. */
    readonly component: string;
    /** Arbitrary payload from the interaction (form data, click target, etc.). */
    readonly payload: Readonly<Record<string, unknown>>;
    /** ISO 8601 timestamp of when the interaction occurred. */
    readonly timestamp: string;
    /**
     * Optional correlation ID for tying this signal to an ongoing interaction chain.
     *
     * @see Appendix E P2
     */
    readonly correlationId?: string;
};

// ---------------------------------------------------------------------------
// EnterstellarAgentConnection Interface
// ---------------------------------------------------------------------------

/**
 * Transport-agnostic interface for bidirectional agent communication.
 *
 * Implementations are provided by `@enterstellar-ai/connection` (`createAgentConnection()`)
 * or custom consumer implementations. The connection is created and owned by
 * the consumer, not by Enterstellar (RE3).
 *
 * This is an **interface** (not a type) because it has methods.
 *
 * @see Bible §3.10
 * @see Design Choices RE3, P1, P5, P7, P11, P12
 * @see Design Choice T1 — interfaces for objects with methods.
 */
export interface EnterstellarAgentConnection {
    /**
     * Dispatches a user interaction signal to the agent.
     * Fire-and-forget: resolves when enqueued in the outbound queue,
     * NOT when the agent processes it.
     *
     * @param signal - The user signal to dispatch.
     * @param options - Optional dispatch options.
     * @returns Resolves when the signal is enqueued.
     *
     * @see Appendix E P1, P6 (debounce)
     */
    dispatch(
        signal: UserSignal,
        options?: { readonly immediate?: boolean },
    ): Promise<void>;

    /**
     * Subscribes to agent-to-UI events.
     * Only whitelisted event types are surfaced (P7).
     *
     * @param event - The event type to listen for.
     * @param callback - Called when the event fires.
     * @returns An unsubscribe function.
     *
     * @see Appendix E P7
     */
    on(event: AgentEventType, callback: (data: unknown) => void): () => void;

    /**
     * Subscribes to ALL raw agent events, including internal ones.
     * Escape hatch for custom DevTools panels and advanced use cases.
     *
     * @param callback - Called for every raw event.
     * @returns An unsubscribe function.
     *
     * @see Appendix E P7
     */
    onRawEvent(callback: (event: unknown) => void): () => void;

    /** Whether the connection is currently active. */
    readonly connected: boolean;

    /**
     * Disconnects the agent connection.
     * Queued signals are flushed before disconnecting.
     */
    disconnect(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating a `UserSignal` at runtime.
 *
 * @see Design Choice T7
 */
export const UserSignalSchema = z.object({
    type: z.enum(['click', 'submit', 'input', 'custom']),
    zone: z.string().min(1, 'Zone name is required.'),
    component: z.string().min(1, 'Component name is required.'),
    payload: z.record(z.string(), z.unknown()),
    timestamp: z.string().min(1, 'Timestamp is required.'),
    correlationId: z.string().optional(),
});
