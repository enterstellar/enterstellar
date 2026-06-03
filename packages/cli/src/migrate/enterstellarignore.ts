/**
 * @module @enterstellar-ai/cli/migrate/enterstellarignore
 * @description `.enterstellarignore` file loader for the `enterstellar migrate` command.
 *
 * Provides two utilities:
 * 1. {@link findProjectRoot} — walks upward from a starting directory to
 *    find the nearest `package.json`, establishing the project root.
 * 2. {@link loadEnterstellarIgnorePatterns} — reads `.enterstellarignore` from the project
 *    root and returns parsed exclusion patterns as a string array.
 *
 * `.enterstellarignore` follows `.gitignore` syntax:
 * - Lines starting with `#` are comments.
 * - Blank lines are ignored.
 * - Each non-comment, non-blank line is a glob exclusion pattern.
 * - Negation patterns (`!pattern`) are preserved as-is for downstream
 *   consumers that support them.
 *
 * **Separation rationale:** Isolated from `resolve-source-files.ts` for
 * unit testability — the ignore file loader can be tested independently
 * of the `fast-glob` file discovery engine.
 *
 * **Graceful degradation:** If no `.enterstellarignore` file exists, or if the
 * project root cannot be determined, an empty array is returned silently.
 * Migration should never fail because of an unreadable ignore file.
 *
 * **L15 compliance:** Zero framework imports. Node `fs`/`path` only.
 *
 * @see Correction 6 — `.enterstellarignore` + `--exclude` (3-layer exclusion model)
 * @see Implementation Plan §3 Component 1 — File Discovery Utilities
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Project Root Discovery
// ---------------------------------------------------------------------------

/**
 * Walks upward from `startDir` to find the nearest directory containing
 * a `package.json` file.
 *
 * This establishes the project root — the directory where `.enterstellarignore`
 * is expected to reside. The walk terminates when either:
 * - A `package.json` is found (returns that directory).
 * - The filesystem root is reached (`dirname('/') === '/'`).
 *
 * @param startDir - Absolute path to begin the upward walk from.
 * @returns The absolute path to the directory containing `package.json`,
 *   or `undefined` if no `package.json` is found before reaching the
 *   filesystem root.
 *
 * @example
 * ```ts
 * const root = findProjectRoot('/Users/dev/my-app/src/components');
 * // → '/Users/dev/my-app' (if package.json exists there)
 * ```
 */
export function findProjectRoot(startDir: string): string | undefined {
    let current = resolve(startDir);

    // Walk upward until we find package.json or hit the filesystem root.
    // The loop terminates because dirname('/') === '/' (or 'C:\' on Windows),
    // so `current === parent` will always eventually be true.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- loop guard
    while (true) {
        if (existsSync(join(current, 'package.json'))) {
            return current;
        }

        const parent = dirname(current);

        // Reached filesystem root — no package.json found anywhere.
        if (parent === current) {
            return undefined;
        }

        current = parent;
    }
}

// ---------------------------------------------------------------------------
// .enterstellarignore Pattern Loader
// ---------------------------------------------------------------------------

/**
 * Reads `.enterstellarignore` from the project root and returns parsed exclusion
 * patterns as a `readonly string[]`.
 *
 * The project root is determined by walking upward from `searchDir` to
 * find the nearest `package.json` (via {@link findProjectRoot}). If no
 * project root is found, or if `.enterstellarignore` does not exist at the root,
 * an empty array is returned silently.
 *
 * **Parsing rules** (`.gitignore`-compatible):
 * - Lines starting with `#` (after trimming) are comments → skipped.
 * - Blank lines (empty after trimming) → skipped.
 * - All other lines are treated as glob exclusion patterns.
 * - Negation patterns (`!pattern`) are preserved as-is.
 * - Leading/trailing whitespace is trimmed from each line.
 *
 * **Error handling:** If the file cannot be read (permission error, I/O
 * failure), an empty array is returned. Migration should never fail due
 * to an unreadable ignore file — this is graceful degradation.
 *
 * @param searchDir - Absolute path to begin the project root search from.
 *   Typically the first path argument to `enterstellar migrate`.
 * @returns A `readonly string[]` of exclusion patterns. Empty if no
 *   `.enterstellarignore` file exists or if the project root cannot be determined.
 *
 * @example
 * ```ts
 * // .enterstellarignore contains:
 * // # Skip test utilities
 * // **\/*.test.tsx
 * // **\/*.stories.tsx
 *
 * const patterns = loadEnterstellarIgnorePatterns('/Users/dev/my-app/src');
 * // → ['**\/*.test.tsx', '**\/*.stories.tsx']
 * ```
 *
 * @see Correction 6 — `.enterstellarignore` resolution: walk upward to `package.json`
 */
export function loadEnterstellarIgnorePatterns(searchDir: string): readonly string[] {
    // Step 1: Find the project root by walking up to nearest package.json.
    const projectRoot = findProjectRoot(searchDir);

    if (projectRoot === undefined) {
        return [];
    }

    // Step 2: Check if .enterstellarignore exists at the project root.
    const enterstellarignorePath = join(projectRoot, '.enterstellarignore');

    if (!existsSync(enterstellarignorePath)) {
        return [];
    }

    // Step 3: Read and parse the .enterstellarignore file.
    try {
        const content = readFileSync(enterstellarignorePath, 'utf-8');
        return parseIgnorePatterns(content);
    } catch {
        // Graceful degradation — unreadable ignore file should not
        // halt the migration pipeline. Return empty patterns.
        return [];
    }
}

// ---------------------------------------------------------------------------
// Internal: Pattern Parsing
// ---------------------------------------------------------------------------

/**
 * Parses raw `.enterstellarignore` file content into an array of exclusion patterns.
 *
 * Applies `.gitignore`-compatible parsing rules:
 * 1. Split content by newlines (`\n` and `\r\n`).
 * 2. Trim leading/trailing whitespace from each line.
 * 3. Skip empty lines (blank after trimming).
 * 4. Skip comment lines (starting with `#` after trimming).
 * 5. Return remaining lines as exclusion patterns.
 *
 * @param content - Raw file content as a string.
 * @returns Array of exclusion pattern strings.
 */
function parseIgnorePatterns(content: string): readonly string[] {
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => {
            // Skip empty lines.
            if (line.length === 0) {
                return false;
            }

            // Skip comment lines.
            if (line.startsWith('#')) {
                return false;
            }

            return true;
        });
}
