/**
 * @module @enterstellar-ai/migration/assembly/generate-example-props
 * @description Generates minimal valid props from a Zod schema.
 *
 * Used by Phase 3 to produce the `examples[0].props` entry in the
 * generated contract. The algorithm:
 *
 * 1. For each field in the Zod schema, check `defaultProps` first (developer intent).
 * 2. For fields without developer defaults, use the Zod `.default()` value if present.
 * 3. For remaining fields, generate minimal valid values from the Zod type:
 *    - `z.string()` → `''`
 *    - `z.number()` → `0`
 *    - `z.boolean()` → `false`
 *    - `z.enum(['a', 'b'])` → `'a'` (first enum value)
 *    - `z.literal('x')` → `'x'` (the literal value)
 *    - `z.array(...)` → `[]`
 *    - `z.object({...})` → recurse into shape
 *    - `z.record(...)` → `{}`
 *    - `z.optional(...)` → omitted (optional fields need not appear)
 *    - `z.nullable(...)` → `null`
 *    - `z.union([...])` → recurse into first option
 *    - `z.tuple([...])` → array of minimal values per element
 *    - `z.unknown()` / unresolvable → omitted
 *
 * **The generated example is a minimal valid instance** — it satisfies
 * the Zod schema but may not be semantically meaningful. The developer
 * should replace it with real example data.
 *
 * **Zod v4 introspection:** Uses `schema._zod.def.type` for type
 * discrimination and `schema.shape` / `schema._zod.def.*` for field
 * access. This is fragile against Zod internal changes but necessary —
 * Zod v4 has no public introspection API.
 *
 * **L15 compliance:** Zero framework imports. Pure Zod + logic only.
 *
 * @see Correction 1 — `examples` Array Generation (migration-01-pipeline.md)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum recursion depth for nested schema traversal.
 *
 * Prevents infinite recursion on self-referential schemas
 * (e.g., `z.lazy(() => TreeSchema)`). Beyond this depth,
 * the walker returns `undefined` (field omitted).
 */
const MAX_DEPTH = 10;

/**
 * Sentinel value indicating a field should be omitted from the output.
 *
 * Used for optional fields and unresolvable types — these should not
 * appear in the generated props object at all. We use a unique symbol
 * rather than `undefined` because `undefined` could be a legitimate
 * value in some contexts.
 */
const OMIT_FIELD = Symbol('OMIT_FIELD');

// ---------------------------------------------------------------------------
// Zod v4 Internal Types (for type-safe access to _zod.def)
// ---------------------------------------------------------------------------

/**
 * Minimal type for Zod v4's internal `_zod.def` structure.
 *
 * Zod v4 stores schema metadata in `schema._zod.def`. The `type` field
 * is a string discriminator (e.g., `'string'`, `'object'`, `'default'`).
 * Additional fields vary by type.
 *
 * This is NOT a public API — it's an internal Zod v4 implementation detail.
 * We accept the fragility because there's no public introspection API.
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
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Safely extracts the `_zod.def` structure from a Zod schema.
 *
 * Returns `undefined` if the schema doesn't have the expected internal
 * structure (defensive against non-Zod objects or future API changes).
 *
 * @param schema - A Zod schema instance.
 * @returns The internal `_zod.def` object, or `undefined` if not accessible.
 */
function getZodDef(schema: z.ZodType): ZodDef | undefined {
    const def = (schema as unknown as Record<string, unknown>)['_zod'] as
        { readonly def?: ZodDef } | undefined;
    return def?.def;
}

/**
 * Resolves a single Zod schema field to its minimal valid value.
 *
 * This is the core recursive walker. It pattern-matches on `_zod.def.type`
 * to determine the Zod type and returns the smallest value that would
 * satisfy the schema.
 *
 * **Resolution order for each field:**
 * 1. If the schema is `ZodDefault` → extract `defaultValue`
 * 2. If the schema is `ZodOptional` → return `OMIT_FIELD` (omit from output)
 * 3. If the schema is `ZodNullable` → return `null`
 * 4. Otherwise → derive minimal value from type
 *
 * @param schema - The Zod schema for a single field.
 * @param depth - Current recursion depth (0-indexed). Prevents infinite
 *   recursion on self-referential schemas.
 * @returns The minimal valid value, or `OMIT_FIELD` symbol if the field
 *   should be omitted from the output.
 */
