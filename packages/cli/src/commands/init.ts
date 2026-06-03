/**
 * @module @enterstellar-ai/cli/commands/init
 * @description Implements the `enterstellar init` interactive scaffolding command.
 *
 * Orchestrates the full project creation pipeline:
 *
 * 1. Prompt for project name (kebab-case, validated via ENS-9001)
 * 2. Prompt for template variant (minimal / full / nextjs / vite-react)
 * 3. Detect or prompt for package manager (CLI3 lockfile detection)
 * 4. **Detect existing React project** — syntax-only scan, 3-tier
 *    summary, migration prompt (Correction 5, L187-213)
 * 5. Create project directory (ENS-9003 if non-empty — skipped
 *    for existing projects per Audit M1)
 * 6. Write all scaffolded files matching Bible §4.17
 * 7. **Auto-generate `.enterstellarignore`** (Correction 6, L457-473 — never overwrite)
 * 8. Install dependencies via detected/chosen package manager
 * 9. Print success message with next steps
 *
 * Uses `@clack/prompts` for a modern, interactive CLI experience
 * and `picocolors` for styled terminal output.
 *
 * @see Design Choice CLI1 — interactive `enterstellar init` flow
 * @see Design Choice CLI3 — auto-detect package manager
 * @see Implementation Bible §4.17 — scaffolded output structure
 * @see Correction 5, L187-213 — existing project detection
 * @see Correction 6, L457-473 — `.enterstellarignore` auto-generation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';

import * as p from '@clack/prompts';
import pc from 'picocolors';

import type { PackageManager } from '../utils/detect-package-manager.js';
import { detectPackageManager } from '../utils/detect-package-manager.js';
import { validateProjectName } from '../utils/validate-name.js';
import { safeWriteFile } from '../utils/write-file.js';
import { runInstall } from '../utils/run-install.js';
import { createDirectoryExistsError } from '../utils/errors.js';

import type { ProjectTemplate } from '../templates/template-package-json.js';
import { generatePackageJson } from '../templates/template-package-json.js';
import { generateTsconfig } from '../templates/template-tsconfig.js';
import { generateRegistry } from '../templates/template-registry.js';
import { generateTokens } from '../templates/template-tokens.js';
import { generateGlobalsCss } from '../templates/template-globals-css.js';
import { generateComponents } from '../templates/template-components.js';
import { generatePage, getPagePath } from '../templates/template-page.js';
import { generateTest } from '../templates/template-test.js';
import { generateReadme } from '../templates/template-readme.js';
import { generateEnterstellarIgnore } from '../templates/template-enterstellarignore.js';

// ---------------------------------------------------------------------------
// Cancel Handling
// ---------------------------------------------------------------------------

/**
 * Handles user cancellation of a prompt.
 * Prints a cancellation message and exits the process.
 * Return type is `never` to ensure TypeScript narrows prompt results correctly.
 */
