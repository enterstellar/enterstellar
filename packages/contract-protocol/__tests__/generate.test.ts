/**
 * @module @enterstellar-ai/contract-protocol/__tests__/generate
 * @description Tests for the schema generator (`scripts/generate.ts`).
 *
 * Validates the generator's output against the contract protocol requirements:
 * 1. **Schema output validity** — each `.json` file is valid JSON Schema Draft-07.
 * 2. **Schema count** — exactly 7 auto-generated + 1 hand-crafted = 8 total.
 * 3. **Draft-07 compliance** — `$schema` field matches Draft-07 URI on all schemas.
 * 4. **Relative `$id`** — no absolute URIs in any schema (CP7 — permanently).
 * 5. **Deterministic output** — running generate twice produces identical content.
 * 6. **Required metadata** — `title` and `description` present on auto-generated schemas.
 *
 * @see Design Choices CP1–CP3, CP7
 * @see Bible §4.14b
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to the `schemas/` directory. */
const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');

/** Package root directory (for running the generate script). */
const PACKAGE_ROOT = resolve(__dirname, '..');

/** JSON Schema Draft-07 `$schema` URI. */
const DRAFT_07_URI = 'http://json-schema.org/draft-07/schema#';

/**
 * The hand-crafted schema filename that is NOT auto-generated.
 * This file is validated for existence but not for auto-generation metadata.
 */
const HAND_CRAFTED_SCHEMA = 'design-tokens-dtcg.json';

/**
 * Auto-generated schema filenames produced by `scripts/generate.ts`.
 * These are the 7 schemas derived from `@enterstellar-ai/types` Zod schemas.
 */
const AUTO_GENERATED_SCHEMAS: readonly string[] = [
    'component-contract.json',
    'component-intent.json',
    'compilation-result.json',
    'agent-trace.json',
    'forge-signal.json',
    'user-signal.json',
    'zone-config.json',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Loads and parses a JSON file from the `schemas/` directory.
 *
 * @param filename - The schema filename (e.g., `'component-contract.json'`).
 * @returns The parsed JSON as a `Record<string, unknown>`.
 */
function loadSchema(filename: string): Record<string, unknown> {
    const filepath = resolve(SCHEMAS_DIR, filename);
    const raw = readFileSync(filepath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Reads the raw content of a schema file for byte-level comparison.
 *
 * @param filename - The schema filename.
 * @returns The raw file content as a string.
 */
function readSchemaRaw(filename: string): string {
    return readFileSync(resolve(SCHEMAS_DIR, filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Schema Generator', () => {
    // -------------------------------------------------------------------------
    // Schema count
    // -------------------------------------------------------------------------

    describe('Schema Count', () => {
        it('should have exactly 8 JSON schemas in schemas/', () => {
            const jsonFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json'));
            expect(jsonFiles).toHaveLength(8);
        });

        it('should have all 7 auto-generated schemas', () => {
            for (const filename of AUTO_GENERATED_SCHEMAS) {
                const filepath = resolve(SCHEMAS_DIR, filename);
                expect(existsSync(filepath)).toBe(true);
            }
        });

        it('should have the hand-crafted DTCG schema', () => {
            const filepath = resolve(SCHEMAS_DIR, HAND_CRAFTED_SCHEMA);
            expect(existsSync(filepath)).toBe(true);
        });
    });

    // -------------------------------------------------------------------------
    // Draft-07 compliance
    // -------------------------------------------------------------------------

    describe('Draft-07 Compliance', () => {
        const allSchemaFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json'));

        it.each(allSchemaFiles)('%s should have $schema set to Draft-07 URI', (filename) => {
            const schema = loadSchema(filename);
            expect(schema['$schema']).toBe(DRAFT_07_URI);
        });

        it.each(allSchemaFiles)('%s should be a valid JSON object with "type"', (filename) => {
            const schema = loadSchema(filename);
            expect(typeof schema).toBe('object');
            expect(schema).not.toBeNull();
            // Every Enterstellar schema defines a top-level type.
            expect(schema['type']).toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // Relative $id (CP7)
    // -------------------------------------------------------------------------

    describe('Relative $id (CP7)', () => {
        const allSchemaFiles = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json'));

        it.each(allSchemaFiles)('%s should have a relative $id starting with "./"', (filename) => {
            const schema = loadSchema(filename);
            const id = schema['$id'];
            expect(typeof id).toBe('string');
            expect(id as string).toMatch(/^\.\//);
        });

        it.each(allSchemaFiles)('%s should NOT contain absolute URIs in $id', (filename) => {
            const schema = loadSchema(filename);
            const id = schema['$id'];
            expect(typeof id).toBe('string');
            expect(id as string).not.toContain('://');
        });
    });

    // -------------------------------------------------------------------------
    // Auto-generated schema metadata
    // -------------------------------------------------------------------------

    describe('Auto-Generated Schema Metadata', () => {
        it.each(AUTO_GENERATED_SCHEMAS)(
            '%s should have title and description',
            (filename) => {
                const schema = loadSchema(filename);

                expect(schema['title']).toBeDefined();
                expect(typeof schema['title']).toBe('string');
                expect((schema['title'] as string).length).toBeGreaterThan(0);

                expect(schema['description']).toBeDefined();
                expect(typeof schema['description']).toBe('string');
                expect((schema['description'] as string).length).toBeGreaterThan(0);
            },
        );

        it.each(AUTO_GENERATED_SCHEMAS)(
            '%s $id should match "./{filename}"',
            (filename) => {
                const schema = loadSchema(filename);
                expect(schema['$id']).toBe(`./${filename}`);
            },
        );
    });

    // -------------------------------------------------------------------------
    // Deterministic output
    // -------------------------------------------------------------------------

    describe('Deterministic Output', () => {
        it('should produce identical schemas when run twice', () => {
            // Capture current schema content.
            const contentBefore = new Map<string, string>();
            for (const filename of AUTO_GENERATED_SCHEMAS) {
                contentBefore.set(filename, readSchemaRaw(filename));
            }

            // Re-run the generator.
            execSync('npx tsx scripts/generate.ts', {
                cwd: PACKAGE_ROOT,
                stdio: 'pipe',
            });

            // Compare: content must be byte-identical.
            for (const filename of AUTO_GENERATED_SCHEMAS) {
                const contentAfter = readSchemaRaw(filename);
                const before = contentBefore.get(filename);
                expect(contentAfter).toBe(before);
            }
        });
    });
});
