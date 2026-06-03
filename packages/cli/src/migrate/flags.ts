/**
 * @module @enterstellar-ai/cli/migrate/flags
 * @description CLI flag types and parsing for the `enterstellar migrate` command.
 *
 * This module stays in `@enterstellar-ai/cli` — only the CLI parses `process.argv`.
 * The `@enterstellar-ai/migration` package is flag-agnostic; it receives typed
 * config objects, not raw CLI arguments.
 *
 * The flag spec follows Correction 5's authoritative reference (12 flags).
 * Parsing is manual (no `commander`, no `yargs`) — consistent with the
 * existing `bin.ts` architecture (see Correction 5: Arg Parsing Architecture).
 *
 * @see Correction 5 — CLI Interface, Recursion Default, and Flag Reference
 * @see Correction 6 — File Exclusion via `--exclude` Flag and `.enterstellarignore`
 * @see Design Choice T1 — `type` for data shapes
 * @see Design Choice T5 — every field documented
 */

// ---------------------------------------------------------------------------
// Output Format
// ---------------------------------------------------------------------------

/**
 * Output format for migration results.
 *
 * - `'text'`: Human-readable colored output (default, for interactive use).
 * - `'json'`: Machine-readable JSON to stdout (for CI pipelines that parse
 *   output programmatically). Outputs `MigrationResult[]` shape.
 *
 * @see Correction 5 — Flag Semantics: `--format`
 */
export type MigrateFormat = 'text' | 'json';

// ---------------------------------------------------------------------------
// CLI Flag Types
// ---------------------------------------------------------------------------

/**
 * Typed object for all 12 parsed CLI flags of `enterstellar migrate`.
 *
 * Produced by `parseMigrateFlags()` from raw `process.argv` arguments.
 * Consumed by the `migrateCommand()` handler in `commands/migrate.ts`.
 *
 * All fields use `readonly` per strict TS policy. Optional fields use
 * the `?` modifier per `exactOptionalPropertyTypes`.
 *
 * @see Correction 5 — Complete CLI Flag Reference (12 flags)
 * @see Correction 5 — Interaction Matrix: How Flags Compose
 */
export type MigrateFlags = {
    // ─── Enrichment ──────────────────────────────────────────────────────

    /**
     * Enables Phase 2 LLM enrichment.
     *
     * Requires either `--provider` + `--api-key` or an active `enterstellar login`
     * session. Without either, interactive TTY prompts with recovery options;
     * non-interactive/CI exits 1.
     *
     * Default behavior (no `--enrich`) = Phase 1 + Phase 3 only.
     */
    readonly enrich: boolean;

    /**
     * LLM provider name for BYO-key enrichment.
     *
     * Supported at launch: `'openai'`, `'anthropic'`. Requires `--enrich`.
     * If specified without `--enrich`, a warning is printed.
     */
    readonly provider?: string;

    /**
     * API key for the specified provider.
     *
     * Requires `--provider`. Can also be set via `ENTERSTELLAR_API_KEY` env var
     * (avoids key appearing in shell history).
     */
    readonly apiKey?: string;

    /**
     * Model identifier for the LLM provider.
     *
     * Optional — each provider has a sensible default (e.g., `'gpt-4o-mini'`
     * for OpenAI). Examples: `'gpt-4o'`, `'claude-sonnet-4-20250514'`.
     */
    readonly model?: string;

    // ─── Output Control ──────────────────────────────────────────────────

    /**
     * Output directory for generated contracts.
     *
     * **Mirrors the source directory structure** under the target directory.
     * When absent, `.contract.ts` and `.test.ts` are written adjacent to
     * each source file.
     *
     * @example
     * `enterstellar migrate src/ --out contracts/` with `src/clinical/Card.tsx`
     * produces `contracts/clinical/Card.contract.ts`.
     */
    readonly out?: string;

    /**
     * Preview mode — prints what would be generated without writing files.
     *
     * When combined with `--enrich`, Phase 2 does NOT run to avoid LLM
     * costs. Shows: "Dry run: enrichment would apply to N fields."
     */
    readonly dryRun: boolean;

    /**
     * Output format for migration results.
     *
     * `'text'` (default) prints human-readable colored output.
     * `'json'` outputs `MigrationResult[]` as JSON to stdout.
     */
    readonly format: MigrateFormat;

    // ─── Filtering ───────────────────────────────────────────────────────

    /**
     * Glob patterns to exclude from migration.
     *
     * Repeatable — multiple `--exclude` flags are merged. Additive with
     * `.enterstellarignore` patterns. Uses `.gitignore`-compatible syntax.
     * Cannot re-include files excluded by `.enterstellarignore`.
     *
     * @example `--exclude "**\/*.stories.tsx" --exclude "**\/legacy/**"`
     */
    readonly exclude: readonly string[];

    // ─── Re-migration ────────────────────────────────────────────────────

    /**
     * Force re-migration of files that already have `@enterstellar-generated` contracts.
     *
     * By default, `enterstellar migrate` skips source files that already have a
     * corresponding `.contract.ts` with an `@enterstellar-generated` comment.
     * `--force` overrides this and regenerates from scratch.
     *
     * **Mutually exclusive with `--update`.** Combining them is an error.
     */
    readonly force: boolean;

    /**
     * Incremental re-migration.
     *
     * Detects `@enterstellar-generated` contracts, re-extracts from the original
     * source, and diffs against the current contract. In interactive mode,
     * prompts before overwriting. In non-interactive mode, prints the diff
     * and exits 0 without overwriting.
     *
     * **Mutually exclusive with `--force`.** Combining them is an error.
     */
    readonly update: boolean;

    // ─── Strictness ──────────────────────────────────────────────────────

    /**
     * Strict CI mode — exits with code 1 if any REVIEW outcomes exist.
     *
     * SKIP outcomes are informational only and do NOT trigger `--strict`
     * failure (they represent files that genuinely cannot produce contracts).
     *
     * @see Correction 1 — 4-Level Outcome Model exit codes
     */
    readonly strict: boolean;
};

