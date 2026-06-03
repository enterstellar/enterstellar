# @enterstellar-ai/normalizer

> Protocol-agnostic intake — normalizes AG-UI, custom, and future protocols into unified `ComponentIntent` objects.

The normalizer sits at the entry point of the Enterstellar rendering pipeline, converting raw protocol events from any agent transport into the canonical `ComponentIntent` format consumed by the compiler. This is an **engine package** (L15) — zero framework dependencies. One normalizer per protocol, composed into a single dispatch function via `createNormalizer()`.

## Quick Start

```ts
import {
  createNormalizer,
  createAGUIAdapter,
  createCustomAdapter,
} from '@enterstellar-ai/normalizer';

// 1. Create protocol adapters
const agui = createAGUIAdapter();
const custom = createCustomAdapter({
  normalize: (msg) => {
    const typed = msg as { action: string; data: Record<string, unknown> };
    return {
      component: typed.action,
      props: typed.data,
      confidence: 0.9,
    };
  },
  canHandle: (msg) => typeof msg === 'object' && msg !== null && 'action' in msg,
});

// 2. Compose — first match wins
const normalize = createNormalizer({
  adapters: [agui, custom],
});

// 3. Dispatch a raw AG-UI event
const intent = normalize({
  type: 'tool_call_start',
  toolCallId: 'tc-001',
  toolName: 'PatientVitals',
  args: { patientId: 'P-123' },
  runId: 'run-abc',
});
// → { component: 'PatientVitals', props: { patientId: 'P-123' }, confidence: 0.8,
//     _source: { protocol: 'ag-ui', rawEventId: 'tc-001', correlationId: 'run-abc' } }
```

## API Reference

### Factory

| Function                   | Returns              | Description                                                                        |
| :------------------------- | :------------------- | :--------------------------------------------------------------------------------- |
| `createNormalizer(config)` | `NormalizerDispatch` | Composes adapters into a single dispatch function. First `canHandle()` match wins. |

### Adapter Factories

| Function                      | Returns              | Description                                                         |
| :---------------------------- | :------------------- | :------------------------------------------------------------------ |
| `createAGUIAdapter(config?)`  | `ProtocolNormalizer` | AG-UI protocol adapter. Maps `tool_call_start` → `ComponentIntent`. |
| `createCustomAdapter(config)` | `ProtocolNormalizer` | Wraps a user-provided function into `ProtocolNormalizer`.           |

### `ProtocolNormalizer` Interface

| Method             | Returns                   | Description                                                       |
| :----------------- | :------------------------ | :---------------------------------------------------------------- |
| `protocol`         | `IntentProtocol`          | The protocol this adapter handles (read-only).                    |
| `canHandle(event)` | `boolean`                 | Lightweight structural check — can this adapter handle the event? |
| `normalize(event)` | `ComponentIntent \| null` | Convert event to intent, or `null` if no UI implication.          |

### AG-UI Event Mapping (N4)

| AG-UI Event          | Enterstellar Output                                                                 |
| :------------------- | :---------------------------------------------------------------------------------- |
| `tool_call_start`    | `ComponentIntent` — component = `toolName`, props = `args`, correlationId = `runId` |
| `text_message_start` | `null` — handled by chat layer                                                      |
| `run_started`        | `null` — lifecycle signal                                                           |
| `run_finished`       | `null` — lifecycle signal                                                           |
| `run_error`          | `null` — lifecycle signal                                                           |

### Dispatch Pipeline (5 Steps)

| Step              | Description                                                                  |
| :---------------- | :--------------------------------------------------------------------------- |
| **1. Match**      | Iterate adapters in order. First `canHandle()` → `true` processes the event. |
| **2. Normalize**  | Call `adapter.normalize(event)`. Wraps errors in `ENS-6002`.                 |
| **3. Null Check** | If `normalize()` returns `null`, propagate `null` (no UI intent).            |
| **4. Validate**   | `ComponentIntentSchema.safeParse()`. Invalid → `ENS-6003`.                   |
| **5. Return**     | Return validated `ComponentIntent`. No match → `ENS-6001`.                   |

### Error Factories (ENS-6001–6003)

| Code       | Factory                                            | Trigger                                | Recoverable |
| :--------- | :------------------------------------------------- | :------------------------------------- | :---------- |
| `ENS-6001` | `createUnknownProtocolError(event)`                | No adapter can handle the event        | No          |
| `ENS-6002` | `createNormalizationFailedError(protocol, cause?)` | Adapter's `normalize()` threw          | Yes         |
| `ENS-6003` | `createInvalidIntentError(zodErrors)`              | Assembled intent failed Zod validation | Yes         |

