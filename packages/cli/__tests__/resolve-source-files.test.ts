/**
 * @module @enterstellar-ai/cli/__tests__/resolve-source-files
 * @description Tests for the file discovery engine and related utilities.
 *
 * Covers:
 * - `resolveSourceFiles()` — full discovery with 3-layer exclusion model
 * - `mergeExclusions()` — exclusion pattern merging
 * - `findProjectRoot()` — project root walk-up
 * - `loadEnterstellarIgnorePatterns()` — `.enterstellarignore` pattern parsing
 *
 * Uses temporary directories created in the OS tmp space for filesystem
 * tests. Each test creates its own isolated fixture and cleans up
 * via `afterEach`.
 *
 * @see Correction 6 — 3-layer exclusion model
 * @see Implementation Plan §3 Component 1 — File Discovery Utilities
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveSourceFiles, mergeExclusions } from '../src/migrate/resolve-source-files.js';
import {
    findProjectRoot,
    loadEnterstellarIgnorePatterns,
} from '../src/migrate/enterstellarignore.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Unique temp directory per test run to avoid collisions. */
function createTempDir(prefix: string): string {
    const dir = join(tmpdir(), `enterstellar-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

/** Tracks temp dirs for cleanup. */
const tempDirs: string[] = [];

afterEach(() => {
    for (const dir of tempDirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            // Best-effort cleanup.
        }
    }
    tempDirs.length = 0;
});

/**
 * Creates a temp project with a `package.json` and source files.
 * Returns the project root path.
 */
function createTempProject(files: Record<string, string>): string {
    const root = createTempDir('resolve');
    tempDirs.push(root);

    // Always create a package.json so findProjectRoot works.
    writeFileSync(join(root, 'package.json'), '{}', 'utf-8');

    for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = join(root, relativePath);
        mkdirSync(join(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
    }

    return root;
}

// ---------------------------------------------------------------------------
// findProjectRoot
// ---------------------------------------------------------------------------

describe('findProjectRoot', () => {
    it('finds package.json in the given directory', () => {
        const root = createTempProject({});
        expect(findProjectRoot(root)).toBe(root);
    });

    it('walks up to find package.json in a parent directory', () => {
        const root = createTempProject({ 'src/deep/file.ts': '' });
        const deepDir = join(root, 'src', 'deep');
        expect(findProjectRoot(deepDir)).toBe(root);
    });

    it('returns undefined when no package.json exists', () => {
        const dir = createTempDir('no-pkg');
        tempDirs.push(dir);
        // No package.json created — walk should reach filesystem root.
        // For safety, we only test that it returns undefined for a
        // directory we know has no package.json above it in the test tree.
        // Since tmpdir() may have a package.json above it, we test
        // with the root-level fallback.
        const result = findProjectRoot('/tmp/__nonexistent_enterstellar_test__');
        expect(result).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// loadEnterstellarIgnorePatterns
// ---------------------------------------------------------------------------

describe('loadEnterstellarIgnorePatterns', () => {
    it('returns patterns from .enterstellarignore at the project root', () => {
        const root = createTempProject({});
        writeFileSync(join(root, '.enterstellarignore'), '**/*.stories.tsx\n**/*.test.tsx\n', 'utf-8');

        const patterns = loadEnterstellarIgnorePatterns(root);
        expect(patterns).toEqual(['**/*.stories.tsx', '**/*.test.tsx']);
    });

    it('skips comment lines and blank lines', () => {
        const root = createTempProject({});
        writeFileSync(
            join(root, '.enterstellarignore'),
            '# This is a comment\n\n**/*.stories.tsx\n\n# Another comment\n**/*.test.tsx\n',
            'utf-8',
        );

        const patterns = loadEnterstellarIgnorePatterns(root);
        expect(patterns).toEqual(['**/*.stories.tsx', '**/*.test.tsx']);
    });

    it('returns empty array when no .enterstellarignore exists', () => {
        const root = createTempProject({});
        const patterns = loadEnterstellarIgnorePatterns(root);
        expect(patterns).toEqual([]);
    });

    it('returns empty array when no package.json exists', () => {
        const patterns = loadEnterstellarIgnorePatterns('/tmp/__nonexistent_enterstellar_test__');
        expect(patterns).toEqual([]);
    });

    it('trims whitespace from pattern lines', () => {
        const root = createTempProject({});
        writeFileSync(join(root, '.enterstellarignore'), '  **/*.stories.tsx  \n  **/*.test.tsx  \n', 'utf-8');

        const patterns = loadEnterstellarIgnorePatterns(root);
        expect(patterns).toEqual(['**/*.stories.tsx', '**/*.test.tsx']);
    });
});

// ---------------------------------------------------------------------------
// mergeExclusions
// ---------------------------------------------------------------------------

describe('mergeExclusions', () => {
    it('includes hardcoded exclusions (node_modules, .git, .enterstellar, .d.ts)', () => {
        const merged = mergeExclusions([], []);
        expect(merged).toContain('**/node_modules/**');
        expect(merged).toContain('**/.git/**');
        expect(merged).toContain('**/.enterstellar/**');
        expect(merged).toContain('**/*.d.ts');
    });

    it('appends enterstellarignore patterns after hardcoded', () => {
        const merged = mergeExclusions(['**/*.stories.tsx'], []);
        expect(merged).toContain('**/*.stories.tsx');
    });

    it('appends exclude flags after enterstellarignore', () => {
        const merged = mergeExclusions([], ['**/legacy/**']);
        expect(merged).toContain('**/legacy/**');
    });

    it('merges all three layers in order', () => {
        const merged = mergeExclusions(['**/*.stories.tsx'], ['**/legacy/**']);
        // Hardcoded first, then enterstellarignore, then exclude flags.
        const storyIdx = merged.indexOf('**/*.stories.tsx');
        const legacyIdx = merged.indexOf('**/legacy/**');
        expect(storyIdx).toBeLessThan(legacyIdx);
    });
});

// ---------------------------------------------------------------------------
// resolveSourceFiles
// ---------------------------------------------------------------------------

describe('resolveSourceFiles', () => {
    it('resolves a single file path', async () => {
        const root = createTempProject({ 'src/Button.tsx': 'export const Button = () => {};' });
        const filePath = join(root, 'src', 'Button.tsx');

        const { files, excludedCount } = await resolveSourceFiles([filePath], []);
        expect(files).toHaveLength(1);
        expect(files[0]).toBe(filePath);
        expect(excludedCount).toBe(0);
    });

    it('expands a directory to *.tsx and *.ts files', async () => {
        const root = createTempProject({
            'src/Button.tsx': 'export const Button = () => {};',
            'src/Card.tsx': 'export const Card = () => {};',
            'src/utils.ts': 'export const helper = () => {};',
            'src/readme.md': '# Readme',
        });

        const { files } = await resolveSourceFiles([join(root, 'src')], []);
        expect(files).toHaveLength(3); // .tsx + .ts only, not .md
    });

    it('excludes .d.ts files from directory expansion', async () => {
        const root = createTempProject({
            'src/Button.tsx': 'export const Button = () => {};',
            'src/types.d.ts': 'declare module "test"',
        });

        const { files } = await resolveSourceFiles([join(root, 'src')], []);
        expect(files).toHaveLength(1);
        expect(files[0]).toContain('Button.tsx');
    });

    it('deduplicates files from overlapping paths', async () => {
        const root = createTempProject({
            'src/Button.tsx': 'export const Button = () => {};',
        });
        const filePath = join(root, 'src', 'Button.tsx');

        // Pass both the file and its parent dir — should deduplicate.
        const { files } = await resolveSourceFiles(
            [filePath, join(root, 'src')],
            [],
        );
        expect(files).toHaveLength(1);
    });

    it('sorts files alphabetically', async () => {
        const root = createTempProject({
            'src/Zebra.tsx': '',
            'src/Apple.tsx': '',
            'src/Mango.tsx': '',
        });

        const { files } = await resolveSourceFiles([join(root, 'src')], []);
        const basenames = files.map((f) => f.split('/').pop());
        expect(basenames).toEqual(['Apple.tsx', 'Mango.tsx', 'Zebra.tsx']);
    });

    it('applies --exclude patterns (Layer 3)', async () => {
        const root = createTempProject({
            'src/Button.tsx': '',
            'src/Button.stories.tsx': '',
            'src/Card.tsx': '',
        });

        const { files } = await resolveSourceFiles(
            [join(root, 'src')],
            ['**/*.stories.tsx'],
        );
        expect(files).toHaveLength(2);
        // Note: excludedCount may be 0 because fast-glob filters during
        // discovery, so excluded files never enter totalDiscovered.
        // The key assertion is that the excluded file is NOT in the results.
        const basenames = files.map((f) => f.split('/').pop());
        expect(basenames).not.toContain('Button.stories.tsx');
    });

    it('returns empty files array for non-existent path', async () => {
        const { files } = await resolveSourceFiles(
            ['/tmp/__nonexistent_enterstellar_path__'],
            [],
        );
        expect(files).toHaveLength(0);
    });

    it('handles glob patterns directly', async () => {
        const root = createTempProject({
            'src/components/Button.tsx': '',
            'src/components/Card.tsx': '',
            'src/utils/helper.ts': '',
        });

        const { files } = await resolveSourceFiles(
            [`${root}/src/**/*.tsx`],
            [],
        );
        expect(files).toHaveLength(2);
    });
});
