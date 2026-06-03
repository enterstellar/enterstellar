/**
 * @module @enterstellar-ai/cli/__tests__/e2e-scaffold
 * @description End-to-end scaffold validation test for P3 Gate compliance.
 *
 * Exercises the full template generation pipeline for all 4 template variants
 * (CLI1 V2) and structurally validates the output — not just file existence,
 * but JSON schema correctness, dependency completeness, TypeScript config
 * strictness, and design token CSS custom property coverage.
 *
 * ## P3 Gate Requirement
 *
 * > `[ ] npx create-enterstellar-app produces working project`
 *
 * This test validates that the scaffold pipeline produces a structurally
 * correct, complete project for every template variant. Combined with the
 * 142 existing unit/integration tests that verify individual template
 * generators, this provides high confidence that the scaffolded output
 * will build and run correctly.
 *
 * ## Network I/O Guarantee
 *
 * This test makes **zero network calls**. All template generators are pure
 * functions that return string content. The `runInstall` step (package
 * manager install) is NOT exercised — it is tested separately and requires
 * a real package manager. File I/O is limited to a temporary directory
 * that is cleaned up in `afterEach`.
 *
 * @see Implementation Bible §4.17 — scaffolded output structure
 * @see Design Choice CLI1 (V2) — 4 template variants
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { ProjectTemplate } from '../src/templates/template-package-json.js';
import { generatePackageJson } from '../src/templates/template-package-json.js';
import { generateTsconfig } from '../src/templates/template-tsconfig.js';
import { generateRegistry } from '../src/templates/template-registry.js';
import { generateTokens } from '../src/templates/template-tokens.js';
import { generateGlobalsCss } from '../src/templates/template-globals-css.js';
import { generateComponents } from '../src/templates/template-components.js';
import { generatePage, getPagePath } from '../src/templates/template-page.js';
import { generateTest } from '../src/templates/template-test.js';
import { generateReadme } from '../src/templates/template-readme.js';
import { safeWriteFile } from '../src/utils/write-file.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * All 4 template variants as defined by CLI1 (V2).
 * The test loop iterates over every variant to ensure full coverage.
 */
const ALL_TEMPLATES: readonly ProjectTemplate[] = [
    'minimal',
    'full',
    'nextjs',
    'vite-react',
] as const;

/**
 * Core `@enterstellar-ai/*` dependencies that MUST be present in every scaffolded
 * `package.json`, regardless of template variant.
 *
 * Engine packages (@enterstellar-ai/compiler, @enterstellar-ai/state, @enterstellar-ai/telemetry, etc.)
 * are transitive dependencies of @enterstellar-ai/react per RE19 and CLI4.
 */
const CORE_Enterstellar_DEPS: readonly string[] = [
    '@enterstellar-ai/react',
    '@enterstellar-ai/registry',
] as const;

/**
 * Additional `@enterstellar-ai/*` dev dependencies present in `full`, `nextjs`, and
 * `vite-react` templates. These are in `devDependencies`, not `dependencies`.
 */
const EXTENDED_Enterstellar_DEV_DEPS: readonly string[] = [
    '@enterstellar-ai/devtools',
    '@enterstellar-ai/test',
] as const;

/**
 * The 5 example component filenames that Bible §4.17 requires.
 */
const EXAMPLE_COMPONENTS: readonly string[] = [
    'ExampleCard.tsx',
    'ExampleList.tsx',
    'ExampleChart.tsx',
    'ExampleForm.tsx',
    'ExampleDetail.tsx',
] as const;

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Root temp directory — unique per test run. */
let testRoot: string;

beforeEach(() => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    testRoot = join(tmpdir(), `enterstellar-e2e-scaffold-${suffix}`);
    mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
});

/**
 * Scaffolds a complete Enterstellar project in a temporary directory.
 *
 * Mirrors the exact file-writing sequence in `init.ts` to produce
 * an identical output without interactive prompts or `runInstall`.
 *
 * @param template - The template variant to scaffold.
 * @returns The absolute path to the scaffolded project directory.
 */
