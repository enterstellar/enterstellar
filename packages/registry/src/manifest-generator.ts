/**
 * @module @enterstellar-ai/registry/manifest-generator
 * @description Generates `CompactManifestEntry[]` from a collection of ComponentContracts.
 *
 * The compact manifest is the token-efficient component description injected
 * into the LLM's system prompt. Each entry contains: name, description,
 * category, and a simplified prop summary.
 *
 * **Format (Design Choice R8):** Custom compact JSON, NOT full JSON Schema
 * (too verbose) and NOT plain English (too ambiguous). The prop summary maps
 * each prop key to a human-readable type string (e.g., `"string (UUID)"`,
 * `"enum: low|medium|high|critical"`).
 *
 * @see Design Choice R8 — compact JSON format for token efficiency.
 * @see Design Choice R9 — descriptions max 120 chars (enforced by `defineComponent`).
 * @see Design Choice R10 — example data via `intent` + `props` fields.
 */

import type { ComponentContract, CompactManifestEntry } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Type Guard Helper
// ---------------------------------------------------------------------------

/**
 * Narrows `unknown` to a string-keyed record.
 * Avoids raw `as Record<string, unknown>` casts throughout introspection logic.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

// ---------------------------------------------------------------------------
// Prop Summary Generation
// ---------------------------------------------------------------------------

/**
 * Extracts a simplified prop summary from a Zod schema.
 *
 * Attempts to introspect the schema's shape to produce human-readable
 * type annotations (e.g., `"string (UUID)"`, `"enum: low|medium|high"`).
 * Falls back to `"unknown"` for types that cannot be introspected.
 *
 * This uses duck-typing to probe the internal structure of Zod schemas
 * without depending on private APIs. The approach is resilient to Zod
 * version differences.
 *
 * @param props - A Zod schema (typically `z.object()`).
 * @param depth - Current introspection depth for recursive calls. Defaults to 0.
 * @returns A `Record<string, string>` mapping prop keys to type descriptions.
 */
function extractPropSummary(props: unknown, depth: number = 0): Record<string, string> {
    const summary: Record<string, string> = {};

    if (!isRecord(props)) {
        return summary;
    }

    // Zod v4 objects have a `.shape` property (object with ZodType values)
    if ('shape' in props) {
        const shape = props['shape'];
        if (isRecord(shape)) {
            for (const [key, fieldSchema] of Object.entries(shape)) {
                summary[key] = describeZodType(fieldSchema, depth);
            }
        }
    }

    return summary;
}

/**
 * Maximum recursion depth for nested type introspection.
 *
 * Prevents infinite recursion on self-referential schemas (e.g., `z.lazy()`).
 * 3 levels is sufficient for all practical GenUI prop structures:
 * `{ items: array of { nested: { key: string } } }` = 3 levels.
 */
const MAX_INTROSPECTION_DEPTH = 3;

/**
 * Resolves the type tag from a Zod schema's internal definition.
 *
 * Handles both Zod v3 (`_def.typeName`) and Zod v4 (`_zod.def.type`)
 * internal structures via duck-typing.
 *
 * @param def - The internal definition record (from `_def` or `_zod`).
 * @returns The type name string, or empty string if not found.
 * @internal
 */
function resolveTypeName(def: Record<string, unknown>): string {
    // Zod v3: _def.typeName = 'ZodString'
    if (typeof def['typeName'] === 'string') {
        return def['typeName'];
    }

    // Zod v4: _zod.def.type = 'string' (or _def.type = 'string')
    if (typeof def['type'] === 'string') {
        return def['type'];
    }

    return '';
}

/**
 * Normalizes a Zod type tag to a canonical form.
 *
 * Zod v3 uses PascalCase prefixed with 'Zod' (e.g., `'ZodString'`),
 * while Zod v4 uses lowercase (e.g., `'string'`). This function maps
 * both conventions to a unified lowercase form.
 *
 * @param raw - The raw type tag from `resolveTypeName()`.
 * @returns Normalized lowercase type name (e.g., `'string'`, `'array'`).
 * @internal
 */
function normalizeTypeName(raw: string): string {
    // Zod v3: 'ZodString' → 'string', 'ZodArray' → 'array'
    if (raw.startsWith('Zod')) {
        return raw.slice(3).toLowerCase();
    }

    // Zod v4: already lowercase ('string', 'array', 'enum', etc.)
    return raw.toLowerCase();
}

/**
 * Formats a prop summary record into a compact inline string.
 *
 * Converts `{ name: 'string', age: 'number' }` → `'{name: string, age: number}'`.
 * Used by the `ZodObject` introspection case to produce nested type descriptions.
 *
 * @param summary - Prop summary record from `extractPropSummary()`.
 * @returns Compact inline string representation.
 * @internal
 */
function formatPropSummaryInline(summary: Record<string, string>): string {
    const entries = Object.entries(summary);
    if (entries.length === 0) {
        return 'object';
    }
    const fields = entries.map(([key, typeDesc]) => `${key}: ${typeDesc}`).join(', ');
    return `{${fields}}`;
}

