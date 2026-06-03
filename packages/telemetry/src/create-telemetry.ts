/**
 * @module @enterstellar-ai/telemetry/create-telemetry
 * @description Async factory for creating a `TelemetryCollector`.
 *
 * This is the primary public API of `@enterstellar-ai/telemetry`. It wires together:
 * - A {@link SignalQueue} (memory or IndexedDB, selected by `queueStrategy`)
 * - A {@link SignalTransport} (cloud HTTP or no-op)
 * - A {@link FlushScheduler} (periodic + threshold flushing)
 * - A {@link buildSignal signal builder} (auto-fill + hashing + PII guard)
 *
 * The factory is async because the IndexedDB queue requires opening a
 * database connection. When `disabled: true`, the frozen no-op collector
 * is returned immediately (wrapped in a resolved `Promise`).
 *
 * @see Bible §4.12
 * @see Design Choice TL4 — IndexedDB queue uses separate `enterstellar-telemetry` DB.
 * @see Design Choice TL9 — `disabled: true` returns a frozen no-op.
 */

import { createFlushScheduler } from './flush-scheduler.js';
import { createIndexedDBQueue } from './queue/indexed-db-queue.js';
import { createMemoryQueue } from './queue/memory-queue.js';
import type { SignalQueue } from './queue/signal-queue.js';
import { buildSignal } from './signal-builder.js';
import type { SignalBuilderConfig } from './signal-builder.js';
import { createCloudTransport } from './transport/cloud-transport.js';
import type {
    FlushResult,
    ForgeSignalInput,
    TelemetryCollector,
    TelemetryConfig,
    TelemetryStats,
} from './types.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default cloud endpoint for signal upload. */
const DEFAULT_ENDPOINT = 'https://api.enterstellar.dev/v1/signals';

/** Default flush interval in milliseconds (30 seconds). */
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;

/** Default batch size (signals per flush). */
const DEFAULT_BATCH_SIZE = 100;

/** Default platform. */
const DEFAULT_PLATFORM = 'unknown' as const;

// ---------------------------------------------------------------------------
// Frozen No-Op Collector (TL9)
// ---------------------------------------------------------------------------

/**
 * A frozen, zero-overhead collector returned when `disabled: true`.
 * Every method is a no-op. No queuing, no flushing, no disk usage.
 *
 * @see Design Choice TL9
 */
