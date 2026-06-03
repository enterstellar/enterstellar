# @enterstellar-ai/state

> Framework-agnostic persistent state management for Enterstellar OS.

## Purpose

`@enterstellar-ai/state` provides `createEnterstellarStore()` — the OS's memory. It implements the `EnterstellarStore` interface from `@enterstellar-ai/types` as a closure-based factory (no class, no prototype chain). The store manages zone state, trace history, session metadata, and typed extensions with pluggable persistence, optional AES-GCM encryption, semver schema versioning, and write-behind debounce.

**Key properties:**

- **S1:** Single global store per application.
- **S2:** Fixed schema (`zones`, `traceIds`, `session`) + typed `extend()` for plugins.
- **S3:** Dev-mode Zod validation on `get()` for schema drift detection.
- **S4:** Subscriptions fire only on actual value change (shallow equality).
- **S5:** Semver schema versioning with chained migrations.
- **S7:** Optional AES-GCM encryption at rest via Web Crypto API.
- **S8:** Write-behind debounce (200ms default), write-through for locked zones.
- **S9:** 1MB snapshot hard limit.
- **S14:** Trace FIFO eviction (100 traces default).
- **L15:** Zero framework dependencies — works in Node.js, Deno, browsers, and SSR.

---

## Quick Start

```ts
import { createEnterstellarStore } from '@enterstellar-ai/state';
import { z } from 'zod';

// Create a store with IndexedDB persistence
const store = await createEnterstellarStore({
  persistence: 'indexed-db',
  maxTraces: 50,
  threadId: 'patient-123-consult',
});

// Read and write fixed keys
store.set('zones', {
  sidebar: {
    name: 'sidebar',
    lifecycleState: 'ready',
    determinism: 0.8,
    lastUpdated: new Date().toISOString(),
  },
});
const zones = store.get('zones');

// Subscribe to changes (shallow equality — no spurious fires)
const unsubscribe = store.subscribe(() => {
  console.log('State changed:', store.getSnapshot());
});

// Register typed extensions
const prefsSchema = z.object({ theme: z.string(), locale: z.string() });
store.extend('preferences', prefsSchema);
store.set('preferences', { theme: 'dark', locale: 'en' });

// Snapshot / restore (cross-device sync)
const snapshot = store.snapshot(); // SerializedState (< 1MB)
store.restore(snapshot); // Full overwrite, fires subscriptions

// Cleanup
unsubscribe();
store.destroy();
```

---

## API Reference

### `createEnterstellarStore(config?): Promise<EnterstellarStore>`

Factory function. Returns the store instance after loading persisted state and applying any pending migrations.

### `EnterstellarStore` Methods

| Method                      | Signature                                 | Description                                                                                                                                                                                                         |
| :-------------------------- | :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get<T>(key)`               | `(key: string) => T \| undefined`         | Read a value by key. Fixed keys: `zones`, `traceIds`, `session`. Extension keys require prior `extend()`. Throws `ENS-4004` for unknown keys.                                                                       |
| `set(key, value)`           | `(key: string, value: unknown) => void`   | Write a value. Fires subscriptions only if value changed (shallow equality). Validates extension values against registered Zod schema. Throws `ENS-4004` for unknown keys, `ENS-4003` for invalid extension values. |
| `subscribe(cb)`             | `(callback: () => void) => () => void`    | Register a change listener. Returns an unsubscribe function. Subscriber errors are caught — they never crash the store.                                                                                             |
| `extend(name, schema)`      | `(name: string, schema: ZodType) => void` | Register a typed extension. Must be called before `get()`/`set()` on that key. Throws `ENS-4002` if name already registered.                                                                                        |
| `snapshot()`                | `() => SerializedState`                   | Serialize the current state. Throws `ENS-4006` if snapshot exceeds 1MB.                                                                                                                                             |
| `restore(state)`            | `(state: SerializedState) => void`        | Full overwrite from a snapshot. Applies semver migrations if needed. Throws `ENS-4007` for future major versions. Fires all subscriptions.                                                                          |
| `registerMigration(config)` | `(config: MigrationConfig) => void`       | Register a schema migration for future version upgrades.                                                                                                                                                            |
| `getSnapshot()`             | `() => SerializedState`                   | Returns a cached snapshot. Same reference if state hasn't changed. Compatible with React's `useSyncExternalStore`.                                                                                                  |
| `destroy()`                 | `() => void`                              | Cancels debounce timers, clears all subscriptions and state. Post-destroy `set()` is a no-op.                                                                                                                       |

### Exports

```ts
// Factory
export { createEnterstellarStore } from './create-store.js';

