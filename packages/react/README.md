# @enterstellar-ai/react

> React integration for Enterstellar OS — Provider, Zone, lifecycle management, cache integration, adapters, hooks, and renderer registry.

## Purpose

`@enterstellar-ai/react` is the adoption surface for Enterstellar in React applications. It provides `<Provider>` as the root context, `<Zone>` as the determinism-controlled container for AI-rendered content, six hooks for accessing Enterstellar services, lifecycle state management via `LifecycleManager`, cache integration via `RenderCache`, adapter wiring for error handling, and a module-level `RendererRegistry` that maps component names to React implementations.

**Key properties:**

- **RE1:** Auto-creates `EnterstellarCompiler` with `GenericCard` fallback if not provided.
- **RE2:** Auto-creates `EnterstellarStore` (`indexed-db` persistence) and `TelemetryCollector` (`indexedDB` queue) if not provided.
- **RE3:** Consumer manages `EnterstellarAgentConnection` lifecycle — Enterstellar never creates connections.
- **RE5:** All hooks throw descriptive errors outside `<Provider>` — no silent degradation.
- **RE7:** Provenance badge — absolute-positioned trust indicator showing agent, compile time, status.
- **RE8:** Every zone renders a `<div data-enterstellar-zone="...">` wrapper for DevTools/CSS targeting.
- **RE9:** Agent connection hook (`useEnterstellarAgent`) is separate from core context hook (`useEnterstellar`).
- **RE11:** `useEnterstellarStore` uses `useSyncExternalStore` with shallow equality for tear-free reads.
- **RE12:** Spatial context via `ResizeObserver` + `IntersectionObserver` — no `mousemove` tracking.
- **RE13:** String-based renderer lookup in a module-level singleton (not React context).
- **RE14:** Streaming prop assembly via `StreamingAssembler` from `@enterstellar-ai/lifecycle`; zone-level state via `useSyncExternalStore`.
- **RE16:** Per-zone error boundary — one zone crashing never takes down other zones.
- **RE17:** Configurable retry policy with exponential backoff (default: 3 retries).
- **RE18:** `onError={(error, trace) => ...}` callback on `<Zone>` for error handling.
- **P13:** Passive spatial context by default; active capture via `captureContext()` on demand.
- **P14:** Latest-intent-wins — new intent cancels all in-flight compilations for the zone.
- **L15:** `RendererRegistry` is React-specific; `EnterstellarRegistry` (pure data contracts) has zero framework imports.
- **RE19:** All Enterstellar engine packages are regular `dependencies` of `@enterstellar-ai/react` — consumers install `@enterstellar-ai/react` and get the full engine transitively.

---

## Installation

```bash
npm install @enterstellar-ai/react @enterstellar-ai/registry zod
```

> Engine packages (`@enterstellar-ai/compiler`, `@enterstellar-ai/state`, `@enterstellar-ai/telemetry`, `@enterstellar-ai/connection`, `@enterstellar-ai/lifecycle`, `@enterstellar-ai/adapters`, `@enterstellar-ai/types`) are regular dependencies of `@enterstellar-ai/react` — they are installed automatically. Only `react`, `react-dom`, and `zod` are peer dependencies that the consumer must install.

---

## Quick Start

```tsx
import {
  Provider,
  Zone,
  defineComponent,
  useEnterstellar,
  useEnterstellarAgent,
  useEnterstellarStore,
  useEnterstellarTrace,
  useEnterstellarAdapters,
  useSpatialContext,
} from '@enterstellar-ai/react';
import { createRegistry } from '@enterstellar-ai/registry';
import { z } from 'zod';

// 1. Define a component (contract + renderer in one call)
const PatientVitals = (props: { patientId: string; riskLevel: string }) => (
  <div>
    Vitals for {props.patientId} — Risk: {props.riskLevel}
  </div>
);

const { contract } = defineComponent({
  contract: {
    name: 'PatientVitals',
    description: 'Displays patient vital signs.',
    category: 'clinical',
    tags: ['patient', 'vitals'],
    props: z.object({
      patientId: z.string(),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    }),
    accessibility: { role: 'region', ariaLabel: 'Patient Vitals' },
  },
  render: PatientVitals,
});

// 2. Create a registry with the component
const registry = createRegistry({ components: [contract] });

// 3. Mount the provider — compiler, store, and telemetry are auto-created (RE1, RE2)
function App() {
  return (
    <Provider registry={registry}>
      <Zone
        name="patient-sidebar"
        determinism={1.0}
        showProvenance
        onError={(err, trace) => console.error(err, trace)}
      />
    </Provider>
  );
}
```

