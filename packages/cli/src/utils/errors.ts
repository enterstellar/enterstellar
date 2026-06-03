/**
 * @module @enterstellar-ai/cli/utils/errors
 * @description CLI-specific error factories for the `ENS-9xxx` error code range.
 *
 * Each factory produces a properly typed `EnterstellarError` with:
 * - `module: 'cli'`
 * - Correct error code
 * - Human-readable message with contextual details
 * - Appropriate `recoverable` flag
 *
 * Error taxonomy:
 * | Code       | Scenario                        | Recoverable |
 * |:-----------|:--------------------------------|:------------|
 * | `ENS-9001` | Invalid project name            | No          |
 * | `ENS-9002` | Invalid component name           | No          |
 * | `ENS-9003` | Directory already exists (non-empty) | No      |
 * | `ENS-9004` | Enterstellar project not found           | No          |
 * | `ENS-9005` | Package manager install failed   | Yes         |
 * | `ENS-9006` | File write failed                | Yes         |
 *
 * @see Coding Rules — Error Handling
 * @see Design Choice CLI1, CLI2, CLI3
 * @see Implementation Bible §4.17
 */

import { EnterstellarError } from '@enterstellar-ai/types';
import pc from 'picocolors';

// ---------------------------------------------------------------------------
// ENS-9001 — Invalid Project Name
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for an invalid project name.
 *
 * Project names must be kebab-case strings containing only lowercase letters,
 * numbers, and hyphens. They must start with a letter and not end with a hyphen.
 *
 * @param name - The invalid project name provided by the user.
 * @returns An `EnterstellarError` with code `ENS-9001`.
 *
 * @example
 * ```ts
 * throw createInvalidProjectNameError('My App!!');
 * // EnterstellarError: [ENS-9001] Invalid project name "My App!!".
 * // Project names must be kebab-case (e.g., "my-enterstellar-app").
 * ```
 */
