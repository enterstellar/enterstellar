/**
 * @module @enterstellar-ai/telemetry/types
 * @description Module-internal types for the telemetry collector.
 *
 * These types define the public API surface of `@enterstellar-ai/telemetry`.
 * They are re-exported from the barrel (`index.ts`) for consumer use.
 *
 * @see Bible §4.12
 * @see Design Choices TL1–TL12
 */

import type { ForgeMode, IntentCategory, SignalPlatform } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// ForgeSignalInput — partial input accepted by record()
// ---------------------------------------------------------------------------

/**
 * The input shape accepted by {@link TelemetryCollector.record}.
 *
 * Callers provide **intent-specific data only**. The telemetry module
 * auto-fills `timestamp`, `sdkVersion`, `platform`, and `registrySize`.
 *
 * **Critical:** The caller passes the **raw intent string**, NOT the hash.
 * Hashing to SHA-256 happens inside `record()` (TL3) so PII never
 * leaves the device.
 *
 * @see Design Choice TL2 — partial input, auto-fill common fields.
 * @see Design Choice TL3 — hashing happens in `record()`.
 */
export type ForgeSignalInput = {
    /** Raw intent string from the user. Hashed internally to SHA-256; never transmitted. */
    readonly rawIntent: string;

    /** PascalCase name of the resolved component. */
    readonly componentName: string;

    /** Classification of the intent that produced this signal. */
    readonly intentCategory: IntentCategory;

    /** Whether compilation passed, failed, or was self-corrected. */
    readonly compilationStatus: 'pass' | 'fail' | 'corrected';

    /** Which forge mode was used, or `'none'` if the component came from the registry. */
    readonly forgeMode: ForgeMode;

    /** Whether the Forge was invoked at all. */
    readonly forgeUsed: boolean;

    /** Total pipeline latency from intent to rendered output, in milliseconds. */
    readonly latencyMs: number;

    /** Number of self-correction attempts before final result. `0` = passed first try. */
    readonly selfCorrectionAttempts: number;

    /**
     * Token usage for self-correction calls.
     * Tracked for cost observability, not enforced with a hard budget (C7).
     */
    readonly correctionTokensUsed: number;
};

// ---------------------------------------------------------------------------
// TelemetryConfig — configuration for createTelemetryCollector()
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createTelemetryCollector}.
 *
 * All fields are optional — sensible defaults are applied.
 *
 * @see Bible §4.12 — canonical config shape.
 * @see Design Choice TL4 — `queueStrategy: 'indexedDB'` uses separate DB.
 * @see Design Choice TL9 — `disabled: true` makes `record()` a silent no-op.
 */
export type TelemetryConfig = {
    /**
     * Cloud endpoint for signal upload.
     * @default 'https://api.enterstellar.dev/v1/signals'
     */
    readonly endpoint?: string | undefined;

    /**
     * Interval between automatic flushes, in milliseconds.
     * @default 30_000
     */
    readonly flushIntervalMs?: number | undefined;

    /**
     * Maximum signals queued before triggering an automatic flush.
     * @default 100
     */
    readonly batchSize?: number | undefined;

    /**
     * Enterprise opt-out flag. When `true`, `record()` is a silent no-op —
     * zero overhead, zero disk usage, zero network.
     * @default false
     * @see Design Choice TL9
     */
    readonly disabled?: boolean | undefined;

    /**
     * Queue persistence strategy.
     * - `'indexedDB'` — survives page refreshes, supports offline (browser).
     * - `'memory'` — in-memory only, suitable for SSR/Node/tests.
     * @default 'indexedDB'
     * @see Design Choice TL4
     */
    readonly queueStrategy?: 'memory' | 'indexedDB' | undefined;

    /**
     * Platform identifier. Auto-detected by the renderer package.
     * Override only in tests.
     * @see Design Choice P9 — inferred, not configured.
     */
    readonly platform?: SignalPlatform | undefined;

    /**
     * Number of components in the registry. Injected by the compiler
     * or `Provider` at creation time.
     * @default 0
     */
    readonly registrySize?: number | undefined;
};

// ---------------------------------------------------------------------------
// FlushResult
// ---------------------------------------------------------------------------

/**
 * Result of a flush operation.
 *
 * @see {@link TelemetryCollector.flush}
 */
export type FlushResult = {
    /** Number of signals successfully sent to the cloud endpoint. */
    readonly sent: number;

    /** Number of signals that failed to send (will be retried on next flush). */
    readonly failed: number;
};

// ---------------------------------------------------------------------------
// TelemetryStats
// ---------------------------------------------------------------------------

/**
 * Self-observability metrics for the telemetry collector.
 *
 * Exposed via {@link TelemetryCollector.getStats} and visible in
 * DevTools via the Cache Dashboard tab.
 *
 * @see Design Choice TL11
 */
export type TelemetryStats = {
    /** Number of signals currently queued and awaiting flush. */
    readonly queued: number;

    /** Cumulative count of signals successfully sent since collector creation. */
    readonly totalSent: number;

    /** Cumulative count of signals that failed to send since collector creation. */
    readonly totalFailed: number;

    /** ISO 8601 timestamp of the last successful flush, or `null` if never flushed. */
    readonly lastFlushAt: string | null;
};

// ---------------------------------------------------------------------------
// TelemetryCollector — the public API interface
// ---------------------------------------------------------------------------

/**
 * The telemetry collector interface — the primary public API of `@enterstellar-ai/telemetry`.
 *
 * Created via {@link createTelemetryCollector}. Records `ForgeSignal` events,
 * queues them locally, and flushes batches to the cloud endpoint.
 *
 * **Lifecycle:**
 * 1. Create via `createTelemetryCollector(config)`.
 * 2. `record()` is called automatically by `@enterstellar-ai/compiler` and `@enterstellar-ai/react` (TL1).
 * 3. Signals are flushed periodically or when the batch threshold is reached.
 * 4. Call `dispose()` on app shutdown to flush remaining signals.
 *
 * @see Bible §4.12
 * @see Design Choice TL1 — called automatically, not manually.
 */
export interface TelemetryCollector {
    /**
     * Record a telemetry signal from a compilation or render event.
     *
     * **Synchronous and non-blocking.** The signal is queued internally.
     * The raw intent string is SHA-256 hashed before queuing (TL3).
     *
     * If the collector is in backpressure mode (≥3 flushes in-flight, TL5),
     * the call is silently dropped.
     *
     * @param input - Partial signal data. Common fields are auto-filled (TL2).
     * @see Design Choice TL2 — partial input accepted.
     * @see Design Choice TL3 — hashing happens here.
     * @see Design Choice TL5 — backpressure at 3 in-flight flushes.
     */
    record(input: ForgeSignalInput): void;

    /**
     * Force-flush all queued signals to the cloud endpoint.
     *
     * Resolves when the flush completes (success or failure).
     * Failed signals are requeued for the next flush cycle.
     *
     * @returns The number of signals sent and failed in this flush.
     */
    flush(): Promise<FlushResult>;

    /**
     * Get self-observability metrics for the collector.
     *
     * @returns Current queue size, lifetime send/fail counts, and last flush timestamp.
     * @see Design Choice TL11
     */
    getStats(): TelemetryStats;

    /**
     * Gracefully shut down the collector.
     *
     * Flushes all remaining queued signals, clears the flush interval,
     * and releases resources. Resolves when complete.
     */
    dispose(): Promise<void>;
}
