/**
 * @module @enterstellar-ai/contract-protocol/__tests__/validate-cli
 * @description Tests for the CLI validator (`bin/validate.ts`).
 *
 * Validates the CLI's behavior for all exit code paths:
 * - **Exit 0** — valid input against a known schema.
 * - **Exit 1** — invalid input (validation errors printed).
 * - **Exit 2** — usage error (missing args, unknown schema, missing file).
 *
 * Uses `execSync` to invoke the CLI as a subprocess, capturing stdout/stderr
 * and verifying exit codes. This mirrors how CI pipelines and developers
 * actually use the tool.
 *
 * @see Design Choice CP8 — CLI validator for Node.js/CI environments.
 * @see `bin/validate.ts` — the CLI implementation under test.
 */

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Package root directory (for running the CLI script). */
const PACKAGE_ROOT = resolve(__dirname, '..');

/** The CLI command prefix (tsx + script path). */
const CLI_CMD = 'npx tsx bin/validate.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a CLI execution, including exit code and output streams.
 */
type CliResult = {
    /** Process exit code (0, 1, or 2). */
    readonly exitCode: number;
    /** Captured stdout content. */
    readonly stdout: string;
    /** Captured stderr content. */
    readonly stderr: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Executes the CLI validator and captures the result.
 *
 * Wraps `execSync` to handle both success and failure exit codes without
 * throwing. Returns a structured `CliResult` for assertion.
 *
 * @param args - CLI arguments (e.g., `'component-contract examples/file.json'`).
 * @returns The CLI execution result with exit code, stdout, and stderr.
 */
function runCli(args: string): CliResult {
    try {
        const stdout = execSync(`${CLI_CMD} ${args}`, {
            cwd: PACKAGE_ROOT,
            stdio: 'pipe',
            encoding: 'utf-8',
        });

        return {
            exitCode: 0,
            stdout,
            stderr: '',
        };
    } catch (error: unknown) {
        // `execSync` throws when exit code ≠ 0.
        // The thrown error has `status`, `stdout`, and `stderr` properties,
        // but TypeScript types it as `unknown`. We narrow carefully.
        if (
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            'stdout' in error &&
            'stderr' in error
        ) {
            const execError = error as {
                readonly status: number | null;
                readonly stdout: Buffer | string;
                readonly stderr: Buffer | string;
            };

            return {
                exitCode: execError.status ?? 1,
                stdout: String(execError.stdout),
                stderr: String(execError.stderr),
            };
        }

        // Unexpected error shape — re-throw for debugging.
        throw error;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CLI Validator (bin/validate.ts)', () => {
    // -------------------------------------------------------------------------
    // Exit 0 — valid input
    // -------------------------------------------------------------------------

    describe('Exit 0 — Valid Input', () => {
        it('should pass a valid conformance fixture', () => {
            const result = runCli(
                'component-intent conformance/component-intent/valid/minimal.json',
            );
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('PASS');
        });

        it('should pass a valid example file', () => {
            const result = runCli(
                'forge-signal examples/patient-vitals.signal.json',
            );
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('PASS');
        });

        it('should pass the full component-contract fixture', () => {
            const result = runCli(
                'component-contract conformance/component-contract/valid/full.json',
            );
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('PASS');
        });
    });

    // -------------------------------------------------------------------------
    // Exit 1 — invalid input (validation errors)
    // -------------------------------------------------------------------------

    describe('Exit 1 — Invalid Input', () => {
        it('should fail an invalid conformance fixture', () => {
            const result = runCli(
                'component-contract conformance/component-contract/invalid/missing-name.json',
            );
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('FAIL');
        });

        it('should print validation error details', () => {
            const result = runCli(
                'component-contract conformance/component-contract/invalid/missing-name.json',
            );
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('Validation errors');
        });

        it('should fail when confidence is out of range', () => {
            const result = runCli(
                'component-intent conformance/component-intent/invalid/confidence-out-of-range.json',
            );
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('FAIL');
        });

        it('should fail when enum value is invalid', () => {
            const result = runCli(
                'forge-signal conformance/forge-signal/invalid/invalid-category.json',
            );
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('FAIL');
        });
    });

    // -------------------------------------------------------------------------
    // Exit 2 — usage errors
    // -------------------------------------------------------------------------

    describe('Exit 2 — Usage Errors', () => {
        it('should exit 2 with no arguments', () => {
            const result = runCli('');
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain('Usage');
        });

        it('should exit 2 with only a schema name (no input file)', () => {
            const result = runCli('component-contract');
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain('Missing required arguments');
        });

        it('should exit 2 for an unknown schema name', () => {
            const result = runCli('nonexistent-schema some-file.json');
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain('Unknown schema');
            expect(result.stderr).toContain('nonexistent-schema');
        });

        it('should exit 2 for a missing input file', () => {
            const result = runCli('component-contract this-file-does-not-exist.json');
            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain('File not found');
        });

        it('should list available schemas in usage output', () => {
            const result = runCli('');
            expect(result.stderr).toContain('component-contract');
            expect(result.stderr).toContain('forge-signal');
            expect(result.stderr).toContain('zone-config');
        });
    });
});
