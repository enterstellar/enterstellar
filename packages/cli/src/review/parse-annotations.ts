/**
 * @module @enterstellar-ai/cli/review/parse-annotations
 * @description Parses `@enterstellar-review` and `@enterstellar-warn` structured annotations
 * from `.contract.ts` file content.
 *
 * This is the core parsing engine for the `enterstellar review` command. It handles
 * two distinct annotation formats produced by `assembleContract()`:
 *
 * 1. **`@enterstellar-review`** — has `rule=`, `field=`, and `reason="..."`:
 *    ```
 *    // @enterstellar-review: rule=GENERIC_TYPE field=props reason="Component has generic..."
 *    ```
 *
 * 2. **`@enterstellar-warn`** — has `field=` and `reason="..."` only (no `rule=`):
 *    ```
 *    // @enterstellar-warn: field=description reason="Description derived from heuristics..."
 *    ```
 *
 * **Multi-line support (Audit M3):** Reasons can span multiple comment lines.
 * The parser detects an unclosed `"` on the opening line and collects
 * subsequent `//` continuation lines until the closing `"` is found.
 *
 * **Malformed annotations** are skipped gracefully — the parser never throws.
 *
 * @see Correction 1 — @enterstellar-review Structured Annotation Format
 * @see Audit E1 — Dual-format parsing (review has `rule=`, warn does not)
 * @see Audit M3 — Two-phase multi-line reason algorithm
 * @see Audit M6 — `ParsedAnnotation.rule` is optional
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single parsed annotation from a `.contract.ts` file.
 *
 * Represents one `@enterstellar-review` or `@enterstellar-warn` comment extracted
 * by {@link parseAnnotations}. The `rule` field is present for
 * `@enterstellar-review` annotations and absent for `@enterstellar-warn` annotations
 * (Audit E1 + M6).
 *
 * With `exactOptionalPropertyTypes`, `rule` is either a `string`
 * or absent — never `undefined`.
 */
export type ParsedAnnotation = {
    /** The annotation type: `'review'` or `'warn'`. */
    readonly type: 'review' | 'warn';
    /**
     * 1-indexed line number where the annotation starts in the source file.
     * For multi-line annotations, this is the line of the opening marker.
     */
    readonly line: number;
    /**
     * The rule ID (e.g., `'GENERIC_TYPE'`).
     *
     * Present for `@enterstellar-review` annotations, absent for `@enterstellar-warn`.
     * With `exactOptionalPropertyTypes` (Tier 3), this is `string` or
     * absent — never explicitly `undefined`.
     *
     * @see Audit E1 — `@enterstellar-warn` has no `rule=` field
     * @see Audit M6 — `rule` must be optional
     */
    readonly rule?: string;
    /** The field path (e.g., `'props.data'`, `'category'`, `'description'`). */
    readonly field: string;
    /** Human-readable reason string (may span multiple source lines). */
    readonly reason: string;
};

/**
 * Result of parsing a single file for annotations.
 *
 * Returned by {@link parseAnnotations} for each scanned file.
 * Files with zero annotations produce `{ filePath, annotations: [] }`.
 */
export type FileAnnotations = {
    /** Relative file path (as passed to the parser). */
    readonly filePath: string;
    /** All annotations found in this file, in source order. */
    readonly annotations: readonly ParsedAnnotation[];
};

// ---------------------------------------------------------------------------
// Regex Patterns (Audit E1 — dual-format)
// ---------------------------------------------------------------------------

/**
 * Matches `@enterstellar-review` annotations: `rule=<id> field=<path> reason="<text>`.
 *
 * Capture groups:
 * - Group 1: rule ID (e.g., `GENERIC_TYPE`)
 * - Group 2: field path (e.g., `props.data`)
 * - Group 3: partial reason text (may be incomplete if multi-line)
 */
const REVIEW_PATTERN = /\/\/ @enterstellar-review: rule=(\S+) field=(\S+) reason="(.*)$/;

/**
 * Matches `@enterstellar-warn` annotations: `field=<path> reason="<text>`.
 *
 * Capture groups:
 * - Group 1: field path (e.g., `description`)
 * - Group 2: partial reason text (may be incomplete if multi-line)
 *
 * No `rule=` group — `@enterstellar-warn` annotations do not have rule IDs.
 */
