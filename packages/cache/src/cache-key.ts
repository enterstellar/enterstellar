/**
 * @module @enterstellar-ai/cache/cache-key
 * @description Cache key construction utility.
 *
 * Builds deterministic cache keys from an intent hash and resolved component
 * name. The key format follows Design Choice CA1: the cache key is based on
 * the *decision* (which component for which intent), NOT on prop variations.
 *
 * **Rationale (CA1):** Hashing props misses the cache if the LLM changes a
 * trivial field (timestamp, request ID). The decision to use `PatientVitals`
 * for "show patient vitals" is stable regardless of prop variations.
 *
 * **L15 compliance:** Zero framework imports. Pure TypeScript.
 *
 * @see Design Choice CA1 — intent hash + resolved component name.
 */

// ---------------------------------------------------------------------------
// Key Separator
// ---------------------------------------------------------------------------

/**
 * Separator between intent hash and component name in the cache key.
 * Using `::` ensures no collision with PascalCase names or hex hashes.
 *
 * @internal
 */
const CACHE_KEY_SEPARATOR = '::';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a deterministic cache key from an intent hash and component name.
 *
 * The intent hash is typically a SHA-256 of the raw intent string (produced
 * by `@enterstellar-ai/telemetry`). The component name is the PascalCase name of the
 * resolved component from the registry.
 *
 * @param intentHash - Hash of the raw intent string (e.g., SHA-256 hex).
 * @param componentName - PascalCase name of the resolved component.
 * @returns A deterministic cache key string.
 *
 * @see Design Choice CA1 — key = intentHash + componentName, NOT props.
 *
 * @example
 * ```ts
 * import { buildCacheKey } from '@enterstellar-ai/cache';
 *
 * const key = buildCacheKey(
 *   'a1b2c3d4e5f6...', // SHA-256 of "show patient vitals"
 *   'PatientVitals',
 * );
 * // => "a1b2c3d4e5f6...::PatientVitals"
 * ```
 */
export function buildCacheKey(
    intentHash: string,
    componentName: string,
): string {
    return `${intentHash}${CACHE_KEY_SEPARATOR}${componentName}`;
}

/**
 * Extracts the component name from a cache key.
 *
 * Useful for `invalidateByComponent()` — allows scanning cache keys
 * without parsing the full `CachedRender` value.
 *
 * @param cacheKey - A key previously produced by `buildCacheKey()`.
 * @returns The component name portion, or `undefined` if the key format
 *          is invalid (no separator found).
 *
 * @internal
 */
export function extractComponentName(cacheKey: string): string | undefined {
    const separatorIndex = cacheKey.indexOf(CACHE_KEY_SEPARATOR);
    if (separatorIndex === -1) {
        return undefined;
    }
    return cacheKey.substring(separatorIndex + CACHE_KEY_SEPARATOR.length);
}
