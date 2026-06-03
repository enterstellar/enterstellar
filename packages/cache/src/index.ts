/**
 * @module @enterstellar-ai/cache
 * @description Enterstellar Render Cache — LRU cache for compiled intents that makes
 * GenUI feel instant.
 *
 * This barrel file re-exports the public API surface. Consumers import from
 * `@enterstellar-ai/cache`. Internal modules (e.g., `LRUCache`) are NOT exported.
 *
 * @see Implementation Bible §4.6
 * @see Design Choices CA1–CA7
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export { createRenderCache } from './create-render-cache.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
export { buildCacheKey } from './cache-key.js';
export { withRegistryInvalidation } from './with-registry-invalidation.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
    RenderCache,
    RenderCacheConfig,
    CachedRender,
    CacheStats,
    WarmupEntry,
    CompileFn,
    EvictionReason,
} from './types.js';

export type {
    CacheInvalidationSource,
    RegistryInvalidationBinding,
} from './with-registry-invalidation.js';
