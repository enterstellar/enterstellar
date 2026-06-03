# @enterstellar-ai/lifecycle

> Framework-agnostic lifecycle state machine: `idle → loading → streaming → ready`, with `error` and `empty` terminal states.

This is the **zone lifecycle engine** (L15) — a pure TypeScript finite state machine that manages the lifecycle of content within Enterstellar zones. Every state transition emits a structured event for observability (L4). The FSM enforces exhaustive transition validation (LC2), configurable timeout (LC3), retry limits (RE17), and streaming assembly (LC4). No framework dependencies — `@enterstellar-ai/react` wraps this in hooks.

## Quick Start

```ts
import { createLifecycleManager, createStreamingAssembler } from '@enterstellar-ai/lifecycle';
import { z } from 'zod';

// 1. Create a lifecycle manager (default: 30s timeout, 3 retries)
const manager = createLifecycleManager();

// 2. Subscribe to state changes (L4: Observable by Default)
const unsubscribe = manager.on((event) => {
  console.log(`Lifecycle: ${event.from} → ${event.to}`);
});

// 3. Drive the lifecycle
manager.transition('loading'); // idle → loading (starts timeout timer)
manager.transition('streaming'); // loading → streaming (clears timeout)
manager.transition('ready'); // streaming → ready (resets retry count)

// 4. Streaming assembly (LC4)
const assembler = createStreamingAssembler();
assembler.apply({ path: 'patientId', value: 'P-123' });
assembler.apply({ path: 'metrics[0].label', value: 'Heart Rate' });
assembler.apply({ path: 'metrics[0].value', value: 92 });

const schema = z.object({
  patientId: z.string(),
  metrics: z.array(z.object({ label: z.string(), value: z.number() })),
});
assembler.isComplete(schema); // true — all required fields present

// 5. Cleanup on zone unmount
unsubscribe();
manager.dispose();
```

## API Reference

### Factories

| Function                          | Returns              | Description                                                                  |
| :-------------------------------- | :------------------- | :--------------------------------------------------------------------------- |
| `createLifecycleManager(config?)` | `LifecycleManager`   | Creates a lifecycle FSM. Config has sensible defaults — all fields optional. |
| `createStreamingAssembler()`      | `StreamingAssembler` | Creates a streaming prop fragment accumulator.                               |

### `LifecycleManager` Interface

| Property/Method            | Type             | Description                                                                                 |
| :------------------------- | :--------------- | :------------------------------------------------------------------------------------------ |
| `state`                    | `LifecycleState` | Current state (read-only getter).                                                           |
| `retryCount`               | `number`         | Number of error → loading retries attempted (read-only).                                    |
| `disposed`                 | `boolean`        | Whether `dispose()` has been called (read-only).                                            |
| `transition(to, context?)` | `void`           | Transitions to `to`. Throws `ENS-3003` on invalid transition, `ENS-3005` if disposed.       |
| `on(listener)`             | `() => void`     | Registers a listener. Returns unsubscribe function.                                         |
| `reset()`                  | `void`           | Returns to `idle`. Clears timeout and retry count. Only escape from terminal `empty` state. |
| `dispose()`                | `void`           | Clears timer, removes listeners, marks disposed. Idempotent.                                |

### `StreamingAssembler` Interface

| Method                  | Type                      | Description                                                 |
| :---------------------- | :------------------------ | :---------------------------------------------------------- |
| `apply(fragment)`       | `void`                    | Applies a single path-based prop fragment.                  |
| `applyBatch(fragments)` | `void`                    | Applies multiple fragments in order.                        |
| `getAccumulated()`      | `Record<string, unknown>` | Returns deep copy of accumulated props.                     |
| `isComplete(schema)`    | `boolean`                 | Checks structural completeness via Zod `safeParse()` (LC5). |
| `reset()`               | `void`                    | Clears all accumulated data.                                |

### State Transition Map (LC2)

| From        | Valid Targets                          | Notes                                                    |
| :---------- | :------------------------------------- | :------------------------------------------------------- |
| `idle`      | `loading`                              | Only valid exit from initial state.                      |
| `loading`   | `streaming`, `ready`, `error`, `empty` | Timeout auto-fires `error` after `timeoutMs` (ENS-3002). |
| `streaming` | `ready`, `error`                       | Fragments accumulating.                                  |
| `ready`     | `streaming`, `empty`                   | Live data updates re-enter streaming.                    |
| `error`     | `loading`                              | Retry. Throws ENS-3003 when `retryCount >= maxRetries`.  |
| `empty`     | _(none)_                               | Terminal. Escape only via `reset()`.                     |

