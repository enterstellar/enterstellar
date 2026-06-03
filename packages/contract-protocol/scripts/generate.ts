#!/usr/bin/env tsx
/**
 * @module @enterstellar-ai/contract-protocol/scripts/generate
 * @description Schema Generator — transforms canonical Zod schemas from `@enterstellar-ai/types`
 * into JSON Schema (Draft-07) files.
 *
 * This is the single source of truth for schema generation. It imports every
 * public Zod schema from `@enterstellar-ai/types`, calls `z.toJSONSchema()` with
 * `target: 'draft-07'` (CP2), and writes the output to `schemas/`.
 *
 * **Design choices enforced:**
 * - CP1: Automated generation via Zod v4 `.toJSONSchema()`
 * - CP2: Draft-07 target for maximum cross-language compatibility
 * - CP3: Output is committed to git; CI drift guard verifies sync
 * - CP7: Relative `$id` references only (airgap-compatible)
 * - CP9: `design-tokens-dtcg.json` is hand-crafted, NOT generated here
 *
 * @example
 * ```bash
 * pnpm --filter @enterstellar-ai/contract-protocol run generate
 * ```
 *
 * @see Design Choices CP1–CP10 in `04-enterstellar-design-choices.md`
 * @see Bible §4.14b
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import {
    ComponentContractSchema,
    ComponentIntentSchema,
    CompilationResultSchema,
    AgentTraceSchema,
    ForgeSignalSchema,
    UserSignalSchema,
    ZoneConfigSchema,
} from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current directory of this script. */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to the `schemas/` output directory. */
const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas');

/** The hand-crafted DTCG token schema filename (CP9 — not auto-generated). */
const DTCG_SCHEMA_FILENAME = 'design-tokens-dtcg.json';

/**
 * JSON Schema Draft-07 target identifier for Zod v4's `toJSONSchema()`.
 *
 * @see CP2 — Draft-07 locked for maximum cross-language tooling compatibility.
 */
const JSON_SCHEMA_TARGET = 'draft-07' as const;

// ---------------------------------------------------------------------------
// Schema Map
// ---------------------------------------------------------------------------

/**
 * Mapping of canonical Zod schemas to their output filenames.
 *
 * Each entry produces one JSON Schema file in `schemas/`.
 * The order is deterministic (object key order is insertion order in ES2015+).
 *
 * @remarks
 * - `design-tokens-dtcg.json` is intentionally absent — it is hand-crafted (CP9).
 * - All 7 schemas here are mechanically derived from `@enterstellar-ai/types` Zod schemas.
 */
const SCHEMA_MAP: ReadonlyArray<{
    /** Zod schema instance from `@enterstellar-ai/types`. */
    readonly schema: z.ZodType;
    /** Output filename (written to `schemas/`). */
    readonly filename: string;
    /** Human-readable title for the JSON Schema `title` field. */
    readonly title: string;
    /** Description for the JSON Schema `description` field. */
    readonly description: string;
}> = [
    {
        schema: ComponentContractSchema,
        filename: 'component-contract.json',
        title: 'Enterstellar ComponentContract',
        description:
            'The canonical data shape for a registered Enterstellar component. Defines schema, metadata, accessibility, design tokens, and lifecycle states.',
    },
    {
        schema: ComponentIntentSchema,
        filename: 'component-intent.json',
        title: 'Enterstellar ComponentIntent',
        description:
            'The normalized message from an AI agent to the Enterstellar rendering pipeline. Produced by the normalizer from any supported protocol.',
    },
    {
        schema: CompilationResultSchema,
        filename: 'compilation-result.json',
        title: 'Enterstellar CompilationResult',
        description:
            'The output of the Enterstellar UI Compiler after validating a ComponentIntent against its ComponentContract.',
    },
    {
        schema: AgentTraceSchema,
        filename: 'agent-trace.json',
        title: 'Enterstellar AgentTrace',
        description:
            'The complete observability record for a single Enterstellar pipeline execution. Powers DevTools timeline, validation log, and performance profiler.',
    },
    {
        schema: ForgeSignalSchema,
        filename: 'forge-signal.json',
        title: 'Enterstellar ForgeSignal',
        description:
            'The mandatory telemetry payload emitted after every Enterstellar compilation. Zero PII. Feeds the ForgeSignal Corpus (M2), Intent Router (M4), and Forge Model (M5).',
    },
    {
        schema: UserSignalSchema,
        filename: 'user-signal.json',
        title: 'Enterstellar UserSignal',
        description:
            'A user interaction signal dispatched from an Zone to the agent. Fire-and-forget with enqueue guarantee.',
    },
    {
        schema: ZoneConfigSchema,
        filename: 'zone-config.json',
        title: 'Enterstellar ZoneConfig',
        description:
            'Configuration for an Zone instance. The determinism dial (0.0–1.0) controls AI influence over the zone.',
    },
] as const;

// ---------------------------------------------------------------------------
// Generation Logic
// ---------------------------------------------------------------------------

