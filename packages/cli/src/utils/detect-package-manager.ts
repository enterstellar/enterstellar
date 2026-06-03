/**
 * @module @enterstellar-ai/cli/utils/detect-package-manager
 * @description Auto-detects the user's package manager from lockfile presence.
 *
 * Per Design Choice CLI3: auto-detect from lockfile (`package-lock.json` → npm,
 * `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun).
 * If no lockfile is found, returns `null` — the caller must prompt the user.
 *
 * Priority order when multiple lockfiles exist: pnpm → bun → yarn → npm.
 * This matches modern ecosystem defaults (pnpm/bun preferred over legacy).
 *
 * @see Design Choice CLI3
 * @see Implementation Bible §4.17
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Supported package managers for Enterstellar project scaffolding.
 *
 * All four major Node.js package managers are supported:
 * - `npm` — Default Node.js package manager
 * - `pnpm` — Performant npm (Enterstellar's own choice)
 * - `yarn` — Yarn Classic / Berry
 * - `bun` — Bun runtime package manager
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

// ---------------------------------------------------------------------------
// Lockfile → Package Manager Mapping
// ---------------------------------------------------------------------------

/**
 * Ordered mapping from lockfile names to their corresponding package manager.
 *
 * The order defines detection priority when multiple lockfiles coexist.
 * pnpm is checked first as it is Enterstellar's recommended package manager.
 */
const LOCKFILE_MAP: ReadonlyArray<readonly [string, PackageManager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['bun.lockb', 'bun'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
] as const;

// ---------------------------------------------------------------------------
// Detection Function
// ---------------------------------------------------------------------------

/**
 * Detects the package manager used in a given directory by checking for lockfiles.
 *
 * Scans the provided directory for known lockfiles in priority order:
 * `pnpm-lock.yaml` → `bun.lockb` → `yarn.lock` → `package-lock.json`.
 * Returns the first match, or `null` if no lockfile is found.
 *
 * This function is synchronous because it runs at CLI startup where blocking
 * is expected and appropriate. Uses `existsSync` for simplicity.
 *
 * @param cwd - The directory to scan for lockfiles. Typically `process.cwd()`.
 * @returns The detected `PackageManager`, or `null` if no lockfile is found.
 *
 * @example
 * ```ts
 * const pm = detectPackageManager('/path/to/project');
 * if (pm === null) {
 *   // Prompt user to choose a package manager
 * } else {
 *   console.log(`Detected: ${pm}`);
 * }
 * ```
 */
export function detectPackageManager(cwd: string): PackageManager | null {
    for (const [lockfile, manager] of LOCKFILE_MAP) {
        if (existsSync(join(cwd, lockfile))) {
            return manager;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Install Command Resolution
// ---------------------------------------------------------------------------

/**
 * Returns the install command string for a given package manager.
 *
 * Used by the scaffolding pipeline to run dependency installation
 * after project files have been written.
 *
 * @param pm - The package manager to get the install command for.
 * @returns The shell command string to install dependencies.
 *
 * @example
 * ```ts
 * getInstallCommand('pnpm'); // 'pnpm install'
 * getInstallCommand('bun');  // 'bun install'
 * ```
 */
export function getInstallCommand(pm: PackageManager): string {
    switch (pm) {
        case 'npm': {
            return 'npm install';
        }
        case 'pnpm': {
            return 'pnpm install';
        }
        case 'yarn': {
            return 'yarn install';
        }
        case 'bun': {
            return 'bun install';
        }
    }
}