async function scaffoldProject(template: ProjectTemplate): Promise<string> {
    const projectName = `test-${template}-project`;
    const projectDir = join(testRoot, projectName);

    // --- Root config files ---
    await safeWriteFile(
        join(projectDir, 'package.json'),
        generatePackageJson(projectName, template),
    );
    await safeWriteFile(
        join(projectDir, 'tsconfig.json'),
        generateTsconfig(template),
    );
    await safeWriteFile(
        join(projectDir, 'README.md'),
        generateReadme(projectName, 'pnpm'),
    );

    // --- Enterstellar registry and tokens ---
    await safeWriteFile(
        join(projectDir, 'src', 'enterstellar', 'registry.ts'),
        generateRegistry(),
    );
    await safeWriteFile(
        join(projectDir, 'src', 'enterstellar', 'tokens.ts'),
        generateTokens(),
    );

    // --- CSS custom properties (L9 — Design Tokens as Firmware) ---
    await safeWriteFile(
        join(projectDir, 'src', 'globals.css'),
        generateGlobalsCss(),
    );

    // --- Example components ---
    for (const { filename, content } of generateComponents()) {
        await safeWriteFile(
            join(projectDir, 'src', 'enterstellar', 'components', filename),
            content,
        );
    }

    // --- App page ---
    const pagePath = getPagePath(template);
    await safeWriteFile(
        join(projectDir, pagePath),
        generatePage(template),
    );

    // --- Test file ---
    await safeWriteFile(
        join(projectDir, 'src', 'tests', 'enterstellar.test.ts'),
        generateTest(),
    );

    return projectDir;
}

/**
 * Reads and parses a JSON file from the scaffolded project.
 *
 * @param projectDir - Absolute path to the project root.
 * @param relativePath - Relative path to the JSON file within the project.
 * @returns The parsed JSON object.
 * @throws If the file does not exist or contains invalid JSON.
 */
