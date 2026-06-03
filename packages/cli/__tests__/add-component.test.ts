/**
 * @module @enterstellar-ai/cli/__tests__/add-component
 * @description Tests for the `enterstellar add component` command internals.
 *
 * Tests the non-interactive parts of the add component pipeline:
 * - Enterstellar project detection (package.json with @enterstellar-ai/registry)
 * - 4-file scaffold generation (contract, render, test, fixture)
 * - File skip-if-exists behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    mkdirSync,
    writeFileSync,
    rmSync,
    existsSync,
    readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { generateComponentScaffold } from '../src/templates/template-component-scaffold.js';
import { safeWriteFile } from '../src/utils/write-file.js';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(() => {
    testDir = join(tmpdir(), `enterstellar-cli-test-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Enterstellar Project Detection
// ---------------------------------------------------------------------------

describe('Enterstellar project detection', () => {
    it('identifies a project with @enterstellar-ai/registry in dependencies', () => {
        const pkg = {
            name: 'my-enterstellar-app',
            dependencies: { '@enterstellar-ai/registry': 'latest' },
        };
        writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));

        const raw = readFileSync(join(testDir, 'package.json'), 'utf-8');
        const parsed: unknown = JSON.parse(raw);

        expect(typeof parsed).toBe('object');
        expect(parsed).not.toBeNull();

        const pkgObj = parsed as Record<string, unknown>;
        const deps = pkgObj['dependencies'];
        expect(typeof deps).toBe('object');
        expect(deps).not.toBeNull();
        expect('@enterstellar-ai/registry' in (deps as Record<string, unknown>)).toBe(true);
    });

    it('identifies a project with @enterstellar-ai/registry in devDependencies', () => {
        const pkg = {
            name: 'my-enterstellar-app',
            devDependencies: { '@enterstellar-ai/registry': 'latest' },
        };
        writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));

        const raw = readFileSync(join(testDir, 'package.json'), 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        const pkgObj = parsed as Record<string, unknown>;
        const devDeps = pkgObj['devDependencies'];

        expect(typeof devDeps).toBe('object');
        expect(devDeps).not.toBeNull();
        expect('@enterstellar-ai/registry' in (devDeps as Record<string, unknown>)).toBe(true);
    });

    it('rejects a project without @enterstellar-ai/registry', () => {
        const pkg = {
            name: 'plain-app',
            dependencies: { 'react': '^19.0.0' },
        };
        writeFileSync(join(testDir, 'package.json'), JSON.stringify(pkg));

        const raw = readFileSync(join(testDir, 'package.json'), 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        const pkgObj = parsed as Record<string, unknown>;
        const deps = pkgObj['dependencies'];

        expect(typeof deps).toBe('object');
        expect(deps).not.toBeNull();
        expect('@enterstellar-ai/registry' in (deps as Record<string, unknown>)).toBe(false);
    });

    it('handles missing package.json gracefully', () => {
        expect(existsSync(join(testDir, 'package.json'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Component Scaffold Generation
// ---------------------------------------------------------------------------

describe('generateComponentScaffold', () => {
    it('generates exactly 4 files', () => {
        const files = generateComponentScaffold('PatientVitals');

        expect(files).toHaveLength(4);
    });

    it('generates files with correct names', () => {
        const files = generateComponentScaffold('PatientVitals');
        const filenames = files.map((f) => f.filename);

        expect(filenames).toContain('PatientVitals.contract.ts');
        expect(filenames).toContain('PatientVitals.tsx');
        expect(filenames).toContain('PatientVitals.test.ts');
        expect(filenames).toContain('PatientVitals.fixture.json');
    });

    it('embeds the component name in the contract file', () => {
        const files = generateComponentScaffold('Dashboard');
        const contract = files.find((f) => f.filename === 'Dashboard.contract.ts');

        expect(contract).toBeDefined();
        expect(contract?.content).toContain("name: 'Dashboard'");
        expect(contract?.content).toContain('DashboardProps');
        expect(contract?.content).toContain('DashboardContract');
        expect(contract?.content).toContain('defineComponent');
    });

    it('embeds the component name in the render file', () => {
        const files = generateComponentScaffold('Stats');
        const render = files.find((f) => f.filename === 'Stats.tsx');

        expect(render).toBeDefined();
        expect(render?.content).toContain('StatsRender');
        expect(render?.content).toContain('StatsPropsType');
        expect(render?.content).toContain('React.ReactElement');
    });

    it('embeds the component name in the test file', () => {
        const files = generateComponentScaffold('Metrics');
        const test = files.find((f) => f.filename === 'Metrics.test.ts');

        expect(test).toBeDefined();
        expect(test?.content).toContain("component: 'Metrics'");
        expect(test?.content).toContain("describe('Metrics'");
        expect(test?.content).toContain('createTestHarness');
    });

    it('generates valid JSON for the fixture file', () => {
        const files = generateComponentScaffold('Chart');
        const fixture = files.find((f) => f.filename === 'Chart.fixture.json');

        expect(fixture).toBeDefined();
        expect(() => JSON.parse(fixture?.content ?? '')).not.toThrow();

        const parsed: unknown = JSON.parse(fixture?.content ?? '{}');
        expect(typeof parsed).toBe('object');
        expect(parsed).not.toBeNull();

        const obj = parsed as Record<string, unknown>;
        expect(typeof obj['title']).toBe('string');
        expect(typeof obj['description']).toBe('string');
    });
});

// ---------------------------------------------------------------------------
// File Writing with Skip-If-Exists
// ---------------------------------------------------------------------------

describe('Component scaffold file writing', () => {
    it('writes all 4 files to the components directory', async () => {
        const componentsDir = join(testDir, 'src', 'enterstellar', 'components');
        const files = generateComponentScaffold('MyWidget');

        for (const { filename, content } of files) {
            await safeWriteFile(join(componentsDir, filename), content);
        }

        expect(existsSync(join(componentsDir, 'MyWidget.contract.ts'))).toBe(true);
        expect(existsSync(join(componentsDir, 'MyWidget.tsx'))).toBe(true);
        expect(existsSync(join(componentsDir, 'MyWidget.test.ts'))).toBe(true);
        expect(existsSync(join(componentsDir, 'MyWidget.fixture.json'))).toBe(true);
    });

    it('skips existing files without overwriting', async () => {
        const componentsDir = join(testDir, 'src', 'enterstellar', 'components');
        mkdirSync(componentsDir, { recursive: true });

        const existingContent = '// existing content\n';
        writeFileSync(join(componentsDir, 'MyWidget.contract.ts'), existingContent);

        const files = generateComponentScaffold('MyWidget');
        const contractFile = files.find((f) => f.filename === 'MyWidget.contract.ts');
        expect(contractFile).toBeDefined();

        const written = await safeWriteFile(
            join(componentsDir, 'MyWidget.contract.ts'),
            contractFile?.content ?? '',
        );

        expect(written).toBe(false);

        // Verify original content preserved
        const actual = readFileSync(join(componentsDir, 'MyWidget.contract.ts'), 'utf-8');
        expect(actual).toBe(existingContent);
    });
});
