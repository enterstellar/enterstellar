/**
 * @module @enterstellar-ai/migration/enrichment
 * @description Phase 2 — LLM enrichment provider layer.
 *
 * Re-exports the provider interface, error types, the provider
 * resolution factory, and the enrichment orchestrator. Provider
 * implementations (`BYOKeyEnrichmentProvider`, `CloudEnrichmentProvider`)
 * are internal and not re-exported — consumers use `resolveProvider()`
 * to obtain a provider instance.
 *
 * **Audit M7:** `buildEnrichmentPrompt` is intentionally NOT exported
 * from this barrel. It is an internal implementation detail of
 * `BYOKeyEnrichmentProvider`. Test files that need direct access can
 * use the deep import path `@enterstellar-ai/migration/src/enrichment/build-prompt`.
 *
 * @see Correction 3 — Minimal EnrichmentProvider Interface (migration-02-enrichment.md)
 * @see Audit M7 — buildEnrichmentPrompt is internal-only
 */

// --- Provider types ---
export type { EnrichmentProvider, EnrichmentErrorCode } from './types.js';
export { EnrichmentError } from './types.js';

// --- Provider resolution ---
export { resolveProvider } from './resolve-provider.js';
export type { EnrichmentConfig } from './resolve-provider.js';

// --- Enrichment orchestrator ---
export {
    enrichManifest,
    mergeOverlay,
    ENRICHABLE_FIELD_KEYS,
} from './enrich-manifest.js';
