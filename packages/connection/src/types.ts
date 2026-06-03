/**
 * @module @enterstellar-ai/connection/types
 * @description Internal configuration types for the connection module.
 *
 * These are data shapes (not object-with-methods), so they are `type` aliases
 * per Design Choice T1. No `Enterstellar` prefix — internal types only (T2).
 *
 * @internal Not exported from the public API surface.
 *
 * @see Bible §4.3b
 * @see Design Choices P5 (backpressure), P11 (separate package), S11 (transport fallback)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// String Union Types
// ---------------------------------------------------------------------------

/**
 * Transport protocol selection strategy.
 *
 * - `'websocket'` — Force WebSocket transport.
 * - `'sse'` — Force Server-Sent Events transport.
 * - `'polling'` — Force HTTP long-polling transport (30s interval).
 * - `'auto'` — 3-tier fallback: WebSocket (1s timeout) → SSE → polling.
 *
 * @see Design Choice S11, P11
 */
export type TransportType = 'websocket' | 'sse' | 'polling' | 'auto';

/**
 * Drop strategy when the intent buffer reaches capacity.
 *
 * - `'oldest'` — Drop the oldest buffered intent (default).
 * - `'newest'` — Drop the newly arriving intent.
 *
 * @see Design Choice P5
 */
export type DropStrategy = 'oldest' | 'newest';

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * Backpressure configuration for the inbound intent buffer.
 *
 * Controls how many pending intents can queue before dropping begins.
 * Intents with `interaction: 'actionable'` always bypass the buffer.
 *
 * @see Design Choice P5
 */
export type BackpressureConfig = {
    /** Maximum number of buffered intents before dropping. Default: 50. */
    readonly maxBuffer: number;
    /** Which end of the buffer to drop from when full. Default: `'oldest'`. */
    readonly dropStrategy: DropStrategy;
};

/**
 * Reconnect configuration for automatic connection recovery.
 *
 * Uses exponential backoff: 1s → 2s → 4s → 8s → 16s → maxDelay (cap).
 *
 * @see Design Choice P12, S11
 */
export type ReconnectConfig = {
    /** Maximum delay between reconnect attempts in milliseconds. Default: 30_000. */
    readonly maxDelay: number;
};

/**
 * Full configuration for `createAgentConnection()`.
 *
 * All fields are required after defaults are merged by the factory.
 * The public API accepts `Partial<BackpressureConfig>` and
 * `Partial<ReconnectConfig>` — defaults are applied in the factory.
 *
 * @see Bible §4.3b
 */
export type ConnectionConfig = {
    /** Agent endpoint URL (WebSocket or HTTP). Must be non-empty. */
    readonly url: string;
    /** Transport selection strategy. Default: `'auto'`. */
    readonly transport: TransportType;
    /** Backpressure configuration for inbound intent buffering. */
    readonly backpressure: BackpressureConfig;
    /** Reconnect configuration for automatic recovery after disconnects. */
    readonly reconnect: ReconnectConfig;
};

/**
 * User-facing factory input — partial config with defaults applied internally.
 *
 * @see Bible §4.3b
 */
export type ConnectionInput = {
    /** Agent endpoint URL (WebSocket or HTTP). Required. */
    readonly url: string;
    /** Transport selection strategy. Default: `'auto'`. */
    readonly transport?: TransportType;
    /** Backpressure configuration. Partial — unset fields use defaults. */
    readonly backpressure?: {
        readonly maxBuffer?: number;
        readonly dropStrategy?: DropStrategy;
    };
    /** Reconnect configuration. Partial — unset fields use defaults. */
    readonly reconnect?: {
        readonly maxDelay?: number;
    };
};

// ---------------------------------------------------------------------------
// Default Values
// ---------------------------------------------------------------------------

/** Default backpressure configuration. */
export const BACKPRESSURE_DEFAULTS: BackpressureConfig = {
    maxBuffer: 50,
    dropStrategy: 'oldest',
} as const;

/** Default reconnect configuration. */
export const RECONNECT_DEFAULTS: ReconnectConfig = {
    maxDelay: 30_000,
} as const;

/** Default transport type. */
export const TRANSPORT_DEFAULT: TransportType = 'auto';

/**
 * WebSocket connect timeout in milliseconds for `'auto'` mode.
 * If WebSocket doesn't connect within this window, fall back to SSE.
 *
 * @see Design Choice S11 — 1 second, per "instant UI" vision.
 */
export const AUTO_WS_TIMEOUT_MS = 1_000;

/**
 * Polling interval in milliseconds for the `'polling'` transport.
 * The polling transport fetches new messages at this fixed interval.
 *
 * @see Design Choice S11 — polling is "last resort, 30s interval".
 */
export const POLLING_INTERVAL_MS = 30_000;

/**
 * Initial backoff delay for reconnect attempts in milliseconds.
 *
 * @see Design Choice S11
 */
export const INITIAL_BACKOFF_MS = 1_000;

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/** Zod schema for `BackpressureConfig` runtime validation. */
export const BackpressureConfigSchema = z.object({
    maxBuffer: z
        .number()
        .int('maxBuffer must be an integer.')
        .positive('maxBuffer must be positive.'),
    dropStrategy: z.enum(['oldest', 'newest']),
});

/** Zod schema for `ReconnectConfig` runtime validation. */
export const ReconnectConfigSchema = z.object({
    maxDelay: z
        .number()
        .int('maxDelay must be an integer.')
        .min(1_000, 'maxDelay must be at least 1000ms.'),
});

/** Zod schema for the user-facing `ConnectionInput` runtime validation. */
export const ConnectionInputSchema = z.object({
    url: z.string().min(1, 'Connection URL is required.'),
    transport: z.enum(['websocket', 'sse', 'polling', 'auto']).optional(),
    backpressure: z
        .object({
            maxBuffer: z
                .number()
                .int('maxBuffer must be an integer.')
                .positive('maxBuffer must be positive.')
                .optional(),
            dropStrategy: z.enum(['oldest', 'newest']).optional(),
        })
        .optional(),
    reconnect: z
        .object({
            maxDelay: z
                .number()
                .int('maxDelay must be an integer.')
                .min(1_000, 'maxDelay must be at least 1000ms.')
                .optional(),
        })
        .optional(),
});