### Advanced: Custom Cache

```tsx
import { createRenderCache } from '@enterstellar-ai/cache';

const cache = createRenderCache({ maxEntries: 100 });

<Provider registry={registry} cache={cache}>
  {/* ... */}
</Provider>;
```

---

## API Reference

### Components

#### `<Provider>`

Root context provider. Auto-creates compiler, store, and telemetry if not provided.

| Prop         | Type                          | Required | Description                                                                |
| :----------- | :---------------------------- | :------: | :------------------------------------------------------------------------- |
| `registry`   | `EnterstellarRegistry`        |    ✅    | The component contract registry.                                           |
| `compiler`   | `EnterstellarCompiler`        |    —     | Custom compiler instance. Auto-created with `GenericCard` fallback (RE1).  |
| `connection` | `EnterstellarAgentConnection` |    —     | Agent transport. Consumer-managed (RE3).                                   |
| `store`      | `EnterstellarStore`           |    —     | State store. Auto-created with `indexed-db` persistence (RE2).             |
| `telemetry`  | `TelemetryCollector`          |    —     | Telemetry collector. Auto-created with `indexedDB` queue, 30s flush (RE2). |
| `cache`      | `RenderCache \| null`         |    —     | Render cache instance for compilation memoization (CA3). Default `null`.   |
| `adapters`   | `EnterstellarAdapters`        |    —     | Optional error, data, auth, analytics adapters (AD1). Default `{}`.        |
| `threadId`   | `string`                      |    —     | Persistent conversation thread ID (P3).                                    |
| `children`   | `ReactNode`                   |    ✅    | Child components.                                                          |

#### `<Zone>`

Renders AI-generated content within a determinism-controlled, error-isolated container.

| Prop                | Type                     | Default                                                 | Description                                                                                             |
| :------------------ | :----------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------ |
| `name`              | `string`                 | —                                                       | **Required.** Unique zone identifier.                                                                   |
| `determinism`       | `number`                 | `1.0`                                                   | `0.0` = static only, `1.0` = full gen.                                                                  |
| `allowedComponents` | `string[]`               | —                                                       | Whitelist of component names (empty = all).                                                             |
| `activateOn`        | `'mount' \| 'visible'`   | `'mount'`                                               | When to activate the zone (mount or IntersectionObserver visibility).                                   |
| `fallback`          | `ReactNode`              | —                                                       | Shown during idle state. Loading state renders `EnterstellarSkeleton` (LC8).                            |
| `showProvenance`    | `boolean`                | `false`                                                 | Show provenance badge (RE7).                                                                            |
| `timeout`           | `number`                 | `30000`                                                 | Compilation timeout in ms. Managed by `LifecycleManager` (LC3).                                         |
| `retryPolicy`       | `RetryPolicy`            | `{ auto: true, maxRetries: 3, backoff: 'exponential' }` | Retry config for failures (RE17). ErrorAdapter overrides when present (AD2).                            |
| `onError`           | `(error, trace) => void` | —                                                       | Error callback with trace context (RE18). Sanitized via `ErrorAdapter.sanitize()` when available (AD5). |
| `className`         | `string`                 | —                                                       | CSS class for zone wrapper div.                                                                         |
| `style`             | `CSSProperties`          | —                                                       | Inline styles for zone wrapper div.                                                                     |
| `children`          | `ReactNode`              | —                                                       | Static content (rendered when `determinism < 1.0`).                                                     |

