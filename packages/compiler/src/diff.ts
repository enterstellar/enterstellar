/**
 * @module @enterstellar-ai/compiler/diff
 * @description Generates a diff between raw LLM props and final compiled props.
 *
 * The diff is invaluable for DevTools debugging — it shows exactly what the
 * compiler changed (stripped props, token corrections, accessibility injections).
 * Gated by the `includeDiff` config flag (not `NODE_ENV`).
 *
 * **L15 compliance:** Zero framework imports. Pure data transformation.
 *
 * @see Design Choice C13 — `includeDiff: true` in dev, `false` in prod.
 */

// ---------------------------------------------------------------------------
// Diff Type
// ---------------------------------------------------------------------------

/**
 * The diff between raw LLM output and final compiled props.
 * Matches the `CompilationResult.diff` shape from `@enterstellar-ai/types`.
 */
export type PropsDiff = {
    /** The raw props as received from the agent (snapshot before pipeline). */
    readonly raw: Readonly<Record<string, unknown>>;
    /** The final compiled props after correction, stripping, and injection. */
    readonly compiled: Readonly<Record<string, unknown>>;
};

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/**
 * Creates a deep snapshot of a props object for diff comparison.
 *
 * Uses structured clone via `JSON.parse(JSON.stringify(...))` which is
 * sufficient for Enterstellar props (plain objects, no Dates/Maps/Sets per S5).
 * Called before the pipeline mutates props, preserving the original state.
 *
 * @param props - The props object to snapshot.
 * @returns A deep copy of the props.
 */
export function snapshotProps(
    props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    return JSON.parse(JSON.stringify(props)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Diff Generation
// ---------------------------------------------------------------------------

/**
 * Generates a diff between the raw (pre-pipeline) and compiled (post-pipeline) props.
 *
 * Returns `undefined` if `includeDiff` is `false`, allowing the caller to
 * conditionally skip diff computation in production.
 *
 * @param rawProps - The original props before pipeline processing.
 * @param compiledProps - The final props after pipeline processing.
 * @param includeDiff - Whether to generate the diff (from config).
 * @returns A `PropsDiff` if `includeDiff` is `true`, otherwise `undefined`.
 *
 * @see Design Choice C13
 *
 * @example
 * ```ts
 * const rawSnapshot = snapshotProps(intent.props);
 * // ... pipeline mutates props ...
 * const diff = generateDiff(rawSnapshot, context.props, config.includeDiff);
 * // diff is { raw: {...}, compiled: {...} } or undefined
 * ```
 */
export function generateDiff(
    rawProps: Readonly<Record<string, unknown>>,
    compiledProps: Readonly<Record<string, unknown>>,
    includeDiff: boolean,
): PropsDiff | undefined {
    if (!includeDiff) {
        return undefined;
    }

    return {
        raw: rawProps,
        compiled: snapshotProps(compiledProps),
    };
}
