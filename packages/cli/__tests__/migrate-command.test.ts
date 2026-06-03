/**
 * @module @enterstellar-ai/cli/__tests__/migrate-command
 * @description Integration tests for the `enterstellar migrate` command handler.
 *
 * Tests the end-to-end flow: path args → pipeline → file output → exit codes.
 * Uses temporary project fixtures with real `.tsx` source files that
 * `extractManifest()` can parse via `ts-morph`.
 *
 * **Test isolation:** Each test creates its own temp directory, captures
 * `console.log`/`console.error`/`process.stdout.write`, and resets
 * `process.exitCode` after execution.
 *
 * @see Correction 5 — CLI Flag Reference (12 flags)
 * @see Implementation Plan §3 Component 4 — Migrate Command Orchestrator
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { migrateCommand } from '../src/commands/migrate.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createTempDir(prefix: string): string {
    const dir = join(tmpdir(), `enterstellar-migrate-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}

const tempDirs: string[] = [];

/**
 * Creates a temp project with `package.json` and source files.
 * Returns the project root path.
 */
function createTempProject(files: Record<string, string>): string {
    const root = createTempDir('cmd');
    tempDirs.push(root);

    writeFileSync(join(root, 'package.json'), '{}', 'utf-8');

    for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = join(root, relativePath);
        mkdirSync(join(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
    }

    return root;
}

/**
 * A minimal valid React component source that `extractManifest()` can parse.
 * Exports a named function component with typed props.
 */
const VALID_COMPONENT_SOURCE = `
import React from 'react';

interface ButtonProps {
    /** The label text for the button. */
    label: string;
    /** Whether the button is disabled. */
    disabled?: boolean;
    /** Click handler callback. */
    onClick?: () => void;
}

/**
 * A simple button component for testing the migration pipeline.
 */
export function Button({ label, disabled, onClick }: ButtonProps): React.ReactElement {
    return <button disabled={disabled} onClick={onClick}>{label}</button>;
}
`;

// ---------------------------------------------------------------------------
// Mocks & Lifecycle
// ---------------------------------------------------------------------------

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => { /* noop */ });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* noop */ });
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
});

afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    stdoutWriteSpy.mockRestore();
    process.exitCode = undefined;

    for (const dir of tempDirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
        } catch {
            // Best-effort cleanup.
        }
    }
    tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migrateCommand', () => {
    // --- Validation guards ---

    it('exits 1 with error message when no path args provided', async () => {
        await migrateCommand([], []);
        expect(process.exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalled();
        const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join(' ');
        expect(errorOutput).toContain('Missing path argument');
    });

    it('exits 1 when --update flag is used (Audit W3 stub)', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });
        await migrateCommand(
            [join(root, 'src')],
            [join(root, 'src'), '--update'],
        );
        expect(process.exitCode).toBe(1);
        const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join(' ');
        expect(errorOutput).toContain('--update is not yet implemented');
    });

    // --- Empty results ---

    it('handles empty file list gracefully (no error)', async () => {
        const root = createTempProject({});
        // Directory with no .tsx/.ts files.
        mkdirSync(join(root, 'empty'), { recursive: true });
        await migrateCommand(
            [join(root, 'empty')],
            [join(root, 'empty')],
        );
        expect(process.exitCode).toBeUndefined();
    });

    // --- Full pipeline: single component ---

    it('migrates a single valid component and writes contract + test files', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });

        await migrateCommand(
            [join(root, 'src', 'Button.tsx')],
            [join(root, 'src', 'Button.tsx')],
        );

        // Verify contract file was written.
        const contractPath = join(root, 'src', 'Button.contract.ts');
        expect(existsSync(contractPath)).toBe(true);

        const contractContent = readFileSync(contractPath, 'utf-8');
        expect(contractContent).toContain('@enterstellar-generated');
        expect(contractContent).toContain('Button');

        // Verify test file was written.
        const testPath = join(root, 'src', 'Button.test.ts');
        expect(existsSync(testPath)).toBe(true);

        // No error exit.
        expect(process.exitCode).toBeUndefined();
    });

    // --- --dry-run ---

    it('does not write files when --dry-run is specified', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });

        await migrateCommand(
            [join(root, 'src', 'Button.tsx')],
            [join(root, 'src', 'Button.tsx'), '--dry-run'],
        );

        const contractPath = join(root, 'src', 'Button.contract.ts');
        expect(existsSync(contractPath)).toBe(false);

        const testPath = join(root, 'src', 'Button.test.ts');
        expect(existsSync(testPath)).toBe(false);
    });

    // --- --format json ---

    it('outputs JSON to stdout when --format json is used', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });

        await migrateCommand(
            [join(root, 'src', 'Button.tsx')],
            [join(root, 'src', 'Button.tsx'), '--format', 'json'],
        );

        // stdout.write should have been called with JSON.
        expect(stdoutWriteSpy).toHaveBeenCalled();
        const jsonOutput = stdoutWriteSpy.mock.calls.map((c) => String(c[0])).join('');
        const parsed = JSON.parse(jsonOutput.trim()) as Record<string, unknown>;
        expect(parsed).toHaveProperty('totalFiles');
        expect(parsed).toHaveProperty('results');
    });

    // --- --strict ---

    it('does not set exitCode when --strict is used and no REVIEW outcomes', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });

        await migrateCommand(
            [join(root, 'src', 'Button.tsx')],
            [join(root, 'src', 'Button.tsx'), '--strict'],
        );

        // Button is a clean component — no REVIEW expected.
        expect(process.exitCode).toBeUndefined();
    });

    // --- --force ---

    it('regenerates contract when --force is used on existing @enterstellar-generated file', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });
        const contractPath = join(root, 'src', 'Button.contract.ts');

        // Create a pre-existing contract.
        writeFileSync(contractPath, '/** @enterstellar-generated */ // old content', 'utf-8');

        await migrateCommand(
            [join(root, 'src', 'Button.tsx')],
            [join(root, 'src', 'Button.tsx'), '--force'],
        );

        // Should have been overwritten with fresh content.
        const newContent = readFileSync(contractPath, 'utf-8');
        expect(newContent).not.toContain('// old content');
        expect(newContent).toContain('@enterstellar-generated');
    });

    // --- Existing contract skip (no --force) ---

    it('skips migration when existing @enterstellar-generated contract found (no --force)', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });
        const contractPath = join(root, 'src', 'Button.contract.ts');

        // Create a pre-existing contract.
        writeFileSync(contractPath, '/** @enterstellar-generated */ // old content', 'utf-8');

        await migrateCommand(
            [join(root, 'src', 'Button.tsx')],
            [join(root, 'src', 'Button.tsx')],
        );

        // Should NOT have been overwritten.
        const content = readFileSync(contractPath, 'utf-8');
        expect(content).toContain('// old content');
    });

    // --- --provider without --enrich ---

    it('prints warning when --provider is used without --enrich', async () => {
        const root = createTempProject({ 'src/Button.tsx': VALID_COMPONENT_SOURCE });

        await migrateCommand(
            [join(root, 'src', 'Button.tsx')],
            [join(root, 'src', 'Button.tsx'), '--provider', 'openai'],
        );

        const logOutput = logSpy.mock.calls.map((c) => String(c[0])).join(' ');
        expect(logOutput).toContain('--provider specified without --enrich');
    });

    // --- --out path mirroring ---

    it('mirrors source structure under --out directory', async () => {
        const root = createTempProject({
            'src/components/Button.tsx': VALID_COMPONENT_SOURCE,
        });
        const outDir = join(root, 'contracts');
        const srcDir = join(root, 'src', 'components');

        await migrateCommand(
            [srcDir],
            [srcDir, '--out', outDir],
        );

        // Contract should be written under the --out directory.
        expect(existsSync(outDir)).toBe(true);
        const contractPath = join(outDir, 'Button.contract.ts');
        expect(existsSync(contractPath)).toBe(true);
    });
});
