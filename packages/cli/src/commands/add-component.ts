/**
 * @module @enterstellar-ai/cli/commands/add-component
 * @description Implements the `enterstellar add component <Name>` scaffolding command.
 *
 * Generates 4 files for a new Enterstellar component per Design Choice CLI2:
 *
 * 1. `<Name>.contract.ts` — Zod schema + `defineComponent()` contract
 * 2. `<Name>.tsx` — React render function stub
 * 3. `<Name>.test.ts` — Intent test with `harness.mock()` + `harness.resolve()`
 * 4. `<Name>.fixture.json` — Example props fixture
 *
 * All files are written to `src/enterstellar/components/` within the detected
 * Enterstellar project root (nearest `package.json` with `@enterstellar-ai/registry` dependency).
 *
 * @see Design Choice CLI2 — `enterstellar add component` scaffold spec
 * @see Implementation Bible §4.17
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

import * as p from '@clack/prompts';
import pc from 'picocolors';

import { validateComponentName } from '../utils/validate-name.js';
import { safeWriteFile } from '../utils/write-file.js';
import {
    createInvalidComponentNameError,
    createProjectNotFoundError,
} from '../utils/errors.js';
import { generateComponentScaffold } from '../templates/template-component-scaffold.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Relative path within the project where component files are written.
 * Matches Bible §4.17 scaffold structure.
 */
const COMPONENTS_DIR = join('src', 'enterstellar', 'components');