function zodTypeToMinimalValue(
    schema: z.ZodType,
    depth: number,
): unknown {
    // --- Depth guard ---
    if (depth >= MAX_DEPTH) {
        return OMIT_FIELD;
    }

    const def = getZodDef(schema);
    if (def === undefined) {
        return OMIT_FIELD;
    }

    switch (def.type) {
        // --- Wrapper types (unwrap first) ---

        case 'default': {
            // ZodDefault — extract the default value directly.
            // This is the highest-priority source for a field value.
            if (def.defaultValue !== undefined) {
                return def.defaultValue;
            }
            // Fallback: unwrap and recurse into inner type
            if (def.innerType !== undefined) {
                return zodTypeToMinimalValue(def.innerType, depth + 1);
            }
            return OMIT_FIELD;
        }

        case 'optional': {
            // ZodOptional — optional fields should be omitted from
            // the minimal example. The contract doesn't require them.
            return OMIT_FIELD;
        }

        case 'nullable': {
            // ZodNullable — `null` is a valid minimal value for nullable fields.
            return null;
        }

        // --- Primitive types ---

        case 'string':
            return '';

        case 'number':
            return 0;

        case 'boolean':
            return false;

        case 'null':
            return null;

        case 'undefined':
            return OMIT_FIELD;

        // --- Literal and enum types ---

        case 'literal': {
            // Zod v4 stores literal values in `def.values` (array).
            const firstValue = def.values?.[0];
            return firstValue !== undefined ? firstValue : OMIT_FIELD;
        }

        case 'enum': {
            // Zod v4 stores enum entries as Record<string, string>.
            // Use the first entry's value.
            if (def.entries !== undefined) {
                const entryValues = Object.values(def.entries);
                const first = entryValues[0];
                return first !== undefined ? first : OMIT_FIELD;
            }
            return OMIT_FIELD;
        }

        // --- Composite types ---

        case 'array': {
            // Minimal valid array is empty — satisfies z.array(T).
            return [];
        }

        case 'object': {
            // Recurse into shape — produce minimal valid nested object.
            if (schema instanceof z.ZodObject) {
                return buildMinimalObject(schema, {}, depth + 1);
            }
            return {};
        }

        case 'record': {
            // Minimal valid record is empty — satisfies z.record(K, V).
            return {};
        }

        case 'tuple': {
            // Produce an array with minimal values for each positional element.
            if (def.items !== undefined) {
                const tupleValues: unknown[] = [];
                for (const item of def.items) {
                    const value = zodTypeToMinimalValue(item, depth + 1);
                    // For tuple elements, we can't omit — use null as fallback
                    tupleValues.push(value === OMIT_FIELD ? null : value);
                }
                return tupleValues;
            }
            return [];
        }

        case 'union': {
            // Use the first option's minimal value.
            // For discriminated unions, this is also correct — the first
            // variant is as valid as any other for a minimal example.
            if (def.options !== undefined) {
                const firstOption = def.options[0];
                if (firstOption !== undefined) {
                    return zodTypeToMinimalValue(firstOption, depth + 1);
                }
            }
            return OMIT_FIELD;
        }

        case 'intersection': {
            // For intersections, merge the minimal values of both sides.
            // This produces a valid value for `z.intersection(A, B)` by
            // combining the fields of both A and B.
            const leftValue = def.left !== undefined
                ? zodTypeToMinimalValue(def.left, depth + 1)
                : {};
            const rightValue = def.right !== undefined
                ? zodTypeToMinimalValue(def.right, depth + 1)
                : {};

            // If both sides are objects, merge them
            if (
                typeof leftValue === 'object' && leftValue !== null &&
                typeof rightValue === 'object' && rightValue !== null
            ) {
                return { ...leftValue as Record<string, unknown>, ...rightValue as Record<string, unknown> };
            }
            // If only one side is an object, use it
            if (typeof leftValue === 'object' && leftValue !== null) return leftValue;
            if (typeof rightValue === 'object' && rightValue !== null) return rightValue;
            // Fallback: use left
            return leftValue === OMIT_FIELD ? rightValue : leftValue;
        }

        // --- Function type (callback props) ---

        case 'function': {
            // Function props cannot have meaningful minimal values.
            // Omit from examples — the developer must provide callbacks.
            return OMIT_FIELD;
        }

        // --- Fallback for unknown/unresolvable types ---

        case 'unknown':
        case 'any':
        case 'never':
        case 'void':
        default:
            return OMIT_FIELD;
    }
}

