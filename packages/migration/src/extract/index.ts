/**
 * @module @enterstellar-ai/migration/extract
 * @description Phase 1 — AST extraction entry point.
 *
 * Re-exports `extractManifest` as the public API for Phase 1.
 * All internal extraction utilities (ts-morph helpers, Zod inference,
 * heuristics) are consumed internally and not re-exported.
 *
 * @see Correction 2 — Binary Source Model (StructuralManifest output)
 * @see Correction 4 — Server-Side Extraction (shared function)
 */

export {
    extractManifest,
    createExtractionProject
} from './extract-manifest.js';
