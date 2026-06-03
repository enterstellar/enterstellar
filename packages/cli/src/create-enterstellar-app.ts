/**
 * @module @enterstellar-ai/cli/create-enterstellar-app
 * @description Entrypoint for `npx create-enterstellar-app [directory]`.
 *
 * Provides the standard `npx create-*` convention used by Next.js, Vite,
 * and other modern frameworks. This is a thin wrapper that delegates
 * entirely to `initCommand()`.
 *
 * Usage:
 * ```bash
 * npx create-enterstellar-app              # Interactive mode
 * npx create-enterstellar-app my-app       # With directory argument
 * ```
 *
 * @see Implementation Bible §4.17
 */

import { initCommand } from './commands/init.js';
import { handleTopLevelError } from './utils/errors.js';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Entrypoint for the `create-enterstellar-app` binary.
 *
 * Extracts the optional directory argument from `process.argv[2]`
 * and delegates to `initCommand()`. If no argument is provided,
 * the user will be prompted interactively.
 */
async function main(): Promise<void> {
    const directoryArg = process.argv[2];
    await initCommand(directoryArg);
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

main().catch(handleTopLevelError);
