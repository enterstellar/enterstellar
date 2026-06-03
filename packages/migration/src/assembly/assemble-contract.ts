/**
 * @module @enterstellar-ai/migration/assembly/assemble-contract
 * @description Phase 3 — generates a `.contract.ts` file from a
 * `StructuralManifest`.
 *
 * Transforms the intermediate `StructuralManifest` representation into
 * a complete `defineComponent()` call with:
 * - Provenance header (`@enterstellar-generated`, `@source`, `@generated-at`, etc.)
 * - Zod schema from `manifest.props` (serialized back to source code)
 * - Design tokens: always `tokens: {}` with `@enterstellar-warn` (E4 — format mismatch)
 * - Accessibility metadata from `manifest.ariaAttributes` + category defaults
 * - Lifecycle states from `manifest.lifecycleStates`
 * - Examples from `manifest.intent` + `generateExampleProps()`
 * - `@enterstellar-review` and `@enterstellar-warn` annotations on affected fields
 *
 * **Output is a string** — the assembled TypeScript source code. The caller
 * writes it to disk (the assembly module is filesystem-agnostic).
 *
 * **Outcome determination is NOT this module's responsibility.** The CLI
 * orchestrator maps assembly annotations (`@enterstellar-review`, `@enterstellar-warn`)
 * to a `MigrationOutcome`. See `determine-outcome.ts` in `@enterstellar-ai/cli`.
 *
 * **L15 compliance:** Zero framework imports. Only Zod for schema serialization.
 *
 * @see Correction 1 — Phase 3 Assembly: Mapping Manifest → ComponentContract
 * @see Correction 1 — Provenance Header format
 * @see Correction 1 — @enterstellar-review Structured Annotation Format
 */

import { z } from 'zod';
import type { ComponentCategory } from '@enterstellar-ai/types';

import type {
    StructuralManifest,
    MigrationProvenance,
    MigrationOutcome,
    AssemblyOptions,
} from '../types.js';
import { generateExampleProps } from './generate-example-props.js';

// ---------------------------------------------------------------------------
// Contract Assembly Result
// ---------------------------------------------------------------------------

/**
 * The output of `assembleContract()` — the generated contract source
 * and metadata about the assembly process.
 *
 * The `provenance.outcome` field contains the real outcome, computed
 * inline from the `reviewAnnotations` and `warnAnnotations` arrays.
 * All annotations are collected before provenance construction, so
 * the outcome is deterministic — no placeholder, no CLI-side patching.
 *
 * @see MigrationOutcome — determined from assembly annotations
 */
export type ContractAssemblyResult = {
    /** The assembled `.contract.ts` file content (TypeScript source string). */
    readonly content: string;
    /** `@enterstellar-review` annotations added to the contract. */
    readonly reviewAnnotations: readonly string[];
    /** `@enterstellar-warn` annotations added to the contract. */
    readonly warnAnnotations: readonly string[];
    /** Provenance metadata for the `@enterstellar-generated` header. */
    readonly provenance: MigrationProvenance;
};

// ---------------------------------------------------------------------------
// Constants (compile-time guarded — same pattern as heuristics.ts)
// ---------------------------------------------------------------------------

/**
 * The 8 predefined `ComponentCategory` values, excluding `custom:*`.
 *
 * @see Design Choice R11 — predefined component categories
 */
type PredefinedCategory = Exclude<ComponentCategory, `custom:${string}`>;

/**
 * Default ARIA role mappings based on component category.
 *
 * **Compile-time sync guarantee:** `Record<PredefinedCategory, string>` +
 * `satisfies` ensures every `PredefinedCategory` key is present and every
 * value is a string. If `ComponentCategory` in `@enterstellar-ai/types` adds a new
 * variant, `tsc` errors here until this map is updated.
 *
 * @see Design Choice C10 — per-component based on category and semantic role
 * @see Design Choice R11 — compile-time exhaustiveness via `satisfies`
 * @see Design Choice C10 — duplicated across compiler and migration with compile-time guard
 */
