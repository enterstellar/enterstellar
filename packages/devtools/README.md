# @enterstellar-ai/devtools

> Embedded DevTools panel for inspecting, debugging, and profiling Enterstellar GenUI pipelines.

## Purpose

`@enterstellar-ai/devtools` provides a browser-embedded DevTools panel that attaches to any React app using `<Provider>`. It renders a floating ⚡ toggle button and a slide-out panel with tabbed navigation for real-time inspection of Enterstellar's intent → compilation → rendering pipeline.

**Key properties:**

- **DT1:** Embedded panel is the P0 delivery — Chrome extension is deferred.
- **DT2:** Toggle via `Ctrl+Shift+A` keyboard shortcut and floating ⚡ FAB.
- **DT3:** Production guard — `process.env.NODE_ENV === 'production'` returns `null`. Tree-shakeable, zero prod bytes.
- **DT4:** Tab phasing — all 6 tabs functional: Timeline, Inspector, Validation Log (P0), Cache Dashboard, Performance Profiler (P1), Replay Mode (P2).
- **DT5:** 500-trace ring buffer with O(1) eviction. ~50KB metadata footprint.
- **DT6:** Dark theme, inline styles. No external CSS dependency.
- **DT7:** Keyboard shortcut is remappable via `config.shortcut`.
- **DT8:** JSON export of all traces via download button.

---

## Quick Start

```tsx
import { EnterstellarDevTools } from '@enterstellar-ai/devtools';
import { Provider } from '@enterstellar-ai/react';

function App() {
  return (
    <Provider registry={registry}>
      {/* Your application */}
      <EnterstellarDevTools />
    </Provider>
  );
}
```

With custom configuration:

```tsx
<EnterstellarDevTools
  config={{
    defaultOpen: true,
    shortcut: 'ctrl+shift+d',
    maxTraces: 1000,
    position: 'bottom-left',
  }}
/>
```

---

## API Reference

### Components

#### `<EnterstellarDevTools />`

Root DevTools component. Renders toggle button + slide-out panel.

| Prop     | Type                   | Required | Description                                                                                                                                                                                                                                      |
| :------- | :--------------------- | :------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config` | `DevToolsConfig`       |    —     | Optional configuration overrides.                                                                                                                                                                                                                |
| `cache`  | `DevToolsCacheAdapter` |    —     | Cache adapter for the Cache Dashboard tab. When provided, shows live statistics. When omitted, shows empty state. Accepts any object satisfying the `DevToolsCacheAdapter` protocol, including `RenderCache` from `@enterstellar-ai/cache` (L5). |

#### `exportTraces(traces, zoneConfigs)`

Exports the current trace buffer as a JSON file download.

| Param         | Type                      | Description                       |
| :------------ | :------------------------ | :-------------------------------- |
| `traces`      | `readonly ZoneTrace[]`    | Traces to export.                 |
| `zoneConfigs` | `Record<string, unknown>` | Zone config snapshot for context. |

### Types

#### `DevToolsConfig`

| Field         | Type                                                           | Default          | Description                          |
| :------------ | :------------------------------------------------------------- | :--------------- | :----------------------------------- |
| `maxTraces`   | `number`                                                       | `500`            | Max traces in ring buffer (DT5).     |
| `defaultOpen` | `boolean`                                                      | `false`          | Open panel on initial mount.         |
| `shortcut`    | `string`                                                       | `'ctrl+shift+a'` | Keyboard shortcut string (DT2, DT7). |
| `position`    | `'bottom-left' \| 'bottom-right' \| 'top-left' \| 'top-right'` | `'bottom-right'` | Position of the ⚡ toggle button.    |

#### `DevToolsTab`

Union of all tab identifiers:

```ts
type DevToolsTab =
  | 'trace-timeline' // P0 — Chronological trace list
  | 'component-inspector' // P0 — Selected trace details
  | 'validation-log' // P0 — Compilation errors
  | 'cache-dashboard' // P1 — Cache stats + clear
  | 'performance-profiler' // P1 — Latency stats + bar chart
  | 'replay-mode'; // P2 — Pipeline log viewer
