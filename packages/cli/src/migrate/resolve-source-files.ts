/**
 * @module @enterstellar-ai/cli/migrate/resolve-source-files
 * @description File discovery engine for the `enterstellar migrate` command.
 *
 * Implements the 3-layer exclusion model from Correction 6:
 * 1. **Hardcoded exclusions** — `node_modules`, `.git`, `.enterstellar`, `.d.ts` files.
 * 2. **`.enterstellarignore` patterns** — loaded from the project root via
 *    {@link loadEnterstellarIgnorePatterns}.
 * 3. **`--exclude` flags** — user-provided exclusion patterns (additive).
 *
 * Accepts path arguments in three forms:
 * - **File path** — resolved directly (e.g., `src/Button.tsx`).
 * - **Directory path** — expanded to `dir/**\/*.{tsx,ts}` via `fast-glob`.
 * - **Glob pattern** — passed directly to `fast-glob` (detected by
 *   presence of `*`, `?`, or `{` characters).
 *
 * Returns a {@link FileDiscoveryResult} containing the sorted, deduplicated
 * file list and a count of files excluded by the 3-layer model.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Correction 6 — `.enterstellarignore` + `--exclude` (3-layer exclusion model)
 * @see Implementation Plan §3 Component 1 — File Discovery Utilities
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import fg from 'fast-glob';

import { loadEnterstellarIgnorePatterns } from './enterstellarignore.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of file discovery for the migration pipeline.
 *
 * Contains the final list of source files to process and a count of
 * files that were excluded by the 3-layer exclusion model.
 */
export type FileDiscoveryResult = {
    /** Sorted, deduplicated list of absolute file paths. */
    readonly files: readonly string[];
    /** Number of files excluded by the 3-layer model. */
    readonly excludedCount: number;
};

// ---------------------------------------------------------------------------
// Hardcoded Exclusions (Layer 1)
// ---------------------------------------------------------------------------

/**
 * Hardcoded exclusion patterns that are ALWAYS applied, regardless of
 * `.enterstellarignore` or `--exclude` flags.
 *
 * These directories are never valid migration targets:
 * - `node_modules` — third-party code.
 * - `.git` — version control internals.
 * - `.enterstellar` — Enterstellar framework output directory.
 *
 * `.d.ts` files are also excluded — they are type declarations, not
 * component source files.
 *
 * @see Correction 6 — hardcoded exclusions (Layer 1)
 */
const HARDCODED_EXCLUSIONS: readonly string[] = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.enterstellar/**',
    '**/*.d.ts',
];

// ---------------------------------------------------------------------------
// Glob Detection
// ---------------------------------------------------------------------------

/**
 * Characters that indicate a path string contains glob syntax.
 * If any of these are present, the path is passed directly to `fast-glob`
 * rather than being treated as a literal file or directory path.
 */
const GLOB_CHARS = ['*', '?', '{'] as const;

/**
 * Tests whether a path string contains glob metacharacters.
 *
 * @param pathStr - The path string to test.
 * @returns `true` if the path contains `*`, `?`, or `{`.
 */
function isGlobPattern(pathStr: string): boolean {
    return GLOB_CHARS.some((char) => pathStr.includes(char));
}

// ---------------------------------------------------------------------------
// Exclusion Merging (Layer 1 + 2 + 3)
// ---------------------------------------------------------------------------

/**
 * Merges exclusion patterns from all three layers into a single array
 * for `fast-glob`'s `ignore` option.
 *
 * Layer order is semantically meaningful for human understanding but
 * functionally equivalent — all patterns are applied equally by `fast-glob`.
 *
 * @param enterstellarignorePatterns - Patterns from `.enterstellarignore` (Layer 2).
 * @param excludeFlags - Patterns from `--exclude` CLI flags (Layer 3).
 * @returns A single `readonly string[]` of all exclusion patterns.
 *
 * @see Correction 6 — 3-layer exclusion model
 */