export function createInvalidProjectNameError(name: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-9001',
        'cli',
        `[ENS-9001] Invalid project name "${name}". Project names must be kebab-case (e.g., "my-enterstellar-app"). Only lowercase letters, numbers, and hyphens are allowed.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-9002 — Invalid Component Name
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` for an invalid component name.
 *
 * Component names must be PascalCase per Enterstellar naming conventions.
 * They must start with an uppercase letter and contain only letters and numbers.
 *
 * @param name - The invalid component name provided by the user.
 * @returns An `EnterstellarError` with code `ENS-9002`.
 *
 * @example
 * ```ts
 * throw createInvalidComponentNameError('patient-vitals');
 * // EnterstellarError: [ENS-9002] Invalid component name "patient-vitals".
 * // Component names must be PascalCase (e.g., "PatientVitals").
 * ```
 */
export function createInvalidComponentNameError(name: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-9002',
        'cli',
        `[ENS-9002] Invalid component name "${name}". Component names must be PascalCase (e.g., "PatientVitals"). Must start with an uppercase letter and contain only letters and numbers.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-9003 — Directory Already Exists
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when the target directory already exists and is non-empty.
 *
 * The `enterstellar init` command refuses to scaffold into a non-empty directory
 * to prevent accidental data loss.
 *
 * @param directory - The absolute path to the non-empty directory.
 * @returns An `EnterstellarError` with code `ENS-9003`.
 *
 * @example
 * ```ts
 * throw createDirectoryExistsError('/Users/dev/my-app');
 * // EnterstellarError: [ENS-9003] Directory "/Users/dev/my-app" already exists
 * // and is not empty. Use an empty directory or choose a different name.
 * ```
 */
export function createDirectoryExistsError(directory: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-9003',
        'cli',
        `[ENS-9003] Directory "${directory}" already exists and is not empty. Use an empty directory or choose a different name.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-9004 — Enterstellar Project Not Found
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when the current directory is not an Enterstellar project.
 *
 * The `enterstellar add component` command requires an existing Enterstellar project
 * (a `package.json` that depends on `@enterstellar-ai/registry`).
 *
 * @param directory - The directory searched for an Enterstellar project.
 * @returns An `EnterstellarError` with code `ENS-9004`.
 *
 * @example
 * ```ts
 * throw createProjectNotFoundError('/Users/dev/plain-app');
 * // EnterstellarError: [ENS-9004] No Enterstellar project found in "/Users/dev/plain-app".
 * // Ensure package.json contains an @enterstellar-ai/registry dependency.
 * ```
 */
export function createProjectNotFoundError(directory: string): EnterstellarError {
    return new EnterstellarError(
        'ENS-9004',
        'cli',
        `[ENS-9004] No Enterstellar project found in "${directory}". Ensure package.json exists and contains an @enterstellar-ai/registry dependency.`,
        false,
    );
}

// ---------------------------------------------------------------------------
// ENS-9005 — Package Manager Install Failed
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when the package manager's install command fails.
 *
 * This error is recoverable — the user can manually run the install command
 * after resolving the underlying issue (network, permissions, etc.).
 *
 * @param packageManager - The package manager that was invoked (e.g., `'pnpm'`).
 * @param cause - The underlying error from the child process.
 * @returns An `EnterstellarError` with code `ENS-9005`.
 *
 * @example
 * ```ts
 * throw createInstallFailedError('pnpm', originalError);
 * // EnterstellarError: [ENS-9005] Package manager "pnpm" install failed.
 * // Run "pnpm install" manually to resolve.
 * ```
 */
export function createInstallFailedError(
    packageManager: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-9005',
        'cli',
        `[ENS-9005] Package manager "${packageManager}" install failed. Run "${packageManager} install" manually to resolve.`,
        true,
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-9006 — File Write Failed
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarError` when writing a scaffolded file fails.
 *
 * This error is recoverable — the user can check file permissions
 * or disk space and re-run the command.
 *
 * @param filePath - The absolute path of the file that could not be written.
 * @param cause - The underlying filesystem error.
 * @returns An `EnterstellarError` with code `ENS-9006`.
 *
 * @example
 * ```ts
 * throw createFileWriteError('/Users/dev/my-app/src/enterstellar/registry.ts', fsError);
 * // EnterstellarError: [ENS-9006] Failed to write file "/Users/dev/my-app/src/enterstellar/registry.ts".
 * // Check file permissions and available disk space.
 * ```
 */
export function createFileWriteError(
    filePath: string,
    cause?: unknown,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-9006',
        'cli',
        `[ENS-9006] Failed to write file "${filePath}". Check file permissions and available disk space.`,
        true,
        cause,
    );
}

// ---------------------------------------------------------------------------
// Top-Level Error Handler
// ---------------------------------------------------------------------------

/**
 * Shared top-level error handler for CLI entrypoints.
 *
 * Provides structured, user-friendly output for all error types:
 *
 * 1. **`EnterstellarError`** — displays error code, message, module, and recovery hint
 *    using styled terminal output.
 * 2. **Generic `Error`** — displays message and stack trace.
 * 3. **Non-Error throwables** — coerces to string via `String()`.
 *
 * Sets `process.exitCode = 1` instead of calling `process.exit(1)` to allow
 * Node.js to flush stdout/stderr before terminating.
 *
 * Used by both `bin.ts` (`enterstellar` command) and `create-enterstellar-app.ts` to ensure
 * consistent error presentation across both entrypoints.
 *
 * @param error - The caught error value (typed as `unknown` per
 *   `useUnknownInCatchVariables`).
 *
 * @example
 * ```ts
 * main().catch(handleTopLevelError);
 * ```
 *
 * @see Coding Rules — Error Handling (C15)
 */
export function handleTopLevelError(error: unknown): void {
    if (error instanceof EnterstellarError) {
        console.error('');
        console.error(pc.red(`${pc.bold(`[${error.code}]`)} ${error.message}`));
        console.error(pc.dim(`  Module: @enterstellar-ai/${error.module}`));

        if (error.recoverable) {
            console.error(pc.dim('  This error is recoverable — see the message above for next steps.'));
        }

        console.error('');
    } else {
        console.error('');
        console.error(pc.red('An unexpected error occurred:'));

        if (error instanceof Error) {
            console.error(error.message);
            if (error.stack !== undefined) {
                console.error(pc.dim(error.stack));
            }
        } else {
            console.error(String(error));
        }

        console.error('');
    }

    process.exitCode = 1;
}
