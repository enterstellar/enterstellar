/**
 * @module @enterstellar-ai/cli/review/review-flags
 * @description CLI flag types and parsing for the `enterstellar review` command.
 *
 * This module stays in `@enterstellar-ai/cli` — only the CLI parses `process.argv`.
 * The annotation parsing logic in `parse-annotations.ts` is flag-agnostic;
 * it receives file content, not raw CLI arguments.
 *
 * The flag spec follows the bible's authoritative reference at
 * `migration-01-pipeline.md` L188-196 — exactly 2 flags:
 * - `--json` — machine-readable output
 * - `--fix` — interactive walkthrough (v2 stub)
 *
 * **No `--filter` flag** — Audit E3 confirmed this is not in the bible.
 * Adding it would violate the Zero Improvisation coding rule.
 *
 * Parsing is manual (no `commander`, no `yargs`) — consistent with
 * the existing `bin.ts` and `parseMigrateFlags()` architecture.
 *
 * @see Correction 1 — `enterstellar review` companion command spec
 * @see Audit E3 — `--filter` removed (Zero Improvisation)
 * @see Design Choice T1 — `type` for data shapes
 * @see Design Choice T5 — every field documented
 */

// ---------------------------------------------------------------------------
// Flag Type
// ---------------------------------------------------------------------------

/**
 * Typed object for the parsed CLI flags of `enterstellar review`.
 *
 * Produced by {@link parseReviewFlags} from raw `process.argv` arguments.
 * Consumed by the `reviewCommand()` handler in `commands/review.ts`.
 *
 * Only 2 flags are supported per the bible spec (L188-196):
 * - `--json` — machine-readable JSON output
 * - `--fix` — interactive annotation walkthrough (v2 stub)
 *
 * @see Correction 1 — `enterstellar review` companion command spec
 * @see Audit E3 — no `--filter` flag
 */
export type ReviewFlags = {
    /**
     * Output as JSON instead of human-readable text.
     *
     * When `true`, output is a `ReviewJsonOutput` structure to stdout.
     * Designed for CI/CD dashboards and programmatic consumption.
     *
     * @default false
     */
    readonly json: boolean;

    /**
     * Interactive fix mode — walks through each annotation and suggests fixes.
     *
     * **v2 stub:** In v1, prints a message explaining the feature is coming
     * and exits 0. The `--fix` flag is accepted so developers don't get
     * an error when they try it, but no interactive behavior is implemented.
     *
     * @default false
     */
    readonly fix: boolean;

    // No --filter flag — not in bible spec (Audit E3, Zero Improvisation).
};

// ---------------------------------------------------------------------------
// Flag Parsing
// ---------------------------------------------------------------------------

/**
 * Parses raw CLI arguments into a typed {@link ReviewFlags} object.
 *
 * Handles boolean flags only:
 * - `--json` → `json: true`
 * - `--fix` → `fix: true`
 *
 * Unknown flags are silently ignored (consistent with `parseMigrateFlags()`).
 * Path arguments (positional, non-`--` prefixed) are not consumed here —
 * they are handled by the caller in `reviewCommand()`.
 *
 * @param args - Raw arguments after the `review` command
 *   (i.e., everything after `enterstellar review` in `process.argv`).
 * @returns A fully typed {@link ReviewFlags} object with defaults applied.
 *
 * @example
 * ```ts
 * // enterstellar review --json
 * const flags = parseReviewFlags(['--json']);
 * // flags.json === true
 * // flags.fix === false
 * ```
 *
 * @example
 * ```ts
 * // enterstellar review src/components/ --fix
 * const flags = parseReviewFlags(['src/components/', '--fix']);
 * // flags.json === false
 * // flags.fix === true
 * ```
 *
 * @see Correction 1 — `enterstellar review` companion command spec
 */
export function parseReviewFlags(args: readonly string[]): ReviewFlags {
    let json = false;
    let fix = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // noUncheckedIndexedAccess: args[i] is string | undefined.
        // Guard against undefined (shouldn't occur within bounds, but
        // satisfies exhaustiveness and compiler constraint).
        if (arg === undefined) {
            continue;
        }

        switch (arg) {
            case '--json':
                json = true;
                break;
            case '--fix':
                fix = true;
                break;
            // Unknown flags and positional args: silently ignored.
            // Positional path args are handled by the caller.
            default:
                break;
        }
    }

    return { json, fix };
}