export function mergeExclusions(
    enterstellarignorePatterns: readonly string[],
    excludeFlags: readonly string[],
): readonly string[] {
    return [
        ...HARDCODED_EXCLUSIONS,   // Layer 1: hardcoded
        ...enterstellarignorePatterns,     // Layer 2: .enterstellarignore
        ...excludeFlags,           // Layer 3: --exclude flags
    ];
}

// ---------------------------------------------------------------------------
// File Discovery Entry Point
// ---------------------------------------------------------------------------

/**
 * Resolves path arguments into a deduplicated, sorted list of source files
 * for the migration pipeline.
 *
 * **Algorithm:**
 * 1. Load `.enterstellarignore` patterns from the project root.
 * 2. Merge with hardcoded exclusions and `--exclude` flags.
 * 3. For each path argument:
 *    - If it's a file → resolve to absolute path and collect.
 *    - If it's a directory → expand to `dir/**\/*.{tsx,ts}` via `fast-glob`.
 *    - If it contains glob chars → pass directly to `fast-glob`.
 * 4. Deduplicate via `Set<string>` on absolute paths.
 * 5. Sort alphabetically for deterministic output.
 * 6. Count excluded files (total discovered minus final list).
 *
 * @param pathArgs - Array of path arguments from the CLI (files, dirs, globs).
 * @param excludePatterns - Array of `--exclude` flag values (Layer 3).
 * @returns A {@link FileDiscoveryResult} with the sorted file list and
 *   excluded count.
 *
 * @example
 * ```ts
 * const result = await resolveSourceFiles(
 *     ['src/components/', 'src/utils/helpers.tsx'],
 *     ['**\/*.stories.tsx'],
 * );
 * // result.files — sorted absolute paths
 * // result.excludedCount — files filtered by exclusions
 * ```
 *
 * @see Correction 6 — 3-layer exclusion model
 */
export async function resolveSourceFiles(
    pathArgs: readonly string[],
    excludePatterns: readonly string[],
): Promise<FileDiscoveryResult> {
    // Step 1: Load .enterstellarignore patterns (Layer 2).
    // Use the first path arg's directory as the starting point for
    // project root discovery. If no path args, use cwd.
    const firstPath = pathArgs[0];
    const searchDir = firstPath !== undefined
        ? resolve(firstPath)
        : process.cwd();
    const enterstellarignorePatterns = loadEnterstellarIgnorePatterns(searchDir);

    // Step 2: Merge all three exclusion layers.
    const allExclusions = mergeExclusions(enterstellarignorePatterns, excludePatterns);

    // Step 3: Resolve each path argument.
    const collectedFiles = new Set<string>();
    let totalDiscovered = 0;

    for (const pathArg of pathArgs) {
        const resolvedPath = resolve(pathArg);

        if (isGlobPattern(pathArg)) {
            // --- Glob pattern: pass directly to fast-glob ---
            const globMatches = await fg(pathArg, {
                absolute: true,
                onlyFiles: true,
                ignore: [...allExclusions],
            });
            totalDiscovered += globMatches.length;
            for (const match of globMatches) {
                collectedFiles.add(match);
            }
        } else if (existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
            // --- Single file: resolve absolute path ---
            totalDiscovered += 1;
            collectedFiles.add(resolvedPath);
        } else if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
            // --- Directory: expand to **/*.{tsx,ts} ---
            const dirPattern = `${resolvedPath}/**/*.{tsx,ts}`;
            const dirMatches = await fg(dirPattern, {
                absolute: true,
                onlyFiles: true,
                ignore: [...allExclusions],
            });
            totalDiscovered += dirMatches.length;
            for (const match of dirMatches) {
                collectedFiles.add(match);
            }
        }
        // Non-existent paths that aren't globs are silently skipped.
        // fast-glob will return [] for non-matching globs, which is correct.
    }

    // Step 4: Sort for deterministic output.
    const sortedFiles = [...collectedFiles].sort();

    // Step 5: Calculate excluded count.
    // For single-file args, exclusions are not applied by fast-glob.
    // The excluded count reflects what fast-glob filtered.
    const excludedCount = totalDiscovered - sortedFiles.length;

    return {
        files: sortedFiles,
        excludedCount: Math.max(0, excludedCount),
    };
}
