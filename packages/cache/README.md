# @enterstellar-ai/cache

> LRU render cache for compiled intents — makes GenUI feel instant.

This package implements the **Render Cache** (Bible §4.6) — a global LRU cache that stores `CompilationResult` entries so identical intents skip re-compilation. The cache is framework-agnostic (L15), uses lazy TTL expiry, and supports async warmup for startup performance. Registry events automatically invalidate stale entries.

## Quick Start

```ts
import { createRenderCache, buildCacheKey, withRegistryInvalidation } from '@enterstellar-ai/cache';

// 1. Create cache
const cache = createRenderCache({ maxEntries: 500, ttl: 1800 });

// 2. Build keys per CA1 (intentHash + componentName)
const key = buildCacheKey(intentHash, 'PatientVitals');

// 3. Cache a compilation result
cache.set(key, {
  compiledIntent: intent,
  compilationResult: result,
  cachedAt: Date.now(),
  expiresAt: Date.now() + 1800 * 1000,
});

// 4. Retrieve (returns undefined if expired or missing)
const cached = cache.get(key);

// 5. Wire registry invalidation (CA4/CA5)
const { dispose } = withRegistryInvalidation(cache, registry);

// 6. Warmup on startup (CA6/CA7 — async, never blocking)
await cache.warmup(
  [{ zone: 'sidebar', intent: { component: 'PatientVitals', props: {}, confidence: 1.0 } }],
  compiler.compile,
);

// 7. Observe performance
cache.getStats(); // { hits, misses, entries, hitRate }

// 8. Cleanup on teardown
dispose();
```

## API Reference

### Factory

| Function                     | Returns       | Description                                                                     |
| :--------------------------- | :------------ | :------------------------------------------------------------------------------ |
| `createRenderCache(config?)` | `RenderCache` | Creates an LRU render cache. Config has sensible defaults — no required fields. |

### `RenderCache` Interface

| Method                        | Returns                     | Description                                                                              |
| :---------------------------- | :-------------------------- | :--------------------------------------------------------------------------------------- |
| `get(key)`                    | `CachedRender \| undefined` | Retrieves a cached entry. Returns `undefined` if expired (lazy TTL eviction) or missing. |
| `set(key, render)`            | `void`                      | Stores a `CachedRender` entry. Evicts LRU if at capacity.                                |
| `invalidate(key)`             | `boolean`                   | Removes a single entry by key. Returns `true` if found.                                  |
| `invalidateByComponent(name)` | `number`                    | Evicts ALL entries for a component name (CA5). Returns count.                            |
| `invalidateAll()`             | `void`                      | Clears all entries and resets stats.                                                     |
| `getStats()`                  | `CacheStats`                | Returns `{ hits, misses, entries, hitRate }`.                                            |
| `warmup(entries, compile)`    | `Promise<void>`             | Pre-compiles intents and caches results. Silently skips failures (CA7).                  |
| `size`                        | `number`                    | Current number of entries in the cache.                                                  |

### Utilities

| Function                                    | Returns                       | Description                                                                                      |
| :------------------------------------------ | :---------------------------- | :----------------------------------------------------------------------------------------------- |
| `buildCacheKey(intentHash, componentName)`  | `string`                      | Builds a deterministic cache key per CA1.                                                        |
| `withRegistryInvalidation(cache, registry)` | `RegistryInvalidationBinding` | Wires registry `update`/`unregister` events to cache invalidation. Returns `{ cache, dispose }`. |

### Exported Types

| Type                          | Description                                                                   |
| :---------------------------- | :---------------------------------------------------------------------------- |
| `RenderCache`                 | Cache interface with all cache operations.                                    |
| `RenderCacheConfig`           | Configuration: `strategy`, `maxEntries`, `ttl`, `onEvict?`.                   |
| `CachedRender`                | Cached entry: `compiledIntent`, `compilationResult`, `cachedAt`, `expiresAt`. |
| `CacheStats`                  | Performance stats: `hits`, `misses`, `entries`, `hitRate`.                    |
| `WarmupEntry`                 | Warmup input: `{ zone, intent }`.                                             |
| `CompileFn`                   | Compile callback: `(intent) => Promise<CompilationResult>`.                   |
| `EvictionReason`              | `'expired' \| 'capacity' \| 'manual' \| 'component-update'`.                  |
| `CacheInvalidationSource`     | Minimal registry interface for invalidation wiring.                           |
| `RegistryInvalidationBinding` | Result of `withRegistryInvalidation()`: `{ cache, dispose }`.                 |

## Configuration

### `RenderCacheConfig` (passed to `createRenderCache()`)

| Option       | Type                    | Required | Default     | Description                                                   |
| :----------- | :---------------------- | :------- | :---------- | :------------------------------------------------------------ |
| `strategy`   | `'lru'`                 | No       | `'lru'`     | Cache eviction strategy. Only LRU currently supported.        |
| `maxEntries` | `number`                | No       | `1000`      | Maximum entries before LRU eviction. Must be ≥ 1.             |
| `ttl`        | `number`                | No       | `3600`      | Time-to-live in seconds. Lazy expiry on `get()`. Must be ≥ 1. |
| `onEvict`    | `(key, reason) => void` | No       | `undefined` | Callback on eviction. Receives key and `EvictionReason`.      |

Invalid config throws `EnterstellarError` with code `ENS-3001` (not recoverable).

### Design Choices Applied

| ID  | Decision                                              | Impact                                     |
| :-- | :---------------------------------------------------- | :----------------------------------------- |
| CA1 | Cache key = `intentHash + componentName`              | Stable across prop variations              |
| CA2 | Cache stores `CompilationResult` only                 | No framework-specific objects              |
| CA3 | Global cache, no zone partitioning                    | Simpler, higher hit rate                   |
| CA4 | 4 invalidation triggers                               | Registry update, token change, TTL, manual |
| CA5 | Registry update evicts ALL entries for that component | Broad but safe                             |
| CA6 | Warmup from static config + historical traces         | Pre-populate on startup                    |
| CA7 | Warmup is async, never blocking                       | Uses idle callbacks                        |

### Build Configuration

| File             | Purpose                                                            |
| :--------------- | :----------------------------------------------------------------- |
| `tsconfig.json`  | Extends `tsconfig.base.json` — 15 strict flags.                    |
| `tsup.config.ts` | Builds ESM + CJS + DTS. Overrides `composite: false` for tsup DTS. |

**Peer dependencies:** `@enterstellar-ai/types`, `zod ^4.3.6`

## See Also

- [Implementation Bible §4.6](../../agent/03-enterstellar-implementation-bible.md) — cache specification.
- [Design Choices — Module 6](../../agent/04-enterstellar-design-choices.md) — locked decisions CA1–CA7.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
