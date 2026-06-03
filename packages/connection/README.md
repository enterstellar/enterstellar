# @enterstellar-ai/connection

> Transport-managed bidirectional agent communication — WebSocket, SSE, polling, auto 3-tier fallback, reconnect, backpressure, and cross-device state sync.

## Purpose

`@enterstellar-ai/connection` provides `createAgentConnection()`, a factory that returns an `EnterstellarAgentConnection` for bidirectional communication between Enterstellar zones and AI agents. It handles 3-tier transport selection (WebSocket → SSE → polling), exponential backoff reconnection, intent backpressure buffering, typed event routing, and `UserSignal` dispatch with Zod runtime validation.

It also provides `createStoreSyncRuntime()` for cross-device `EnterstellarStore` synchronization — wiring an `EnterstellarStore` to a remote sync endpoint with REST initial fetch and incremental transport updates.

**Key properties:**

- **P1:** Fire-and-forget `dispatch()` — promise resolves when enqueued, delivery is best-effort.
- **P5:** Backpressure buffer with `ENS-3010` drop warnings and configurable oldest/newest strategy.
- **P7:** Event whitelist — only `intent`, `lifecycle`, `data`, `message`, `reconnect` events are classified; unknown types silently ignored.
- **P11:** Separate package — `@enterstellar-ai/connection` is independent of `@enterstellar-ai/react`.
- **P12:** `onRawEvent()` escape hatch for protocol-level debugging.
- **R1:** Plain objects with closures, not classes. All returned objects are frozen.
- **RE3:** This package is consumer-managed — `Provider` in `@enterstellar-ai/react` accepts a connection but never creates one.
- **S11:** Auto mode = 3-tier fallback: WebSocket (1s timeout) → SSE → polling (30s interval).
- **L15:** Zero framework imports — uses only Web APIs (`WebSocket`, `EventSource`, `fetch`, `setTimeout`).

---

## Quick Start

```ts
import { createAgentConnection } from '@enterstellar-ai/connection';

// 1. Create a connection
const connection = createAgentConnection({
  url: 'wss://agent.example.com/ws',
  transport: 'auto', // default: 3-tier WS (1s) → SSE → polling (30s)
  backpressure: { maxBuffer: 50, dropStrategy: 'oldest' },
  reconnect: { maxDelay: 30_000 },
});

// 2. Subscribe to events
const unsub = connection.on('intent', (intent) => {
  console.log('Received intent:', intent);
});

connection.on('lifecycle', (state) => {
  console.log('Lifecycle:', state); // 'loading' | 'ready' | 'error'
});

// 3. Raw event escape hatch (P12)
connection.onRawEvent((event) => {
  console.log('Raw:', event); // all inbound events, unclassified
});

// 4. Dispatch user signals
await connection.dispatch({
  type: 'click',
  zone: 'main-dashboard',
  component: 'PatientVitals',
  payload: { action: 'refresh' },
  timestamp: new Date().toISOString(),
});

// 5. Cleanup
unsub();
await connection.disconnect();
```

---

## API Reference

### `createAgentConnection(input)`

Creates an `EnterstellarAgentConnection` with managed transport, reconnect, backpressure, and event routing.

| Parameter            | Type                                          | Required | Description                            |
| :------------------- | :-------------------------------------------- | :------: | :------------------------------------- |
| `input.url`          | `string`                                      |    ✅    | Agent endpoint URL.                    |
| `input.transport`    | `'websocket' \| 'sse' \| 'polling' \| 'auto'` |    —     | Transport strategy. Default: `'auto'`. |
| `input.backpressure` | `BackpressureConfig`                          |    —     | Intent buffer config. See below.       |
| `input.reconnect`    | `ReconnectConfig`                             |    —     | Reconnect config. See below.           |

**Returns:** `EnterstellarAgentConnection` — a frozen plain object.

**Throws:** `EnterstellarError` `ENS-3001` if config is invalid (developer error, fatal).

### `EnterstellarAgentConnection` Methods

| Method                       | Signature                                        | Description                                                               |
| :--------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------ |
| `dispatch(signal, options?)` | `(UserSignal, { immediate? }) => Promise<void>`  | Validates via Zod, serializes, sends. Rejects with `ENS-3001` if invalid. |
| `on(event, callback)`        | `(AgentEventType, (data) => void) => () => void` | Subscribe to typed events. Returns unsubscribe function.                  |
| `onRawEvent(callback)`       | `((event: unknown) => void) => () => void`       | Subscribe to all raw inbound events (P12).                                |
| `disconnect()`               | `() => Promise<void>`                            | Tears down transport, cancels reconnect, clears listeners.                |
| `connected`                  | `boolean` (getter)                               | Whether the transport is currently connected.                             |

### `createStoreSyncRuntime(store, syncConfig)`

Wires an `EnterstellarStore` to a remote sync endpoint for cross-device state synchronization.

| Parameter               | Type                | Required | Description                            |
| :---------------------- | :------------------ | :------: | :------------------------------------- |
| `store`                 | `EnterstellarStore` |    ✅    | The store instance to synchronize.     |
| `syncConfig.enabled`    | `boolean`           |    ✅    | Must be `true`.                        |
| `syncConfig.endpoint`   | `string`            |    ✅    | Remote sync endpoint URL.              |
| `syncConfig.debounceMs` | `number`            |    ✅    | Debounce interval for outbound pushes. |

**Returns:** `Promise<StoreSyncRuntime>` — object with `connected` getter and `destroy()` method.

**Throws:** `EnterstellarError` `ENS-3001` if `enabled` is false or `endpoint` is empty (developer error, fatal).

**Protocol (S11):**

