/**
 * @module @enterstellar-ai/cli/commands/review
 * @description Implements the `enterstellar review [path] [flags]` command.
 *
 * This is the **review command handler** — the companion to `enterstellar migrate`
 * that provides project-wide visibility into `@enterstellar-review` and `@enterstellar-warn`
 * annotation debt in generated `.contract.ts` files.
 *
 * ## Orchestration Flow
 *
 * ```
 * reviewCommand(pathArgs, rawArgs)
 *   ├─ 1. Parse flags (parseReviewFlags)
 *   ├─ 2. Guard: --fix stub (print message, exit 0)
 *   ├─ 3. Resolve scan paths (default to cwd if empty)
 *   ├─ 4. Discover *.contract.ts files (fast-glob)
 *   ├─ 5. Guard: no contract files found
 *   ├─ 6. Read and parse annotations (parseAnnotations)
 *   ├─ 7. Filter files with zero annotations
 *   └─ 8. Format and print output (text or JSON)
 * ```
 *
 * ## Design Decisions
 *
 * - **Own `fast-glob` call (Audit M2):** The review command uses its own
 *   glob with `**\/*.contract.ts` — NOT `resolveSourceFiles()`, which is
 *   hardcoded to `*.{tsx,ts}` for source file discovery.
 * - **No `.enterstellarignore` filtering:** `.enterstellarignore` applies to source file
 *   discovery during `enterstellar migrate`, not to generated contract files.
 *   Generated contracts are always scanned.
 * - **Dynamic import:** This module is dynamically imported from `bin.ts`
 *   to keep annotation parsing out of the cold-start path.
 * - **Exit code 0 always:** `enterstellar review` is informational. It never
 *   fails — even when annotations are found. Use `enterstellar migrate --strict`
 *   for CI gating.
 *
 * @see Correction 1 — `enterstellar review` companion command spec
 * @see Audit E2 — locked export signature
 * @see Audit M2 — own `fast-glob` call, not `resolveSourceFiles()`
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import fg from 'fast-glob';
import pc from 'picocolors';

import { parseAnnotations } from '../review/parse-annotations.js';
import { parseReviewFlags } from '../review/review-flags.js';
import { formatReviewText } from '../review/format-review-text.js';
import { formatReviewJson } from '../review/format-review-json.js';

// ---------------------------------------------------------------------------
// Review Command
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar review [path] [flags]` command.
 *
 * Scans `.contract.ts` files for `@enterstellar-review` and `@enterstellar-warn`
 * annotations, providing project-wide visibility into migration debt.
 *
 * Supports two output modes:
 * - **Text** (default): Human-readable colored output matching the
 *   Correction 1 spec at `migration-01-pipeline.md` L199-212.
 * - **JSON** (`--json`): Machine-readable `ReviewJsonOutput` structure
 *   for CI/CD dashboards.
 *
 * @param pathArgs - Zero or more paths (files or directories).
 *   If empty, scans the current working directory.
 * @param rawArgs - Raw CLI arguments after the `review` command
 *   (includes both path args and flags).
 *
 * @example
 * ```ts
 * // Called from bin.ts:
 * // enterstellar review src/components/
 * await reviewCommand(['src/components/'], ['src/components/']);
 *
 * // enterstellar review --json
 * await reviewCommand([], ['--json']);
 * ```
 *
 * @see Correction 1 — `enterstellar review` companion command spec
 * @see Audit E2 — locked export signature
 */
export async function reviewCommand(
    pathArgs: readonly string[],
    rawArgs: readonly string[],
): Promise<void> {
    // --- 1. Parse flags ---
    const flags = parseReviewFlags(rawArgs);

    // --- 2. Guard: --fix stub ---
    if (flags.fix) {
        console.log(
            `${pc.cyan('enterstellar review --fix')} is not yet implemented. Coming in v2.\n` +
            `For now, use ${pc.bold('enterstellar review')} to list annotations and fix them manually.`,
        );
        return;
    }

    // --- 3. Resolve scan paths ---
    // Default to current working directory if no path args are provided.
    const scanPaths = pathArgs.length > 0
        ? pathArgs.map((p) => resolve(p))
        : [resolve('.')];

    // --- 4. Discover *.contract.ts files (Audit M2 — own fast-glob call) ---
    // Unlike resolveSourceFiles() which targets *.{tsx,ts} for source discovery,
    // the review command scans generated contract files exclusively.
    const contractFiles = await fg(
        scanPaths.map((p) => `${p}/**/*.contract.ts`),
        {
            absolute: true,
            onlyFiles: true,
            // No .enterstellarignore filtering — generated contracts are always scanned.
            // .enterstellarignore applies to source file discovery during `enterstellar migrate`.
            ignore: ['**/node_modules/**', '**/dist/**'],
        },
    );

    // --- 5. Guard: no contract files found ---
    if (contractFiles.length === 0) {
        console.log(
            pc.dim('No .contract.ts files found.') + '\n' +
            `Run ${pc.bold('enterstellar migrate <path>')} first to generate contracts.`,
        );
        return;
    }

    // --- 6. Read and parse annotations ---
    const allFileAnnotations = await Promise.all(
        contractFiles.map(async (filePath) => {
            try {
                const content = await readFile(filePath, 'utf-8');
                // Use relative path for display readability.
                const relativePath = filePath.startsWith(resolve('.'))
                    ? filePath.slice(resolve('.').length + 1)
                    : filePath;
                return parseAnnotations(content, relativePath);
            } catch (error: unknown) {
                // useUnknownInCatchVariables: narrow the error.
                const message = error instanceof Error
                    ? error.message
                    : String(error);
                console.error(
                    pc.dim(`  ⚠ Could not read ${filePath}: ${message}`),
                );
                return null;
            }
        }),
    );

    // --- 7. Filter files with zero annotations ---
    // Also filter out null entries from read errors.
    const annotatedFiles = allFileAnnotations.filter(
        (f): f is NonNullable<typeof f> =>
            f !== null && f.annotations.length > 0,
    );

    // --- 8. Format and print output ---
    if (flags.json) {
        const json = formatReviewJson(annotatedFiles);
        process.stdout.write(json + '\n');
    } else {
        const text = formatReviewText(annotatedFiles);
        console.log(text);
    }
}