const CATEGORY_ROLE_DEFAULTS: Readonly<Record<PredefinedCategory, string>> = {
    'clinical': 'region',
    'admin': 'region',
    'navigation': 'navigation',
    'data-display': 'article',
    'form': 'form',
    'feedback': 'alert',
    'layout': 'group',
    'utility': 'complementary',
} satisfies Record<PredefinedCategory, string>;

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/**
 * Return shape for builder helpers that produce a field value
 * and zero or more annotations.
 */
type BuilderResult<T> = {
    /** The computed field value. */
    readonly value: T;
    /** `@enterstellar-review` annotations for this field (require developer attention). */
    readonly reviewAnnotations: readonly string[];
    /** `@enterstellar-warn` annotations for this field (heuristic inferences). */
    readonly warnAnnotations: readonly string[];
};

/**
 * Minimal type for Zod v4's internal `_zod.def` structure.
 *
 * Used by `serializeZodSchema()` to walk the schema tree.
 * Same pattern as `generate-example-props.ts`.
 *
 * @see generate-example-props.ts — shared introspection approach
 */
type ZodDef = {
    readonly type: string;
    readonly defaultValue?: unknown;
    readonly innerType?: z.ZodType;
    readonly values?: readonly unknown[];
    readonly entries?: Readonly<Record<string, unknown>>;
    readonly element?: z.ZodType;
    readonly items?: readonly z.ZodType[];
    readonly options?: readonly z.ZodType[];
    readonly left?: z.ZodType;
    readonly right?: z.ZodType;
    readonly keyType?: z.ZodType;
    readonly valueType?: z.ZodType;
};

// ---------------------------------------------------------------------------
// Zod v4 Introspection Helper
// ---------------------------------------------------------------------------

/**
 * Safely extracts the `_zod.def` structure from a Zod schema.
 *
 * @param schema - A Zod schema instance.
 * @returns The internal `_zod.def` object, or `undefined` if not accessible.
 */
function getZodDef(schema: z.ZodType): ZodDef | undefined {
    const def = (schema as unknown as Record<string, unknown>)['_zod'] as
        { readonly def?: ZodDef } | undefined;
    return def?.def;
}

// ---------------------------------------------------------------------------
// Builder Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the `@enterstellar-generated` provenance JSDoc header block.
 *
 * Produces a machine-readable JSDoc comment with provenance tags:
 * `@source`, `@generated-at`, `@pipeline-version`, `@phases`,
 * and optionally `@enrichment-provider` and `@enriched-fields`.
 *
 * @param provenance - The provenance metadata to serialize.
 * @returns A JSDoc comment string (including `/**` and `* /` delimiters).
 */
function buildProvenanceHeader(provenance: MigrationProvenance): string {
    const lines: string[] = [
        '/**',
        ' * @enterstellar-generated',
        ` * @source ${provenance.source}`,
        ` * @generated-at ${provenance.generatedAt}`,
        ` * @pipeline-version ${provenance.pipelineVersion}`,
        ` * @phases ${provenance.phases.join(',')}`,
    ];

    if (provenance.enrichmentProvider !== undefined) {
        lines.push(` * @enrichment-provider ${provenance.enrichmentProvider}`);
    }

    if (
        provenance.enrichedFields !== undefined &&
        provenance.enrichedFields.length > 0
    ) {
        lines.push(` * @enriched-fields ${provenance.enrichedFields.join(',')}`);
    }

    lines.push(` * @outcome ${provenance.outcome}`);
    lines.push(' */');
    return lines.join('\n');
}

/**
 * Builds the `accessibility` field from manifest ARIA attributes
 * and category-based role defaults.
 *
 * Uses `CATEGORY_ROLE_DEFAULTS` to derive a default role if none was
 * extracted from the source JSX. Falls back to `'region'` for unknown
 * or custom categories.
 *
 * @param manifest - The structural manifest.
 * @returns Builder result with the accessibility value and annotations.
 */