1. Initial state: `GET {endpoint}` → `store.restore()` (non-fatal if fails).
2. Inbound updates: 3-tier transport (WS → SSE → polling) → `store.restore()`.
3. Outbound push: store change → debounced `POST {endpoint}` with `store.snapshot()`.
4. Feedback loop prevention: inbound restores suppress outbound pushes.

```ts
import { createStoreSyncRuntime } from '@enterstellar-ai/connection';

const syncRuntime = await createStoreSyncRuntime(store, {
  enabled: true,
  endpoint: 'https://sync.example.com/state',
  debounceMs: 100,
});

// State is now synchronized — changes push/pull automatically.
// On app teardown:
syncRuntime.destroy();
```

### Event Types

| Event       | Payload Type                        | Description                               |
| :---------- | :---------------------------------- | :---------------------------------------- |
| `intent`    | `ComponentIntent`                   | Agent sends a component rendering intent. |
| `lifecycle` | `'loading' \| 'ready' \| 'error'`   | Agent lifecycle state changes.            |
| `data`      | `Readonly<Record<string, unknown>>` | Arbitrary structured data from agent.     |
| `message`   | `string`                            | Text messages from agent.                 |
| `reconnect` | `undefined`                         | Emitted after successful reconnection.    |

### Exported Types

| Type                 | Description                                                                   |
| :------------------- | :---------------------------------------------------------------------------- |
| `ConnectionInput`    | User-facing factory input with partial config and defaults.                   |
| `TransportType`      | `'websocket' \| 'sse' \| 'polling' \| 'auto'`.                                |
| `BackpressureConfig` | Intent buffer configuration.                                                  |
| `ReconnectConfig`    | Reconnect configuration.                                                      |
| `DropStrategy`       | `'oldest' \| 'newest'`.                                                       |
| `StoreSyncRuntime`   | Return type of `createStoreSyncRuntime`: `{ connected, destroy() }`.          |
| `SyncConfig`         | Re-export from `@enterstellar-ai/types`: `{ enabled, endpoint, debounceMs }`. |

### Error Codes

| Code       | Scenario                           | Recoverable          |
| :--------- | :--------------------------------- | :------------------- |
| `ENS-3001` | Invalid connection config          | No (developer error) |
| `ENS-3003` | Connection failed / timeout        | Yes                  |
| `ENS-3004` | Send on disconnected transport     | No                   |
| `ENS-3005` | Inbound message JSON parse failure | Yes                  |
| `ENS-3010` | Intent dropped due to backpressure | Yes                  |

---

## Configuration

### `BackpressureConfig`

| Option         | Type                   | Default    | Description                                        |
| :------------- | :--------------------- | :--------- | :------------------------------------------------- |
| `maxBuffer`    | `number`               | `50`       | Maximum intents in buffer before dropping. Min: 1. |
| `dropStrategy` | `'oldest' \| 'newest'` | `'oldest'` | Which intent to drop when buffer is full.          |

### `ReconnectConfig`

| Option     | Type     | Default | Description                                                |
| :--------- | :------- | :------ | :--------------------------------------------------------- |
| `maxDelay` | `number` | `30000` | Maximum delay in ms between reconnect attempts. Min: 1000. |

### Transport Modes

| Mode               | Behavior                                                                      |
| :----------------- | :---------------------------------------------------------------------------- |
| `'websocket'`      | Direct WebSocket connection. Fails if WebSocket unavailable.                  |
| `'sse'`            | EventSource for receive, `fetch` POST for send.                               |
| `'polling'`        | HTTP long-polling: `GET` every 30s for inbound, `POST` for send. Last resort. |
| `'auto'` (default) | 3-tier fallback: WebSocket (1s timeout) → SSE → polling (S11).                |

### Reconnect Behavior

Exponential backoff: `1s → 2s → 4s → 8s → 16s → 30s (cap)`. Resets on successful reconnection. Emits `'reconnect'` event. Teardown via `disconnect()` cancels all pending reconnect timers.

### Backpressure Behavior

When the intent buffer reaches `maxBuffer`:

- **`oldest` strategy:** Drops the oldest buffered intent, enqueues the new one.
- **`newest` strategy:** Rejects the new intent, keeps the buffer intact.
- **Actionable bypass:** Intents with `interaction: 'actionable'` bypass the buffer entirely (never dropped).
- Every drop emits `ENS-3010` warning with the dropped component name.

### Build Configuration

| File             | Purpose                                                                                    |
| :--------------- | :----------------------------------------------------------------------------------------- |
| `tsconfig.json`  | Extends `tsconfig.base.json` — 15 strict flags. Overrides `composite: false` for tsup DTS. |
| `tsup.config.ts` | Builds ESM + CJS + DTS. Single entry: `src/index.ts`.                                      |

**Peer dependencies:** `@enterstellar-ai/types`, `zod ^4.3.6`

---

## Design Choices Applied

P1 (fire-and-forget dispatch), P5 (backpressure + ENS-3010), P7 (event whitelist), P11 (separate package), P12 (onRawEvent escape hatch), R1 (frozen plain objects with closures), RE3 (consumer-managed connection), S9–S12 (cross-device sync), S11 (3-tier WS → SSE → polling + sync REST endpoint), C14 (structured error codes), L8 (Zod runtime validation), L15 (zero framework imports).

---

## Bible Reference

See [Implementation Bible §4.3b](../../agent/03-enterstellar-implementation-bible.md) for the canonical `EnterstellarAgentConnection` specification, and [Design Choices Appendix](../../agent/04-enterstellar-design-choices.md) for decisions P1, P5, P7, P11, P12, R1, RE3, S9–S12.
