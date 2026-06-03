/**
 * @module @enterstellar-ai/cli/utils/run-install
 * @description Runs the detected package manager's install command in a project directory.
 *
 * Spawns the install command as a child process, capturing stdout and stderr.
 * Uses `@clack/prompts` spinner to show progress during installation.
 * Wraps failures in `EnterstellarError` (ENS-9005) with the underlying error as `cause`.
 *
 * @see Design Choice CLI3 — auto-detect package manager
 * @see Implementation Bible §4.17
 */

import { execSync } from 'node:child_process';

import { spinner } from '@clack/prompts';

import type { PackageManager } from './detect-package-manager.js';
import { getInstallCommand } from './detect-package-manager.js';
import { createInstallFailedError } from './errors.js';

// ---------------------------------------------------------------------------
// Install Runner
// ---------------------------------------------------------------------------

/**
 * Runs the package manager's install command in the given project directory.
 *
 * Displays a spinner via `@clack/prompts` while the install runs.
 * Captures stdout/stderr via `execSync` with `stdio: 'pipe'` so the CLI
 * remains in control of terminal output.
 *
 * The function is synchronous (uses `execSync`) because:
 * 1. Package installation is the final step of scaffolding — no concurrent work.
 * 2. `execSync` simplifies error handling (throws on non-zero exit).
 * 3. The spinner provides visual feedback during the blocking wait.
 *
 * @param pm - The package manager to use (e.g., `'pnpm'`, `'npm'`).
 * @param cwd - The project directory to run the install in.
 * @throws {EnterstellarError} `ENS-9005` if the install command fails.
 *
 * @example
 * ```ts
 * runInstall('pnpm', '/Users/dev/my-enterstellar-app');
 * // Shows spinner: "Installing dependencies with pnpm..."
 * // On success: "Dependencies installed."
 * // On failure: throws ENS-9005
 * ```
 */
export function runInstall(pm: PackageManager, cwd: string): void {
    const command = getInstallCommand(pm);
    const s = spinner();

    s.start(`Installing dependencies with ${pm}...`);

    try {
        execSync(command, {
            cwd,
            stdio: 'pipe',
            env: {
                ...process.env,
                /**
                 * Suppress npm/pnpm update notifications during scaffolding.
                 * The user just installed — they don't need upgrade nags.
                 */
                NO_UPDATE_NOTIFIER: '1',
            },
            /**
             * 10 MB output buffer — generous limit for install output.
             * Default is 1 MB which can overflow on large dependency trees.
             */
            maxBuffer: 10 * 1024 * 1024,
        });

        s.stop('Dependencies installed.');
    } catch (error: unknown) {
        s.stop('Installation failed.');
        throw createInstallFailedError(pm, error);
    }
}