function buildAccessibility(
    manifest: StructuralManifest,
): BuilderResult<{ role: string; ariaLabel: string; announceOnUpdate: boolean }> {
    const reviewAnnotations: string[] = [];
    const warnAnnotations: string[] = [];

    const ariaAttrs = manifest.ariaAttributes.value;

    // Derive role from manifest or category defaults
    const role = ariaAttrs['role']
        ?? (CATEGORY_ROLE_DEFAULTS as Readonly<Record<string, string>>)[manifest.category.value]
        ?? 'region';

    // Derive ariaLabel from manifest or component name
    const ariaLabel = ariaAttrs['aria-label'] ?? manifest.name;

    // If source was heuristic, annotate
    if (manifest.ariaAttributes.source === 'heuristic-fallback') {
        warnAnnotations.push(
            `@enterstellar-warn: field=accessibility reason="ARIA attributes derived from category defaults. Review role='${role}' and ariaLabel='${ariaLabel}'."`,
        );
    }

    return {
        value: { role, ariaLabel, announceOnUpdate: false },
        reviewAnnotations,
        warnAnnotations,
    };
}

/**
 * Builds the `states` field from manifest lifecycle states.
 *
 * Maps detected lifecycle state strings to the 4 required
 * `ComponentStates` fields: `loading`, `error`, `empty`, `ready`.
 * Missing states get default placeholder values.
 *
 * @param manifest - The structural manifest.
 * @returns Builder result with the states value and annotations.
 */
function buildStates(
    manifest: StructuralManifest,
): BuilderResult<{ loading: string; error: string; empty: string; ready: string }> {
    const warnAnnotations: string[] = [];

    const value = {
        loading: `Loading ${manifest.name}...`,
        error: `Error loading ${manifest.name}`,
        empty: `No data for ${manifest.name}`,
        ready: manifest.name,
    };

    if (manifest.lifecycleStates.source === 'heuristic-fallback') {
        warnAnnotations.push(
            '@enterstellar-warn: field=states reason="No lifecycle state patterns detected. Using default placeholders."',
        );
    }

    return { value, reviewAnnotations: [], warnAnnotations };
}

/**
 * Builds the `tokens` field.
 *
 * Always returns `tokens: {}` because Phase 1's `detectDesignTokenRefs()`
 * extracts CSS variable patterns (`var(--enterstellar-primary)`, `--enterstellar-danger`)
 * which are incompatible with `defineComponent()`'s R6 validation that
 * enforces `value.startsWith('token:')`.
 *
 * If CSS variables were detected, adds `@enterstellar-warn` listing them for
 * manual mapping by the developer.
 *
 * @param manifest - The structural manifest.
 * @returns Builder result with empty tokens and optional annotation.
 *
 * @see Audit E4 — `var(--*)` format incompatible with `token:*` requirement
 */
function buildTokens(
    manifest: StructuralManifest,
): BuilderResult<Record<string, string>> {
    const warnAnnotations: string[] = [];

    const detectedRefs = manifest.designTokenRefs.value;
    if (detectedRefs.length > 0) {
        warnAnnotations.push(
            `@enterstellar-warn: field=tokens reason="Detected CSS variable references: ${detectedRefs.join(', ')}. Map to token:* format manually."`,
        );
    }

    return { value: {}, reviewAnnotations: [], warnAnnotations };
}

/**
 * Builds the `tags` field from manifest tags.
 *
 * Ensures at least 1 tag is present (R3 `.min(1)` validation).
 * Falls back to `[category.value]` with `@enterstellar-warn` if empty.
 *
 * @param manifest - The structural manifest.
 * @returns Builder result with the tags array and annotations.
 *
 * @see Audit M6 — `tags: []` fails R3 `.min(1)`
 */