/**
 * Generates a single JSON Schema file from a Zod schema.
 *
 * @param schema - The Zod schema to convert.
 * @param filename - The output filename (e.g., `'component-contract.json'`).
 * @param title - Human-readable title for the `title` field.
 * @param description - Description for the `description` field.
 * @returns The generated JSON Schema object.
 *
 * @throws {Error} If Zod's `toJSONSchema()` encounters an unrepresentable type.
 */
function generateSchema(
    schema: z.ZodType,
    filename: string,
    title: string,
    description: string,
): Record<string, unknown> {
    // Generate JSON Schema via Zod v4's native `toJSONSchema()` (CP1).
    // The `target: 'draft-07'` option ensures Draft-07 output (CP2).
    // The `unrepresentable: 'any'` option maps `z.unknown()` to `{}` (accept anything)
    // rather than throwing — required because Enterstellar types use `z.unknown()` for
    // generic payload fields like `props` and `raw`.
    const rawSchema = z.toJSONSchema(schema, {
        target: JSON_SCHEMA_TARGET,
        unrepresentable: 'any',
    }) as Record<string, unknown>;

    // Inject Enterstellar-specific metadata fields.
    // `$id` uses relative references only (CP7 — permanently, airgap-compatible).
    // `title` and `description` provide human-readable context for non-TS consumers.
    const enrichedSchema: Record<string, unknown> = {
        $schema: rawSchema['$schema'],
        $id: `./${filename}`,
        title,
        description,
    };

    // Merge remaining fields from the generated schema, preserving Zod's output
    // exactly. We iterate explicitly to maintain deterministic key order.
    for (const [key, value] of Object.entries(rawSchema)) {
        if (key !== '$schema') {
            enrichedSchema[key] = value;
        }
    }

    return enrichedSchema;
}

/**
 * Writes a JSON Schema object to a file with deterministic formatting.
 *
 * @param filepath - Absolute path to the output file.
 * @param schema - The JSON Schema object to write.
 */
function writeSchema(filepath: string, schema: Record<string, unknown>): void {
    // `JSON.stringify` with 2-space indent produces deterministic output:
    // same input → identical file content (no timestamps, no random values).
    const content = JSON.stringify(schema, null, 2) + '\n';
    writeFileSync(filepath, content, 'utf-8');
}

/**
 * Validates that the hand-crafted DTCG token schema exists (CP9).
 *
 * The design-tokens-dtcg.json file is NOT auto-generated — it is an
 * Enterstellar-specific subset of the W3C DTCG spec, hand-crafted per CP9.
 * This function verifies it exists so the generator doesn't silently
 * produce an incomplete schema set.
 *
 * @throws {Error} If the DTCG schema file is missing.
 */
function validateDtcgSchemaExists(): void {
    const dtcgPath = resolve(SCHEMAS_DIR, DTCG_SCHEMA_FILENAME);
    if (!existsSync(dtcgPath)) {
        throw new Error(
            `Missing hand-crafted schema: ${DTCG_SCHEMA_FILENAME}\n` +
            `This file must be created manually per CP9 (Enterstellar-specific W3C DTCG subset).\n` +
            `Expected location: ${dtcgPath}`,
        );
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Entry point for the schema generator.
 *
 * 1. Ensures the `schemas/` directory exists.
 * 2. Generates 7 JSON Schema files from canonical Zod schemas.
 * 3. Validates the hand-crafted DTCG schema exists.
 * 4. Logs a summary of generated files.
 */
function main(): void {
    // Ensure the schemas directory exists.
    if (!existsSync(SCHEMAS_DIR)) {
        mkdirSync(SCHEMAS_DIR, { recursive: true });
    }

    console.log('🔧 Enterstellar Contract Protocol — Schema Generator');
    console.log(`   Target: JSON Schema ${JSON_SCHEMA_TARGET}`);
    console.log(`   Output: ${SCHEMAS_DIR}`);
    console.log('');

    // Generate each schema from the mapping.
    let generatedCount = 0;

    for (const entry of SCHEMA_MAP) {
        const filepath = resolve(SCHEMAS_DIR, entry.filename);

        try {
            const schema = generateSchema(
                entry.schema,
                entry.filename,
                entry.title,
                entry.description,
            );
            writeSchema(filepath, schema);
            console.log(`   ✅ ${entry.filename}`);
            generatedCount++;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`   ❌ ${entry.filename}: ${message}`);
            process.exit(1);
        }
    }

    // Validate the hand-crafted DTCG schema exists (CP9).
    try {
        validateDtcgSchemaExists();
        console.log(`   ✅ ${DTCG_SCHEMA_FILENAME} (hand-crafted, verified)`);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️  ${message}`);
        console.warn('   The DTCG schema must be created manually (T4).');
    }

    // Count total schemas in the directory.
    const totalSchemas = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json')).length;

    console.log('');
    console.log(
        `   Generated ${String(generatedCount)} schemas, ` +
        `${String(totalSchemas)} total in schemas/.`,
    );
    console.log('   Done.');
}

main();