/**
 * Builds a minimal valid object from a `ZodObject` schema and default overrides.
 *
 * Iterates the schema's `.shape` and resolves each field using the priority:
 * 1. `defaultProps[key]` — developer-provided defaults from the source component
 * 2. Zod `.default()` value — schema-level defaults
 * 3. Type-derived minimal value — from `zodTypeToMinimalValue()`
 *
 * Fields that resolve to `OMIT_FIELD` are excluded from the output.
 *
 * @param schema - A `ZodObject` schema to extract shape from.
 * @param defaultProps - Default prop values (from manifest or parent recursion).
 * @param depth - Current recursion depth.
 * @returns A record of minimal valid prop values.
 */
function buildMinimalObject(
    schema: z.ZodObject,
    defaultProps: Readonly<Record<string, unknown>>,
    depth: number,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const shape = schema.shape as Record<string, z.ZodType>;

    for (const key of Object.keys(shape)) {
        const fieldSchema = shape[key];
        if (fieldSchema === undefined) continue;

        // Priority 1: Developer-provided default from the manifest
        const developerDefault = defaultProps[key];
        if (developerDefault !== undefined) {
            result[key] = developerDefault;
            continue;
        }

        // Priority 2+3: Zod default or type-derived minimal value
        // (zodTypeToMinimalValue handles ZodDefault internally as Priority 2)
        const minimalValue = zodTypeToMinimalValue(fieldSchema, depth);
        if (minimalValue !== OMIT_FIELD) {
            result[key] = minimalValue;
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates minimal valid props from a Zod schema and default values.
 *
 * Produces the smallest `Record<string, unknown>` that satisfies the given
 * Zod schema, using developer-provided defaults where available. This powers
 * the `examples[0].props` field in generated `.contract.ts` files.
 *
 * **Resolution priority per field:**
 * 1. `defaultProps[key]` — developer defaults from the source component
 *    (extracted from destructured parameters or `.defaultProps`)
 * 2. Zod `.default()` value — schema-level defaults
 * 3. Type-derived minimal value — the smallest valid value for each Zod type
 *
 * **Edge cases:**
 * - Non-`ZodObject` schemas (e.g., `z.unknown()`, `z.string()`) → returns `{}`
 * - Optional fields → omitted from output (they're not required)
 * - Nullable fields → `null` (valid minimal value)
 * - Function props → omitted (callbacks need developer implementation)
 * - Self-referential schemas → depth-guarded at 10 levels
 *
 * @param propsSchema - The Zod schema for the component's props.
 *   Typically a `z.ZodObject` from Phase 1's `typeToZodSchema()`.
 * @param defaultProps - Default prop values extracted from the component
 *   source by `extractDefaultProps()` in Phase 1.
 * @returns A minimal valid props object that satisfies the schema.
 *   All keys have values that would pass `propsSchema.parse()`.
 *
 * @example
 * ```ts
 * const schema = z.object({
 *     label: z.string(),
 *     count: z.number().default(0),
 *     active: z.boolean(),
 *     className: z.string().optional(),
 * });
 *
 * const props = generateExampleProps(schema, { label: 'Hello' });
 * // → { label: 'Hello', count: 0, active: false }
 * // Note: `className` is omitted (optional field)
 * ```
 *
 * @see Correction 1 — `examples` Array Generation
 * @see ComponentExample — { intent: string, props: Record<string, unknown> }
 */
export function generateExampleProps(
    propsSchema: z.ZodType,
    defaultProps: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    // Non-ZodObject schemas cannot have shape — return empty props.
    // This handles z.unknown(), z.string(), z.record(), etc.
    if (!(propsSchema instanceof z.ZodObject)) {
        // Still apply developer defaults if provided
        if (Object.keys(defaultProps).length > 0) {
            return { ...defaultProps };
        }
        return {};
    }

    return buildMinimalObject(propsSchema, defaultProps, 0);
}
