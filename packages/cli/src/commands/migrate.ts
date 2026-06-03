/**
 * @module @enterstellar-ai/cli/commands/migrate
 * @description Implements the `enterstellar migrate <path> [flags]` command.
 *
 * This is the **CLI orchestrator** — the glue layer that wires:
 * - `@enterstellar-ai/migration` (domain logic: extract, enrich, assemble)
 * - `@enterstellar-ai/cli/migrate/*` (file discovery, outcome determination, formatters)
 * - Node filesystem (read source, write `.contract.ts` + `.test.ts`)
 * - Terminal (colored output, spinners, exit codes)
 *
 * ## Orchestration Flow
 *
 * ```
 * migrateCommand(pathArgs, rawArgs)
 *   ├─ 1. Parse flags (parseMigrateFlags)
 *   ├─ 2. Validate path args (≥1 required)
 *   ├─ 3. Guard: --update stub (exits 1)
 *   ├─ 4. Dynamic import (@enterstellar-ai/migration + ts-morph)
 *   ├─ 5. Resolve source files (3-layer exclusion)
 *   ├─ 6. Guard: empty file list
 *   ├─ 7. Resolve enrichment provider (if --enrich)
 *   ├─ 8. Per-file pipeline loop:
 *   │   ├─ 8a. Skip detection (existing contracts)
 *   │   ├─ 8b. Phase 1: extractManifest()
 *   │   ├─ 8c. Phase 2: enrichManifest() (if --enrich && !--dry-run)
 *   │   ├─ 8d. Phase 3: assembleContract() + assembleTest()
 *   │   ├─ 8e. Determine outcome + patch content (Audit E1)
 *   │   └─ 8f. Write files (unless --dry-run)
 *   ├─ 9. Build MigrateBatchSummary
 *   ├─ 10. Format and print output
 *   └─ 11. Exit code (--strict)
 * ```
 *
 * ## Critical Design Decisions
 *
 * - **Dynamic imports (Audit W4):** `@enterstellar-ai/migration` and `ts-morph` are
 *   dynamically imported inside the function body — NOT at top level. This
 *   keeps `ts-morph` (~2MB) out of the cold-start path for `enterstellar init`
 *   and `enterstellar add component`.
 * - **Annotation-based outcomes:** Outcome is determined from assembly
 *   annotations (`@enterstellar-review`, `@enterstellar-warn`). `compiler.lint()` is
 *   architecturally inapplicable — it validates `ComponentIntents`
 *   against registered contracts, not the contracts themselves.
 * - **Content patching (Audit E1):** `@outcome clean` placeholder in the
 *   generated content is patched with the real outcome before writing.
 *
 * @see Correction 4 — Server-Side Extraction (package separation rationale)
 * @see Correction 5 — CLI Interface, Recursion Default, and Flag Reference
 * @see Correction 6 — `.enterstellarignore` + `--exclude` (3-layer exclusion model)
 * @see Implementation Plan §3 Component 4 — Migrate Command Orchestrator
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import pc from 'picocolors';

import type { MigrateFlags } from '../migrate/flags.js';
import { parseMigrateFlags } from '../migrate/flags.js';
import { resolveSourceFiles } from '../migrate/resolve-source-files.js';
import { formatBatchSummaryText, formatResultText } from '../migrate/format-text.js';
import { formatBatchSummaryJson } from '../migrate/format-json.js';

import type {
    MigrationResult,
    MigrateBatchSummary,
    MigrationOutcome,
    EnrichResult,
    AssemblyOptions,
    EnrichmentProvider,
    ExtractResult,
    StructuralManifest,
    ContractAssemblyResult,
} from '@enterstellar-ai/migration';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The pipeline version embedded in the provenance header.
 * Updated manually when the pipeline logic changes.
 */
const PIPELINE_VERSION = '1.0.0';

/**
 * Marker comment in generated `.contract.ts` files that indicates
 * the file was produced by the Enterstellar migration pipeline.
 */