function buildTags(
    manifest: StructuralManifest,
): BuilderResult<readonly string[]> {
    const warnAnnotations: string[] = [];

    const tags = manifest.tags.value;
    if (tags.length === 0) {
        warnAnnotations.push(
            '@enterstellar-warn: field=tags reason="No tags detected — auto-generated from category. Add semantic tags."',
        );
        return {
            value: [manifest.category.value],
            reviewAnnotations: [],
            warnAnnotations,
        };
    }

    if (manifest.tags.source === 'heuristic-fallback') {
        warnAnnotations.push(
            '@enterstellar-warn: field=tags reason="Tags derived from heuristics. Review and refine."',
        );
    }

    return { value: tags, reviewAnnotations: [], warnAnnotations };
}

// ---------------------------------------------------------------------------
// Zod Schema Serializer
// ---------------------------------------------------------------------------

/** Maximum recursion depth for schema serialization. */
const MAX_SERIALIZE_DEPTH = 10;

/**
 * Serializes a runtime Zod schema back to TypeScript source code.
 *
 * This is the inverse of `zod-inference.ts`'s `typeToZodSchema()`:
 * it takes a runtime `z.ZodType` and produces the source string
 * (e.g., `z.object({ name: z.string(), age: z.number() })`).
 *
 * Walks `_zod.def` internals (Zod v4). Handles the same 17 types
 * as the inference module. Complex schemas with `.refine()`,
 * `.transform()`, or `.pipe()` chains are serialized as `z.unknown()`
 * with a REVIEW annotation (best-effort — no public introspection API).
 *
 * @param schema - The runtime Zod schema to serialize.
 * @param depth - Current recursion depth (default 0).
 * @returns The TypeScript source string representation.
 */
function serializeZodSchema(schema: z.ZodType, depth: number = 0): string {
    if (depth >= MAX_SERIALIZE_DEPTH) {
        return 'z.unknown()';
    }

    const def = getZodDef(schema);
    if (def === undefined) {
        return 'z.unknown()';
    }

    switch (def.type) {
        // --- Primitives ---
        case 'string': return 'z.string()';
        case 'number': return 'z.number()';
        case 'boolean': return 'z.boolean()';
        case 'null': return 'z.null()';
        case 'undefined': return 'z.undefined()';
        case 'unknown': return 'z.unknown()';
        case 'any': return 'z.unknown()';
        case 'void': return 'z.void()';
        case 'never': return 'z.never()';

        // --- Literal ---
        case 'literal': {
            const litValue = def.values?.[0];
            if (typeof litValue === 'string') return `z.literal('${litValue}')`;
            if (typeof litValue === 'number') return `z.literal(${String(litValue)})`;
            if (typeof litValue === 'boolean') return `z.literal(${String(litValue)})`;
            return 'z.unknown()';
        }

        // --- Enum ---
        case 'enum': {
            if (def.entries !== undefined) {
                const keys = Object.keys(def.entries);
                const formatted = keys.map((k) => `'${k}'`).join(', ');
                return `z.enum([${formatted}])`;
            }
            return 'z.unknown()';
        }

        // --- Object ---
        case 'object': {
            if (schema instanceof z.ZodObject) {
                const shape = schema.shape as Record<string, z.ZodType>;
                const entries = Object.entries(shape);
                if (entries.length === 0) return 'z.object({})';
                const fields = entries.map(([key, fieldSchema]) => {
                    const serialized = serializeZodSchema(fieldSchema, depth + 1);
                    return `    ${key}: ${serialized},`;
                });
                return `z.object({\n${fields.join('\n')}\n})`;
            }
            return 'z.object({})';
        }

        // --- Array ---
        case 'array': {
            if (def.element !== undefined) {
                return `z.array(${serializeZodSchema(def.element, depth + 1)})`;
            }
            return 'z.array(z.unknown())';
        }

        // --- Record ---
        case 'record': {
            const keyType = def.keyType !== undefined
                ? serializeZodSchema(def.keyType, depth + 1)
                : 'z.string()';
            const valueType = def.valueType !== undefined
                ? serializeZodSchema(def.valueType, depth + 1)
                : 'z.unknown()';
            return `z.record(${keyType}, ${valueType})`;
        }

        // --- Tuple ---
        case 'tuple': {
            if (def.items !== undefined) {
                const elements = def.items.map(
                    (item) => serializeZodSchema(item, depth + 1),
                );
                return `z.tuple([${elements.join(', ')}])`;
            }
            return 'z.tuple([])';
        }

        // --- Union ---
        case 'union': {
            if (def.options !== undefined) {
                const members = def.options.map(
                    (opt) => serializeZodSchema(opt, depth + 1),
                );
                return `z.union([${members.join(', ')}])`;
            }
            return 'z.unknown()';
        }

        // --- Intersection ---
        case 'intersection': {
            const leftStr = def.left !== undefined
                ? serializeZodSchema(def.left, depth + 1)
                : 'z.unknown()';
            const rightStr = def.right !== undefined
                ? serializeZodSchema(def.right, depth + 1)
                : 'z.unknown()';
            return `z.intersection(${leftStr}, ${rightStr})`;
        }

        // --- Wrapper types ---
        case 'optional': {
            if (def.innerType !== undefined) {
                return `${serializeZodSchema(def.innerType, depth + 1)}.optional()`;
            }
            return 'z.unknown().optional()';
        }

        case 'nullable': {
            if (def.innerType !== undefined) {
                return `${serializeZodSchema(def.innerType, depth + 1)}.nullable()`;
            }
            return 'z.unknown().nullable()';
        }

        case 'default': {
            if (def.innerType !== undefined) {
                const inner = serializeZodSchema(def.innerType, depth + 1);
                const dv = def.defaultValue;
                const defaultStr = typeof dv === 'string'
                    ? `'${dv}'`
                    : JSON.stringify(dv);
                return `${inner}.default(${defaultStr})`;
            }
            return 'z.unknown()';
        }

        // --- Function ---
        case 'function': return 'z.function()';

        // --- Fallback for unrecognized types ---
        default:
            return 'z.unknown()';
    }
}

