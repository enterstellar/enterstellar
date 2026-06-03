/**
 * @module @enterstellar-ai/cli/__tests__/templates
 * @description Tests for all template generator functions.
 *
 * Verifies that each generator produces valid, well-formed output
 * with the expected content, deps, and structure.
 */

import { describe, it, expect } from 'vitest';

import { generatePackageJson } from '../src/templates/template-package-json.js';
import { generateTsconfig } from '../src/templates/template-tsconfig.js';
import { generateRegistry } from '../src/templates/template-registry.js';
import { generateTokens } from '../src/templates/template-tokens.js';
import { generateComponents } from '../src/templates/template-components.js';
import { generatePage, getPagePath } from '../src/templates/template-page.js';
import { generateTest } from '../src/templates/template-test.js';
import { generateReadme } from '../src/templates/template-readme.js';

// ---------------------------------------------------------------------------
// generatePackageJson
// ---------------------------------------------------------------------------

describe('generatePackageJson', () => {
    it('produces valid JSON', () => {
        const json = generatePackageJson('test-app', 'minimal');
        expect(() => JSON.parse(json)).not.toThrow();
    });

    it('sets the correct project name and version', () => {
        const json = generatePackageJson('my-enterstellar-app', 'minimal');
        const parsed = JSON.parse(json) as Record<string, unknown>;

        expect(parsed['name']).toBe('my-enterstellar-app');
        expect(parsed['version']).toBe('0.1.0');
        expect(parsed['type']).toBe('module');
    });

    it('includes core deps in minimal template', () => {
        const json = generatePackageJson('app', 'minimal');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const deps = parsed['dependencies'] as Record<string, unknown>;

        expect(deps['@enterstellar-ai/react']).toBeDefined();
        expect(deps['@enterstellar-ai/registry']).toBeDefined();
        expect(deps['zod']).toBeDefined();
        // Engine packages are transitive deps of @enterstellar-ai/react (RE19, CLI4)
        expect(deps['@enterstellar-ai/compiler']).toBeUndefined();
        expect(deps['@enterstellar-ai/state']).toBeUndefined();
        expect(deps['@enterstellar-ai/telemetry']).toBeUndefined();
    });

    it('includes DevTools in full template devDependencies', () => {
        const json = generatePackageJson('app', 'full');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const devDeps = parsed['devDependencies'] as Record<string, unknown>;

        expect(devDeps['@enterstellar-ai/devtools']).toBeDefined();
        expect(devDeps['@enterstellar-ai/test']).toBeDefined();
    });

    it('includes next in nextjs template dependencies', () => {
        const json = generatePackageJson('app', 'nextjs');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const deps = parsed['dependencies'] as Record<string, unknown>;

        expect(deps['next']).toBeDefined();
        expect(deps['react']).toBeDefined();
    });

    it('includes vite in vite-react devDependencies', () => {
        const json = generatePackageJson('app', 'vite-react');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const devDeps = parsed['devDependencies'] as Record<string, unknown>;

        expect(devDeps['vite']).toBeDefined();
        expect(devDeps['@vitejs/plugin-react']).toBeDefined();
    });

    it('has scripts for all templates', () => {
        const json = generatePackageJson('app', 'minimal');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const scripts = parsed['scripts'] as Record<string, unknown>;

        expect(scripts['test']).toBeDefined();
        expect(scripts['typecheck']).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// generateTsconfig
// ---------------------------------------------------------------------------

describe('generateTsconfig', () => {
    it('produces valid JSON', () => {
        const json = generateTsconfig('minimal');
        expect(() => JSON.parse(json)).not.toThrow();
    });

    it('includes all strict flags', () => {
        const json = generateTsconfig('minimal');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const opts = parsed['compilerOptions'] as Record<string, unknown>;

        expect(opts['strict']).toBe(true);
        expect(opts['strictNullChecks']).toBe(true);
        expect(opts['noImplicitAny']).toBe(true);
        expect(opts['noUncheckedIndexedAccess']).toBe(true);
        expect(opts['exactOptionalPropertyTypes']).toBe(true);
        expect(opts['useUnknownInCatchVariables']).toBe(true);
    });

    it('uses jsx: preserve for nextjs', () => {
        const json = generateTsconfig('nextjs');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const opts = parsed['compilerOptions'] as Record<string, unknown>;

        expect(opts['jsx']).toBe('preserve');
    });

    it('uses jsx: react-jsx for vite-react', () => {
        const json = generateTsconfig('vite-react');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const opts = parsed['compilerOptions'] as Record<string, unknown>;

        expect(opts['jsx']).toBe('react-jsx');
    });

    it('includes Next.js plugin for nextjs template', () => {
        const json = generateTsconfig('nextjs');
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const opts = parsed['compilerOptions'] as Record<string, unknown>;
        const plugins = opts['plugins'] as Array<Record<string, unknown>>;

        expect(plugins).toBeDefined();
        expect(plugins).toHaveLength(1);
        expect(plugins[0]?.['name']).toBe('next');
    });
});

// ---------------------------------------------------------------------------
// generateRegistry
// ---------------------------------------------------------------------------

describe('generateRegistry', () => {
    it('imports createRegistry', () => {
        const content = generateRegistry();
        expect(content).toContain("import { createRegistry } from '@enterstellar-ai/registry'");
    });

    it('imports all 5 example component contracts', () => {
        const content = generateRegistry();
        expect(content).toContain('ExampleCardContract');
        expect(content).toContain('ExampleListContract');
        expect(content).toContain('ExampleChartContract');
        expect(content).toContain('ExampleFormContract');
        expect(content).toContain('ExampleDetailContract');
    });

    it('exports the registry', () => {
        const content = generateRegistry();
        expect(content).toContain('export const registry');
    });

    it('imports design tokens', () => {
        const content = generateRegistry();
        expect(content).toContain('designTokens');
    });
});

// ---------------------------------------------------------------------------
// generateTokens
// ---------------------------------------------------------------------------

describe('generateTokens', () => {
    it('exports designTokens with DesignTokenSet type', () => {
        const content = generateTokens();
        expect(content).toContain('export const designTokens: DesignTokenSet');
    });

    it('includes color tokens', () => {
        const content = generateTokens();
        expect(content).toContain("'color.primary.base'");
        expect(content).toContain("'color.neutral.500'");
        expect(content).toContain("'color.error.base'");
    });

    it('includes spacing tokens', () => {
        const content = generateTokens();
        expect(content).toContain("'spacing.xs'");
        expect(content).toContain("'spacing.3xl'");
    });

    it('includes typography tokens', () => {
        const content = generateTokens();
        expect(content).toContain("'font.family.sans'");
        expect(content).toContain("'font.size.base'");
        expect(content).toContain("'font.weight.bold'");
    });

    it('includes radius and shadow tokens', () => {
        const content = generateTokens();
        expect(content).toContain("'radius.md'");
        expect(content).toContain("'shadow.lg'");
    });
});

// ---------------------------------------------------------------------------
// generateComponents
// ---------------------------------------------------------------------------

describe('generateComponents', () => {
    it('generates exactly 5 components', () => {
        const components = generateComponents();
        expect(components).toHaveLength(5);
    });

    it('generates correct filenames', () => {
        const components = generateComponents();
        const filenames = components.map((c) => c.filename);

        expect(filenames).toContain('ExampleCard.tsx');
        expect(filenames).toContain('ExampleList.tsx');
        expect(filenames).toContain('ExampleChart.tsx');
        expect(filenames).toContain('ExampleForm.tsx');
        expect(filenames).toContain('ExampleDetail.tsx');
    });

    it('each component imports defineComponent', () => {
        const components = generateComponents();
        for (const { content } of components) {
            expect(content).toContain('defineComponent');
        }
    });

    it('each component imports zod', () => {
        const components = generateComponents();
        for (const { content } of components) {
            expect(content).toContain("from 'zod'");
        }
    });

    it('each component has a Contract export', () => {
        const components = generateComponents();
        for (const { content, filename } of components) {
            const baseName = filename.replace('.tsx', '');
            expect(content).toContain(`${baseName}Contract`);
        }
    });
});

// ---------------------------------------------------------------------------
// generatePage
// ---------------------------------------------------------------------------

describe('generatePage', () => {
    it('includes use client for nextjs', () => {
        const content = generatePage('nextjs');
        expect(content).toContain("'use client'");
    });

    it('does not include use client for vite-react', () => {
        const content = generatePage('vite-react');
        expect(content).not.toContain("'use client'");
    });

    it('imports Provider and Zone', () => {
        const content = generatePage('minimal');
        expect(content).toContain('Provider');
        expect(content).toContain('Zone');
    });

    it('imports the registry', () => {
        const content = generatePage('minimal');
        expect(content).toContain('registry');
    });

    it('uses export default for nextjs', () => {
        const content = generatePage('nextjs');
        expect(content).toContain('export default function');
    });

    it('uses export (non-default) for vite-react', () => {
        const content = generatePage('vite-react');
        expect(content).toContain('export function App');
    });
});

// ---------------------------------------------------------------------------
// generateTest
// ---------------------------------------------------------------------------

describe('generateTest', () => {
    it('imports vitest describe/it/expect', () => {
        const content = generateTest();
        expect(content).toContain("from 'vitest'");
    });

    it('imports createTestHarness', () => {
        const content = generateTest();
        expect(content).toContain('createTestHarness');
    });

    it('has 3 test cases', () => {
        const content = generateTest();
        const itMatches = content.match(/\bit\(/g);

        expect(itMatches).not.toBeNull();
        expect(itMatches?.length).toBe(3);
    });

    it('tests resolution, pass, and fail scenarios', () => {
        const content = generateTest();
        expect(content).toContain('resolves');
        expect(content).toContain('valid props');
        expect(content).toContain('invalid props');
    });
});

// ---------------------------------------------------------------------------
// generateReadme
// ---------------------------------------------------------------------------

describe('generateReadme', () => {
    it('includes the project name as heading', () => {
        const content = generateReadme('my-enterstellar-app', 'pnpm');
        expect(content).toContain('# my-enterstellar-app');
    });

    it('uses pnpm commands for pnpm', () => {
        const content = generateReadme('app', 'pnpm');
        expect(content).toContain('pnpm install');
        expect(content).toContain('pnpm dev');
        expect(content).toContain('pnpm test');
    });

    it('uses npm run commands for npm', () => {
        const content = generateReadme('app', 'npm');
        expect(content).toContain('npm install');
        expect(content).toContain('npm run dev');
        expect(content).toContain('npm run test');
    });

    it('uses yarn commands for yarn', () => {
        const content = generateReadme('app', 'yarn');
        expect(content).toContain('yarn install');
        expect(content).toContain('yarn dev');
    });

    it('uses bun commands for bun', () => {
        const content = generateReadme('app', 'bun');
        expect(content).toContain('bun install');
        expect(content).toContain('bun run dev');
    });

    it('includes project structure tree', () => {
        const content = generateReadme('app', 'pnpm');
        expect(content).toContain('registry.ts');
        expect(content).toContain('tokens.ts');
        expect(content).toContain('components/');
    });

    it('includes enterstellar add component guidance', () => {
        const content = generateReadme('app', 'pnpm');
        expect(content).toContain('enterstellar');
        expect(content).toContain('add component');
    });
});
