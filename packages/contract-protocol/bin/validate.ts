#!/usr/bin/env tsx
/**
 * @module @enterstellar-ai/contract-protocol/bin/validate
 * @description CLI validator for Enterstellar contract protocol schemas.
 *
 * Validates a JSON file against an Enterstellar JSON Schema (Draft-07) using `ajv`.
 * Designed for TS teams and CI pipelines — works in any terminal without
 * color dependencies.
 *
 * **Usage:**
 * ```bash
 * npx @enterstellar-ai/contract-protocol validate <schema-name> <input-file>
 * ```
 *
 * **Exit codes:**
 * - `0` — Input is valid against the schema.
 * - `1` — Input is invalid (validation errors printed).
 * - `2` — Usage error (missing args, unknown schema, file not found, bad JSON).
 *
 * @see Design Choice CP8 — CLI validator for Node.js/CI environments.
 * @see Bible §4.14b
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv, { type ErrorObject } from 'ajv';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current directory of this script. */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to the `schemas/` directory (sibling to `bin/`). */
const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');

/**
 * Available schema names (derived from filenames in `schemas/`, minus `.json`).
 * Computed once at startup for the usage message.
 */
const AVAILABLE_SCHEMAS: readonly string[] = readdirSync(SCHEMAS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();

// ---------------------------------------------------------------------------
// Exit Codes
// ---------------------------------------------------------------------------

/** Exit code indicating the input is valid. */
const EXIT_VALID = 0;
/** Exit code indicating the input is invalid (validation errors). */
const EXIT_INVALID = 1;
/** Exit code indicating a usage error (bad args, missing file, etc.). */
const EXIT_USAGE_ERROR = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Prints usage information to stderr and exits with code 2.
 *
 * @param errorMessage - Optional error message to print before usage.
 */
function printUsageAndExit(errorMessage?: string): never {
    if (errorMessage !== undefined) {
        console.error(`Error: ${errorMessage}`);
        console.error('');
    }

    console.error('Usage: enterstellar-protocol-validate <schema-name> <input-file>');
    console.error('');
    console.error('Validates a JSON file against an Enterstellar contract protocol schema.');
    console.error('');
    console.error('Available schemas:');
    for (const name of AVAILABLE_SCHEMAS) {
        console.error(`  - ${name}`);
    }
    console.error('');
    console.error('Examples:');
    console.error('  enterstellar-protocol-validate component-contract my-contract.json');
    console.error('  enterstellar-protocol-validate forge-signal signal.json');

    process.exit(EXIT_USAGE_ERROR);
}

/**
 * Loads and parses a JSON file.
 *
 * @param filepath - Absolute path to the JSON file.
 * @returns The parsed JSON value.
 * @throws {Error} If the file cannot be read or contains invalid JSON.
 */
function loadJsonFile(filepath: string): unknown {
    const raw = readFileSync(filepath, 'utf-8');
    return JSON.parse(raw) as unknown;
}

/**
 * Creates an Ajv instance configured for JSON Schema Draft-07.
 *
 * @remarks
 * `strict: false` is required because Zod v4's `toJSONSchema()` output
 * uses keywords like `propertyNames` which trigger ajv's strict mode
 * warnings despite being valid Draft-07. This does NOT reduce validation
 * accuracy — it only suppresses ajv's opinionated warnings about keyword
 * usage patterns.
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
 * Formats ajv validation errors into human-readable output.
 *
 * @param errors - The ajv error array (never null when validation fails).
 * @returns Formatted error string with one line per error.
 */
function formatErrors(errors: readonly ErrorObject[]): string {
    return errors
        .map((err: ErrorObject, index: number) => {
            const path = err.instancePath !== '' ? err.instancePath : '(root)';
            const message = err.message ?? 'Unknown validation error';
            const params = JSON.stringify(err.params);
            return `  ${String(index + 1)}. ${path}: ${message} [${params}]`;
        })
        .join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Entry point for the CLI validator.
 *
 * Parses CLI arguments, loads the schema and input file, validates,
 * and exits with the appropriate code.
 */
function main(): void {
    // Parse CLI arguments.
    // argv[0] = node/tsx, argv[1] = this script, argv[2] = schema name, argv[3] = input file.
    const args = process.argv.slice(2);
    const schemaName: string | undefined = args[0];
    const inputPath: string | undefined = args[1];

    // Validate arguments.
    if (schemaName === undefined || inputPath === undefined) {
        printUsageAndExit('Missing required arguments.');
    }

    // Validate schema name.
    if (!AVAILABLE_SCHEMAS.includes(schemaName)) {
        printUsageAndExit(`Unknown schema: '${schemaName}'.`);
    }

    // Resolve file paths.
    const schemaFilePath = resolve(SCHEMAS_DIR, `${schemaName}.json`);
    const inputFilePath = resolve(process.cwd(), inputPath);

    // Validate input file exists.
    if (!existsSync(inputFilePath)) {
        printUsageAndExit(`File not found: '${inputPath}'.`);
    }

    // Load schema.
    let schema: unknown;
    try {
        schema = loadJsonFile(schemaFilePath);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to load schema '${schemaName}': ${message}`);
        process.exit(EXIT_USAGE_ERROR);
    }

    // Load input file.
    let input: unknown;
    try {
        input = loadJsonFile(inputFilePath);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to parse '${basename(inputPath)}': ${message}`);
        process.exit(EXIT_USAGE_ERROR);
    }

    // Validate.
    const ajv = createValidator();
    const validate = ajv.compile(schema as Record<string, unknown>);
    const valid = validate(input);

    if (valid) {
        console.log(`PASS: '${basename(inputPath)}' is valid against '${schemaName}'.`);
        process.exit(EXIT_VALID);
    } else {
        console.error(`FAIL: '${basename(inputPath)}' is invalid against '${schemaName}'.`);
        console.error('');
        console.error('Validation errors:');
        if (validate.errors !== null && validate.errors !== undefined) {
            console.error(formatErrors(validate.errors));
        }
        process.exit(EXIT_INVALID);
    }
}

main();