const NOOP_COLLECTOR: TelemetryCollector = Object.freeze({
    record(_input: ForgeSignalInput): void {
        // Silent no-op — zero overhead (TL9).
    },
    flush(): Promise<FlushResult> {
        return Promise.resolve({ sent: 0, failed: 0 });
    },
    getStats(): TelemetryStats {
        return { queued: 0, totalSent: 0, totalFailed: 0, lastFlushAt: null };
    },
    dispose(): Promise<void> {
        // Nothing to dispose.
        return Promise.resolve();
    },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a {@link TelemetryCollector} for recording and uploading
 * ForgeSignal telemetry.
 *
 * **Async:** The factory is async because the `'indexedDB'` queue strategy
 * requires opening a database connection (TL4). When `disabled: true`,
 * the frozen no-op collector is returned immediately — no async work.
 *
 * **Queue strategy default:** `'indexedDB'` per Bible §4.12. Falls back
 * to memory queue silently when IndexedDB is unavailable (Node.js, SSR),
 * matching `createEnterstellarStore()`'s graceful degradation pattern.
 *
 * **Usage:**
 * ```ts
 * import { createTelemetryCollector } from '@enterstellar-ai/telemetry';
 *
 * const telemetry = await createTelemetryCollector({
 *   endpoint: 'https://api.enterstellar.dev/v1/signals',
 *   flushIntervalMs: 30_000,
 *   batchSize: 100,
 *   queueStrategy: 'indexedDB',
 *   platform: 'web',
 *   registrySize: 42,
 * });
 *
 * // Called automatically by @enterstellar-ai/compiler and @enterstellar-ai/react (TL1).
 * telemetry.record({
 *   rawIntent: 'show patient vitals',
 *   componentName: 'PatientVitals',
 *   intentCategory: 'clinical',
 *   compilationStatus: 'pass',
 *   forgeMode: 'none',
 *   forgeUsed: false,
 *   latencyMs: 12,
 *   selfCorrectionAttempts: 0,
 *   correctionTokensUsed: 0,
 * });
 *
 * // On shutdown:
 * await telemetry.dispose();
 * ```
 *
 * @param config - Optional configuration. All fields have sensible defaults.
 * @returns A promise resolving to a `TelemetryCollector` instance.
 *
 * @see Design Choice TL4 — IndexedDB queue uses separate `enterstellar-telemetry` DB.
 * @see Design Choice TL9 — `disabled: true` returns a frozen no-op.
 * @see Design Choice TL1 — called by compiler and react, not manually.
 */
export async function createTelemetryCollector(
    config?: TelemetryConfig,
): Promise<TelemetryCollector> {
    // -------------------------------------------------------------------------
    // TL9: Enterprise opt-out — return frozen no-op immediately.
    // -------------------------------------------------------------------------
    if (config?.disabled === true) {
        return NOOP_COLLECTOR;
    }

    // -------------------------------------------------------------------------
    // Resolve configuration with defaults.
    // -------------------------------------------------------------------------
    const endpoint = config?.endpoint ?? DEFAULT_ENDPOINT;
    const flushIntervalMs = config?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    const batchSize = config?.batchSize ?? DEFAULT_BATCH_SIZE;
    const queueStrategy = config?.queueStrategy ?? 'indexedDB'; // Bible §4.12 default
    const platform = config?.platform ?? DEFAULT_PLATFORM;
    const registrySize = config?.registrySize ?? 0;

    // -------------------------------------------------------------------------
    // Queue: memory or IndexedDB (TL4).
    // -------------------------------------------------------------------------
    // IndexedDB is the default (Bible §4.12). It persists signals across page
    // refreshes and browser crashes, enabling offline-first telemetry.
    // When IndexedDB is unavailable (Node.js, SSR, test environments),
    // we gracefully fall back to memory — matching @enterstellar-ai/state's pattern
    // in createEnterstellarStore() (create-store.ts L177–186).
    // -------------------------------------------------------------------------
    let queue: SignalQueue;

    if (queueStrategy === 'indexedDB') {
        try {
            queue = await createIndexedDBQueue();
        } catch {
            // IndexedDB unavailable (Node.js, SSR, or blocked by browser policy).
            // Fall back to memory queue silently. The collector's contract is
            // "always start" — queue initialization failure must never block.
            queue = createMemoryQueue();
        }
    } else {
        queue = createMemoryQueue();
    }

    // -------------------------------------------------------------------------
    // Assemble the pipeline.
    // -------------------------------------------------------------------------

    // Transport: cloud HTTP or no-op.
    const transport = createCloudTransport({ endpoint });

    // Flush scheduler: periodic + threshold + backpressure.
    const scheduler = createFlushScheduler(queue, transport, {
        flushIntervalMs,
        batchSize,
    });

    // Signal builder config (static per collector instance).
    const builderConfig: SignalBuilderConfig = { platform, registrySize };

    // -------------------------------------------------------------------------
    // Track disposal state.
    // -------------------------------------------------------------------------
    let isDisposed = false;

    // -------------------------------------------------------------------------
    // Return the collector.
    // -------------------------------------------------------------------------
    return {
        record(input: ForgeSignalInput): void {
            // Guard: disposed or backpressured → silently drop (TL5).
            if (isDisposed || scheduler.isBackpressured()) {
                return;
            }

            // Build signal (async: hashing) and enqueue. Fire-and-forget.
            // record() is synchronous to the caller — the async work happens
            // in the background to avoid blocking the render path.
            void buildSignal(input, builderConfig).then(async (signal) => {
                await queue.enqueue(signal);
                scheduler.notifyEnqueued(1);
                scheduler.checkThreshold();
            });
        },

        async flush(): Promise<FlushResult> {
            return scheduler.flush();
        },

        getStats(): TelemetryStats {
            const { totalSent, totalFailed } = scheduler.counters();

            return {
                queued: scheduler.queuedCount(),
                totalSent,
                totalFailed,
                lastFlushAt: scheduler.lastFlushAt(),
            };
        },

        async dispose(): Promise<void> {
            if (isDisposed) {
                return;
            }

            isDisposed = true;
            await scheduler.dispose();

            // Release the queue's underlying resources. For IndexedDB queues,
            // this closes the IDBDatabase connection — required to unblock
            // deleteDatabase() and prevent connection leaks.
            // Memory queues have no close() method — optional chaining is safe.
            queue.close?.();
        },
    };
}