// ---------------------------------------------------------------------------
// Flag Parsing
// ---------------------------------------------------------------------------

/**
 * Parses raw CLI arguments into a typed `MigrateFlags` object.
 *
 * Handles three flag categories:
 * - **Boolean flags:** `--enrich`, `--dry-run`, `--strict`, `--force`, `--update`
 * - **Key-value flags:** `--out <dir>`, `--provider <name>`, `--api-key <key>`,
 *   `--model <id>`, `--format <type>`
 * - **Repeatable flags:** `--exclude <glob>` (collected into an array)
 *
 * Validates the `--force` + `--update` mutual exclusion constraint.
 * Validates `--format` against allowed values (`'text'`, `'json'`).
 *
 * Environment variable fallback: `ENTERSTELLAR_API_KEY` is checked if `--api-key`
 * is not provided (avoids key appearing in shell history).
 *
 * @param args - Raw arguments after the `migrate` command
 *   (i.e., `process.argv.slice(3)` or equivalent).
 * @returns A fully typed `MigrateFlags` object with defaults applied.
 * @throws {Error} If `--force` and `--update` are both specified.
 * @throws {Error} If `--format` has an invalid value.
 *
 * @example
 * ```ts
 * // enterstellar migrate src/ --enrich --provider openai --api-key sk-xxx --dry-run
 * const flags = parseMigrateFlags([
 *     'src/', '--enrich', '--provider', 'openai',
 *     '--api-key', 'sk-xxx', '--dry-run',
 * ]);
 * // flags.enrich === true
 * // flags.provider === 'openai'
 * // flags.apiKey === 'sk-xxx'
 * // flags.dryRun === true
 * ```
 *
 * @see Correction 5 — Arg Parsing Architecture (manual parsing, no framework)
 * @see Correction 5 — Interaction Matrix: `--force` + `--update` = error
 */
export function parseMigrateFlags(args: readonly string[]): MigrateFlags {
    // --- Accumulators ---
    let enrich = false;
    let provider: string | undefined;
    let apiKey: string | undefined;
    let model: string | undefined;
    let out: string | undefined;
    let dryRun = false;
    let format: MigrateFormat = 'text';
    const exclude: string[] = [];
    let force = false;
    let update = false;
    let strict = false;

    // --- Parse loop ---
    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        // Guard: noUncheckedIndexedAccess makes args[i] string | undefined.
        // Skip undefined entries (shouldn't occur, but satisfies exhaustiveness).
        if (arg === undefined) {
            i += 1;
            continue;
        }

        switch (arg) {
            // Boolean flags
            case '--enrich':
                enrich = true;
                break;
            case '--dry-run':
                dryRun = true;
                break;
            case '--force':
                force = true;
                break;
            case '--update':
                update = true;
                break;
            case '--strict':
                strict = true;
                break;

            // Key-value flags
            case '--provider':
                i += 1;
                provider = args[i];
                break;
            case '--api-key':
                i += 1;
                apiKey = args[i];
                break;
            case '--model':
                i += 1;
                model = args[i];
                break;
            case '--out':
                i += 1;
                out = args[i];
                break;
            case '--format': {
                i += 1;
                const formatValue = args[i];
                if (formatValue !== 'text' && formatValue !== 'json') {
                    throw new Error(
                        `Invalid --format value: '${String(formatValue)}'. ` +
                        `Allowed values: 'text', 'json'.`,
                    );
                }
                format = formatValue;
                break;
            }

            // Repeatable flags
            case '--exclude': {
                i += 1;
                const excludeValue = args[i];
                if (excludeValue !== undefined) {
                    exclude.push(excludeValue);
                }
                break;
            }

            // Skip non-flag arguments (path args handled by caller)
            default:
                break;
        }

        i += 1;
    }

    // --- Validation ---

    // Correction 5, Interaction Matrix: --force + --update = error
    if (force && update) {
        throw new Error(
            '--force and --update are mutually exclusive. ' +
            '--force overwrites all contracts. --update diffs and prompts.',
        );
    }

    // Environment variable fallback for API key
    if (apiKey === undefined && process.env['ENTERSTELLAR_API_KEY'] !== undefined) {
        apiKey = process.env['ENTERSTELLAR_API_KEY'];
    }

    // Build return with conditional spreads — exactOptionalPropertyTypes
    // requires optional fields to be absent (not undefined) when unset.
    return {
        enrich,
        ...(provider !== undefined ? { provider } : {}),
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(out !== undefined ? { out } : {}),
        dryRun,
        format,
        exclude,
        force,
        update,
        strict,
    };
}