function handleCancel(): never {
    p.cancel('Operation cancelled.');
    process.exit(0);
    // Unreachable — ensures TypeScript sees this as `never` even
    // before @types/node is installed (where process.exit is unresolved).
    throw new Error('Unreachable: process.exit() should have terminated.');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Resolved options for the init command after all prompts complete.
 * All fields are guaranteed non-null at this point.
 */
interface InitOptions {
    /** Kebab-case project name. */
    readonly projectName: string;
    /** Chosen template variant. */
    readonly template: ProjectTemplate;
    /** Selected contract pack for pre-built component contracts. */
    readonly contractPack: ContractPack;
    /** Selected starter kit for domain-specific scaffolding. */
    readonly starterKit: StarterKit;
    /** Detected or user-chosen package manager. */
    readonly packageManager: PackageManager;
    /** Absolute path to the project directory. */
    readonly directory: string;
    /**
     * Whether the target directory was detected as an existing React project.
     * When `true`, `validateDirectory()` is skipped (Audit M1) and the
     * `.enterstellarignore` file is written regardless.
     *
     * @see Correction 5, L187-213 — existing project detection
     */
    readonly isExistingProject: boolean;
    /**
     * Migration choice made during existing project detection.
     *
     * - `'none'` — not an existing project, or user declined migration.
     * - `'yes'` — run `enterstellar migrate src/` after scaffolding.
     * - `'yes-enrich'` — run `enterstellar migrate src/ --enrich` after scaffolding.
     *
     * The migration call executes AFTER `writeScaffoldFiles()` and
     * `runInstall()` — ensuring `.enterstellarignore` exists and deps are installed.
     *
     * @see Correction 5, L187-213 — migration confirmation prompt
     */
    readonly migrationChoice: MigrationChoice;
}

/**
 * Migration choice from the existing project detection prompt.
 *
 * @see handleExistingProjectDetection — prompt that produces this value
 */
type MigrationChoice = 'none' | 'yes' | 'yes-enrich';

/**
 * Contract pack selection for `enterstellar init`.
 *
 * Defines which pre-built contract pack to install as a dependency.
 * Only `'shadcn'` and `'empty'` are currently available — all others
 * are Phase 2-3 and display `(coming soon)` in the selector.
 *
 * @see Correction 8, L25-41 — contract pack selector
 * @see migration-05-contract-packs.md L21 — Phase 3 additions
 */
type ContractPack =
    | 'shadcn'
    | 'radix'
    | 'mui'
    | 'headless'
    | 'chakra'
    | 'ant-design'
    | 'react-aria'
    | 'empty';

/**
 * Starter kit selection for `enterstellar init`.
 *
 * Defines which domain-specific starter kit to scaffold.
 * `'skip'` means no starter kit — only the base scaffold is created.
 *
 * @see Correction 8, L25-41 — starter kit selector
 */
type StarterKit = 'skip' | 'minimal' | 'dashboard' | 'e-commerce' | 'healthcare';

// ---------------------------------------------------------------------------
// Init Command
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar init` interactive scaffolding command.
 *
 * This function drives the entire project creation flow:
 * - Prompts the user for project name, template, and package manager
 * - Validates inputs and directory state
 * - Writes all scaffold files per Bible §4.17
 * - Installs dependencies
 * - Prints a success message with next steps
 *
 * If the user cancels any prompt (Ctrl+C), the process exits gracefully
 * with exit code 0 — no error, no partial state.
 *
 * @param directoryArg - Optional directory passed as CLI argument (e.g., `enterstellar init my-app`).
 *                        If provided, skips the project name prompt.
 * @throws {EnterstellarError} `ENS-9003` if the target directory exists and is non-empty.
 * @throws {EnterstellarError} `ENS-9005` if package manager install fails.
 * @throws {EnterstellarError} `ENS-9006` if any file write fails.
 */
export async function initCommand(directoryArg?: string): Promise<void> {
    p.intro(pc.bgCyan(pc.black(' enterstellar init ')));

    // -------------------------------------------------------------------------
    // Step 1: Collect Options
    // -------------------------------------------------------------------------
    const options = await collectOptions(directoryArg);

    // -------------------------------------------------------------------------
    // Step 2: Existing Project Detection (Correction 5, L187-213)
    // -------------------------------------------------------------------------
    // Runs AFTER collectOptions (which resolves the directory) and BEFORE
    // validateDirectory (which would throw on a non-empty dir).
    // Detection is skipped for directories that don't exist yet (greenfield).
    let resolvedOptions = options;
    if (existsSync(options.directory)) {
        resolvedOptions = await handleExistingProjectDetection(options);
    }

    // -------------------------------------------------------------------------
    // Step 3: Validate Directory
    // -------------------------------------------------------------------------
    // Audit M1: Skip validation for existing projects — the directory is
    // intentionally non-empty. validateDirectory() would throw ENS-9003.
    if (!resolvedOptions.isExistingProject) {
        validateDirectory(resolvedOptions.directory);
    }

    // -------------------------------------------------------------------------
    // Step 4: Write Scaffold Files
    // -------------------------------------------------------------------------
    const s = p.spinner();
    s.start('Scaffolding project...');

    await writeScaffoldFiles(resolvedOptions);

    s.stop('Project scaffolded.');

    // -------------------------------------------------------------------------
    // Step 5: Install Dependencies
    // -------------------------------------------------------------------------
    runInstall(resolvedOptions.packageManager, resolvedOptions.directory);

    // -------------------------------------------------------------------------
    // Step 5.5: Post-Scaffolding Migration (Correction 5, L187-213)
    // -------------------------------------------------------------------------
    // Runs AFTER writeScaffoldFiles() (so .enterstellarignore exists) and AFTER
    // runInstall() (so @enterstellar-ai/migration is available in node_modules).
    if (resolvedOptions.migrationChoice !== 'none') {
        const srcDir = join(resolvedOptions.directory, 'src');
        const migrationArgs: string[] = [srcDir];

        if (resolvedOptions.migrationChoice === 'yes-enrich') {
            migrationArgs.push('--enrich');
        }

        p.log.step(pc.bold('Running migration...'));

        // Dynamic import — same pattern as bin.ts routing.
        // Keeps ts-morph out of the cold-start path.
        const { migrateCommand } = await import('./migrate.js');
        await migrateCommand(migrationArgs, migrationArgs);
    }

    // -------------------------------------------------------------------------
    // Step 6: Success Message
    // -------------------------------------------------------------------------
    printSuccess(resolvedOptions);
}

// ---------------------------------------------------------------------------
// Option Collection
// ---------------------------------------------------------------------------

/**
 * Collects all init options via interactive prompts.
 *
 * If `directoryArg` is provided, derives the project name from it
 * and skips the name prompt. Auto-detects the package manager
 * from lockfiles in the current working directory per CLI3.
 *
 * @param directoryArg - Optional directory from CLI argument.
 * @returns Fully resolved `InitOptions`.
 */
async function collectOptions(
    directoryArg?: string,
): Promise<InitOptions> {
    // --- Project Name ---
    let projectName: string;

    if (directoryArg !== undefined && directoryArg.length > 0) {
        projectName = basename(directoryArg);
    } else {
        const nameResult = await p.text({
            message: 'Project name:',
            placeholder: 'my-enterstellar-app',
            validate(value) {
                if (value.length === 0) {
                    return 'Project name is required.';
                }
                if (!validateProjectName(value)) {
                    return 'Must be kebab-case (e.g., "my-enterstellar-app"). Lowercase letters, numbers, and hyphens only.';
                }
                return undefined;
            },
        });

        if (p.isCancel(nameResult)) {
            handleCancel();
        }

        projectName = nameResult;
    }

    // --- Template ---
    const templateResult = await p.select({
        message: 'Choose a template:',
        options: [
            {
                value: 'minimal' as const,
                label: 'Minimal',
                hint: 'Registry + Compiler + 3 core packages',
            },
            {
                value: 'full' as const,
                label: 'Full',
                hint: 'All Enterstellar packages + DevTools + Test harness',
            },
            {
                value: 'nextjs' as const,
                label: 'Next.js',
                hint: 'Full Enterstellar + Next.js App Router',
            },
            {
                value: 'vite-react' as const,
                label: 'Vite + React',
                hint: 'Full Enterstellar + Vite dev server',
            },
        ],
    });

    if (p.isCancel(templateResult)) {
        handleCancel();
    }

    const template: ProjectTemplate = templateResult;

    // --- Contract Pack (Correction 8, L25-41) ---
    // Audit M7: All Bible-specified packs listed. Unavailable packs
    // are disabled with "coming soon" hints.
    const packResult = await p.select({
        message: 'Choose a contract pack:',
        options: [
            {
                value: 'shadcn' as const,
                label: 'shadcn/ui',
                hint: 'Pre-built contracts for shadcn/ui components',
            },
            {
                value: 'empty' as const,
                label: 'Empty',
                hint: 'No pre-built contracts — define your own',
            },
            {
                value: 'radix' as const,
                label: 'Radix UI (coming soon)',
                hint: 'Phase 2',
            },
            {
                value: 'mui' as const,
                label: 'Material UI (coming soon)',
                hint: 'Phase 2',
            },
            {
                value: 'headless' as const,
                label: 'Headless UI (coming soon)',
                hint: 'Phase 2',
            },
            {
                value: 'chakra' as const,
                label: 'Chakra UI (coming soon)',
                hint: 'Phase 3',
            },
            {
                value: 'ant-design' as const,
                label: 'Ant Design (coming soon)',
                hint: 'Phase 3',
            },
            {
                value: 'react-aria' as const,
                label: 'React Aria (coming soon)',
                hint: 'Phase 3',
            },
        ],
    });

    if (p.isCancel(packResult)) {
        handleCancel();
    }

    const contractPack: ContractPack = packResult;

    // --- Starter Kit (Correction 8, L25-41) ---
    const kitResult = await p.select({
        message: 'Choose a starter kit:',
        options: [
            {
                value: 'skip' as const,
                label: 'Skip',
                hint: 'Base scaffold only — no starter components',
            },
            {
                value: 'minimal' as const,
                label: 'Minimal',
                hint: '3 example components + basic registry',
            },
            {
                value: 'dashboard' as const,
                label: 'Dashboard',
                hint: 'Analytics dashboard with charts and tables',
            },
            {
                value: 'e-commerce' as const,
                label: 'E-Commerce',
                hint: 'Product catalog, cart, and checkout flow',
            },
            {
                value: 'healthcare' as const,
                label: 'Healthcare',
                hint: 'Patient vitals, medical records, clinical UI',
            },
        ],
    });

    if (p.isCancel(kitResult)) {
        handleCancel();
    }

    const starterKit: StarterKit = kitResult;

    // --- Package Manager ---
    const detected = detectPackageManager(process.cwd());
    let packageManager: PackageManager;

    if (detected !== null) {
        p.log.info(`Detected package manager: ${pc.bold(detected)}`);
        packageManager = detected;
    } else {
        const pmResult = await p.select({
            message: 'Choose a package manager:',
            options: [
                { value: 'pnpm' as const, label: 'pnpm' },
                { value: 'npm' as const, label: 'npm' },
                { value: 'yarn' as const, label: 'yarn' },
                { value: 'bun' as const, label: 'bun' },
            ],
        });

        if (p.isCancel(pmResult)) {
            handleCancel();
        }

        packageManager = pmResult;
    }

    // --- Resolve Directory ---
    const directory = resolve(
        directoryArg !== undefined && directoryArg.length > 0
            ? directoryArg
            : projectName,
    );

    return {
        projectName,
        template,
        contractPack,
        starterKit,
        packageManager,
        directory,
        isExistingProject: false,
        migrationChoice: 'none',
    };
}

// ---------------------------------------------------------------------------
// Existing Project Detection (Correction 5, L187-213)
// ---------------------------------------------------------------------------

/**
 * Checks whether a directory contains an existing React project.
 *
 * Detection criteria (all must be true):
 * 1. Directory contains a `package.json` file.
 * 2. `package.json` lists `react` in `dependencies` or `devDependencies`.
 * 3. A `src/` directory exists containing at least one `.tsx` file.
 *
 * This is a **fast, synchronous check** — it reads `package.json` and
 * checks for `.tsx` file existence. It does NOT load `ts-morph` or
 * perform any AST analysis.
 *
 * @param directory - Absolute path to the target directory.
 * @returns `true` if the directory is an existing React project.
 */
function detectExistingReactProject(directory: string): boolean {
    // Check 1: package.json must exist.
    const pkgPath = join(directory, 'package.json');
    if (!existsSync(pkgPath)) {
        return false;
    }

    // Check 2: react must be in dependencies or devDependencies.
    try {
        const raw = readFileSync(pkgPath, 'utf-8');
        const pkg: unknown = JSON.parse(raw);

        if (typeof pkg !== 'object' || pkg === null) {
            return false;
        }

        const record = pkg as Record<string, unknown>;
        const deps = record['dependencies'];
        const devDeps = record['devDependencies'];
        let hasReact = false;

        if (typeof deps === 'object' && deps !== null) {
            hasReact = 'react' in deps;
        }
        if (!hasReact && typeof devDeps === 'object' && devDeps !== null) {
            hasReact = 'react' in devDeps;
        }

        if (!hasReact) {
            return false;
        }
    } catch {
        return false;
    }

    // Check 3: src/ directory must exist with at least one .tsx file.
    const srcDir = join(directory, 'src');
    if (!existsSync(srcDir)) {
        return false;
    }

    try {
        const srcEntries = readdirSync(srcDir, { recursive: true }) as string[];
        return srcEntries.some((entry) => entry.endsWith('.tsx'));
    } catch {
        return false;
    }
}

/**
 * Handles existing React project detection for `enterstellar init`.
 *
 * When the target directory is an existing React project, this function:
 * 1. Dynamic-imports `scanComponentsLightweight` from `@enterstellar-ai/migration`
 *    (same pattern as `migrateCommand` — Audit E3, preserves cold-start).
 * 2. Runs the syntax-only scan to produce a 3-tier classification.
 * 3. Displays the scan summary using `@clack/prompts`.
 * 4. Prompts the user with 3 options: migrate now, migrate with enrichment,
 *    or skip migration.
 * 5. Returns an updated `InitOptions` with `isExistingProject: true`.
 *
 * If the directory is NOT an existing React project, returns the original
 * options unchanged.
 *
 * @param options - Current init options (with `isExistingProject: false`).
 * @returns Updated `InitOptions` — either with `isExistingProject: true`
 *   (if detected) or the original options unchanged.
 *
 * @see Correction 5, L187-213 — 3-tier scan summary and confirmation prompt
 */
async function handleExistingProjectDetection(
    options: InitOptions,
): Promise<InitOptions> {
    if (!detectExistingReactProject(options.directory)) {
        return options;
    }

    p.log.info(
        `${pc.yellow('Existing React project detected')} in ${pc.dim(options.directory)}`,
    );

    // Dynamic-import @enterstellar-ai/migration for the lightweight scan.
    // This is the same pattern used by migrateCommand — ts-morph only loads
    // on demand, never in the cold-start path (Mid-Session Decision #7).
    const s = p.spinner();
    s.start('Scanning components...');

    const { scanComponentsLightweight } = await import('@enterstellar-ai/migration');
    const srcDir = join(options.directory, 'src');
    const result = scanComponentsLightweight(srcDir);

    s.stop('Scan complete.');

    // --- Display 3-tier summary (Correction 5, L187-213) ---
    const reactVersionStr = result.reactVersion !== undefined
        ? `React ${result.reactVersion}`
        : 'React (version unknown)';

    p.note(
        [
            `${pc.bold(reactVersionStr)} — ${String(result.total)} component files found`,
            '',
            `  ${pc.green('\u2713')} ${pc.bold(String(result.autoMigratable))} auto-migratable`,
            `  ${pc.yellow('~')} ${pc.bold(String(result.manualReview))} manual review`,
            `  ${pc.dim('\u2717')} ${pc.bold(String(result.skipped))} skipped`,
        ].join('\n'),
        'Component Scan',
    );

    // --- Migration confirmation prompt (3 options) ---
    const migrationChoice = await p.select({
        message: 'Run migration now?',
        options: [
            {
                value: 'yes' as const,
                label: 'Yes',
                hint: 'Run enterstellar migrate src/ after scaffolding',
            },
            {
                value: 'yes-enrich' as const,
                label: 'Yes, with enrichment',
                hint: 'Run enterstellar migrate src/ --enrich (requires API key)',
            },
            {
                value: 'no' as const,
                label: 'No',
                hint: 'Skip migration — you can run it later',
            },
        ],
    });

    if (p.isCancel(migrationChoice)) {
        handleCancel();
    }

    if (migrationChoice === 'no') {
        p.log.info(
            pc.dim("Run 'enterstellar migrate src/' when you're ready to generate contracts."),
        );
    } else {
        // Store the migration choice — the actual call executes in
        // initCommand() after writeScaffoldFiles() + runInstall().
        p.log.info(
            pc.dim(
                migrationChoice === 'yes-enrich'
                    ? 'Migration with enrichment will run after scaffolding.'
                    : 'Migration will run after scaffolding.',
            ),
        );
    }

    return {
        ...options,
        isExistingProject: true,
        migrationChoice: migrationChoice === 'no' ? 'none' : migrationChoice,
    };
}

// ---------------------------------------------------------------------------
// Directory Validation
// ---------------------------------------------------------------------------

/**
 * Validates that the target directory is safe for scaffolding.
 *
 * Rules:
 * - Directory doesn't exist → OK (will be created by file writes)
 * - Directory exists but is empty → OK (safe to use)
 * - Directory exists and is non-empty → throw `ENS-9003`
 *
 * @param directory - Absolute path to the project directory.
 * @throws {EnterstellarError} `ENS-9003` if directory is non-empty.
 */
function validateDirectory(directory: string): void {
    if (!existsSync(directory)) {
        return;
    }

    const entries = readdirSync(directory);
    /**
     * Filter out common invisible files that shouldn't block scaffolding.
     * `.DS_Store` (macOS), `.git` (initialized repo), and `.gitkeep` are safe.
     */
    const significantEntries = entries.filter(
        (entry: string) => entry !== '.DS_Store' && entry !== '.git' && entry !== '.gitkeep',
    );

    if (significantEntries.length > 0) {
        throw createDirectoryExistsError(directory);
    }
}

// ---------------------------------------------------------------------------
// File Writing
// ---------------------------------------------------------------------------

/**
 * Writes all scaffold files into the project directory.
 *
 * File structure matches Bible §4.17 exactly:
 * ```
 * my-enterstellar-app/
 * ├── src/enterstellar/registry.ts
 * ├── src/enterstellar/tokens.ts
 * ├── src/enterstellar/components/{5 files}
 * ├── src/app/page.tsx  (or src/App.tsx)
 * ├── src/tests/enterstellar.test.ts
 * ├── package.json
 * ├── tsconfig.json
 * └── README.md
 * ```
 *
 * @param options - Resolved init options.
 */
async function writeScaffoldFiles(options: InitOptions): Promise<void> {
    const { projectName, template, contractPack, packageManager, directory } = options;

    // --- Root config files ---
    await safeWriteFile(
        resolve(directory, 'package.json'),
        generatePackageJson(projectName, template, contractPack),
    );

    await safeWriteFile(
        resolve(directory, 'tsconfig.json'),
        generateTsconfig(template),
    );

    await safeWriteFile(
        resolve(directory, 'README.md'),
        generateReadme(projectName, packageManager),
    );

    // --- Enterstellar registry and tokens ---
    await safeWriteFile(
        resolve(directory, 'src', 'enterstellar', 'registry.ts'),
        generateRegistry(),
    );

    await safeWriteFile(
        resolve(directory, 'src', 'enterstellar', 'tokens.ts'),
        generateTokens(),
    );

    await safeWriteFile(
        resolve(directory, 'src', 'globals.css'),
        generateGlobalsCss(),
    );

    // --- Example components ---
    const components = generateComponents();
    for (const { filename, content } of components) {
        await safeWriteFile(
            resolve(directory, 'src', 'enterstellar', 'components', filename),
            content,
        );
    }

    // --- App page ---
    const pagePath = getPagePath(template);
    await safeWriteFile(
        resolve(directory, pagePath),
        generatePage(template),
    );

    // --- Tests ---
    await safeWriteFile(
        resolve(directory, 'src', 'tests', 'enterstellar.test.ts'),
        generateTest(),
    );

    // --- .enterstellarignore (Correction 6, L457-473) ---
    // Created regardless of whether the developer migrates now or later.
    // Never overwrites an existing .enterstellarignore.
    const enterstellarignorePath = resolve(directory, '.enterstellarignore');
    if (existsSync(enterstellarignorePath)) {
        p.log.info(pc.dim('.enterstellarignore already exists — skipping.'));
    } else {
        await safeWriteFile(enterstellarignorePath, generateEnterstellarIgnore());
    }
}

// ---------------------------------------------------------------------------
// Success Output
// ---------------------------------------------------------------------------

/**
 * Prints a success message with next steps after scaffolding completes.
 *
 * @param options - Resolved init options for contextual messaging.
 */
function printSuccess(options: InitOptions): void {
    const { projectName, template, packageManager } = options;

    const runCmd = packageManager === 'npm' ? 'npm run' : packageManager;

    p.note(
        [
            `${pc.bold('Project created:')} ${projectName}`,
            `${pc.bold('Template:')}        ${template}`,
            `${pc.bold('Package manager:')} ${packageManager}`,
            '',
            pc.dim('Next steps:'),
            '',
            `  cd ${projectName}`,
            `  ${runCmd} dev`,
            '',
            pc.dim('Other commands:'),
            '',
            `  ${runCmd} test        ${pc.dim('— Run intent-based tests')}`,
            `  ${runCmd} typecheck   ${pc.dim('— Type check the project')}`,
            `  npx @enterstellar-ai/cli add component MyComponent  ${pc.dim('— Scaffold a new component')}`,
        ].join('\n'),
        'Success!',
    );

    p.outro(pc.green('Happy building with Enterstellar! 🚀'));
}
