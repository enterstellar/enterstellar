/**
 * @module @enterstellar-ai/migration/extract/zod-inference
 * @description TypeScript type → Zod schema mapping.
 *
 * Converts TypeScript interface/type declarations into runtime Zod schemas.
 * This is the core type-system bridge: `ts-morph` extracts the type AST,
 * and this module maps each TS type node to its Zod equivalent.
 *
 * **Mapping table (core types):**
 *
 * | TypeScript              | Zod                          |
 * |:------------------------|:-----------------------------|
 * | `string`                | `z.string()`                 |
 * | `number`                | `z.number()`                 |
 * | `boolean`               | `z.boolean()`                |
 * | `null`                  | `z.null()`                   |
 * | `undefined`             | `z.undefined()`              |
 * | `'a'` (string literal)  | `z.literal('a')`             |
 * | `42` (number literal)   | `z.literal(42)`              |
 * | `true` (boolean literal)| `z.literal(true)`            |
 * | `'a' \| 'b' \| 'c'`    | `z.enum(['a', 'b', 'c'])`   |
 * | `string \| number`      | `z.union([z.string(), z.number()])` |
 * | `{ x: string }`         | `z.object({ x: z.string() })` |
 * | `T[]`                   | `z.array(zodOfT)`            |
 * | `Record<string, T>`     | `z.record(zodOfT)`           |
 * | `A & B`                 | `z.intersection(zodA, zodB)` |
 * | `[string, number]`      | `z.tuple([z.string(), z.number()])` |
 * | `() => void`            | `z.function()`               |
 * | `T \| undefined`        | `zodOfT.optional()`          |
 * | `T \| null`             | `zodOfT.nullable()`          |
 * | Generic / unresolvable  | `z.unknown()` + diagnostic   |
 * | Depth exceeded          | `z.unknown()` + diagnostic   |
 *
 * **Generic handling (REVIEW-level):** Generic type parameters that cannot
 * be statically resolved produce `z.unknown()` with a diagnostic. Phase 3
 * uses the `GenericParam.constraint` to generate better placeholders.
 *
 * **L15 compliance:** Zero framework imports. Uses `ts-morph` + `zod` only.
 *
 * @see Correction 1 — Generics: The Primary Source of REVIEW Annotations
 * @see Correction 2 — StructuralManifest.props (Zod schema from TS interface)
 */

import type { Type } from 'ts-morph';
import { z } from 'zod';

import type { ExtractDiagnostic } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum recursion depth for type → Zod schema mapping.
 *
 * Self-referential types (e.g., `type Tree = { children: Tree[] }`) can
 * cause infinite recursion. Beyond this depth, the mapper emits
 * `z.unknown()` and records a diagnostic.
 */
const MAX_DEPTH = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if all types in an array are string literal types.
 *
 * Used to optimize string literal unions into `z.enum()` instead of
 * `z.union([z.literal(), ...])`. This produces cleaner, more readable
 * schemas and better runtime validation messages.
 *
 * @param types - Array of `ts-morph` `Type` objects.
 * @returns `true` if every type is a string literal.
 */
export function isAllStringLiterals(types: readonly Type[]): boolean {
    return types.length > 0 && types.every((t) => t.isStringLiteral());
}

// ---------------------------------------------------------------------------
// Type → Zod Schema Mapping
// ---------------------------------------------------------------------------

/**
 * Converts a `ts-morph` `Type` to a Zod schema.
 *
 * Recursively maps TypeScript types to their Zod equivalents. For types
 * that cannot be statically resolved (generics, complex utility types),
 * falls back to `z.unknown()` and records a diagnostic.
 *
 * **Updated signature (from stub):** Adds `diagnostics` accumulator and
 * `depth` guard (max 10) per the implementation plan.
 *
 * @param type - The `ts-morph` `Type` to convert.
 * @param diagnostics - Mutable array to accumulate extraction diagnostics.
 *   Unresolvable types push `'warning'`-level diagnostics here.
 * @param depth - Current recursion depth (default 0). When `MAX_DEPTH`
 *   is reached, returns `z.unknown()` with a diagnostic.
 * @returns A Zod schema representing the TypeScript type.
 *
 * @see Correction 1 — Generic constraint → placeholder mapping table
 */
