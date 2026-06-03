/**
 * @module @enterstellar-ai/migration
 * @description Enterstellar migration pipeline — converts existing component libraries
 * into the Enterstellar `ComponentContract` standard.
 *
 * This package provides the domain logic for the 3-phase migration pipeline:
 * 1. **Extraction** — `ts-morph` AST extraction → `StructuralManifest`
 * 2. **Enrichment** — Opt-in LLM enrichment via `EnrichmentProvider`
 * 3. **Assembly** — `StructuralManifest` + `SemanticOverlay` → `.contract.ts`
 *
 * The CLI (`@enterstellar-ai/cli`) provides command routing and terminal output.
 * The cloud (`@enterstellar-ai/cloud`) imports `extractManifest()` for server-side use.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @example
 * ```ts
 * import { extractManifest } from '@enterstellar-ai/migration';
 * import type { StructuralManifest, ExtractResult } from '@enterstellar-ai/migration';
 *
 * const result: ExtractResult = extractManifest(sourceCode, 'Button.tsx');
 * // result.manifest — the StructuralManifest for the component
 * // result.diagnostics — extraction diagnostics
 * ```
 *
 * @see Correction 4 — Server-Side Extraction (code-sharing architecture)
 * @see Implementation Bible §4.2
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Phase 1: Extraction
// ---------------------------------------------------------------------------
export {
    extractManifest,
    createExtractionProject
} from './extract/index.js';

// ---------------------------------------------------------------------------
// Phase 1a: Lightweight Scan (for `enterstellar init` existing-project detection)
// ---------------------------------------------------------------------------
export { scanComponentsLightweight } from './extract/scan-lightweight.js';
export type { ComponentScanResult } from './extract/scan-lightweight.js';

// ---------------------------------------------------------------------------
// Phase 2: Enrichment
// ---------------------------------------------------------------------------
export type {
    EnrichmentProvider,
    EnrichmentErrorCode,
    EnrichmentConfig,
} from './enrichment/index.js';
export {
    EnrichmentError,
    resolveProvider,
    enrichManifest,
    mergeOverlay,
    ENRICHABLE_FIELD_KEYS,
} from './enrichment/index.js';

// ---------------------------------------------------------------------------
// Phase 3: Assembly
// ---------------------------------------------------------------------------
export {
    assembleContract,
    assembleTest,
    generateExampleProps,
} from './assembly/index.js';
export type { ContractAssemblyResult } from './assembly/index.js';

// ---------------------------------------------------------------------------
// Pipeline Types (public API surface)
// ---------------------------------------------------------------------------
export type {
    ManifestFieldSource,
    SourceLocation,
    EnrichableField,
    GenericParam,
    StructuralManifest,
    EnrichableFieldKey,
    EnrichedFieldPatch,
    SemanticOverlay,
    EnrichDiagnostic,
    EnrichResult,
    ExtractDiagnostic,
    ExtractResult,
    MigrationOutcome,
    MigrationProvenance,
    MigrationResult,
    MigrateBatchSummary,
    AssemblyOptions,
    ServerExtractRequest,
    ServerExtractResponse,
} from './types.js';

// ---------------------------------------------------------------------------
// Zod Schemas (public — for JSON serialization validation)
// ---------------------------------------------------------------------------
export {
    MigrationResultSchema,
    MigrateBatchSummarySchema,
    SemanticOverlaySchema,
    ServerExtractRequestSchema,
} from './types.js';
