/**
 * @module @enterstellar-ai/cli/__tests__/review-command
 * @description Integration tests for the `enterstellar review` command handler.
 *
 * Tests the end-to-end flow: fixture `.contract.ts` files → annotation
 * parsing → text/JSON output → `--fix` stub.
 *
 * **Test isolation:** Each test creates its own temp directory with fixture
 * contract files, captures `console.log`/`process.stdout.write`, and cleans
 * up after execution.
 *
 * @see Correction 1 — `enterstellar review` companion command spec
 * @see Audit E2 — locked `reviewCommand` signature
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { reviewCommand } from '../src/commands/review.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createTempDir(prefix: string): string {
    const dir = join(
        tmpdir(),
        `enterstellar-review-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    return dir;
}

const tempDirs: string[] = [];

/**
 * Creates a temp project with fixture `.contract.ts` files.
 * Returns the project root path.
 */
function createFixtureProject(files: Record<string, string>): string {
    const root = createTempDir('review');
    tempDirs.push(root);

    for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = join(root, relativePath);
        mkdirSync(join(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
    }

    return root;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Contract file with @enterstellar-review annotation. */
const CONTRACT_WITH_REVIEW = `/**
 * @enterstellar-generated
 * @component DataTable
 * @outcome review
 */
export const DataTableContract = {
    name: 'DataTable',
    // @enterstellar-review: rule=GENERIC_TYPE field=props.data reason="z.array(z.record(z.unknown())) — replace with concrete schema"
    props: {},
};
`;

/** Contract file with @enterstellar-warn annotation. */
const CONTRACT_WITH_WARN = `/**
 * @enterstellar-generated
 * @component Card
 * @outcome warn
 */
export const CardContract = {
    name: 'Card',
    // @enterstellar-warn: field=description reason="Description derived from heuristics. Review and refine."
    description: 'A card.',
};
`;

/** Clean contract with no annotations. */
const CLEAN_CONTRACT = `/**
 * @enterstellar-generated
 * @component Button
 * @outcome clean
 */
export const ButtonContract = {
    name: 'Button',
    description: 'A button.',
};
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
});

afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    stdoutWriteSpy.mockRestore();

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

describe('reviewCommand', () => {
    it('prints text output listing annotations from fixture files', async () => {
        const root = createFixtureProject({
            'src/DataTable.contract.ts': CONTRACT_WITH_REVIEW,
            'src/Card.contract.ts': CONTRACT_WITH_WARN,
        });

        await reviewCommand([root], [root]);

        // Text output goes to console.log.
        expect(logSpy).toHaveBeenCalled();
        const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');

        // Should list both annotations.
        expect(output).toContain('annotations');
        expect(output).toContain('GENERIC_TYPE');
        expect(output).toContain('description');
    });

    it('outputs valid JSON when --json flag is used', async () => {
        const root = createFixtureProject({
            'src/DataTable.contract.ts': CONTRACT_WITH_REVIEW,
            'src/Card.contract.ts': CONTRACT_WITH_WARN,
        });

        await reviewCommand([root], [root, '--json']);

        // JSON output goes to process.stdout.write.
        expect(stdoutWriteSpy).toHaveBeenCalled();
        const jsonOutput = stdoutWriteSpy.mock.calls
            .map((c) => String(c[0]))
            .join('');

        // Must be valid JSON.
        const parsed = JSON.parse(jsonOutput.trim()) as Record<string, unknown>;
        expect(parsed).toHaveProperty('totalAnnotations');
        expect(parsed).toHaveProperty('totalFiles');
        expect(parsed).toHaveProperty('files');

        // Should have exactly 2 annotated files.
        expect(parsed['totalAnnotations']).toBe(2);
        expect(parsed['totalFiles']).toBe(2);
    });

    it('prints stub message for --fix flag and returns early', async () => {
        const root = createFixtureProject({
            'src/DataTable.contract.ts': CONTRACT_WITH_REVIEW,
        });

        await reviewCommand([root], [root, '--fix']);

        expect(logSpy).toHaveBeenCalled();
        const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(output).toContain('not yet implemented');
        expect(output).toContain('v2');
    });

    it('handles directories with no .contract.ts files gracefully', async () => {
        const root = createFixtureProject({
            'src/utils.ts': 'export const add = (a: number, b: number) => a + b;',
        });

        await reviewCommand([root], [root]);

        expect(logSpy).toHaveBeenCalled();
        const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(output).toContain('No .contract.ts files found');
    });

    it('filters out clean contract files (zero annotations) from output', async () => {
        const root = createFixtureProject({
            'src/Button.contract.ts': CLEAN_CONTRACT,
            'src/Card.contract.ts': CONTRACT_WITH_WARN,
        });

        await reviewCommand([root], [root, '--json']);

        const jsonOutput = stdoutWriteSpy.mock.calls
            .map((c) => String(c[0]))
            .join('');
        const parsed = JSON.parse(jsonOutput.trim()) as Record<string, unknown>;

        // Only Card should appear (Button has no annotations).
        expect(parsed['totalFiles']).toBe(1);
        expect(parsed['totalAnnotations']).toBe(1);
    });
});
