/**
 * @module @enterstellar-ai/cli/migrate/format-text
 * @description Human-readable colored terminal output for migration results.
 *
 * Provides two formatters:
 * 1. {@link formatBatchSummaryText} — aggregate batch summary matching
 *    Correction 1's terminal output format.
 * 2. {@link formatResultText} — per-component one-line status for live
 *    progress output during the migration loop.
 *
 * **Design:** Output follows the Correction 1 spec exactly:
 * ```
 * enterstellar migrate src/components/ — 200 files scanned (1.2s)
 *
 *   ✓ 135 contracts generated (clean)
 *   ⚠  12 contracts generated (warnings)
 *   ~ 42 contracts generated (need review)
 *   ✗ 11 files skipped:
 *       3 no exports
 *       5 not React components
 *       3 syntax errors
 *
 * Output: src/components/**\/*.contract.ts
 * Next: review @enterstellar-review annotations.
 * ```
 *
 * **Audit M1 compliance:** SKIP sub-counts are grouped by
 * `MigrationResult.skipReason` and displayed as a breakdown.
 *
 * **L15 compliance:** Zero framework imports. Uses `picocolors` only.
 *
 * @see Correction 1 — Batch Summary: Terminal Output Format
 * @see Audit M1 — SKIP sub-count breakdown
 * @see Implementation Plan §3 Component 3 — Output Formatters
 */

import pc from 'picocolors';

import type { MigrateBatchSummary, MigrationResult } from '@enterstellar-ai/migration';

// ---------------------------------------------------------------------------
// Batch Summary Formatter
// ---------------------------------------------------------------------------

/**
 * Formats a `MigrateBatchSummary` as a human-readable colored string
 * for terminal output.
 *
 * Matches the Correction 1 batch summary format exactly, with SKIP
 * sub-counts grouped by `skipReason` (Audit M1).
 *
 * Lines are only included when their count is greater than zero.
 * This prevents noise for clean runs (no WARN/REVIEW/SKIP lines).
 *
 * @param summary - The aggregate batch summary from the migration run.
 * @param inputPath - The primary input path (for the header line).
 * @returns A multi-line string ready for `console.log()`.
 *
 * @example
 * ```ts
 * const output = formatBatchSummaryText(summary, 'src/components/');
 * console.log(output);
 * ```
 *
 * @see Correction 1 — Batch Summary: Terminal Output Format
 * @see Audit M1 — SKIP sub-count breakdown
 */
export function formatBatchSummaryText(
    summary: MigrateBatchSummary,
    inputPath: string,
): string {
    const lines: string[] = [];
    const durationSec = (summary.durationMs / 1000).toFixed(1);

    // --- Header ---
    lines.push(
        `${pc.bold('enterstellar migrate')} ${inputPath} — ${pc.bold(String(summary.totalFiles))} files scanned (${durationSec}s)`,
    );
    lines.push('');

    // --- Outcome counts (only non-zero lines) ---
    if (summary.cleanCount > 0) {
        lines.push(
            `  ${pc.green('✓')} ${String(summary.cleanCount)} contracts generated ${pc.dim('(clean)')}`,
        );
    }

    if (summary.warnCount > 0) {
        lines.push(
            `  ${pc.yellow('⚠')}  ${String(summary.warnCount)} contracts generated ${pc.dim('(warnings)')}`,
        );
    }

    if (summary.reviewCount > 0) {
        lines.push(
            `  ${pc.cyan('~')} ${String(summary.reviewCount)} contracts generated ${pc.dim('(need review)')}`,
        );
    }

    // --- SKIP section with sub-counts (Audit M1) ---
    if (summary.skipCount > 0) {
        lines.push(
            `  ${pc.dim('✗')} ${String(summary.skipCount)} files skipped:`,
        );

        // Group skip reasons from individual results.
        const skipReasons = groupSkipReasons(summary.results);

        for (const [reason, count] of skipReasons) {
            lines.push(`      ${String(count)} ${reason}`);
        }
    }

    // --- Output path hint ---
    if (summary.cleanCount + summary.warnCount + summary.reviewCount > 0) {
        lines.push('');
        lines.push(`Output: ${pc.dim(`${inputPath}/**/*.contract.ts`)}`);
    }

    // --- Review guidance ---
    if (summary.reviewCount > 0) {
        lines.push(
            `${pc.cyan('Next:')} review ${pc.bold('@enterstellar-review')} annotations.`,
        );
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Per-Result Formatter
// ---------------------------------------------------------------------------

/**
 * Formats a single `MigrationResult` as a one-line colored string
 * for live progress output during the migration loop.
 *
 * Format per outcome:
 * - **CLEAN:** `✓ Button.tsx → Button.contract.ts (clean)`
 * - **WARN:**  `⚠ Button.tsx → Button.contract.ts (2 warnings)`
 * - **REVIEW:** `~ Button.tsx → Button.contract.ts (3 review items)`
 * - **SKIP:**  `✗ utils.tsx — no component export found`
 *
 * @param result - The per-component migration result.
 * @returns A single-line string ready for `console.log()`.
 */
export function formatResultText(result: MigrationResult): string {
    const source = result.sourcePath;

    switch (result.outcome) {
        case 'clean':
            return `  ${pc.green('✓')} ${source} → ${result.contractPath ?? 'unknown'} ${pc.dim('(clean)')}`;

        case 'warn':
            return `  ${pc.yellow('⚠')}  ${source} → ${result.contractPath ?? 'unknown'} ${pc.dim(`(${String(result.warnAnnotations.length)} warnings)`)}`;

        case 'review':
            return `  ${pc.cyan('~')} ${source} → ${result.contractPath ?? 'unknown'} ${pc.dim(`(${String(result.reviewAnnotations.length)} review items)`)}`;

        case 'skip':
            return `  ${pc.dim('✗')} ${source} — ${result.skipReason ?? 'skipped'}`;
    }
}

// ---------------------------------------------------------------------------
// Internal: SKIP Reason Grouping (Audit M1)
// ---------------------------------------------------------------------------

/**
 * Groups and counts SKIP reasons from migration results.
 *
 * Iterates over all results with outcome `'skip'`, groups by the
 * `skipReason` field, and returns sorted entries by descending count.
 *
 * **`exactOptionalPropertyTypes` compliance:** `skipReason` is optional
 * on `MigrationResult`. When absent, the reason is categorized as
 * `'unknown reason'`.
 *
 * @param results - All migration results (SKIP and non-SKIP).
 * @returns An array of `[reason, count]` tuples sorted by count (descending).
 */
function groupSkipReasons(
    results: readonly MigrationResult[],
): ReadonlyArray<readonly [string, number]> {
    const counts = new Map<string, number>();

    for (const result of results) {
        if (result.outcome !== 'skip') {
            continue;
        }

        // exactOptionalPropertyTypes: skipReason is `string | undefined`
        // when the field is absent. Use nullish coalescing.
        const reason = result.skipReason ?? 'unknown reason';

        const current = counts.get(reason) ?? 0;
        counts.set(reason, current + 1);
    }

    // Sort by count descending for readability.
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