#### `<ProvenanceBadge>`

Trust indicator showing agent, compilation status, and compile time.

| Prop         | Type                    | Description                              |
| :----------- | :---------------------- | :--------------------------------------- |
| `provenance` | `CompilationProvenance` | Provenance data from compilation result. |
| `visible`    | `boolean`               | Whether the badge should be rendered.    |

#### `<ZoneErrorBoundary>`

Per-zone error boundary. Internal component — used automatically by `<Zone>`.

#### `<LifecycleWrapper>`

Internal state → component resolver (LC7). Maps each lifecycle state (`idle`, `loading`, `streaming`, `ready`, `error`, `empty`) to the correct React output:

- Checks contract `states` field for custom renderers registered in `RendererRegistry`.
- Falls back to default components: `EnterstellarSkeleton` (loading), `EnterstellarErrorCard` (error), `EnterstellarEmptyState` (empty).
- Passes `onRetry` to error card (LC9).
- Renders partial streaming props via the named renderer during `streaming` state (LC6).

#### `<EnterstellarSkeleton>`

Default loading state component (LC8). Three animated pulse bars with CSS custom properties (`--enterstellar-skeleton-*`). `role="status"`, `aria-busy="true"`.

#### `<EnterstellarErrorCard>`

Default error state component (LC8, LC9). Displays error message, optional `EnterstellarError` code badge, and retry button.

| Prop      | Type         | Description                                                               |
| :-------- | :----------- | :------------------------------------------------------------------------ |
| `error`   | `Error`      | The error to display. Shows code badge for `EnterstellarError` instances. |
| `onRetry` | `() => void` | Callback fired when the user clicks the retry button (LC9).               |

#### `<EnterstellarEmptyState>`

Default empty state component (LC8). "No content available" message with decorative icon. `role="status"`.

### Hooks

| Hook                             | Signature                                                         | Description                                                                             |
| :------------------------------- | :---------------------------------------------------------------- | :-------------------------------------------------------------------------------------- |
| `useEnterstellar()`              | `() => { registry, compiler, store, telemetry, cache, adapters }` | Core Enterstellar services + cache + adapters. Throws outside provider (RE5, CA3, AD1). |
| `useEnterstellarAgent()`         | `() => EnterstellarAgentConnection \| null`                       | Agent connection. Returns `null` if no connection (RE9).                                |
| `useEnterstellarStore()`         | `() => SerializedState`                                           | Full store state via `useSyncExternalStore` (RE11).                                     |
| `useEnterstellarStore(selector)` | `<T>(selector) => T`                                              | Selected slice with shallow equality memoization (S4).                                  |
| `useEnterstellarTrace(zoneName)` | `(zoneName: string) => AgentTrace \| null`                        | Latest trace for a zone via `useSyncExternalStore` (RE10, F13-1).                       |
| `useEnterstellarAdapters()`      | `() => EnterstellarAdapters`                                      | Convenience alias for `useEnterstellar().adapters` (AD1).                               |
| `useSpatialContext(name, ref)`   | `(name, ref) => SpatialContext`                                   | Zone dimensions, visibility, `captureContext()` (RE12, P13).                            |

### Factories & Registries

| Export                              | Description                                           |
| :---------------------------------- | :---------------------------------------------------- |
| `defineComponent(config)`           | Validates contract + registers renderer in one call.  |
| `rendererRegistry`                  | Module-level singleton `RendererRegistry`.            |
| `registerRenderer(name, component)` | Shorthand for `rendererRegistry.register()`.          |
| `createRendererRegistry()`          | Factory for independent `RendererRegistry` instances. |

### Lifecycle & Streaming

Streaming prop assembly is handled internally by `StreamingAssembler` from `@enterstellar-ai/lifecycle`. Lifecycle state transitions are managed by `LifecycleManager`. These are zone-internal — consumers interact via `Zone` props and callbacks.