// ---------------------------------------------------------------------------
// Add Component Command
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar add component <Name>` command.
 *
 * Pipeline:
 * 1. Validate that `componentName` is PascalCase (ENS-9002 if not).
 * 2. Detect Enterstellar project root — find nearest `package.json` with
 *    `@enterstellar-ai/registry` in dependencies or devDependencies (ENS-9004 if not found).
 * 3. Generate 4 scaffold files from the component template.
 * 4. Write files to `src/enterstellar/components/` (skip if file already exists).
 * 5. Print success message listing created files.
 *
 * @param componentName - PascalCase name for the new component (e.g., `PatientVitals`).
 * @throws {EnterstellarError} `ENS-9002` if the component name is not PascalCase.
 * @throws {EnterstellarError} `ENS-9004` if no Enterstellar project is found in the current directory.
 * @throws {EnterstellarError} `ENS-9006` if any file write fails.
 */
export async function addComponentCommand(
    componentName: string,
): Promise<void> {
    p.intro(pc.bgMagenta(pc.black(' enterstellar add component ')));

    // -------------------------------------------------------------------------
    // Step 1: Validate Component Name
    // -------------------------------------------------------------------------
    if (!validateComponentName(componentName)) {
        throw createInvalidComponentNameError(componentName);
    }

    // -------------------------------------------------------------------------
    // Step 2: Detect Enterstellar Project Root
    // -------------------------------------------------------------------------
    const projectRoot = findEnterstellarProjectRoot(process.cwd());

    if (projectRoot === null) {
        throw createProjectNotFoundError(process.cwd());
    }

    p.log.info(`Enterstellar project found: ${pc.dim(projectRoot)}`);

    // -------------------------------------------------------------------------
    // Step 3: Generate Scaffold Files
    // -------------------------------------------------------------------------
    const scaffoldFiles = generateComponentScaffold(componentName);
    const componentsDir = resolve(projectRoot, COMPONENTS_DIR);

    // -------------------------------------------------------------------------
    // Step 4: Write Files
    // -------------------------------------------------------------------------
    const createdFiles: string[] = [];
    const skippedFiles: string[] = [];

    for (const { filename, content } of scaffoldFiles) {
        const filePath = resolve(componentsDir, filename);
        const written = await safeWriteFile(filePath, content);

        if (written) {
            createdFiles.push(filename);
        } else {
            skippedFiles.push(filename);
        }
    }

    // -------------------------------------------------------------------------
    // Step 5: Success Message
    // -------------------------------------------------------------------------
    printAddComponentSuccess(componentName, createdFiles, skippedFiles);
}

// ---------------------------------------------------------------------------
// Project Root Detection
// ---------------------------------------------------------------------------

/**
 * Finds the nearest Enterstellar project root by searching for a `package.json`
 * that contains `@enterstellar-ai/registry` as a dependency or devDependency.
 *
 * Searches upward from `startDir` through parent directories until
 * the filesystem root is reached. This allows running `enterstellar add component`
 * from any subdirectory within the project.
 *
 * @param startDir - The directory to start searching from (typically `process.cwd()`).
 * @returns The absolute path to the project root, or `null` if not found.
 */
function findEnterstellarProjectRoot(startDir: string): string | null {
    let currentDir = resolve(startDir);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- traversal loop
    while (true) {
        const packageJsonPath = join(currentDir, 'package.json');

        if (existsSync(packageJsonPath)) {
            if (isEnterstellarProject(packageJsonPath)) {
                return currentDir;
            }
        }

        const parentDir = resolve(currentDir, '..');

        // Reached filesystem root — no Enterstellar project found
        if (parentDir === currentDir) {
            return null;
        }

        currentDir = parentDir;
    }
}

/**
 * Checks whether a `package.json` file indicates an Enterstellar project.
 *
 * An Enterstellar project is identified by having `@enterstellar-ai/registry` listed
 * in either `dependencies` or `devDependencies`.
 *
 * @param packageJsonPath - Absolute path to a `package.json` file.
 * @returns `true` if this is an Enterstellar project, `false` otherwise.
 */
function isEnterstellarProject(packageJsonPath: string): boolean {
    try {
        const raw = readFileSync(packageJsonPath, 'utf-8');
        const parsed: unknown = JSON.parse(raw);

        if (typeof parsed !== 'object' || parsed === null) {
            return false;
        }

        const pkg = parsed as Record<string, unknown>;

        const deps = pkg['dependencies'];
        const devDeps = pkg['devDependencies'];

        if (typeof deps === 'object' && deps !== null && '@enterstellar-ai/registry' in deps) {
            return true;
        }

        if (typeof devDeps === 'object' && devDeps !== null && '@enterstellar-ai/registry' in devDeps) {
            return true;
        }

        return false;
    } catch {
        // Invalid JSON or read failure — not an Enterstellar project
        return false;
    }
}

// ---------------------------------------------------------------------------
// Success Output
// ---------------------------------------------------------------------------

/**
 * Prints summary of the add component operation.
 *
 * Lists created files in green and skipped files (already exist) in yellow.
 *
 * @param componentName - The component name.
 * @param created - Filenames that were successfully created.
 * @param skipped - Filenames that were skipped (already exist).
 */
function printAddComponentSuccess(
    componentName: string,
    created: readonly string[],
    skipped: readonly string[],
): void {
    const lines: string[] = [];

    if (created.length > 0) {
        lines.push(pc.green('Created:'));
        for (const file of created) {
            lines.push(`  ${pc.green('✓')} ${COMPONENTS_DIR}/${file}`);
        }
    }

    if (skipped.length > 0) {
        if (lines.length > 0) {
            lines.push('');
        }
        lines.push(pc.yellow('Skipped (already exist):'));
        for (const file of skipped) {
            lines.push(`  ${pc.yellow('○')} ${COMPONENTS_DIR}/${file}`);
        }
    }

    if (created.length > 0) {
        lines.push('');
        lines.push(pc.dim('Next steps:'));
        lines.push(`  1. Edit ${pc.bold(`${componentName}.contract.ts`)} — define your Zod schema`);
        lines.push(`  2. Edit ${pc.bold(`${componentName}.tsx`)} — implement the render function`);
        lines.push(`  3. Update ${pc.bold('registry.ts')} — register the contract`);
        lines.push(`  4. Run ${pc.bold('pnpm test')} — verify your component compiles`);
    }

    p.note(lines.join('\n'), `Component: ${componentName}`);
    p.outro(pc.green('Component scaffolded! 🧩'));
}