// Version
export { STATE_SCHEMA_VERSION } from './version.js';

// Snapshot utility
export { createEmptyState } from './snapshot.js';

// Config types
export type { EnterstellarStoreConfig, PersistenceAdapter, EncryptionConfig } from './types.js';

// Convenience re-exports from @enterstellar-ai/types
export type {
  EnterstellarStore,
  SerializedState,
  ZoneState,
  SessionState,
  MigrationConfig,
  PersistenceStrategy,
  SyncConfig,
} from '@enterstellar-ai/types';
```

---

## Configuration

### `EnterstellarStoreConfig`

| Option          | Type                                                      | Default    | Description                                                                           |
| :-------------- | :-------------------------------------------------------- | :--------- | :------------------------------------------------------------------------------------ |
| `persistence`   | `'memory' \| 'local-storage' \| 'indexed-db' \| 'custom'` | `'memory'` | Persistence strategy.                                                                 |
| `customAdapter` | `PersistenceAdapter`                                      | —          | Required when `persistence` is `'custom'`.                                            |
| `encryption`    | `EncryptionConfig`                                        | —          | Optional AES-GCM encryption at rest. Requires `enabled: true` + `keySource` callback. |
| `sync`          | `SyncConfig`                                              | —          | Cross-device sync config. Type scaffolded; runtime deferred.                          |
| `maxTraces`     | `number`                                                  | `100`      | Max trace IDs before FIFO eviction (S14).                                             |
| `devMode`       | `boolean`                                                 | `false`    | Enable Zod validation on `get()` (S3).                                                |
| `threadId`      | `string`                                                  | —          | Persistent conversation thread ID (P3).                                               |
| `debounceMs`    | `number`                                                  | `200`      | Write-behind debounce interval in ms (S8).                                            |

### Persistence Adapters

| Strategy        | Storage                             | Use Case                      |
| :-------------- | :---------------------------------- | :---------------------------- |
| `memory`        | None (ephemeral)                    | Tests, SSR, stateless mode    |
| `local-storage` | `localStorage`                      | Simple web apps (< 5MB)       |
| `indexed-db`    | IndexedDB (`enterstellar-store` DB) | Production web apps           |
| `custom`        | Consumer-provided                   | Server-side, native, or cloud |

### Encryption (S7)

```ts
const store = await createEnterstellarStore({
  persistence: 'indexed-db',
  encryption: {
    enabled: true,
    keySource: async () => {
      // Derive or load your CryptoKey here
      return crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
      ]);
    },
  },
});
```

---

## Error Codes

| Code       | Scenario                             | Recoverable |
| :--------- | :----------------------------------- | :---------- |
| `ENS-4002` | Extension name already registered    | No          |
| `ENS-4003` | Extension value fails Zod validation | No          |
| `ENS-4004` | Unknown store key                    | No          |
| `ENS-4005` | Persistence adapter failure          | Yes         |
| `ENS-4006` | Snapshot exceeds 1MB                 | No          |
| `ENS-4007` | Major version mismatch on restore    | No          |

---

## Schema Versioning (S5)

Snapshots include a `schemaVersion` string. On `restore()`:

| Scenario                                    | Behavior                               |
| :------------------------------------------ | :------------------------------------- |
| Same version or patch diff                  | Zod validate only                      |
| Older snapshot                              | Chain registered migrations → validate |
| Minor forward (e.g., 1.2.0 on 1.1.0 client) | Passthrough (`.passthrough()`)         |
| Major forward (e.g., 2.0.0 on 1.x.x client) | Hard reject with `ENS-4007`            |

Register migrations for future upgrades:

```ts
store.registerMigration({
  from: '1.0.0',
  to: '1.1.0',
  migrate: (state) => ({
    ...state,
    schemaVersion: '1.1.0',
    extensions: { ...state.extensions, newField: 'default' },
  }),
});
```

---

## Design Choices Applied

S1 (single store), S2 (fixed schema + extend), S3 (dev validation), S4 (shallow equality), S5 (semver versioning), S6 (idb-keyval isolation), S7 (AES-GCM encryption), S8 (write-behind debounce), S9 (1MB limit), S10 (full overwrite on restore), S13 (snapshot caching), S14 (trace FIFO), L15 (framework-agnostic), P3 (threadId).

---

## Bible Reference

See [Implementation Bible §3.8](../../agent/03-enterstellar-implementation-bible.md) for the canonical `EnterstellarStore` specification, and [Design Choices Appendix](../../agent/04-enterstellar-design-choices.md) for decisions S1–S15.