| Export                   | Description                                                           |
| :----------------------- | :-------------------------------------------------------------------- |
| `LifecycleWrapper`       | State → component resolver. Maps lifecycle states to renderers (LC7). |
| `EnterstellarSkeleton`   | Default loading component — animated pulse bars (LC8).                |
| `EnterstellarErrorCard`  | Default error component — with `onRetry` prop (LC8, LC9).             |
| `EnterstellarEmptyState` | Default empty component — "No content available" (LC8).               |

### Cache Integration (CA1–CA3)

Pass a `RenderCache` to `<Provider cache={cache}>`. `Zone` will:

- **CA1:** Look up cached `CompilationResult` before calling the compiler.
- **CA2:** Write successful results (`pass`/`corrected`) to cache after compilation.
- **CA3:** Cache is global, shared across all zones. `null` = no caching.
- **L4:** Cache hits still produce a `ZoneTrace` with `fromCache: true`.

### Adapters Integration (AD1–AD5)

Pass adapters to `<Provider adapters={{ error: myErrorAdapter }}>`. `Zone` wires:

- **AD2:** `ErrorAdapter.shouldRetry()` — overrides built-in retry decision (async).
- **AD2:** `ErrorAdapter.report()` — non-blocking error reporting for telemetry.
- **AD5:** `ErrorAdapter.sanitize()` — transforms errors before surfacing to user.
- Graceful degradation: adapter failure falls back to built-in retry policy.

---

## Configuration

### Determinism Rules

| Value           | Behavior                                                                  |
| :-------------- | :------------------------------------------------------------------------ |
| `0.0`           | Static mode — renders `children` only. Agent intents ignored.             |
| `0.0 < d < 1.0` | Hybrid — renders `children` alongside AI-generated content.               |
| `1.0` (default) | Full generative — renders fallback → compiles intent → renders component. |

### RetryPolicy

| Option       | Type                                  | Default         | Description                                    |
| :----------- | :------------------------------------ | :-------------- | :--------------------------------------------- |
| `auto`       | `boolean`                             | `true`          | Enable automatic retry on compilation failure. |
| `maxRetries` | `number`                              | `3`             | Maximum retry attempts.                        |
| `backoff`    | `'exponential' \| 'linear' \| 'none'` | `'exponential'` | Backoff strategy (1s, 2s, 4s, ...).            |

---

## Design Choices Applied

RE1 (auto-create compiler), RE2 (auto-create store/telemetry), RE3 (consumer manages connection), RE4 (client-side only), RE5 (throw outside provider), RE6 (Zone requires Provider), RE7 (provenance badge), RE8 (data-enterstellar-zone attribute), RE9 (separate agent hook), RE10 (latest trace only), RE11 (useSyncExternalStore), RE12 (observer-based spatial context), RE13 (string-based renderer lookup), RE14 (streaming via StreamingAssembler), RE15 (lifecycle loading state), RE16 (per-zone error boundary), RE17 (retry policy), RE18 (onError callback), RE19 (engine packages as regular deps), CA1 (cache lookup before compile), CA2 (cache write on success), CA3 (global shared cache), LC1 (LifecycleManager FSM), LC2 (6 lifecycle states), LC3 (timeout via LifecycleManager), LC6 (streaming with partial props), LC7 (state → component resolution), LC8 (default state components), LC9 (onRetry on error card), AD1 (adapters in context), AD2 (ErrorAdapter wiring), AD5 (error sanitization), P3 (threadId), P6 (debounce), P13 (passive spatial), P14 (latest-intent-wins), L4 (traceability), L15 (framework-agnostic engine), R6 (render not on contract).

---

## Bible Reference

See [Implementation Bible §5.3](../../agent/03-enterstellar-implementation-bible.md) for the canonical `Zone` specification, and [Design Choices Appendix](../../agent/04-enterstellar-design-choices.md) for decisions RE1–RE19.
