/**
 * @module @enterstellar-ai/cli
 * @description Public API for the Enterstellar CLI.
 *
 * This barrel exports the CLI's programmatic API for use in build scripts,
 * CI pipelines, or custom tooling. For terminal usage, use the `enterstellar` or
 * `create-enterstellar-app` binaries directly.
 *
 * ## Commands
 *
 * - {@link initCommand} — Programmatic `enterstellar init` scaffolding.
 * - {@link addComponentCommand} — Programmatic `enterstellar add component` scaffolding.
 * - {@link migrateCommand} — Programmatic `enterstellar migrate` pipeline entry point.
 * - {@link reviewCommand} — Programmatic `enterstellar review` annotation scanner.
 *
 * ## Types
 *
 * - {@link ProjectTemplate} — Template variant union (`minimal | full | nextjs | vite-react`).
 * - {@link PackageManager} — Supported package managers (`npm | pnpm | yarn | bun`).
 *
 * ## Migration Utilities
 *
 * - {@link resolveSourceFiles} — File discovery with 3-layer exclusion model.
 * - {@link determineOutcome} — Assembly annotations → `MigrationOutcome`.
 * - {@link patchContractContent} — Fix `@outcome clean` placeholder in generated contracts.
 * - {@link reconstructProvenance} — Create corrected provenance for readonly fields.
 * - {@link formatBatchSummaryText} — Colored terminal batch summary.
 * - {@link formatBatchSummaryJson} — JSON batch summary for CI pipelines.
 *
 * ## Utilities
 *
 * - {@link detectPackageManager} — Auto-detect PM from lockfiles.
 * - {@link validateProjectName} — Validate kebab-case project names.
 * - {@link validateComponentName} — Validate PascalCase component names.
 * - {@link handleTopLevelError} — Shared CLI error handler for custom entrypoints.
 *
 * ## Version
 *
 * - {@link CLI_VERSION} — Semantic version constant (T14 pattern).
 *
 * @see Implementation Bible §4.17
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export { initCommand } from './commands/init.js';
export { addComponentCommand } from './commands/add-component.js';
export { migrateCommand } from './commands/migrate.js';
export { reviewCommand } from './commands/review.js';

// ---------------------------------------------------------------------------
// Types (re-exported for consumers)
// ---------------------------------------------------------------------------

export type { ProjectTemplate } from './templates/template-package-json.js';
export type { PackageManager } from './utils/detect-package-manager.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export { detectPackageManager, getInstallCommand } from './utils/detect-package-manager.js';
export { validateProjectName, validateComponentName } from './utils/validate-name.js';
export { handleTopLevelError } from './utils/errors.js';

// ---------------------------------------------------------------------------
// Version (T14 pattern)
// ---------------------------------------------------------------------------

export { CLI_VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Migration: CLI-Specific Utilities
// ---------------------------------------------------------------------------

export { resolveSourceFiles } from './migrate/resolve-source-files.js';
export type { FileDiscoveryResult } from './migrate/resolve-source-files.js';
export {
    determineOutcome,
    patchContractContent,
    reconstructProvenance,
} from './migrate/determine-outcome.js';
export { formatBatchSummaryText, formatResultText } from './migrate/format-text.js';
export { formatBatchSummaryJson } from './migrate/format-json.js';

// ---------------------------------------------------------------------------
// Migration: Re-Exported Types from @enterstellar-ai/migration (Finding A2 + Audit M3)
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
    ExtractDiagnostic,
    ExtractResult,
    MigrationOutcome,
    MigrationProvenance,
    MigrationResult,
    MigrateBatchSummary,
    EnrichmentProvider,
    EnrichmentErrorCode,
    // Audit M3: assembly types used by orchestrator and external consumers.
    ContractAssemblyResult,
    AssemblyOptions,
} from '@enterstellar-ai/migration';

export {
    extractManifest,
    EnrichmentError,
    MigrationResultSchema,
    MigrateBatchSummarySchema,
} from '@enterstellar-ai/migration';

export type { MigrateFlags, MigrateFormat } from './migrate/flags.js';
export { parseMigrateFlags } from './migrate/flags.js';

// ---------------------------------------------------------------------------
// Review: CLI-Specific Utilities (Audit M4)
// ---------------------------------------------------------------------------

export { parseAnnotations } from './review/parse-annotations.js';
export type { ParsedAnnotation, FileAnnotations } from './review/parse-annotations.js';
export type { ReviewJsonOutput } from './review/format-review-json.js';
export type { ReviewFlags } from './review/review-flags.js';
export { parseReviewFlags } from './review/review-flags.js';