/**
 * Generates a human-readable description of a Zod type.
 *
 * Recursively introspects the schema for common Zod type structures and
 * returns a concise description string suitable for LLM context injection.
 *
 * Handles both Zod v3 (`_def.typeName`) and Zod v4 (`_zod.def.type`)
 * internal structures via duck-typing.
 *
 * **Recursion (R8 compliance):**
 * - `ZodArray`: recurses into element type → `"array of {key: string, label: string}"`
 * - `ZodObject`: reuses `extractPropSummary()` → `"{name: string, age: number}"`
 * - `ZodUnion`: enumerates options → `"string | number"`
 * - Depth-limited to `MAX_INTROSPECTION_DEPTH` (3) to prevent infinite recursion.
 *
 * @param schema - A Zod field schema.
 * @param depth - Current recursion depth (0-indexed). Defaults to 0.
 * @returns A human-readable type string (e.g., `"string"`, `"enum: a|b|c"`).
 *
 * @see Design Choice R8 — compact JSON format with readable type strings.
 */
function describeZodType(schema: unknown, depth: number = 0): string {
    if (!isRecord(schema)) {
        return 'unknown';
    }

    // Depth guard: prevent infinite recursion on self-referential schemas
    if (depth >= MAX_INTROSPECTION_DEPTH) {
        return 'unknown';
    }

    // Resolve the internal definition from Zod v3 (_def) or Zod v4 (_zod)
    const rawDef = '_def' in schema ? schema['_def'] : '_zod' in schema ? schema['_zod'] : null;
    const def = isRecord(rawDef) ? rawDef : null;

    // Zod v4 nests the definition inside _zod.def
    const innerDef = def !== null && 'def' in def && isRecord(def['def']) ? def['def'] : def;

    if (innerDef !== null) {
        const rawTypeName = resolveTypeName(innerDef);
        const typeName = normalizeTypeName(rawTypeName);

        switch (typeName) {
            case 'string':
                return 'string';
            case 'number':
                return 'number';
            case 'boolean':
                return 'boolean';
            case 'enum': {
                // Zod v3: _def.values = ['a', 'b', 'c']
                const values = innerDef['values'];
                if (Array.isArray(values)) {
                    return `enum: ${values.join('|')}`;
                }
                // Zod v4: _zod.def.entries = { a: 'a', b: 'b' }
                const entries = innerDef['entries'];
                if (isRecord(entries)) {
                    return `enum: ${Object.keys(entries).join('|')}`;
                }
                return 'enum';
            }
            case 'array': {
                // Zod v3: _def.type = innerSchema
                // Zod v4: _zod.def.element = innerSchema
                const element = innerDef['element'] ?? innerDef['type'];
                if (element !== undefined && isRecord(element)) {
                    const inner = describeZodType(element, depth + 1);
                    return `array of ${inner}`;
                }
                return 'array';
            }
            case 'object': {
                // DRY: reuse extractPropSummary() to introspect the shape.
                // The schema itself (not innerDef) has the .shape property.
                const summary = extractPropSummary(schema, depth + 1);
                return formatPropSummaryInline(summary);
            }
            case 'union': {
                // Zod v4: _zod.def.options = [ZodType, ZodType, ...]
                const options = innerDef['options'];
                if (Array.isArray(options)) {
                    const described = options.map((opt: unknown) => describeZodType(opt, depth + 1));
                    return described.join(' | ');
                }
                return 'unknown';
            }
            case 'optional': {
                const innerType = innerDef['innerType'];
                if (innerType !== undefined) {
                    return `${describeZodType(innerType, depth + 1)} (optional)`;
                }
                return 'optional';
            }
            case 'nullable': {
                const innerType = innerDef['innerType'];
                if (innerType !== undefined) {
                    return `${describeZodType(innerType, depth + 1)} (nullable)`;
                }
                return 'nullable';
            }
            case 'default': {
                const innerType = innerDef['innerType'];
                if (innerType !== undefined) {
                    return describeZodType(innerType, depth + 1);
                }
                return 'unknown';
            }
            default:
                break;
        }
    }

    // Fallback: check for description property on the schema itself
    if ('description' in schema && typeof schema['description'] === 'string') {
        return schema['description'];
    }

    return 'unknown';
}

// ---------------------------------------------------------------------------
// Manifest Generator
// ---------------------------------------------------------------------------

/**
 * Generates a compact manifest from registered components.
 *
 * Each `CompactManifestEntry` contains the minimal information needed for
 * the LLM to select the right component:
 * - `name` — PascalCase component name (max 30 chars)
 * - `description` — concise description (max 120 chars)
 * - `category` — component category
 * - `props` — simplified key→type map
 *
 * @param contracts - Iterable of `ComponentContract` instances.
 * @returns Array of `CompactManifestEntry` sorted alphabetically by name.
 *
 * @example
 * ```ts
 * const manifest = generateManifest(registeredComponents.values());
 * // [{ name: 'PatientVitals', description: '...', category: 'clinical', props: { patientId: 'string' } }]
 * ```
 */
export function generateManifest(
    contracts: Iterable<ComponentContract>,
): CompactManifestEntry[] {
    const entries: CompactManifestEntry[] = [];

    for (const contract of contracts) {
        const entry: CompactManifestEntry = {
            name: contract.name,
            description: contract.description,
            category: contract.category,
            props: extractPropSummary(contract.props),
        };

        entries.push(entry);
    }

    // Sort alphabetically for deterministic output
    entries.sort((a, b) => a.name.localeCompare(b.name));

    return entries;
}
