/**
 * @module @enterstellar-ai/contract-protocol/__tests__/conformance
 * @description Conformance suite self-consistency tests.
 *
 * Validates that the conformance suite is correct:
 * 1. All `valid/*.json` fixtures pass their corresponding schema via `ajv`.
 * 2. All `invalid/*.json` fixtures fail their corresponding schema via `ajv`.
 * 3. Every schema directory has at least one valid and one invalid fixture.
 *
 * Fixtures are discovered dynamically — adding new `.json` files to any
 * `valid/` or `invalid/` directory automatically includes them in the test run.
 *
 * @see Design Choice CP8 — conformance testing for non-TS environments.
 * @see Bible §4.14b
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to the `schemas/` directory. */
const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');

/** Absolute path to the `conformance/` directory. */
const CONFORMANCE_DIR = resolve(__dirname, '..', 'conformance');

/**
 * Schema names that have conformance fixtures.
 * Discovered dynamically from the `conformance/` directory.
 * Excludes non-directory entries (e.g., `README.md`).
 */
const SCHEMA_NAMES: readonly string[] = readdirSync(CONFORMANCE_DIR, {
    withFileTypes: true,
})
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates an Ajv instance configured identically to the CLI validator.
 *
 * @remarks
 * `strict: false` is required because Zod v4's `toJSONSchema()` output
 * uses keywords like `propertyNames` that trigger ajv strict-mode warnings
 * despite being valid Draft-07. See `bin/validate.ts` for full rationale.
 *
 * @returns A configured Ajv instance.
 */
function createValidator(): InstanceType<typeof Ajv.default> {
    return new Ajv.default({
        allErrors: true,
        strict: false,
        verbose: true,
    });
}

/**
 * Loads and parses a JSON file.
 *
 * @param filepath - Absolute path to the JSON file.
 * @returns The parsed JSON value.
 */
function loadJson(filepath: string): unknown {
    const raw = readFileSync(filepath, 'utf-8');
    return JSON.parse(raw) as unknown;
}

/**
 * Lists all `.json` files in a directory.
 *
 * @param dirPath - Absolute path to the directory.
 * @returns Array of filenames (e.g., `['minimal.json', 'full.json']`).
 *          Returns empty array if the directory does not exist.
 */
function listJsonFiles(dirPath: string): readonly string[] {
    if (!existsSync(dirPath)) {
        return [];
    }
    return readdirSync(dirPath).filter((f) => f.endsWith('.json'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Conformance Suite', () => {

    /**
     * Verify we discovered schema directories.
     * If this fails, the conformance suite structure is broken.
     */
    it('should discover at least 1 schema directory', () => {
        expect(SCHEMA_NAMES.length).toBeGreaterThan(0);
    });

    /**
     * Verify every known schema has both valid and invalid fixtures.
     * This prevents incomplete conformance coverage.
     */
    describe.each(SCHEMA_NAMES)('%s', (schemaName) => {
        const schemaFilePath = resolve(SCHEMAS_DIR, `${schemaName}.json`);
        const validDir = resolve(CONFORMANCE_DIR, schemaName, 'valid');
        const invalidDir = resolve(CONFORMANCE_DIR, schemaName, 'invalid');

        // -----------------------------------------------------------------------
        // Schema existence
        // -----------------------------------------------------------------------

        it('should have a corresponding schema file', () => {
            expect(existsSync(schemaFilePath)).toBe(true);
        });

        // -----------------------------------------------------------------------
        // Fixture coverage
        // -----------------------------------------------------------------------

        it('should have at least one valid fixture', () => {
            const validFiles = listJsonFiles(validDir);
            expect(validFiles.length).toBeGreaterThan(0);
        });

        it('should have at least one invalid fixture', () => {
            const invalidFiles = listJsonFiles(invalidDir);
            expect(invalidFiles.length).toBeGreaterThan(0);
        });

        // -----------------------------------------------------------------------
        // Valid fixtures
        // -----------------------------------------------------------------------

        const validFiles = listJsonFiles(validDir);

        if (validFiles.length > 0) {
            describe('valid/', () => {
                it.each(validFiles)('%s should pass schema validation', (filename) => {
                    // Create a fresh Ajv instance per test to avoid $id caching conflicts.
                    // Schemas have `$id` fields that ajv registers internally — a shared
                    // instance throws 'schema already exists' on the second compile().
                    const validator = createValidator();
                    const schema = loadJson(schemaFilePath);
                    const fixture = loadJson(resolve(validDir, filename));
                    const validate = validator.compile(schema as Record<string, unknown>);
                    const result = validate(fixture);

                    if (!result && validate.errors !== null && validate.errors !== undefined) {
                        // Print errors for debugging if a valid fixture unexpectedly fails.
                        const errorDetails = validate.errors
                            .map((e: { readonly instancePath: string; readonly message?: string }) => `  ${e.instancePath}: ${e.message ?? 'unknown'}`)
                            .join('\n');
                        throw new Error(
                            `Valid fixture '${filename}' failed validation:\n${errorDetails}`,
                        );
                    }

                    expect(result).toBe(true);
                });
            });
        }

        // -----------------------------------------------------------------------
        // Invalid fixtures
        // -----------------------------------------------------------------------

        const invalidFiles = listJsonFiles(invalidDir);

        if (invalidFiles.length > 0) {
            describe('invalid/', () => {
                it.each(invalidFiles)('%s should fail schema validation', (filename) => {
                    // Fresh Ajv instance per test — see valid/ block for rationale.
                    const validator = createValidator();
                    const schema = loadJson(schemaFilePath);
                    const fixture = loadJson(resolve(invalidDir, filename));
                    const validate = validator.compile(schema as Record<string, unknown>);
                    const result = validate(fixture);

                    expect(result).toBe(false);
                });
            });
        }
    });
});
