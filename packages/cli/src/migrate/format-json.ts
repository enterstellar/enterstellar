/**
 * @module @enterstellar-ai/cli/migrate/format-json
 * @description JSON output formatter for the `enterstellar migrate --format json` mode.
 *
 * Serializes a `MigrateBatchSummary` to stdout-ready JSON. Used by CI
 * pipelines and programmatic consumers that parse migration results.
 *
 * ## Audit M2: Schema Compliance
 *
 * The output is the **bare** `MigrateBatchSummary` — no extra fields are
 * added. `MigrateBatchSummarySchema` (Zod v4, strict mode) rejects unknown
 * keys. Adding `dryRun` or other ad-hoc fields via spread would cause
 * `.parse()` validation to fail. Dry-run status is communicated via the
 * `--dry-run` flag context (exit code / CLI UX), not the JSON payload.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Correction 1 — Batch Summary: JSON Output Format
 * @see Audit M2 — no `dryRun` field in JSON output (schema compliance)
 * @see Implementation Plan §3 Component 3 — Output Formatters
 */

import type { MigrateBatchSummary } from '@enterstellar-ai/migration';

// ---------------------------------------------------------------------------
// JSON Formatter
// ---------------------------------------------------------------------------

/**
 * Formats a `MigrateBatchSummary` as a JSON string for stdout.
 *
 * Outputs the bare `MigrateBatchSummary` schema without modification.
 * Uses 2-space indentation for human readability when piped to tools
 * like `jq` or inspected in CI logs.
 *
 * **Audit M2 compliance:** No extra fields added. The output passes
 * `MigrateBatchSummarySchema.parse()` validation.
 *
 * @param summary - The aggregate batch summary from the migration run.
 * @returns A JSON string with 2-space indentation, ready for
 *   `process.stdout.write()`.
 *
 * @example
 * ```ts
 * const json = formatBatchSummaryJson(summary);
 * process.stdout.write(json + '\n');
 * ```
 *
 * @see MigrateBatchSummarySchema — Zod schema for runtime validation
 */
export function formatBatchSummaryJson(
    summary: MigrateBatchSummary,
): string {
    return JSON.stringify(summary, null, 2);
}
