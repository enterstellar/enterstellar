/**
 * @module @enterstellar-ai/cli/review/format-review-json
 * @description JSON output formatter for the `enterstellar review --json` mode.
 *
 * Serializes annotation results to stdout-ready JSON. Used by CI/CD
 * dashboards and programmatic consumers that parse review results.
 *
 * The output is a `ReviewJsonOutput` structure containing:
 * - Total annotation count
 * - Total file count (files with annotations)
 * - Per-file annotation arrays
 *
 * Uses 2-space indentation for human readability (consistent with
 * `formatBatchSummaryJson` in the migration formatter).
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Correction 1 — `enterstellar review --json` output format
 */

import type { FileAnnotations } from './parse-annotations.js';

// ---------------------------------------------------------------------------
// Output Type
// ---------------------------------------------------------------------------

/**
 * Machine-readable JSON output shape for `enterstellar review --json`.
 *
 * This is the top-level structure written to stdout when the `--json`
 * flag is active. Designed for CI/CD dashboards that programmatically
 * track migration annotation debt over time.
 *
 * @example
 * ```json
 * {
 *   "totalAnnotations": 42,
 *   "totalFiles": 31,
 *   "files": [
 *     {
 *       "filePath": "src/components/DataTable.contract.ts",
 *       "annotations": [
 *         {
 *           "type": "review",
 *           "line": 18,
 *           "rule": "GENERIC_TYPE",
 *           "field": "props.data",
 *           "reason": "z.array(z.record(z.unknown())) — replace with concrete schema"
 *         }
 *       ]
 *     }
 *   ]
 * }
 * ```
 */
export type ReviewJsonOutput = {
    /** Total number of annotations across all files. */
    readonly totalAnnotations: number;
    /** Number of files that contain at least one annotation. */
    readonly totalFiles: number;
    /** Per-file annotation results, in scan order. */
    readonly files: readonly FileAnnotations[];
};

// ---------------------------------------------------------------------------
// JSON Formatter
// ---------------------------------------------------------------------------

/**
 * Formats annotation results as a JSON string for stdout.
 *
 * Constructs a {@link ReviewJsonOutput} and serializes it with 2-space
 * indentation for human readability when piped to tools like `jq`
 * or inspected in CI logs.
 *
 * @param files - Parsed annotation results, one per scanned file.
 *   Files with zero annotations should already be filtered out by the caller.
 * @returns A JSON string with 2-space indentation, ready for
 *   `process.stdout.write()`.
 *
 * @example
 * ```ts
 * const json = formatReviewJson(annotatedFiles);
 * process.stdout.write(json + '\n');
 * ```
 *
 * @see Correction 1 — `enterstellar review --json` output format
 */
export function formatReviewJson(
    files: readonly FileAnnotations[],
): string {
    const totalAnnotations = files.reduce(
        (sum, f) => sum + f.annotations.length,
        0,
    );

    const output: ReviewJsonOutput = {
        totalAnnotations,
        totalFiles: files.length,
        files,
    };

    return JSON.stringify(output, null, 2);
}