/**
 * Builds a provenance comment for existing Zod schemas detected in the source.
 *
 * Phase 1 captures the names of existing Zod schema variables (e.g.,
 * `UserSchema`, `propsSchema`). This comment alerts developers that
 * existing schemas were found and may contain constraints worth migrating.
 *
 * @param schemas - Array of existing Zod schema variable names.
 * @returns A comment string, or empty string if no schemas found.
 */
function buildExistingZodComment(schemas: readonly string[]): string {
    if (schemas.length === 0) return '';
    return `// Note: existing Zod schemas detected in source: ${schemas.join(', ')}\n// Consider migrating constraints from these schemas into the contract props.\n`;
}

// ---------------------------------------------------------------------------
// Contract Assembly
// ---------------------------------------------------------------------------

/**
 * Assembles a `.contract.ts` file from a `StructuralManifest`.
 *
 * **Field mapping (Correction 1):**
 *
 * | Manifest field            | Contract field     | Transformation                |
 * |:--------------------------|:-------------------|:------------------------------|
 * | `name`                    | `name`             | Direct copy                   |
 * | (auto-generated)          | `id`               | `defineComponent()` handles   |
 * | `description.value`       | `description`      | Unwrap `EnrichableField`      |
 * | `category.value`          | `category`         | String literal                |
 * | `tags.value`              | `tags`             | Ensure min 1 (M6)            |
 * | `props`                   | `props`            | `serializeZodSchema()`        |
 * | `designTokenRefs.value`   | `tokens`           | Always `{}` + @enterstellar-warn (E4) |
 * | `ariaAttributes.value`    | `accessibility`    | Merge with category defaults  |
 * | `lifecycleStates.value`   | `states`           | `string[]` → `ComponentStates`|
 * | `intent.value`            | `examples`         | `generateExampleProps()`      |
 *
 * **Does NOT include `id` or `_meta`** — auto-generated by `defineComponent()` (E1).
 * **Does NOT determine outcome** — CLI orchestrator responsibility (E3).
 *
 * @param manifest - The `StructuralManifest` from Phase 1 (optionally
 *   enriched by Phase 2).
 * @param sourcePath - Relative path to the source file (for provenance).
 * @param pipelineVersion - Pipeline version string (e.g., `'1.0.0'`).
 * @param options - Optional enrichment metadata for provenance header.
 * @returns A `ContractAssemblyResult` with the generated source and metadata.
 *
 * @see Correction 1 — Field Mapping table
 * @see Audit E1 — no id/_meta in generated source
 * @see Audit E3 — no outcome determination
 */