### Error Factories (ENS-3002–3005)

| Code       | Factory                                      | Recoverable | Trigger                                      |
| :--------- | :------------------------------------------- | :---------- | :------------------------------------------- |
| `ENS-3002` | `createAgentTimeoutError(timeoutMs)`         | ✅          | Loading state exceeds timeout.               |
| `ENS-3003` | `createInvalidTransitionError(from, to)`     | ❌          | Invalid state transition attempted.          |
| `ENS-3003` | `createMaxRetriesExceededError(maxRetries)`  | ❌          | Retry count exceeded during error → loading. |
| `ENS-3004` | `createStreamingAssemblyError(path, reason)` | ✅          | Malformed path in streaming fragment.        |
| `ENS-3005` | `createDisposedError()`                      | ❌          | Operation on disposed manager.               |

### Exported Types

| Type                         | Description                                                                    |
| :--------------------------- | :----------------------------------------------------------------------------- |
| `LifecycleState`             | `'idle' \| 'loading' \| 'streaming' \| 'ready' \| 'error' \| 'empty'`          |
| `LifecycleEvent`             | `{ from, to, timestamp, context? }` — emitted on every transition.             |
| `LifecycleTransitionContext` | Optional metadata: `error?`, `retryAttempt?`, `propFragment?`.                 |
| `LifecycleListener`          | `(event: LifecycleEvent) => void` — callback signature.                        |
| `LifecycleManagerConfig`     | `{ timeoutMs, maxRetries }` — FSM configuration.                               |
| `PropFragment`               | `{ path: string, value: unknown }` — path-based prop fragment (LC4).           |
| `LifecycleManager`           | Full manager interface with state, transition, on, reset, dispose.             |
| `StreamingAssembler`         | Assembler interface with apply, applyBatch, getAccumulated, isComplete, reset. |

### Utility Exports

| Export                             | Description                                                               |
| :--------------------------------- | :------------------------------------------------------------------------ |
| `parsePath(path)`                  | Parses dot-notation path to segments. `@internal` — exported for testing. |
| `deepSet(target, segments, value)` | Sets value at nested path. `@internal` — exported for testing.            |
| `VALID_TRANSITIONS`                | Immutable map of all valid state transitions (LC2).                       |
| `DEFAULT_TIMEOUT_MS`               | `30_000` (30 seconds, LC3).                                               |
| `DEFAULT_MAX_RETRIES`              | `3` (RE17).                                                               |
| `LIFECYCLE_VERSION`                | Semver string matching `package.json`.                                    |

## Configuration

### `LifecycleManagerConfig` (passed to `createLifecycleManager()`)

| Option       | Type     | Required | Default  | Description                                                  |
| :----------- | :------- | :------- | :------- | :----------------------------------------------------------- |
| `timeoutMs`  | `number` | No       | `30_000` | Loading state timeout in ms. Fires ENS-3002 on expiry (LC3). |
| `maxRetries` | `number` | No       | `3`      | Max error → loading retries before ENS-3003 (RE17).          |

### Design Choices Applied

| ID   | Decision                  | Implementation                                             |
| :--- | :------------------------ | :--------------------------------------------------------- |
| LC1  | Custom FSM, not xstate    | `state-machine.ts` — switch/case, ~180 lines.              |
| LC2  | Exhaustive transition map | `VALID_TRANSITIONS` in `constants.ts`.                     |
| LC3  | 30s default timeout       | `DEFAULT_TIMEOUT_MS`, `globalThis.setTimeout`.             |
| LC4  | Path-based prop fragments | `StreamingAssembler.apply()` with `parsePath()`.           |
| LC5  | Zod schema completeness   | `StreamingAssembler.isComplete(schema)` via `safeParse()`. |
| LC6  | No optimistic defaults    | Missing fields remain missing. Clinical safety.            |
| RE17 | 3 retries default         | `DEFAULT_MAX_RETRIES`, `retryCount` tracking.              |

### Build Configuration

| File             | Purpose                                                                   |
| :--------------- | :------------------------------------------------------------------------ |
| `tsconfig.json`  | Extends `tsconfig.base.json` — 15 strict flags.                           |
| `tsup.config.ts` | Builds ESM + CJS + DTS. `composite: false`, `incremental: false` for DTS. |

**Peer dependencies:** `@enterstellar-ai/types`, `zod ^4.3.6`

## See Also

- [Implementation Bible §4.8](../../agent/03-enterstellar-implementation-bible.md) — lifecycle specification.
- [Design Choices — Module 5](../../agent/04-enterstellar-design-choices.md) — locked decisions LC1–LC9.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