const WARN_PATTERN = /\/\/ @enterstellar-warn: field=(\S+) reason="(.*)$/;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses all `@enterstellar-review` and `@enterstellar-warn` annotations from file content.
 *
 * **Algorithm (two-phase, dual-format):**
 * 1. Split content into lines and scan sequentially.
 * 2. For each line, try `REVIEW_PATTERN` first, then `WARN_PATTERN`.
 * 3. If a match is found, check if the reason's closing `"` is on the
 *    same line (single-line) or missing (multi-line).
 * 4. For multi-line: collect subsequent `//` continuation lines until
 *    the closing `"` is found. Strip `//` prefix and leading whitespace,
 *    join with spaces.
 * 5. Emit a `ParsedAnnotation` with `rule` present (review) or absent (warn).
 * 6. Lines that match neither pattern are skipped silently.
 *
 * **Guarantees:**
 * - Never throws — malformed annotations are silently skipped.
 * - Returns annotations in source order (by line number).
 * - Files with zero annotations return an empty `annotations` array.
 *
 * @param content - The file content as a string.
 * @param filePath - Relative file path (stored in the result, not read from disk).
 * @returns A {@link FileAnnotations} object containing all parsed annotations.
 *
 * @example
 * ```ts
 * const content = fs.readFileSync('Button.contract.ts', 'utf-8');
 * const result = parseAnnotations(content, 'src/Button.contract.ts');
 * for (const ann of result.annotations) {
 *     console.log(`L${ann.line} [${ann.type}] ${ann.field}: ${ann.reason}`);
 * }
 * ```
 *
 * @see Audit E1 — dual-format parsing
 * @see Audit M3 — multi-line continuation algorithm
 */
export function parseAnnotations(
    content: string,
    filePath: string,
): FileAnnotations {
    const lines = content.split('\n');
    const annotations: ParsedAnnotation[] = [];
    let lineIndex = 0;

    while (lineIndex < lines.length) {
        const line = lines[lineIndex];

        // noUncheckedIndexedAccess: `line` is `string | undefined` from array access.
        // The while condition guarantees `lineIndex < lines.length`, but TS
        // doesn't narrow this. Guard explicitly.
        if (line === undefined) {
            lineIndex++;
            continue;
        }

        // --- Try @enterstellar-review first (has rule=) ---
        const reviewMatch = REVIEW_PATTERN.exec(line);
        if (reviewMatch !== null) {
            // noUncheckedIndexedAccess: capture groups may be undefined.
            const rule = reviewMatch[1];
            const field = reviewMatch[2];
            const reasonFragment = reviewMatch[3];

            if (rule !== undefined && field !== undefined && reasonFragment !== undefined) {
                const { reason, linesConsumed } = resolveReason(
                    reasonFragment,
                    lines,
                    lineIndex,
                );

                annotations.push({
                    type: 'review',
                    line: lineIndex + 1, // 1-indexed
                    rule,
                    field,
                    reason,
                });

                lineIndex += linesConsumed;
                continue;
            }
        }

        // --- Try @enterstellar-warn (no rule=) ---
        const warnMatch = WARN_PATTERN.exec(line);
        if (warnMatch !== null) {
            const field = warnMatch[1];
            const reasonFragment = warnMatch[2];

            if (field !== undefined && reasonFragment !== undefined) {
                const { reason, linesConsumed } = resolveReason(
                    reasonFragment,
                    lines,
                    lineIndex,
                );

                // exactOptionalPropertyTypes: omit `rule` entirely for @enterstellar-warn.
                // Do NOT set `rule: undefined` — that violates the constraint.
                annotations.push({
                    type: 'warn',
                    line: lineIndex + 1,
                    field,
                    reason,
                });

                lineIndex += linesConsumed;
                continue;
            }
        }

        lineIndex++;
    }

    return { filePath, annotations };
}

// ---------------------------------------------------------------------------
// Multi-Line Reason Resolution (Audit M3)
// ---------------------------------------------------------------------------

/**
 * Resolves a potentially multi-line reason string.
 *
 * If the reason fragment from the opening line ends with `"` (closing
 * quote), it's a single-line reason. Otherwise, subsequent `//`
 * continuation lines are collected until the closing `"` is found.
 *
 * @param fragment - The partial reason text captured from the opening line.
 * @param allLines - All lines of the file.
 * @param startLineIndex - 0-indexed line of the opening annotation.
 * @returns The complete reason string and total lines consumed.
 */
function resolveReason(
    fragment: string,
    allLines: readonly string[],
    startLineIndex: number,
): { readonly reason: string; readonly linesConsumed: number } {
    // Single-line: reason ends with closing `"` on the same line.
    if (fragment.endsWith('"')) {
        return {
            reason: fragment.slice(0, -1), // Strip the trailing `"`
            linesConsumed: 1,
        };
    }

    // Multi-line: collect continuation lines until closing `"`.
    const parts: string[] = [fragment];
    let consumed = 1;
    let nextIndex = startLineIndex + 1;

    while (nextIndex < allLines.length) {
        const nextLine = allLines[nextIndex];

        // noUncheckedIndexedAccess: guard against undefined.
        if (nextLine === undefined) {
            break;
        }

        // Continuation lines must start with `//` (after optional whitespace).
        const trimmed = nextLine.trimStart();
        if (!trimmed.startsWith('//')) {
            // Not a continuation — stop collecting.
            break;
        }

        // Strip the `//` prefix and leading whitespace from the content.
        const continuationContent = trimmed.slice(2).trimStart();
        consumed++;

        // Check if this continuation line contains the closing `"`.
        if (continuationContent.endsWith('"')) {
            parts.push(continuationContent.slice(0, -1));
            break;
        }

        parts.push(continuationContent);
        nextIndex++;
    }

    return {
        reason: parts.join(' '),
        linesConsumed: consumed,
    };
}
