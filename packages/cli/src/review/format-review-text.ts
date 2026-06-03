/**
 * @module @enterstellar-ai/cli/review/format-review-text
 * @description Human-readable colored terminal output for `enterstellar review` results.
 *
 * Formats parsed annotation results matching the bible's output spec at
 * `migration-01-pipeline.md` L199-212:
 *
 * ```
 * Found 42 @enterstellar-review annotations across 31 files:
 *
 *   src/components/DataTable.contract.ts
 *     L18  props.data     GENERIC_TYPE  "z.array(z.record(z.unknown())) — replace..."
 *     L21  props.columns  GENERIC_TYPE  "keyof T resolved to z.string()..."
 *
 *   src/components/DynamicForm.contract.ts
 *     L12  props.fields   GENERIC_TYPE  "z.array(z.unknown()) — replace..."
 *
 *   ... (39 more)
 * ```
 *
 * **Design:** Both `@enterstellar-review` and `@enterstellar-warn` annotations are displayed.
 * `@enterstellar-warn` annotations show `(warn)` in place of a rule ID, since they
 * do not carry a `rule=` field (Audit E1).
 *
 * **L15 compliance:** Zero framework imports. Uses `picocolors` only.
 *
 * @see Correction 1 — `enterstellar review` output format
 * @see Audit E1 — `@enterstellar-warn` has no `rule=` field
 */

import pc from 'picocolors';

import type { FileAnnotations, ParsedAnnotation } from './parse-annotations.js';

// ---------------------------------------------------------------------------
// Text Formatter
// ---------------------------------------------------------------------------

/**
 * Formats annotation results as a human-readable colored string for
 * terminal output.
 *
 * Matches the Correction 1 output format. Groups annotations by file,
 * sorted by line number within each file. Displays file path as a header,
 * then each annotation as an indented line with:
 * - Line number (e.g., `L18`)
 * - Field path (e.g., `props.data`)
 * - Rule ID or `(warn)` for `@enterstellar-warn` annotations
 * - Truncated reason string
 *
 * When no annotations are found, returns an informational message.
 *
 * @param files - Parsed annotation results, one per scanned file.
 *   Files with zero annotations should already be filtered out by the caller.
 * @returns A multi-line string ready for `console.log()`.
 *
 * @example
 * ```ts
 * const output = formatReviewText(annotatedFiles);
 * console.log(output);
 * ```
 *
 * @see Correction 1 — `enterstellar review` output format
 */
export function formatReviewText(
    files: readonly FileAnnotations[],
): string {
    // Count total annotations across all files.
    const totalAnnotations = files.reduce(
        (sum, f) => sum + f.annotations.length,
        0,
    );

    // No annotations found — informational message.
    if (totalAnnotations === 0) {
        return pc.green('No @enterstellar-review or @enterstellar-warn annotations found. All contracts are clean.');
    }

    const lines: string[] = [];

    // --- Header ---
    lines.push(
        `Found ${pc.bold(String(totalAnnotations))} annotations across ${pc.bold(String(files.length))} files:`,
    );
    lines.push('');

    // --- Per-file annotation listing ---
    for (const file of files) {
        // File header — dimmed path
        lines.push(`  ${pc.cyan(file.filePath)}`);

        for (const annotation of file.annotations) {
            lines.push(formatAnnotationLine(annotation));
        }

        // Blank line between files for readability.
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Internal: Per-Annotation Line Formatter
// ---------------------------------------------------------------------------

/**
 * Formats a single annotation as an indented line.
 *
 * Format:
 * ```
 *     L18  props.data     GENERIC_TYPE  "z.array(z.record(z.unknown())) — replace..."
 *     L21  description    (warn)        "Description derived from heuristics..."
 * ```
 *
 * `@enterstellar-warn` annotations display `(warn)` instead of a rule ID
 * since they do not carry a `rule=` field (Audit E1 + M6).
 *
 * @param annotation - The parsed annotation to format.
 * @returns A single indented line string.
 */
function formatAnnotationLine(annotation: ParsedAnnotation): string {
    const lineNum = pc.dim(`L${String(annotation.line)}`);
    const field = annotation.field;

    // Audit E1 + M6: @enterstellar-warn has no rule — display (warn) as placeholder.
    const ruleDisplay = annotation.rule !== undefined
        ? pc.yellow(annotation.rule)
        : pc.dim('(warn)');

    // Truncate long reasons to keep terminal output readable.
    const maxReasonLength = 80;
    const reason = annotation.reason.length > maxReasonLength
        ? `${annotation.reason.slice(0, maxReasonLength)}…`
        : annotation.reason;

    // Pad field and rule for column alignment (best-effort).
    const fieldPadded = field.padEnd(14);
    const rulePadded = (annotation.rule ?? '(warn)').padEnd(14);

    // Use rulePadded for spacing but ruleDisplay for coloring.
    // We compute spacing from the uncolored text, then apply color.
    void rulePadded; // Used for length calculation reference only

    return `    ${lineNum}  ${fieldPadded} ${ruleDisplay}  ${pc.dim(`"${reason}"`)}`;
}
