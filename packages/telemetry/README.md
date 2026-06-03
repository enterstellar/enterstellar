# @enterstellar-ai/telemetry

> ForgeSignal collection, queuing, and upload. Zero-PII telemetry for the Forge.

## Purpose

`@enterstellar-ai/telemetry` provides `createTelemetryCollector()` — the data pipeline powering the 3 network-effect moats (M2, M4, M5). Every Enterstellar compilation emits a `ForgeSignal` — a zero-PII telemetry payload containing hashed intents, component names, and latency metrics. Signals are queued locally, batched, and uploaded to `api.enterstellar.dev/v1/signals`.

**Key properties:**

- **TL1:** Called automatically by `@enterstellar-ai/compiler` and `@enterstellar-ai/react`. No manual calls needed.
- **TL2:** `record()` accepts partial input — auto-fills `timestamp`, `sdkVersion`, `platform`, `registrySize`.
- **TL3:** Raw intent is SHA-256 hashed inside `record()` — PII never leaves the device.
- **TL4:** IndexedDB queue uses separate `enterstellar-telemetry` DB — isolated from `@enterstellar-ai/state`'s `enterstellar-store`.
- **TL5:** Max 3 in-flight flushes, then backpressure (signals silently dropped).
- **TL6:** `POST /v1/signals` with JSON array body.
- **TL7:** Exponential backoff on failures: 1s → 2s → 4s → 8s → 16s → 60s cap.
- **TL8:** Targeted PII check on `componentName` only — no aggressive scanning.
- **TL9:** `disabled: true` → frozen no-op singleton. Zero overhead, zero disk, zero network.
- **TL10:** ForgeSignal is mandatory per L12 — no user consent required (zero PII).
- **TL11:** `getStats()` returns queue size, send/fail counts, last flush timestamp.
- **TL12:** Failed batches retried up to 5×, then dropped. No batch splitting.
- **L15:** Zero framework dependencies — works in Node.js, Deno, browsers, and SSR.

---

## Quick Start

```ts
import { createTelemetryCollector } from '@enterstellar-ai/telemetry';

const telemetry = await createTelemetryCollector({
  platform: 'web',
  registrySize: 42,
});

// Called automatically by @enterstellar-ai/compiler and @enterstellar-ai/react (TL1).
// Manual calls are NOT needed in normal usage.
telemetry.record({
  rawIntent: 'show patient vitals',
  componentName: 'PatientVitals',
  intentCategory: 'clinical',
  compilationStatus: 'pass',
  forgeMode: 'none',
  forgeUsed: false,
  latencyMs: 12,
  selfCorrectionAttempts: 0,
  correctionTokensUsed: 0,
});

// On shutdown:
await telemetry.dispose();
```

---

## API Reference

### `createTelemetryCollector(config?): Promise<TelemetryCollector>`

Async factory function. Returns a collector instance after initializing the
queue (IndexedDB by default, memory as fallback). When `disabled: true`,
returns a frozen no-op singleton immediately with zero overhead (TL9).

### `TelemetryCollector` Methods

| Method          | Signature                           | Description                                                                                                                                                              |
| :-------------- | :---------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record(input)` | `(input: ForgeSignalInput) => void` | Record a signal. Synchronous, non-blocking. Hashes the raw intent to SHA-256 (TL3), runs PII guard (TL8), enqueues. Silently dropped if backpressured (TL5) or disposed. |
| `flush()`       | `() => Promise<FlushResult>`        | Force-flush all queued signals. Returns `{ sent, failed }`. Failed signals are requeued (TL12).                                                                          |
| `getStats()`    | `() => TelemetryStats`              | Returns `{ queued, totalSent, totalFailed, lastFlushAt }`. Visible in DevTools (TL11).                                                                                   |
| `dispose()`     | `() => Promise<void>`               | Graceful shutdown: final flush, clear interval, release resources. Post-dispose `record()` is a no-op.                                                                   |

### Types

```ts
/** Partial input accepted by record(). Auto-fills are handled internally. */
type ForgeSignalInput = {
  rawIntent: string; // Hashed to SHA-256 internally (TL3)
  componentName: string; // PII guard checked (TL8)
  intentCategory: IntentCategory;
  compilationStatus: 'pass' | 'fail' | 'corrected';
  forgeMode: ForgeMode;
  forgeUsed: boolean;
  latencyMs: number;
  selfCorrectionAttempts: number;
  correctionTokensUsed: number;
};