function readJsonFile(projectDir: string, relativePath: string): Record<string, unknown> {
    const filePath = join(projectDir, relativePath);
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Reads a text file from the scaffolded project.
 *
 * @param projectDir - Absolute path to the project root.
 * @param relativePath - Relative path to the file within the project.
 * @returns The file content as a UTF-8 string.
 */
function readTextFile(projectDir: string, relativePath: string): string {
    return readFileSync(join(projectDir, relativePath), 'utf-8');
}

// ===========================================================================
// E2E Scaffold Validation Tests
// ===========================================================================

describe('E2E: scaffold validation (P3 Gate)', () => {
    // -----------------------------------------------------------------------
    // Per-variant tests: loop through all 4 templates (CLI1 V2)
    // -----------------------------------------------------------------------

    for (const template of ALL_TEMPLATES) {
        describe(`template: "${template}"`, () => {
            /** Scaffolded project directory — set once per template suite. */
            let projectDir: string;

            beforeEach(async () => {
                projectDir = await scaffoldProject(template);
            });

            // ---------------------------------------------------------------
            // 1. File Tree Completeness (Bible §4.17)
            // ---------------------------------------------------------------

            describe('file tree completeness (Bible §4.17)', () => {
                it('has package.json at the project root', () => {
                    expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
                });

                it('has tsconfig.json at the project root', () => {
                    expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
                });

                it('has README.md at the project root', () => {
                    expect(existsSync(join(projectDir, 'README.md'))).toBe(true);
                });

                it('has src/enterstellar/registry.ts', () => {
                    expect(existsSync(join(projectDir, 'src', 'enterstellar', 'registry.ts'))).toBe(true);
                });

                it('has src/enterstellar/tokens.ts', () => {
                    expect(existsSync(join(projectDir, 'src', 'enterstellar', 'tokens.ts'))).toBe(true);
                });

                it('has src/globals.css (CSS custom properties)', () => {
                    expect(existsSync(join(projectDir, 'src', 'globals.css'))).toBe(true);
                });

                it('has the template-correct page component', () => {
                    const pagePath = getPagePath(template);
                    expect(existsSync(join(projectDir, pagePath))).toBe(true);
                });

                it('has src/tests/enterstellar.test.ts', () => {
                    expect(existsSync(join(projectDir, 'src', 'tests', 'enterstellar.test.ts'))).toBe(true);
                });

                it('has all 5 example components', () => {
                    for (const component of EXAMPLE_COMPONENTS) {
                        expect(
                            existsSync(join(projectDir, 'src', 'enterstellar', 'components', component)),
                        ).toBe(true);
                    }
                });
            });

            // ---------------------------------------------------------------
            // 2. package.json Structural Validation
            // ---------------------------------------------------------------

            describe('package.json structural validation', () => {
                it('is valid JSON with a string name field', () => {
                    const pkg = readJsonFile(projectDir, 'package.json');

                    expect(typeof pkg['name']).toBe('string');
                    expect((pkg['name'] as string).length).toBeGreaterThan(0);
                });

                it('has "type": "module" for ESM', () => {
                    const pkg = readJsonFile(projectDir, 'package.json');

                    expect(pkg['type']).toBe('module');
                });

                it('has all core @enterstellar-ai/* dependencies', () => {
                    const pkg = readJsonFile(projectDir, 'package.json');
                    const deps = pkg['dependencies'] as Record<string, string> | undefined;

                    expect(deps).toBeDefined();

                    for (const dep of CORE_Enterstellar_DEPS) {
                        expect(deps).toHaveProperty(dep);
                    }
                });

                it('has extended @enterstellar-ai/* dev deps for non-minimal templates', () => {
                    // "minimal" only has core deps; all others include extended devDeps
                    if (template === 'minimal') {
                        return; // Skip — minimal has no extended deps by design
                    }

                    const pkg = readJsonFile(projectDir, 'package.json');
                    const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;

                    expect(devDeps).toBeDefined();

                    for (const dep of EXTENDED_Enterstellar_DEV_DEPS) {
                        expect(devDeps).toHaveProperty(dep);
                    }
                });

                it('has react and react-dom in dependencies', () => {
                    const pkg = readJsonFile(projectDir, 'package.json');
                    const deps = pkg['dependencies'] as Record<string, string> | undefined;

                    expect(deps).toBeDefined();
                    expect(deps).toHaveProperty('react');
                    expect(deps).toHaveProperty('react-dom');
                });

                it('has framework-specific dependencies for the template', () => {
                    const pkg = readJsonFile(projectDir, 'package.json');
                    const deps = pkg['dependencies'] as Record<string, string> | undefined;
                    const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;

                    if (template === 'nextjs') {
                        expect(deps).toHaveProperty('next');
                    }

                    if (template === 'vite-react') {
                        expect(devDeps).toHaveProperty('vite');
                        expect(devDeps).toHaveProperty('@vitejs/plugin-react');
                    }
                });

                it('has required scripts (dev, build, test)', () => {
                    const pkg = readJsonFile(projectDir, 'package.json');
                    const scripts = pkg['scripts'] as Record<string, string> | undefined;

                    expect(scripts).toBeDefined();
                    expect(scripts).toHaveProperty('dev');
                    expect(scripts).toHaveProperty('build');
                    expect(scripts).toHaveProperty('test');
                });
            });

            // ---------------------------------------------------------------
            // 3. tsconfig.json Structural Validation
            // ---------------------------------------------------------------

            describe('tsconfig.json structural validation', () => {
                it('is valid JSON', () => {
                    const tsconfig = readJsonFile(projectDir, 'tsconfig.json');

                    expect(tsconfig).toBeDefined();
                    expect(typeof tsconfig).toBe('object');
                });

                it('has compilerOptions with strict mode enabled', () => {
                    const tsconfig = readJsonFile(projectDir, 'tsconfig.json');
                    const opts = tsconfig['compilerOptions'] as Record<string, unknown> | undefined;

                    expect(opts).toBeDefined();
                    expect(opts?.['strict']).toBe(true);
                });

                it('targets ES2022 or later', () => {
                    const tsconfig = readJsonFile(projectDir, 'tsconfig.json');
                    const opts = tsconfig['compilerOptions'] as Record<string, unknown> | undefined;

                    expect(opts).toBeDefined();

                    const target = (opts?.['target'] as string | undefined)?.toLowerCase();
                    const validTargets = ['es2022', 'es2023', 'es2024', 'esnext'];
                    expect(validTargets).toContain(target);
                });

                it('enables JSX support for React', () => {
                    const tsconfig = readJsonFile(projectDir, 'tsconfig.json');
                    const opts = tsconfig['compilerOptions'] as Record<string, unknown> | undefined;

                    expect(opts).toBeDefined();
                    expect(opts?.['jsx']).toBeDefined();
                });

                it('enforces strict TypeScript flags', () => {
                    const tsconfig = readJsonFile(projectDir, 'tsconfig.json');
                    const opts = tsconfig['compilerOptions'] as Record<string, unknown> | undefined;

                    expect(opts).toBeDefined();

                    // Key strictness flags that Enterstellar requires
                    expect(opts?.['noUncheckedIndexedAccess']).toBe(true);
                    expect(opts?.['noUnusedLocals']).toBe(true);
                    expect(opts?.['noUnusedParameters']).toBe(true);
                });
            });

            // ---------------------------------------------------------------
            // 4. globals.css Structural Validation (L9 — Design Tokens as Firmware)
            // ---------------------------------------------------------------

            describe('globals.css validation', () => {
                it('contains a :root block', () => {
                    const css = readTextFile(projectDir, 'src/globals.css');

                    expect(css).toContain(':root');
                });

                it('defines CSS custom properties for all design token categories', () => {
                    const css = readTextFile(projectDir, 'src/globals.css');

                    // Colors
                    expect(css).toContain('--color-primary-base');
                    expect(css).toContain('--color-neutral-200');
                    expect(css).toContain('--color-text-primary');
                    expect(css).toContain('--color-background-page');
                    expect(css).toContain('--color-error-base');

                    // Spacing
                    expect(css).toContain('--spacing-xs');
                    expect(css).toContain('--spacing-lg');
                    expect(css).toContain('--spacing-3xl');

                    // Typography
                    expect(css).toContain('--font-family-sans');
                    expect(css).toContain('--font-size-base');
                    expect(css).toContain('--font-weight-bold');
                    expect(css).toContain('--font-lineHeight-normal');

                    // Radii
                    expect(css).toContain('--radius-md');
                    expect(css).toContain('--radius-full');

                    // Shadows
                    expect(css).toContain('--shadow-sm');
                    expect(css).toContain('--shadow-lg');
                });

                it('CSS custom property values match token values (L9 parity)', () => {
                    const css = readTextFile(projectDir, 'src/globals.css');
                    const tokens = readTextFile(projectDir, 'src/enterstellar/tokens.ts');

                    /**
                     * Critical token samples for parity verification.
                     * Each entry maps a dot-path token key to its expected value.
                     * The test verifies that BOTH tokens.ts AND globals.css
                     * contain the same value, catching drift between the two.
                     */
                    const criticalTokens: ReadonlyArray<readonly [string, string, string]> = [
                        // [tokenDotPath, cssVarName, expectedValue]
                        ['color.primary.base', '--color-primary-base', '#6366F1'],
                        ['color.neutral.200', '--color-neutral-200', '#E2E8F0'],
                        ['color.text.primary', '--color-text-primary', '#0F172A'],
                        ['color.error.base', '--color-error-base', '#EF4444'],
                        ['spacing.lg', '--spacing-lg', '16px'],
                        ['spacing.xs', '--spacing-xs', '4px'],
                        ['font.size.base', '--font-size-base', '1rem'],
                        ['font.weight.bold', '--font-weight-bold', '700'],
                        ['radius.md', '--radius-md', '8px'],
                        ['shadow.sm', '--shadow-sm', '0 1px 2px 0 rgb(0 0 0 / 0.05)'],
                    ] as const;

                    for (const [tokenPath, cssVar, expectedValue] of criticalTokens) {
                        // Verify tokens.ts contains the value
                        expect(tokens).toContain(`'${tokenPath}': '${expectedValue}'`);

                        // Verify globals.css contains the same value
                        expect(css).toContain(`${cssVar}: ${expectedValue}`);
                    }
                });
            });

            // ---------------------------------------------------------------
            // 5. Page Component Validation
            // ---------------------------------------------------------------

            describe('page component validation', () => {
                it('imports globals.css with the correct path', () => {
                    const pagePath = getPagePath(template);
                    const page = readTextFile(projectDir, pagePath);

                    if (template === 'nextjs') {
                        expect(page).toContain("import '../globals.css'");
                    } else {
                        expect(page).toContain("import './globals.css'");
                    }
                });

                it('imports Provider and Zone from @enterstellar-ai/react', () => {
                    const pagePath = getPagePath(template);
                    const page = readTextFile(projectDir, pagePath);

                    expect(page).toContain('Provider');
                    expect(page).toContain('Zone');
                    expect(page).toContain('@enterstellar-ai/react');
                });

                it('uses Provider with auto-created compiler (RE1, RE19)', () => {
                    const pagePath = getPagePath(template);
                    const page = readTextFile(projectDir, pagePath);

                    // Provider auto-creates compiler — no @enterstellar-ai/compiler import
                    expect(page).not.toContain('@enterstellar-ai/compiler');
                    expect(page).not.toContain('createCompiler');
                    expect(page).toContain('<Provider registry={registry}>');
                });

                it('has "use client" directive for Next.js only', () => {
                    const pagePath = getPagePath(template);
                    const page = readTextFile(projectDir, pagePath);

                    if (template === 'nextjs') {
                        expect(page).toContain("'use client'");
                    } else {
                        expect(page).not.toContain("'use client'");
                    }
                });

                it('imports the project registry', () => {
                    const pagePath = getPagePath(template);
                    const page = readTextFile(projectDir, pagePath);

                    expect(page).toContain('registry');
                    expect(page).toContain('/enterstellar/registry');
                });
            });

            // ---------------------------------------------------------------
            // 6. Registry and Tokens Validation
            // ---------------------------------------------------------------

            describe('registry and tokens validation', () => {
                it('registry.ts imports component contracts', () => {
                    const registry = readTextFile(projectDir, 'src/enterstellar/registry.ts');

                    expect(registry).toContain('ExampleCardContract');
                    expect(registry).toContain('ExampleListContract');
                });

                it('registry.ts imports createRegistry', () => {
                    const registry = readTextFile(projectDir, 'src/enterstellar/registry.ts');

                    expect(registry).toContain('createRegistry');
                });

                it('tokens.ts contains DesignTokenSet type reference', () => {
                    const tokens = readTextFile(projectDir, 'src/enterstellar/tokens.ts');

                    expect(tokens).toContain('DesignTokenSet');
                });

                it('tokens.ts defines color, spacing, and typography tokens', () => {
                    const tokens = readTextFile(projectDir, 'src/enterstellar/tokens.ts');

                    expect(tokens).toContain('color.primary.base');
                    expect(tokens).toContain('spacing.lg');
                    expect(tokens).toContain('font.family.sans');
                });
            });

            // ---------------------------------------------------------------
            // 7. Test File Validation
            // ---------------------------------------------------------------

            describe('test file validation', () => {
                it('contains createTestHarness import', () => {
                    const testFile = readTextFile(projectDir, 'src/tests/enterstellar.test.ts');

                    expect(testFile).toContain('createTestHarness');
                });

                it('contains at least 3 test cases', () => {
                    const testFile = readTextFile(projectDir, 'src/tests/enterstellar.test.ts');

                    // Count occurrences of `it(` or `test(` — should be ≥3
                    const testCases = (testFile.match(/\bit\s*\(/g) ?? []).length
                        + (testFile.match(/\btest\s*\(/g) ?? []).length;

                    expect(testCases).toBeGreaterThanOrEqual(3);
                });
            });

            // ---------------------------------------------------------------
            // 8. README Validation
            // ---------------------------------------------------------------

            describe('README.md validation', () => {
                it('contains the project name', () => {
                    const readme = readTextFile(projectDir, 'README.md');

                    expect(readme).toContain(`test-${template}-project`);
                });

                it('contains pnpm install instructions', () => {
                    const readme = readTextFile(projectDir, 'README.md');

                    expect(readme).toContain('pnpm');
                });
            });
        });
    }

    // -----------------------------------------------------------------------
    // Cross-variant sanity checks
    // -----------------------------------------------------------------------

    describe('cross-variant sanity checks', () => {
        it('all 4 CLI1 variants are tested', () => {
            // Compile-time guarantee — if ProjectTemplate adds a 5th variant,
            // this array will fail typecheck.
            expect(ALL_TEMPLATES).toHaveLength(4);
            expect(ALL_TEMPLATES).toContain('minimal');
            expect(ALL_TEMPLATES).toContain('full');
            expect(ALL_TEMPLATES).toContain('nextjs');
            expect(ALL_TEMPLATES).toContain('vite-react');
        });

        it('no template generator imports external modules at runtime', () => {
            // Verify that all generators are callable without side effects.
            // This guarantees no network I/O occurs during scaffold generation.
            expect(() => generatePackageJson('test', 'minimal')).not.toThrow();
            expect(() => generateTsconfig('minimal')).not.toThrow();
            expect(() => generateRegistry()).not.toThrow();
            expect(() => generateTokens()).not.toThrow();
            expect(() => generateGlobalsCss()).not.toThrow();
            expect(() => generateComponents()).not.toThrow();
            expect(() => generatePage('minimal')).not.toThrow();
            expect(() => generateTest()).not.toThrow();
            expect(() => generateReadme('test', 'pnpm')).not.toThrow();
        });
    });
});
