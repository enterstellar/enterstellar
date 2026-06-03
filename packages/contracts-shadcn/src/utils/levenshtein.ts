/**
 * @module @enterstellar-ai/contracts-shadcn/utils/levenshtein
 * @description Pure-function Levenshtein distance implementation for fuzzy
 * contract name validation.
 *
 * Used by {@link registerShadcnContracts} to provide actionable error
 * messages when a developer passes an unknown component name:
 *
 * ```
 * Error: 'Buttn' is not a known shadcn contract. Did you mean 'Button'?
 * ```
 *
 * **Zero dependencies. Zero framework imports. Pure functions only.**
 *
 * The threshold distance is **3** — any candidate with a distance ≤ 3
 * from the input is considered a viable suggestion. This covers:
 * - 1-char typos (distance 1): `Buttn` → `Button`
 * - Transpositions (distance 2): `Cadr` → `Card`
 * - Prefix/suffix errors (distance 2-3): `Dialg` → `Dialog`
 *
 * @see Correction 7 Decision 2 — fuzzy-validated registration
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum Levenshtein distance to consider a candidate a valid suggestion.
 *
 * A threshold of 3 covers common typos (single-char, transposition,
 * prefix/suffix) while avoiding false positives on completely unrelated
 * names. Empirically validated against shadcn component names.
 */
const MATCH_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Levenshtein Distance
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein distance between two strings.
 *
 * The Levenshtein distance is the minimum number of single-character
 * edits (insertions, deletions, or substitutions) required to change
 * one string into the other.
 *
 * Uses the standard O(m×n) dynamic programming algorithm with O(n)
 * space (two-row optimization).
 *
 * @param a - First string.
 * @param b - Second string.
 * @returns The edit distance between `a` and `b`. Always ≥ 0.
 *
 * @example
 * ```ts
 * levenshteinDistance('Button', 'Buttn');  // → 1
 * levenshteinDistance('Card', 'Cadr');     // → 2
 * levenshteinDistance('', 'Hello');        // → 5
 * levenshteinDistance('same', 'same');     // → 0
 * ```
 */
export function levenshteinDistance(a: string, b: string): number {
    // Early exit: identical strings.
    if (a === b) {
        return 0;
    }

    const m = a.length;
    const n = b.length;

    // Edge cases: one string is empty.
    if (m === 0) {
        return n;
    }
    if (n === 0) {
        return m;
    }

    // Two-row DP: prev = row (i-1), curr = row i.
    // Each row has (n + 1) entries.
    let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
    let curr: number[] = new Array<number>(n + 1);

    for (let i = 1; i <= m; i++) {
        curr[0] = i;

        for (let j = 1; j <= n; j++) {
            // Cost is 0 if characters match, 1 otherwise.
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;

            // Minimum of insertion, deletion, or substitution.
            // prev[j] + 1:       deletion  (remove from a)
            // (curr[j - 1] ?? 0) + 1: insertion (add to a)
            // (prev[j - 1] ?? 0) + cost: substitution
            const deletion = (prev[j] ?? 0) + 1;
            const insertion = (curr[j - 1] ?? 0) + 1;
            const substitution = (prev[j - 1] ?? 0) + cost;

            curr[j] = Math.min(deletion, insertion, substitution);
        }

        // Swap rows: curr becomes prev for next iteration.
        [prev, curr] = [curr, prev];
    }

    // After the loop, prev contains the last computed row.
    // The answer is in prev[n].
    return prev[n] ?? 0;
}

// ---------------------------------------------------------------------------
// Closest Match Finder
// ---------------------------------------------------------------------------

/**
 * Finds the closest matching string from a list of candidates using
 * Levenshtein distance.
 *
 * Returns the candidate with the smallest distance to `input`, provided
 * that distance is ≤ {@link MATCH_THRESHOLD} (3). If no candidate is
 * within threshold, returns `undefined`.
 *
 * When multiple candidates share the minimum distance, the first one
 * encountered is returned (stable, deterministic ordering).
 *
 * @param input - The string to match against candidates.
 * @param candidates - The list of valid candidate strings.
 * @returns The closest matching candidate, or `undefined` if none
 *   are within the threshold distance.
 *
 * @example
 * ```ts
 * const names = ['Button', 'Card', 'Dialog', 'Input'];
 *
 * findClosestMatch('Buttn', names);   // → 'Button' (distance 1)
 * findClosestMatch('Crad', names);    // → 'Card' (distance 2)
 * findClosestMatch('Xyz', names);     // → undefined (no close match)
 * ```
 */
export function findClosestMatch(
    input: string,
    candidates: readonly string[],
): string | undefined {
    let bestMatch: string | undefined;
    let bestDistance = MATCH_THRESHOLD + 1; // Start above threshold.

    for (const candidate of candidates) {
        const distance = levenshteinDistance(input, candidate);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = candidate;
        }

        // Perfect match — can't do better.
        if (distance === 0) {
            break;
        }
    }

    // Only return if within threshold.
    return bestDistance <= MATCH_THRESHOLD ? bestMatch : undefined;
}