/** Result of a flush operation. */
type FlushResult = { sent: number; failed: number };

/** Self-observability metrics. */
type TelemetryStats = {
  queued: number;
  totalSent: number;
  totalFailed: number;
  lastFlushAt: string | null;
};
```

### Exports

```ts
// Factory
export { createTelemetryCollector } from './create-telemetry.js';

// Types (re-exported for consumer use)
export type {
  TelemetryCollector,
  TelemetryConfig,
  TelemetryStats,
  FlushResult,
  ForgeSignalInput,
} from './types.js';
```

---

## Configuration

### `TelemetryConfig`

| Option            | Type                                                   | Default                                     | Description                                                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------ | :------------------------------------------------------------------------- |
| `endpoint`        | `string`                                               | `'https://api.enterstellar.dev/v1/signals'` | Cloud signal ingestion endpoint.                                           |
| `flushIntervalMs` | `number`                                               | `30_000`                                    | Auto-flush interval in ms.                                                 |
| `batchSize`       | `number`                                               | `100`                                       | Signals per batch before threshold flush.                                  |
| `disabled`        | `boolean`                                              | `false`                                     | Enterprise opt-out (TL9). When `true`, zero overhead.                      |
| `queueStrategy`   | `'memory' \| 'indexedDB'`                              | `'indexedDB'`                               | Queue persistence. `'indexedDB'` = survives refresh (Bible §4.12 default). |
| `platform`        | `'web' \| 'native' \| 'desktop' \| 'cli' \| 'unknown'` | `'unknown'`                                 | Auto-set by renderer package.                                              |
| `registrySize`    | `number`                                               | `0`                                         | Number of components in the registry. Injected by compiler.                |

### Queue Strategies

| Strategy    | Storage                                 | Use Case                             |
| :---------- | :-------------------------------------- | :----------------------------------- |
| `memory`    | None (ephemeral)                        | Tests, SSR, Node.js                  |
| `indexedDB` | IndexedDB (`enterstellar-telemetry` DB) | Production web apps, offline support |

---

## Telemetry Pipeline

```
record(input) → buildSignal() → queue.enqueue() → scheduler.notifyEnqueued(1)
                    │                                       │
                    ├── hashIntent() (SHA-256, TL3)         ├── scheduler.checkThreshold()
                    ├── checkComponentNamePii() (TL8)       │     queued >= batchSize?
                    └── auto-fill timestamp, sdk, etc.      │       yes → executeSingleFlush()
                                                            │       no  → wait for interval
                                                            │
                                                      setInterval(flushIntervalMs)
                                                            │
                                                      executeSingleFlush()
                                                            │
                                                      queue.dequeue(batchSize) → queued -= batch.length
                                                            │
                                                      transport.send(batch)
                                                       ├── 2xx → success, counters++
                                                       ├── 429 → Retry-After or backoff, requeue → queued += batch.length
                                                       ├── 5xx → exponential backoff (TL7)
                                                       └── fail 5× → drop batch (TL12)
```

---

## Design Choices Applied

TL1 (dual call-site), TL2 (partial input), TL3 (internal hashing), TL4 (isolated IDB), TL5 (backpressure at 3), TL6 (POST JSON array), TL7 (exponential backoff), TL8 (targeted PII), TL9 (frozen no-op), TL10 (mandatory, no consent), TL11 (self-observability), TL12 (batch retry, max 5×), L15 (framework-agnostic).

---

## Bible Reference

See [Implementation Bible §4.12](../../agent/03-enterstellar-implementation-bible.md) for the canonical `TelemetryCollector` specification, and [Design Choices Appendix](../../agent/04-enterstellar-design-choices.md) for decisions TL1–TL12.