export function assembleContract(
    manifest: StructuralManifest,
    sourcePath: string,
    pipelineVersion: string,
    options?: AssemblyOptions,
): ContractAssemblyResult {
    // --- Collect all annotations ---
    const allReviewAnnotations: string[] = [];
    const allWarnAnnotations: string[] = [];

    // --- Build each field ---
    const accessibility = buildAccessibility(manifest);
    allReviewAnnotations.push(...accessibility.reviewAnnotations);
    allWarnAnnotations.push(...accessibility.warnAnnotations);

    const statesResult = buildStates(manifest);
    allWarnAnnotations.push(...statesResult.warnAnnotations);

    const tokensResult = buildTokens(manifest);
    allWarnAnnotations.push(...tokensResult.warnAnnotations);

    const tagsResult = buildTags(manifest);
    allWarnAnnotations.push(...tagsResult.warnAnnotations);

    // --- Generics → @enterstellar-review on props ---
    if (manifest.generics.length > 0) {
        const genericNames = manifest.generics.map((g) => g.name).join(', ');
        allReviewAnnotations.push(
            `@enterstellar-review: rule=GENERIC_TYPE field=props reason="Component has generic type parameters: <${genericNames}>. Generated schema uses placeholder types. Manual refinement required."`,
        );
    }

    // --- Heuristic description → @enterstellar-warn ---
    if (manifest.description.source === 'heuristic-fallback') {
        allWarnAnnotations.push(
            '@enterstellar-warn: field=description reason="Description derived from heuristics. Review and refine."',
        );
    }

    // --- Heuristic category → @enterstellar-warn ---
    if (manifest.category.source === 'heuristic-fallback') {
        allWarnAnnotations.push(
            '@enterstellar-warn: field=category reason="Category derived from heuristics. Review and refine."',
        );
    }

    // --- Heuristic intent → @enterstellar-warn ---
    if (manifest.intent.source === 'heuristic-fallback') {
        allWarnAnnotations.push(
            '@enterstellar-warn: field=intent reason="Intent derived from heuristics. Review and refine."',
        );
    }

    // --- Serialize props schema ---
    const propsSource = serializeZodSchema(manifest.props);

    // --- Generate example props ---
    const exampleProps = generateExampleProps(manifest.props, manifest.defaultProps);

    // --- Build provenance ---
    const phases: string[] = ['ast'];
    if (
        options?.enrichedFields !== undefined &&
        options.enrichedFields.length > 0
    ) {
        phases.push('enrichment');
    }

    // --- Determine outcome from annotations (deterministic at this point) ---
    // All annotation arrays are fully populated above. The outcome is known
    // before provenance construction — no placeholder needed.
    const outcome: MigrationOutcome =
        allReviewAnnotations.length > 0
            ? 'review'
            : allWarnAnnotations.length > 0
                ? 'warn'
                : 'clean';

    const provenance: MigrationProvenance = {
        source: sourcePath,
        generatedAt: new Date().toISOString(),
        pipelineVersion,
        phases,
        // Only include optional fields when defined (exactOptionalPropertyTypes)
        ...(options?.enrichmentProvider !== undefined
            ? { enrichmentProvider: options.enrichmentProvider } : {}),
        ...(options?.enrichedFields !== undefined && options.enrichedFields.length > 0
            ? { enrichedFields: options.enrichedFields } : {}),
        outcome,
    };

    // --- Build source string ---
    const header = buildProvenanceHeader(provenance);
    const zodComment = buildExistingZodComment(manifest.existingZodSchemas);

    const lines: string[] = [
        header,
        `import { defineComponent } from '@enterstellar-ai/registry';`,
        `import { z } from 'zod';`,
        '',
    ];

    // Existing Zod schemas provenance comment
    if (zodComment.length > 0) {
        lines.push(zodComment);
    }

    // Build the defineComponent call
    lines.push(`export const ${manifest.name}Contract = defineComponent({`);
    lines.push(`    name: '${manifest.name}',`);

    // Description with optional annotation
    if (manifest.description.source === 'heuristic-fallback') {
        lines.push(`    // @enterstellar-warn: field=description reason="Description derived from heuristics. Review and refine."`);
    }
    lines.push(`    description: '${escapeString(manifest.description.value)}',`);

    // Category with optional annotation
    if (manifest.category.source === 'heuristic-fallback') {
        lines.push(`    // @enterstellar-warn: field=category reason="Category derived from heuristics. Review and refine."`);
    }
    lines.push(`    category: '${manifest.category.value}',`);

    // Tags with optional annotation
    if (tagsResult.warnAnnotations.length > 0) {
        const annotation = tagsResult.warnAnnotations[0];
        if (annotation !== undefined) lines.push(`    // ${annotation}`);
    }
    const tagsFormatted = tagsResult.value.map((t) => `'${t}'`).join(', ');
    lines.push(`    tags: [${tagsFormatted}],`);

    // Props with optional generics annotation
    if (manifest.generics.length > 0) {
        const genericNames = manifest.generics.map((g) => g.name).join(', ');
        lines.push(`    // @enterstellar-review: rule=GENERIC_TYPE field=props reason="Component has generic type parameters: <${genericNames}>. Generated schema uses placeholder types. Manual refinement required."`);
    }
    lines.push(`    props: ${propsSource},`);

    // Tokens with annotation
    if (tokensResult.warnAnnotations.length > 0) {
        const annotation = tokensResult.warnAnnotations[0];
        if (annotation !== undefined) lines.push(`    // ${annotation}`);
    }
    lines.push(`    tokens: {},`);

    // Accessibility with optional annotation
    if (accessibility.warnAnnotations.length > 0) {
        const annotation = accessibility.warnAnnotations[0];
        if (annotation !== undefined) lines.push(`    // ${annotation}`);
    }
    const a11y = accessibility.value;
    lines.push(`    accessibility: { role: '${a11y.role}', ariaLabel: '${escapeString(a11y.ariaLabel)}', announceOnUpdate: false },`);

    // States with optional annotation
    if (statesResult.warnAnnotations.length > 0) {
        const annotation = statesResult.warnAnnotations[0];
        if (annotation !== undefined) lines.push(`    // ${annotation}`);
    }
    const st = statesResult.value;
    lines.push(`    states: { loading: '${escapeString(st.loading)}', error: '${escapeString(st.error)}', empty: '${escapeString(st.empty)}', ready: '${escapeString(st.ready)}' },`);

    // Examples with optional intent annotation
    if (manifest.intent.source === 'heuristic-fallback') {
        lines.push(`    // @enterstellar-warn: field=intent reason="Intent derived from heuristics. Review and refine."`);
    }
    const examplePropsStr = JSON.stringify(exampleProps);
    lines.push(`    examples: [{ intent: '${escapeString(manifest.intent.value)}', props: ${examplePropsStr} }],`);

    lines.push(`});`);
    lines.push('');

    return {
        content: lines.join('\n'),
        reviewAnnotations: allReviewAnnotations,
        warnAnnotations: allWarnAnnotations,
        provenance,
    };
}

// ---------------------------------------------------------------------------
// String Utility
// ---------------------------------------------------------------------------

/**
 * Escapes single quotes in a string for safe embedding in
 * single-quoted TypeScript string literals.
 *
 * @param value - The raw string value.
 * @returns The escaped string.
 */
function escapeString(value: string): string {
    return value.replace(/'/g, "\\'");
}
