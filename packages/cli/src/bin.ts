/**
 * @module @enterstellar-ai/cli/bin
 * @description Main entrypoint for the `enterstellar` CLI binary.
 *
 * Routes `process.argv` to the appropriate subcommand:
 *
 * | Command                        | Handler                |
 * |:-------------------------------|:-----------------------|
 * | `enterstellar init [dir]`              | `initCommand(dir?)`    |
 * | `enterstellar add component <Name>`    | `addComponentCommand(name)` |
 * | `enterstellar migrate <path> [flags]`  | `migrateCommand(paths, args)` |
 * | `enterstellar review [path] [flags]`   | `reviewCommand(paths, args)` |
 * | `enterstellar --version`, `enterstellar -v`    | Print version          |
 * | `enterstellar --help`, `enterstellar -h`       | Print help             |
 *
 * Manual arg parsing is used instead of a CLI framework (commander, yargs)
 * because the CLI has only 4 commands — a framework would add ~300KB
 * of unnecessary dependencies.
 *
 * Top-level error handler catches all `EnterstellarError` instances and prints
 * structured, user-friendly messages. Unknown errors get a generic fallback.
 *
 * @see Implementation Bible §4.17
 */

import pc from 'picocolors';

import { initCommand } from './commands/init.js';
import { addComponentCommand } from './commands/add-component.js';
import { handleTopLevelError } from './utils/errors.js';
import { CLI_VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Help Text
// ---------------------------------------------------------------------------

/**
 * Generates the help text for the CLI.
 * Includes all available commands with descriptions and usage examples.
 */
function printHelp(): void {
    const help = `
${pc.bold('enterstellar')} — Enterstellar CLI for project scaffolding and component generation.

${pc.bold('Usage:')}
  enterstellar <command> [options]

${pc.bold('Commands:')}
  ${pc.cyan('init')} [directory]              Create a new Enterstellar project
  ${pc.cyan('add component')} <Name>          Scaffold a new component (PascalCase)
  ${pc.cyan('migrate')} <path> [flags]        Migrate existing components to Enterstellar contracts
  ${pc.cyan('review')} [path] [flags]          List @enterstellar-review annotations

${pc.bold('Options:')}
  ${pc.dim('--version, -v')}                 Print CLI version
  ${pc.dim('--help, -h')}                    Print this help message

${pc.bold('Examples:')}
  ${pc.dim('$')} enterstellar init
  ${pc.dim('$')} enterstellar init my-app
  ${pc.dim('$')} enterstellar add component PatientVitals
  ${pc.dim('$')} enterstellar migrate src/components/
  ${pc.dim('$')} enterstellar migrate src/ --enrich --provider openai
  ${pc.dim('$')} enterstellar review
  ${pc.dim('$')} enterstellar review src/components/ --json

${pc.dim(`v${CLI_VERSION} · https://enterstellar.dev/docs/cli`)}
`;

    console.log(help);
}

// ---------------------------------------------------------------------------
// Argument Parsing & Routing
// ---------------------------------------------------------------------------

/**
 * Main CLI execution function.
 *
 * Parses `process.argv` and routes to the appropriate handler.
 * All subcommand routing is explicit — no dynamic dispatch or reflection.
 *
 * Exit codes:
 * - `0` — Success or user cancellation
 * - `1` — Error (EnterstellarError or unknown)
 */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    // No args or help flag → print help
    if (command === undefined || command === '--help' || command === '-h') {
        printHelp();
        return;
    }

    // Version flag
    if (command === '--version' || command === '-v') {
        console.log(CLI_VERSION);
        return;
    }

    // Route: enterstellar init [directory]
    if (command === 'init') {
        const directoryArg = args[1];
        await initCommand(directoryArg);
        return;
    }

    // Route: enterstellar migrate <path> [flags]
    // Dynamic import keeps ts-morph (~2MB) out of the cold-start path
    // for `enterstellar init` and `enterstellar add component`.
    if (command === 'migrate') {
        const pathArgs = args.slice(1).filter((a: string) => !a.startsWith('--'));
        const { migrateCommand } = await import('./commands/migrate.js');
        await migrateCommand(pathArgs, args.slice(1));
        return;
    }

    // Route: enterstellar review [path] [flags]
    // Dynamic import keeps annotation parsing out of the cold-start path.
    if (command === 'review') {
        const pathArgs = args.slice(1).filter((a: string) => !a.startsWith('--'));
        const { reviewCommand } = await import('./commands/review.js');
        await reviewCommand(pathArgs, args.slice(1));
        return;
    }

    // Route: enterstellar add component <Name>
    if (command === 'add') {
        const subcommand = args[1];

        if (subcommand !== 'component') {
            console.error(
                pc.red(`Unknown subcommand: enterstellar add ${subcommand ?? '(missing)'}`),
            );
            console.error(`Run ${pc.bold('enterstellar --help')} for available commands.\n`);
            process.exitCode = 1;
            return;
        }

        const componentName = args[2];

        if (componentName === undefined || componentName.length === 0) {
            console.error(
                pc.red('Missing component name.'),
            );
            console.error(`Usage: ${pc.bold('enterstellar add component <Name>')}\n`);
            console.error(`Example: ${pc.dim('enterstellar add component PatientVitals')}\n`);
            process.exitCode = 1;
            return;
        }

        await addComponentCommand(componentName);
        return;
    }

    // Unknown command
    console.error(pc.red(`Unknown command: ${command}`));
    console.error(`Run ${pc.bold('enterstellar --help')} for available commands.\n`);
    process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

main().catch(handleTopLevelError);
