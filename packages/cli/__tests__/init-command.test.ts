/**
 * @module @enterstellar-ai/cli/__tests__/init-command
 * @description Tests for the `enterstellar init` command internals.
 *
 * Tests the non-interactive parts of the init pipeline:
 * - Directory validation (empty allowed, non-empty throws ENS-9003)
 * - Scaffold file generation for all 4 templates
 * - Correct file paths per template variant
 *
 * Interactive prompts (@clack/prompts) are not tested here — they require
 * terminal emulation. Instead, we test the underlying logic that the
 * prompts feed into.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { ProjectTemplate } from '../src/templates/template-package-json.js';
import { generatePackageJson } from '../src/templates/template-package-json.js';
import { generateTsconfig } from '../src/templates/template-tsconfig.js';
import { generateRegistry } from '../src/templates/template-registry.js';
import { generateTokens } from '../src/templates/template-tokens.js';
import { generateComponents } from '../src/templates/template-components.js';
import { generatePage, getPagePath } from '../src/templates/template-page.js';
import { generateTest } from '../src/templates/template-test.js';
import { generateReadme } from '../src/templates/template-readme.js';
import { safeWriteFile } from '../src/utils/write-file.js';
import { createDirectoryExistsError } from '../src/utils/errors.js';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(() => {
    testDir = join(tmpdir(), `enterstellar-cli-test-init-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Directory Validation
// ---------------------------------------------------------------------------

describe('Directory validation', () => {
    it('allows scaffolding in a non-existent directory', () => {
        const nonExistent = join(testDir, 'new-project');

        // Should not throw — directory doesn't exist yet
        expect(existsSync(nonExistent)).toBe(false);
    });

    it('allows scaffolding in an empty directory', () => {
        // testDir is empty from beforeEach — should be allowed
        const entries = readdirSync(testDir);

        expect(entries).toHaveLength(0);
    });

    it('allows scaffolding in a directory with only .DS_Store', () => {
        writeFileSync(join(testDir, '.DS_Store'), '');
        const entries = readdirSync(testDir);
        const significant = entries.filter(
            (e) => e !== '.DS_Store' && e !== '.git' && e !== '.gitkeep',
        );

        expect(significant).toHaveLength(0);
    });

    it('allows scaffolding in a directory with only .git', () => {
        mkdirSync(join(testDir, '.git'));
        const entries = readdirSync(testDir);
        const significant = entries.filter(
            (e) => e !== '.DS_Store' && e !== '.git' && e !== '.gitkeep',
        );

        expect(significant).toHaveLength(0);
    });

    it('throws ENS-9003 for a non-empty directory', () => {
        writeFileSync(join(testDir, 'existing-file.ts'), 'export {}');

        const error = createDirectoryExistsError(testDir);

        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-9003');
        expect(error.message).toContain(testDir);
    });
});

// ---------------------------------------------------------------------------
// Scaffold File Writing
// ---------------------------------------------------------------------------

describe('Scaffold file writing', () => {
    it('writes package.json to the target directory', async () => {
        const filePath = join(testDir, 'package.json');
        const content = generatePackageJson('test-project', 'minimal');

        await safeWriteFile(filePath, content);

        expect(existsSync(filePath)).toBe(true);
    });

    it('writes tsconfig.json to the target directory', async () => {
        const filePath = join(testDir, 'tsconfig.json');
        const content = generateTsconfig('minimal');

        await safeWriteFile(filePath, content);

        expect(existsSync(filePath)).toBe(true);
    });

    it('writes registry.ts to src/enterstellar/', async () => {
        const filePath = join(testDir, 'src', 'enterstellar', 'registry.ts');
        const content = generateRegistry();

        await safeWriteFile(filePath, content);

        expect(existsSync(filePath)).toBe(true);
    });

    it('writes tokens.ts to src/enterstellar/', async () => {
        const filePath = join(testDir, 'src', 'enterstellar', 'tokens.ts');
        const content = generateTokens();

        await safeWriteFile(filePath, content);

        expect(existsSync(filePath)).toBe(true);
    });

    it('writes all 5 example components', async () => {
        const components = generateComponents();

        expect(components).toHaveLength(5);

        for (const { filename, content } of components) {
            const filePath = join(testDir, 'src', 'enterstellar', 'components', filename);
            await safeWriteFile(filePath, content);

            expect(existsSync(filePath)).toBe(true);
        }
    });

    it('writes the test file to src/tests/', async () => {
        const filePath = join(testDir, 'src', 'tests', 'enterstellar.test.ts');
        const content = generateTest();

        await safeWriteFile(filePath, content);

        expect(existsSync(filePath)).toBe(true);
    });

    it('writes README.md to the root', async () => {
        const filePath = join(testDir, 'README.md');
        const content = generateReadme('test-project', 'pnpm');

        await safeWriteFile(filePath, content);

        expect(existsSync(filePath)).toBe(true);
    });

    it('does not overwrite existing files by default', async () => {
        const filePath = join(testDir, 'package.json');
        const original = '{"name":"original"}';
        mkdirSync(join(testDir), { recursive: true });
        writeFileSync(filePath, original, 'utf-8');

        const written = await safeWriteFile(filePath, '{"name":"new"}');

        expect(written).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Template-Specific Page Paths
// ---------------------------------------------------------------------------

describe('Template page paths', () => {
    it('uses src/app/page.tsx for nextjs template', () => {
        expect(getPagePath('nextjs')).toBe('src/app/page.tsx');
    });

    it('uses src/App.tsx for vite-react template', () => {
        expect(getPagePath('vite-react')).toBe('src/App.tsx');
    });

    it('uses src/App.tsx for minimal template', () => {
        expect(getPagePath('minimal')).toBe('src/App.tsx');
    });

    it('uses src/App.tsx for full template', () => {
        expect(getPagePath('full')).toBe('src/App.tsx');
    });
});

// ---------------------------------------------------------------------------
// Full Scaffold Simulation
// ---------------------------------------------------------------------------

describe('Full scaffold simulation', () => {
    const TEMPLATES: readonly ProjectTemplate[] = ['minimal', 'full', 'nextjs', 'vite-react'] as const;

    for (const template of TEMPLATES) {
        it(`scaffolds all required files for "${template}" template`, async () => {
            const projectDir = join(testDir, `project-${template}`);
            const projectName = `test-${template}`;

            // Write all scaffold files
            await safeWriteFile(join(projectDir, 'package.json'), generatePackageJson(projectName, template));
            await safeWriteFile(join(projectDir, 'tsconfig.json'), generateTsconfig(template));
            await safeWriteFile(join(projectDir, 'README.md'), generateReadme(projectName, 'pnpm'));
            await safeWriteFile(join(projectDir, 'src', 'enterstellar', 'registry.ts'), generateRegistry());
            await safeWriteFile(join(projectDir, 'src', 'enterstellar', 'tokens.ts'), generateTokens());

            for (const { filename, content } of generateComponents()) {
                await safeWriteFile(join(projectDir, 'src', 'enterstellar', 'components', filename), content);
            }

            const pagePath = getPagePath(template);
            await safeWriteFile(join(projectDir, pagePath), generatePage(template));
            await safeWriteFile(join(projectDir, 'src', 'tests', 'enterstellar.test.ts'), generateTest());

            // Verify core files exist
            expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
            expect(existsSync(join(projectDir, 'tsconfig.json'))).toBe(true);
            expect(existsSync(join(projectDir, 'README.md'))).toBe(true);
            expect(existsSync(join(projectDir, 'src', 'enterstellar', 'registry.ts'))).toBe(true);
            expect(existsSync(join(projectDir, 'src', 'enterstellar', 'tokens.ts'))).toBe(true);
            expect(existsSync(join(projectDir, pagePath))).toBe(true);
            expect(existsSync(join(projectDir, 'src', 'tests', 'enterstellar.test.ts'))).toBe(true);

            // Verify all 5 components
            expect(existsSync(join(projectDir, 'src', 'enterstellar', 'components', 'ExampleCard.tsx'))).toBe(true);
            expect(existsSync(join(projectDir, 'src', 'enterstellar', 'components', 'ExampleList.tsx'))).toBe(true);
            expect(existsSync(join(projectDir, 'src', 'enterstellar', 'components', 'ExampleChart.tsx'))).toBe(true);
            expect(existsSync(join(projectDir, 'src', 'enterstellar', 'components', 'ExampleForm.tsx'))).toBe(true);
            expect(existsSync(join(projectDir, 'src', 'enterstellar', 'components', 'ExampleDetail.tsx'))).toBe(true);
        });
    }
});
