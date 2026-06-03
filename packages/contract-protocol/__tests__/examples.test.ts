/**
 * @module @enterstellar-ai/contract-protocol/__tests__/examples
 * @description Example file validation tests.
 *
 * Validates that every example file in `examples/` passes its corresponding
 * JSON Schema. Uses filename conventions to determine the mapping:
 *
 * | Pattern | Schema |
 * |:---|:---|
 * | `*.contract.json` | `component-contract.json` |
 * | `*.intent.json` | `component-intent.json` |
 * | `*.signal.json` | `forge-signal.json` |
 * | `*.compilation-result.json` | `compilation-result.json` |
 * | `*.trace.json` | `agent-trace.json` |
 * | `*.user-signal.json` | `user-signal.json` |
 * | `zone-config.*.json` | `zone-config.json` |
 *
 * @see Design Choice CP6 — examples are standalone, clean JSON that pass validation.
 * @see Bible §4.14b
 */

import { readFileSync, readdirSync } from 'node:fs';
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

/** Absolute path to the `examples/` directory. */
const EXAMPLES_DIR = resolve(__dirname, '..', 'examples');

// ---------------------------------------------------------------------------
// Filename → Schema Mapping
// ---------------------------------------------------------------------------

/**
 * File suffix patterns mapped to their corresponding schema filenames.
 *
 * Patterns are tested in order — first match wins. More specific patterns
 * (e.g., `compilation-result.json`) appear before less specific ones
 * (e.g., `signal.json`) to prevent false matches.
 *
 * @remarks
 * This is intentionally an array of tuples (not a Map) to preserve
 * iteration order and enable pattern-based matching.
 */
const SUFFIX_TO_SCHEMA: ReadonlyArray<readonly [suffix: string, schemaFile: string]> = [
    ['.contract.json', 'component-contract.json'],
    ['.intent.json', 'component-intent.json'],
    ['.compilation-result.json', 'compilation-result.json'],
    ['.trace.json', 'agent-trace.json'],
    ['.user-signal.json', 'user-signal.json'],
    ['.signal.json', 'forge-signal.json'],
] as const;

/**
 * Prefix patterns for files that don't follow the suffix convention.
 * Tested only if no suffix pattern matches.
 */
const PREFIX_TO_SCHEMA: ReadonlyArray<readonly [prefix: string, schemaFile: string]> = [
    ['zone-config.', 'zone-config.json'],
] as const;

/**
 * Resolves an example filename to its corresponding schema filename.
 *
 * @param exampleFilename - The example filename (e.g., `'patient-vitals.contract.json'`).
 * @returns The schema filename (e.g., `'component-contract.json'`), or `undefined` if no match.
 */
function resolveSchemaForExample(exampleFilename: string): string | undefined {
    // Check suffix patterns first (most examples follow this convention).
    for (const [suffix, schemaFile] of SUFFIX_TO_SCHEMA) {
        if (exampleFilename.endsWith(suffix)) {
            return schemaFile;
        }
    }

    // Check prefix patterns for exceptions (e.g., zone-config.example.json).
    for (const [prefix, schemaFile] of PREFIX_TO_SCHEMA) {
        if (exampleFilename.startsWith(prefix)) {
            return schemaFile;
        }
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Creates an Ajv instance configured identically to the CLI validator.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** All example files in the `examples/` directory. */
const exampleFiles: readonly string[] = readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

describe('Example Files', () => {

    it('should discover at least 1 example file', () => {
        expect(exampleFiles.length).toBeGreaterThan(0);
    });

    describe.each(exampleFiles)('%s', (filename) => {
        it('should map to a known schema', () => {
            const schemaFile = resolveSchemaForExample(filename);
            expect(schemaFile).toBeDefined();
        });

        it('should pass schema validation', () => {
            const schemaFile = resolveSchemaForExample(filename);
            // Guard: skip validation if schema mapping is undefined (caught by previous test).
            if (schemaFile === undefined) {
                throw new Error(`No schema mapping for example file '${filename}'.`);
            }

            const schemaPath = resolve(SCHEMAS_DIR, schemaFile);
            const examplePath = resolve(EXAMPLES_DIR, filename);

            // Fresh Ajv instance per test — schemas have `$id` fields that ajv
            // registers internally, causing 'already exists' on shared instances.
            const validator = createValidator();
            const schema = loadJson(schemaPath);
            const example = loadJson(examplePath);
            const validate = validator.compile(schema as Record<string, unknown>);
            const result = validate(example);

            if (!result && validate.errors !== null && validate.errors !== undefined) {
                const errorDetails = validate.errors
                    .map((e: { readonly instancePath: string; readonly message?: string }) => `  ${e.instancePath}: ${e.message ?? 'unknown'}`)
                    .join('\n');
                throw new Error(
                    `Example '${filename}' failed against '${schemaFile}':\n${errorDetails}`,
                );
            }

            expect(result).toBe(true);
        });
    });
});

// ---------------------------------------------------------------------------
// Mapping Function Unit Tests
// ---------------------------------------------------------------------------

describe('resolveSchemaForExample', () => {
    it.each([
        ['patient-vitals.contract.json', 'component-contract.json'],
        ['patient-vitals.intent.json', 'component-intent.json'],
        ['patient-vitals.signal.json', 'forge-signal.json'],
        ['patient-vitals.compilation-result.json', 'compilation-result.json'],
        ['patient-vitals.trace.json', 'agent-trace.json'],
        ['patient-vitals.user-signal.json', 'user-signal.json'],
        ['zone-config.example.json', 'zone-config.json'],
    ])('maps %s → %s', (input, expected) => {
        expect(resolveSchemaForExample(input)).toBe(expected);
    });

    it('returns undefined for unrecognized filenames', () => {
        expect(resolveSchemaForExample('random-file.json')).toBeUndefined();
    });
});