const Enterstellar_GENERATED_MARKER = '@enterstellar-generated';

// ---------------------------------------------------------------------------
// Migrate Command
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar migrate <path> [flags]` command.
 *
 * Orchestrates the full 3-phase migration pipeline: file discovery,
 * extraction (Phase 1), optional enrichment (Phase 2), assembly (Phase 3),
 * outcome determination, file writing, and batch summary output.
 *
 * @param pathArgs - One or more paths (files, directories, or glob patterns).
 * @param rawArgs - Raw CLI arguments after the `migrate` command
 *   (includes both path args and flags — `parseMigrateFlags` separates them).
 *
 * @example
 * ```ts
 * // Called from bin.ts:
 * // enterstellar migrate src/components/ --enrich --provider openai --api-key sk-xxx
 * await migrateCommand(
 *     ['src/components/'],
 *     ['src/components/', '--enrich', '--provider', 'openai', '--api-key', 'sk-xxx'],
 * );
 * ```
 *
 * @see Correction 5 — complete flag reference (12 flags)
 * @see Correction 1 — 4-level outcome model and batch summary format
 */
export async function migrateCommand(
    pathArgs: readonly string[],
    rawArgs: readonly string[],
): Promise<void> {
    const startTime = Date.now();

    // --- Step 1: Parse flags ---
    const flags: MigrateFlags = parseMigrateFlags(rawArgs);

    // --- Step 2: Validate path args ---
    if (pathArgs.length === 0) {
        console.error(pc.red('Missing path argument.'));
        console.error(`Usage: ${pc.bold('enterstellar migrate <path> [flags]')}\n`);
        console.error(`Example: ${pc.dim('enterstellar migrate src/components/')}\n`);
        process.exitCode = 1;
        return;
    }

    // --- Step 3: Guard: --update stub (Audit W3 — exit 1, not 0) ---
    if (flags.update) {
        console.error(
            pc.red('Error: --update is not yet implemented.\n') +
            `Use ${pc.bold('--force')} to regenerate contracts from scratch.\n` +
            pc.dim('Incremental re-migration will be available in a future release.'),
        );
        process.exitCode = 1;
        return;
    }

    // --- Step 4: Dynamic imports (Audit W4 — cold-start optimization) ---
    // @enterstellar-ai/migration (and its ts-morph dep) are loaded only when
    // `enterstellar migrate` is invoked, not on every CLI startup.
    // The CLI never imports ts-morph directly — it uses the
    // createExtractionProject() factory to stay on the right side
    // of the package boundary (Mid-Session Decision #7).
    const {
        extractManifest,
        createExtractionProject,
        assembleContract,
        assembleTest,
        enrichManifest,
        resolveProvider,
    } = await import('@enterstellar-ai/migration');

    // Reuse a single Project instance for batch performance.
    // extractManifest() accepts an optional `project` parameter for this.
    const project = createExtractionProject();

    // --- Step 5: Resolve source files (3-layer exclusion model) ---
    const { files, excludedCount } = await resolveSourceFiles(pathArgs, flags.exclude);

    if (excludedCount > 0 && flags.format === 'text') {
        console.log(pc.dim(`Excluded ${String(excludedCount)} files by ignore rules.`));
    }

    // --- Step 6: Guard: empty file list ---
    if (files.length === 0) {
        if (flags.format === 'text') {
            console.log(pc.yellow('No source files found matching the given paths.'));
        }
        return;
    }

    // --- Step 7: Resolve enrichment provider (if --enrich) ---
    // Provider is resolved ONCE before the loop, not per-file.
    let enrichmentProvider: Awaited<ReturnType<typeof resolveProvider>> | undefined;

    if (flags.enrich && !flags.dryRun) {
        try {
            // exactOptionalPropertyTypes: conditional spreads for optional fields.
            // flags.provider / flags.apiKey / flags.model are `string | undefined`
            // but EnrichmentConfig expects `string?` (not `string | undefined`).
            enrichmentProvider = resolveProvider({
                ...(flags.provider !== undefined ? { providerName: flags.provider } : {}),
                ...(flags.apiKey !== undefined ? { apiKey: flags.apiKey } : {}),
                ...(flags.model !== undefined ? { model: flags.model } : {}),
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown provider error.';
            console.error(pc.red(`Enrichment provider error: ${message}`));
            process.exitCode = 1;
            return;
        }
    }

    // Warning: --provider without --enrich
    if (flags.provider !== undefined && !flags.enrich && flags.format === 'text') {
        console.log(
            pc.yellow('Warning: --provider specified without --enrich. Provider will not be used.'),
        );
    }

    // --- Step 8: Per-file pipeline loop ---
    const results: MigrationResult[] = [];
    const primaryInputPath = pathArgs[0] ?? '.';

    for (const filePath of files) {
        const result = await processFile(filePath, flags, {
            // Type assertion bridges the ts-morph `Project` ↔ `unknown` variance
            // gap. extractManifest expects `Project` but the CLI types it as
            // `unknown` to avoid importing ts-morph. This is the single assertion.
            extractManifest: extractManifest as ProcessFileContext['extractManifest'],
            assembleContract,
            assembleTest,
            enrichManifest,
            project,
            enrichmentProvider,
            primaryInputPath,
        });

        results.push(result);

        // Live per-file output (text mode only, non-dry-run).
        if (flags.format === 'text') {
            console.log(formatResultText(result));
        }
    }

    // --- Step 9: Build MigrateBatchSummary ---
    const durationMs = Date.now() - startTime;
    const summary: MigrateBatchSummary = buildBatchSummary(results, files.length, durationMs);

    // --- Step 10: Format and print output ---
    if (flags.format === 'json') {
        process.stdout.write(formatBatchSummaryJson(summary) + '\n');
    } else {
        console.log('');
        console.log(formatBatchSummaryText(summary, primaryInputPath));
    }

    // --- Step 11: Exit code (--strict) ---
    if (flags.strict && summary.reviewCount > 0) {
        process.exitCode = 1;
    }
}
// ---------------------------------------------------------------------------
// Types: Pipeline Dependencies (injected to processFile)
// ---------------------------------------------------------------------------

/**
 * Pipeline function references and shared state injected into
 * {@link processFile}. Avoids passing 7+ individual parameters.
 *
 * Function types are defined structurally to match `@enterstellar-ai/migration`'s
 * exports without using `import()` type annotations (which are forbidden
 * by the `consistent-type-imports` eslint rule). TypeScript verifies
 * structural compatibility at the call site in `migrateCommand()`.
 */
type ProcessFileContext = {
    /**
     * Extraction function — typed to accept the opaque `project` value.
     * The third parameter is typed as `unknown` because the CLI cannot
     * reference `ts-morph.Project` directly. The dynamic import's real
     * function is structurally compatible; the context object is constructed
     * with a type assertion on this single field only.
     */
    readonly extractManifest: (
        source: string,
        filename?: string,
        project?: unknown,
    ) => ExtractResult;
    readonly assembleContract: (
        manifest: StructuralManifest,
        sourcePath: string,
        pipelineVersion: string,
        options?: AssemblyOptions,
    ) => ContractAssemblyResult;
    readonly assembleTest: (
        manifest: StructuralManifest,
        contractImportPath: string,
    ) => string;
    readonly enrichManifest: (
        manifest: StructuralManifest,
        source: string,
        provider: EnrichmentProvider,
    ) => Promise<EnrichResult>;
    /** Shared `ts-morph` Project — opaque to the CLI. */
    readonly project: unknown;
    readonly enrichmentProvider: EnrichmentProvider | undefined;
    readonly primaryInputPath: string;
};

// ---------------------------------------------------------------------------
// Per-File Processor
// ---------------------------------------------------------------------------

/**
 * Processes a single source file through the 3-phase migration pipeline.
 *
 * Handles all SKIP detection, phase execution, outcome reading,
 * and file writing for one component.
 *
 * **Error handling:** Exceptions during Phase 1 (extraction) are caught
 * and produce a SKIP result. Phase 2 never throws (errors captured in
 * diagnostics). Phase 3 is synchronous and deterministic.
 *
 * @param filePath - Absolute path to the source file.
 * @param flags - Parsed CLI flags.
 * @param ctx - Pipeline function references and shared state.
 * @returns A `MigrationResult` for this file.
 */
async function processFile(
    filePath: string,
    flags: MigrateFlags,
    ctx: ProcessFileContext,
): Promise<MigrationResult> {
    const sourcePath = relative(process.cwd(), filePath);
    const sourceDir = dirname(filePath);
    const sourceBasename = basename(filePath, '.tsx');
    const sourceBasenameTs = basename(filePath, '.ts');
    // Use the shorter basename (handles both .tsx and .ts extensions).
    const componentBasename = sourceBasename.length < sourceBasenameTs.length
        ? sourceBasename
        : sourceBasenameTs;

    // --- Step 8a: Skip detection (existing contracts) ---
    const contractFilename = `${componentBasename}.contract.ts`;
    const testFilename = `${componentBasename}.test.ts`;

    const outputDir = flags.out !== undefined
        ? resolveOutputDir(filePath, flags.out, ctx.primaryInputPath)
        : sourceDir;

    const contractPath = join(outputDir, contractFilename);
    const testPath = join(outputDir, testFilename);

    if (!flags.force && existsSync(contractPath)) {
        // Check if the existing file was generated by Enterstellar migration.
        try {
            const existingContent = readFileSync(contractPath, 'utf-8');
            if (existingContent.includes(Enterstellar_GENERATED_MARKER)) {
                return buildSkipResult(
                    componentBasename,
                    sourcePath,
                    'existing @enterstellar-generated contract (use --force to overwrite)',
                );
            }
        } catch {
            // Cannot read existing file — continue with migration.
        }
    }

    // --- Step 8b: Phase 1 — Extraction ---
    let source: string;
    try {
        source = readFileSync(filePath, 'utf-8');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown read error.';
        return buildSkipResult(componentBasename, sourcePath, `cannot read file: ${message}`);
    }

    let extractResult: ReturnType<typeof ctx.extractManifest>;
    try {
        extractResult = ctx.extractManifest(source, basename(filePath), ctx.project);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown extraction error.';
        // Clean up the SKIP prefix if it's already in the error message.
        const reason = message.startsWith('SKIP: ')
            ? message.slice(6)
            : message;
        return buildSkipResult(componentBasename, sourcePath, reason);
    }

    const { manifest, diagnostics } = extractResult;

    // --- Step 8c: Phase 2 — Enrichment (if --enrich && !--dry-run) ---
    let enrichResult: EnrichResult | undefined;
    let assemblyOptions: AssemblyOptions | undefined;

    if (flags.enrich && !flags.dryRun && ctx.enrichmentProvider !== undefined) {
        enrichResult = await ctx.enrichManifest(manifest, source, ctx.enrichmentProvider);

        // Build assembly options with enrichment metadata for provenance.
        if (enrichResult.enrichedFields.length > 0) {
            assemblyOptions = {
                enrichedFields: enrichResult.enrichedFields,
                ...(flags.provider !== undefined
                    ? { enrichmentProvider: flags.provider }
                    : {}),
            };
        }
    }

    // Use the enriched manifest if available, otherwise the original.
    const finalManifest = enrichResult !== undefined
        ? enrichResult.manifest
        : manifest;

    // --- Step 8d: Phase 3 — Assembly ---
    const contractResult = ctx.assembleContract(
        finalManifest,
        sourcePath,
        PIPELINE_VERSION,
        assemblyOptions,
    );

    const contractImportPath = `./${componentBasename}.contract`;
    const testContent = ctx.assembleTest(finalManifest, contractImportPath);

    // --- Step 8e: Read outcome from assembly result ---
    // Outcome is computed inline by assembleContract() from its annotation
    // arrays. No placeholder patching or provenance reconstruction needed.
    const outcome: MigrationOutcome = contractResult.provenance.outcome;

    // --- Step 8f: Write files (unless --dry-run) ---
    if (!flags.dryRun) {
        // Ensure output directory exists.
        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        writeFileSync(contractPath, contractResult.content, 'utf-8');
        writeFileSync(testPath, testContent, 'utf-8');
    }

    // --- Build MigrationResult ---
    const relativeContractPath = relative(process.cwd(), contractPath);
    const relativeTestPath = relative(process.cwd(), testPath);

    return {
        componentName: manifest.name,
        sourcePath,
        outcome,
        contractPath: relativeContractPath,
        testPath: relativeTestPath,
        reviewAnnotations: contractResult.reviewAnnotations,
        warnAnnotations: contractResult.warnAnnotations,
        diagnostics,
        provenance: contractResult.provenance,
    };
}

// ---------------------------------------------------------------------------
// Output Directory Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the output directory for a source file when `--out` is specified.
 *
 * Mirrors the source directory structure under the `--out` target directory.
 * For example, with `--out contracts/` and source `src/clinical/Card.tsx`,
 * the output directory is `contracts/clinical/`.
 *
 * @param filePath - Absolute path to the source file.
 * @param outDir - The `--out` target directory.
 * @param primaryInputPath - The primary input path (used as the base
 *   for relative path computation).
 * @returns Absolute path to the output directory.
 */
function resolveOutputDir(
    filePath: string,
    outDir: string,
    primaryInputPath: string,
): string {
    const sourceDir = dirname(filePath);
    const baseDir = resolve(primaryInputPath);

    // Compute the relative path from the primary input to the source file's dir.
    const relativePath = relative(baseDir, sourceDir);

    return resolve(outDir, relativePath);
}

// ---------------------------------------------------------------------------
// Result Builders
// ---------------------------------------------------------------------------

/**
 * Creates a `MigrationResult` for a SKIP outcome.
 *
 * Used when extraction fails, the file is unreadable, or an existing
 * `@enterstellar-generated` contract is detected without `--force`.
 *
 * @param componentName - The component name (derived from filename).
 * @param sourcePath - Relative path to the source file.
 * @param skipReason - Human-readable reason for the SKIP.
 * @returns A `MigrationResult` with outcome `'skip'`.
 */
function buildSkipResult(
    componentName: string,
    sourcePath: string,
    skipReason: string,
): MigrationResult {
    return {
        componentName,
        sourcePath,
        outcome: 'skip',
        reviewAnnotations: [],
        warnAnnotations: [],
        diagnostics: [],
        skipReason,
    };
}

/**
 * Builds the aggregate `MigrateBatchSummary` from individual results.
 *
 * Counts outcomes by category and assembles the batch summary shape
 * expected by the Zod schema and formatters.
 *
 * @param results - All per-component migration results.
 * @param totalFiles - Total files scanned (before SKIP filtering).
 * @param durationMs - Total wall-clock duration in milliseconds.
 * @returns A `MigrateBatchSummary`.
 */
function buildBatchSummary(
    results: readonly MigrationResult[],
    totalFiles: number,
    durationMs: number,
): MigrateBatchSummary {
    let cleanCount = 0;
    let warnCount = 0;
    let reviewCount = 0;
    let skipCount = 0;

    for (const result of results) {
        switch (result.outcome) {
            case 'clean':
                cleanCount++;
                break;
            case 'warn':
                warnCount++;
                break;
            case 'review':
                reviewCount++;
                break;
            case 'skip':
                skipCount++;
                break;
        }
    }

    return {
        totalFiles,
        cleanCount,
        warnCount,
        reviewCount,
        skipCount,
        results,
        durationMs,
    };
}