```

#### `DevToolsCacheAdapter`

Protocol-based cache interface (L5 — no hard `@enterstellar-ai/cache` dependency).

| Method            | Signature                                  | Description                         |
| :---------------- | :----------------------------------------- | :---------------------------------- |
| `getStats()`      | `() => { hits, misses, entries, hitRate }` | Current cache performance snapshot. |
| `invalidateAll()` | `() => void`                               | Clears all cache entries.           |

#### `LatencyStats`

| Field   | Type     | Description                             |
| :------ | :------- | :-------------------------------------- |
| `p50`   | `number` | 50th percentile (median) latency in ms. |
| `p95`   | `number` | 95th percentile latency in ms.          |
| `p99`   | `number` | 99th percentile latency in ms.          |
| `mean`  | `number` | Arithmetic mean latency in ms.          |
| `min`   | `number` | Minimum observed latency in ms.         |
| `max`   | `number` | Maximum observed latency in ms.         |
| `count` | `number` | Number of data points.                  |

---

## Tabs

### Trace Timeline (P0)

Chronological list of all `ZoneTrace` events from the ring buffer.

- **Filter bar:** Free-text search, zone dropdown, component dropdown, status toggles (pass/corrected/fail).
- **Trace rows:** Timestamp, zone name, component name, status badge, latency.
- **Click-to-inspect:** Clicking a row selects it and auto-switches to the Component Inspector tab.
- **Export:** Download all traces as `enterstellar-traces-{timestamp}.json`.
- **Empty states:** "No traces yet" / "No traces match the current filters."

### Component Inspector (P0)

Detailed view of a selected trace's compilation pipeline.

- **Sections:** Trace metadata, Intent (component + props), Compilation (status + errors + self-correction), Provenance (agent + registry + version), Performance (latency).
- **JSON viewer:** Collapsible tree view of the full trace data.
- **Error details:** Individual `CompilationError` entries with code, path, message, expected/received.

### Validation Log (P0)

Filtered view showing only `fail` and `corrected` traces.

- **Search:** Filter by component name or zone.
- **Issue header:** Shows count of validation issues.
- **Self-correction indicator:** "✓ Self-corrected successfully" for corrected traces.
- **Click-to-inspect:** Same behavior as Timeline — selects trace and switches to Inspector.

### Cache Dashboard (P1)

Live cache performance statistics and management.

- **Stats grid:** Hits, Misses, Entries, Hit Rate (polled every 2s).
- **Hit rate progress bar:** Visual indicator with percentage.
- **Clear Cache button:** Calls `cache.invalidateAll()`. Disabled when entries is 0.
- **Empty state:** Shown when no `cache` prop is provided — instructs user to pass a `RenderCache`.
- **Protocol-based:** Uses `DevToolsCacheAdapter` — no hard dependency on `@enterstellar-ai/cache` (L5).
- **Deferred:** Cache entry listing (requires `RenderCache.list()`), warmup trigger.

### Performance Profiler (P1)

Latency aggregation and per-trace performance visualization.

- **Stat cards:** P50, P95, P99, Mean, Min, Max — computed via `computeLatencyStats()` using nearest-rank method.
- **Bar chart:** Horizontal bars sorted by slowest trace (descending). Color-coded by compilation status.
- **Filter bar:** Same filter controls as Timeline (search, zone, component, status).
- **Click-to-inspect:** Clicking a bar selects the trace (same behavior as Timeline).
- **Deferred:** Per-stage latency breakdown (requires `AgentTrace.metrics` fields).

### Replay Mode (P2)

Step-by-step pipeline log viewer (DT6 — not visual DOM replay).

- **Vertical stepper:** 6 pipeline stages: Intent → Resolution → Compilation → Validation → Output → Performance.
- **Step indicators:** ● completed (green), ✕ failed (red), ○ skipped (grey).
- **Expandable data:** Each step shows structured JSON via `JsonViewer`.
- **Navigation:** Previous/Next buttons with step counter.
- **Empty state:** Shown when no trace is selected — instructs user to select from Timeline.
- **Deferred:** Visual DOM replay, full resolution details (requires `AgentTrace`).

---

## Configuration

### Keyboard Shortcut Format

Modifier keys joined with `+`. Modifiers: `ctrl`, `shift`, `alt`, `meta`. Examples:

| Shortcut       | Description        |
| :------------- | :----------------- |
| `ctrl+shift+a` | Default (DT2).     |
| `alt+d`        | Alternative.       |
| `meta+shift+d` | macOS Cmd+Shift+D. |

**macOS:** `ctrl` modifier also matches `Cmd` (metaKey) for cross-platform consistency.

### Ring Buffer

The trace buffer is a fixed-size array. When `maxTraces` is reached, the oldest trace is evicted (FIFO). Default size: 500 traces at ~100 bytes metadata each ≈ 50KB (DT5).

---

## Build Configuration

| Tool          | Config                                                           |
| :------------ | :--------------------------------------------------------------- |
| **Build**     | tsup — ESM + CJS + DTS. Target: ES2022.                          |
| **Typecheck** | `tsc --noEmit`. Strict mode via `tsconfig.base.json`.            |
| **Lint**      | ESLint on `src/`.                                                |
| **Test**      | Vitest + `@testing-library/react` + jsdom. 215 tests, 11 suites. |

---

## File Structure

```
packages/devtools/
├── src/
│   ├── index.ts                    # Barrel exports (public API)
│   ├── enterstellar-devtools.tsx           # Root <EnterstellarDevTools /> component
│   ├── types.ts                    # Type definitions (DevToolsConfig, DevToolsCacheAdapter, LatencyStats, ReplayStep)
│   ├── constants.ts                # Module constants (DT2, DT4, DT5, CACHE_POLL_INTERVAL_MS, REPLAY_MAX_DEPTH)
│   ├── styles.ts                   # Centralized dark-theme inline styles + statusColors
│   ├── use-keyboard-shortcut.ts    # Keyboard shortcut hook + parser
│   ├── use-devtools-traces.ts      # Ring buffer + filtering + store subscription
│   ├── export-traces.ts            # JSON trace export utility
│   ├── utils/
│   │   └── percentiles.ts         # computeLatencyStats, percentile (nearest-rank)
│   ├── components/
│   │   ├── toggle-button.tsx       # Floating ⚡ FAB
│   │   ├── status-badge.tsx        # Color-coded status indicator
│   │   ├── json-viewer.tsx         # Collapsible JSON tree
│   │   ├── filter-bar.tsx          # Shared filter controls
│   │   └── trace-row.tsx           # Single trace entry in timeline
│   └── panels/
│       ├── trace-timeline.tsx      # P0 Tab 1
│       ├── component-inspector.tsx # P0 Tab 2
│       ├── validation-log.tsx      # P0 Tab 3
│       ├── cache-dashboard.tsx     # P1 Tab 4
│       ├── performance-profiler.tsx # P1 Tab 5
│       ├── replay-mode.tsx         # P2 Tab 6
│       └── panel-stub.tsx          # Future tab placeholder
├── __tests__/
│   ├── setup.ts                    # jest-dom matcher registration
│   ├── enterstellar-devtools.test.tsx      # Root component tests (23 cases)
│   ├── panels.test.tsx             # P0 panel tests (32 cases)
│   ├── components.test.tsx         # Shared component tests (32 cases)
│   ├── cache-dashboard.test.tsx    # Cache Dashboard tests (18 cases)
│   ├── performance-profiler.test.tsx # Performance Profiler tests (16 cases)
│   ├── replay-mode.test.tsx        # Replay Mode tests (17 cases)
│   ├── percentiles.test.ts         # Percentile utility tests (21 cases)
│   ├── integration.test.tsx        # Integration tests (8 cases)
│   ├── use-devtools-traces.test.ts # Hook tests (19 cases)
│   ├── use-keyboard-shortcut.test.ts # Shortcut tests (16 cases)
│   └── export-traces.test.ts      # Export utility tests (13 cases)
├── env.d.ts                        # Ambient process.env declaration
├── vitest.config.ts                # Test configuration
├── tsconfig.json
├── tsup.config.ts
└── package.json
```

---

## Design Choices Applied

DT1 (embedded panel is P0), DT2 (Ctrl+Shift+A + ⚡ button), DT3 (tree-shakeable, zero prod bytes), DT4 (P0/P1/P2 tab phasing), DT5 (500 trace ring buffer), DT6 (dark theme, inline styles), DT7 (remappable shortcut), DT8 (JSON export via download), C15 (fix suggestions in errors), L4 (every render traced), L15 (no framework-agnostic engine imports).

---

## Bible Reference

See [Implementation Bible §4.4](../../agent/03-enterstellar-implementation-bible.md) for the canonical DevTools specification, and [Design Choices Appendix](../../agent/04-enterstellar-design-choices.md) for decisions DT1–DT8.