### Exported Types

| Type                   | Description                                                                 |
| :--------------------- | :-------------------------------------------------------------------------- |
| `ProtocolNormalizer`   | Interface for protocol adapters (has `canHandle` + `normalize`).            |
| `NormalizerConfig`     | Configuration for `createNormalizer()` — ordered adapter list.              |
| `NormalizerDispatch`   | `(event: unknown) => ComponentIntent \| null` — the dispatch function.      |
| `AGUIAdapterConfig`    | Config for `createAGUIAdapter()` — optional `defaultConfidence`.            |
| `CustomAdapterConfig`  | Config for `createCustomAdapter()` — `normalize` fn + optional `canHandle`. |
| `AGUIToolCallEvent`    | Shape of AG-UI `tool_call_start` events.                                    |
| `AGUITextMessageEvent` | Shape of AG-UI `text_message_start` events.                                 |
| `AGUILifecycleEvent`   | Shape of AG-UI lifecycle events (`run_started`/`run_finished`/`run_error`). |
| `AGUIEvent`            | Union of all AG-UI event shapes.                                            |
| `AGUIEventType`        | Derived union type of known AG-UI event type strings.                       |

### Constants

| Export                        | Value                                          | Description                                 |
| :---------------------------- | :--------------------------------------------- | :------------------------------------------ |
| `DEFAULT_AGUI_CONFIDENCE`     | `0.8`                                          | Default confidence for AG-UI tool calls.    |
| `AGUI_UI_EVENT_TYPES`         | `['tool_call_start', 'text_message_start']`    | Event types that may produce intents.       |
| `AGUI_LIFECYCLE_EVENT_TYPES`  | `['run_started', 'run_finished', 'run_error']` | Event types that produce lifecycle signals. |
| `AGUI_COMPLETION_EVENT_TYPES` | `['tool_call_end', 'text_message_end']`        | Streaming completion markers (N5).          |
| `AGUI_PROTOCOL`               | `'ag-ui'`                                      | Protocol identifier for AG-UI adapter.      |
| `CUSTOM_PROTOCOL`             | `'custom'`                                     | Protocol identifier for custom adapters.    |
| `NORMALIZER_VERSION`          | `'0.1.0'`                                      | Package version for runtime checks.         |

## Configuration

### `AGUIAdapterConfig` (passed to `createAGUIAdapter()`)

| Option              | Type     | Required | Default | Description                                                  |
| :------------------ | :------- | :------- | :------ | :----------------------------------------------------------- |
| `defaultConfidence` | `number` | No       | `0.8`   | Confidence score for intents when agent doesn't provide one. |

### `CustomAdapterConfig` (passed to `createCustomAdapter()`)

| Option      | Type                                        | Required | Default      | Description                                  |
| :---------- | :------------------------------------------ | :------- | :----------- | :------------------------------------------- |
| `normalize` | `(msg: unknown) => ComponentIntent \| null` | **Yes**  | —            | User-provided normalization function.        |
| `canHandle` | `(msg: unknown) => boolean`                 | No       | `() => true` | Structural detection. Defaults to catch-all. |

## Design Choices Applied

| ID     | Decision                                                   | Impact                                       |
| :----- | :--------------------------------------------------------- | :------------------------------------------- |
| **N1** | AG-UI + custom at v1; A2UI/MCP are P2                      | Only 2 adapters shipped                      |
| **N2** | Custom normalizer = `(unknown) => ComponentIntent \| null` | Simple, composable signature                 |
| **N3** | Explicit factory, no auto-detection                        | Consumer controls adapter composition        |
| **N4** | AG-UI: `tool_call_start` → intent; lifecycle → null        | Only tool calls produce UI intents           |
| **N5** | Buffer-and-assemble streaming                              | Partial intents deferred to streaming buffer |
| **N6** | A2UI: 1:1 Blueprint → intent                               | Deferred to P2                               |

### Build Configuration

| File             | Purpose                                                                   |
| :--------------- | :------------------------------------------------------------------------ |
| `tsconfig.json`  | Extends `tsconfig.base.json` — 15 strict flags.                           |
| `tsup.config.ts` | Builds ESM + CJS + DTS. `composite: false`, `incremental: false` for DTS. |

**Peer dependencies:** `@enterstellar-ai/types`, `zod ^4.3.6`

## See Also

- [Implementation Bible §4.9](../../agent/03-enterstellar-implementation-bible.md) — normalizer specification.
- [Design Choices — Module 11](../../agent/04-enterstellar-design-choices.md) — locked decisions N1–N6.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