export function typeToZodSchema(
    type: Type,
    diagnostics: ExtractDiagnostic[],
    depth: number = 0,
): z.ZodType {
    // --- Depth guard ---
    if (depth >= MAX_DEPTH) {
        diagnostics.push({
            level: 'warning',
            message: `Max recursion depth (${String(MAX_DEPTH)}) reached for type "${type.getText()}". Using z.unknown().`,
            field: 'props',
        });
        return z.unknown();
    }

    // --- Primitives ---
    if (type.isString()) return z.string();
    if (type.isNumber()) return z.number();
    if (type.isBoolean()) return z.boolean();
    if (type.isNull()) return z.null();
    if (type.isUndefined()) return z.undefined();

    // --- Literals ---
    if (type.isStringLiteral()) return z.literal(type.getLiteralValueOrThrow() as string);
    if (type.isNumberLiteral()) return z.literal(type.getLiteralValueOrThrow() as number);
    if (type.isBooleanLiteral()) {
        const value = type.getText() === 'true';
        return z.literal(value);
    }

    // --- Unions (must come before object check — union members may be objects) ---
    if (type.isUnion()) {
        return handleUnion(type.getUnionTypes(), diagnostics, depth);
    }

    // --- Intersections ---
    if (type.isIntersection()) {
        return handleIntersection(type.getIntersectionTypes(), diagnostics, depth);
    }

    // --- Arrays ---
    if (type.isArray()) {
        const elementType = type.getArrayElementTypeOrThrow();
        return z.array(typeToZodSchema(elementType, diagnostics, depth + 1));
    }

    // --- Tuples ---
    if (type.isTuple()) {
        const elements = type.getTupleElements();
        const schemas = elements.map((el) => typeToZodSchema(el, diagnostics, depth + 1));
        return z.tuple(schemas as [z.ZodType, ...z.ZodType[]]);
    }

    // --- Functions (callback props) ---
    if (type.getCallSignatures().length > 0 && type.getProperties().length === 0) {
        return z.function();
    }

    // --- Objects / Interfaces ---
    if (type.isObject()) {
        return handleObject(type, diagnostics, depth);
    }

    // --- Enum types ---
    if (type.isEnum()) {
        const enumMembers = type.getUnionTypes();
        if (isAllStringLiterals(enumMembers)) {
            const values = enumMembers.map((m) => m.getLiteralValueOrThrow() as string);
            return z.enum(values as [string, ...string[]]);
        }
        // Mixed enum — map as union
        return handleUnion(enumMembers, diagnostics, depth);
    }

    // --- Fallback: unresolvable (generics, utility types, etc.) ---
    diagnostics.push({
        level: 'warning',
        message: `Unresolvable type "${type.getText()}". Using z.unknown(). This may be a generic type parameter.`,
        field: 'props',
    });
    return z.unknown();
}

// ---------------------------------------------------------------------------
// Union Handling
// ---------------------------------------------------------------------------

/**
 * Handles union type → Zod schema mapping.
 *
 * Applies three optimizations:
 * 1. Extracts `undefined` members → `.optional()`
 * 2. Extracts `null` members → `.nullable()`
 * 3. All-string-literal remainder → `z.enum()` instead of `z.union()`
 */
function handleUnion(
    members: Type[],
    diagnostics: ExtractDiagnostic[],
    depth: number,
): z.ZodType {
    // Separate undefined and null from the union
    let hasUndefined = false;
    let hasNull = false;
    const remaining: Type[] = [];

    for (const member of members) {
        if (member.isUndefined()) {
            hasUndefined = true;
        } else if (member.isNull()) {
            hasNull = true;
        } else {
            remaining.push(member);
        }
    }

    // Build the core schema from remaining types
    let schema: z.ZodType;

    if (remaining.length === 0) {
        // Union was only undefined/null
        schema = z.unknown();
    } else if (remaining.length === 1) {
        const single = remaining[0];
        if (single !== undefined) {
            schema = typeToZodSchema(single, diagnostics, depth + 1);
        } else {
            schema = z.unknown();
        }
    } else if (isAllStringLiterals(remaining)) {
        // Optimization: string literal union → z.enum()
        const values = remaining.map((m) => m.getLiteralValueOrThrow() as string);
        schema = z.enum(values as [string, ...string[]]);
    } else {
        // Mixed union → z.union()
        const schemas = remaining.map((m) => typeToZodSchema(m, diagnostics, depth + 1));
        schema = z.union(schemas as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }

    // Apply optional/nullable wrappers
    if (hasNull) {
        schema = schema.nullable();
    }
    if (hasUndefined) {
        schema = schema.optional();
    }

    return schema;
}

// ---------------------------------------------------------------------------
// Intersection Handling
// ---------------------------------------------------------------------------

/**
 * Handles intersection type → `z.intersection()`.
 *
 * Zod v4 `z.intersection()` takes exactly 2 arguments. For 3+ members,
 * we nest: `z.intersection(z.intersection(A, B), C)`.
 */
function handleIntersection(
    members: Type[],
    diagnostics: ExtractDiagnostic[],
    depth: number,
): z.ZodType {
    if (members.length === 0) return z.unknown();

    const first = members[0];
    if (first === undefined) return z.unknown();
    let result = typeToZodSchema(first, diagnostics, depth + 1);

    for (let i = 1; i < members.length; i++) {
        const member = members[i];
        if (member === undefined) continue;
        result = z.intersection(result, typeToZodSchema(member, diagnostics, depth + 1));
    }

    return result;
}

// ---------------------------------------------------------------------------
// Object Handling
// ---------------------------------------------------------------------------

/**
 * Handles object/interface type → `z.object()`.
 *
 * Recursively maps each property to its Zod equivalent. Detects
 * `Record<K, V>` pattern via index signatures and maps to `z.record()`.
 */
function handleObject(
    type: Type,
    diagnostics: ExtractDiagnostic[],
    depth: number,
): z.ZodType {
    // Check for Record/Map pattern — has string index signature, no named props
    const numberIndexType = type.getNumberIndexType();
    const stringIndexType = type.getStringIndexType();
    const properties = type.getProperties();

    if (stringIndexType !== undefined && properties.length === 0) {
        return z.record(z.string(), typeToZodSchema(stringIndexType, diagnostics, depth + 1));
    }
    if (numberIndexType !== undefined && properties.length === 0) {
        return z.record(z.number(), typeToZodSchema(numberIndexType, diagnostics, depth + 1));
    }

    // Standard object — map each property
    const shape: Record<string, z.ZodType> = {};
    for (const prop of properties) {
        const propName = prop.getName();
        const propType = prop.getValueDeclarationOrThrow().getType();
        const isOptional = prop.isOptional();

        let propSchema = typeToZodSchema(propType, diagnostics, depth + 1);
        if (isOptional) {
            propSchema = propSchema.optional();
        }

        shape[propName] = propSchema;
    }

    return z.object(shape);
}
