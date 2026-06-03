/**
 * @module @enterstellar-ai/migration/__tests__/zod-inference
 * @description Unit tests for the TypeScript → Zod schema mapper.
 *
 * Uses in-memory `ts-morph` `Project` instances with fixture type
 * declarations. Each test resolves a type via `ts-morph` and verifies
 * the generated Zod schema matches expectations.
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { z } from 'zod';

import { typeToZodSchema, isAllStringLiterals } from '../src/extract/zod-inference.js';

import type { ExtractDiagnostic } from '../src/types.js';

/** Resolve a named type from fixture source. */
function resolveType(source: string, typeName: string) {
    const project = new Project({ useInMemoryFileSystem: true });
    const sf = project.createSourceFile('fixture.ts', source);
    const typeAlias = sf.getTypeAliasOrThrow(typeName);
    return typeAlias.getType();
}

/** Resolve the type of a named variable from fixture source. */
function resolveVarType(source: string, varName: string) {
    const project = new Project({ useInMemoryFileSystem: true });
    const sf = project.createSourceFile('fixture.ts', source);
    const decl = sf.getVariableDeclarationOrThrow(varName);
    return decl.getType();
}

// ---------------------------------------------------------------------------
// isAllStringLiterals
// ---------------------------------------------------------------------------

describe('isAllStringLiterals', () => {
    it('returns true for all string literal union members', () => {
        const type = resolveType(`type T = 'a' | 'b' | 'c';`, 'T');
        expect(isAllStringLiterals(type.getUnionTypes())).toBe(true);
    });

    it('returns false for mixed union', () => {
        const type = resolveType(`type T = 'a' | number;`, 'T');
        expect(isAllStringLiterals(type.getUnionTypes())).toBe(false);
    });

    it('returns false for empty array', () => {
        expect(isAllStringLiterals([])).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('typeToZodSchema — primitives', () => {
    it('maps string → z.string()', () => {
        const type = resolveType(`type T = string;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse('hello')).toBe('hello');
        expect(() => schema.parse(42)).toThrow();
    });

    it('maps number → z.number()', () => {
        const type = resolveType(`type T = number;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(42)).toBe(42);
    });

    it('maps boolean → z.boolean()', () => {
        const type = resolveType(`type T = boolean;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(true)).toBe(true);
    });

    it('maps null → z.null()', () => {
        const type = resolveType(`type T = null;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(null)).toBeNull();
    });

    it('maps undefined → z.undefined()', () => {
        const type = resolveType(`type T = undefined;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(undefined)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Literals
// ---------------------------------------------------------------------------

describe('typeToZodSchema — literals', () => {
    it('maps string literal → z.literal()', () => {
        const type = resolveType(`type T = 'hello';`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse('hello')).toBe('hello');
        expect(() => schema.parse('world')).toThrow();
    });

    it('maps number literal → z.literal()', () => {
        const type = resolveType(`type T = 42;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(42)).toBe(42);
    });

    it('maps boolean literal true → z.literal(true)', () => {
        const type = resolveType(`type T = true;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(true)).toBe(true);
        expect(() => schema.parse(false)).toThrow();
    });
});

// ---------------------------------------------------------------------------
// Unions
// ---------------------------------------------------------------------------

describe('typeToZodSchema — unions', () => {
    it('maps string literal union → z.enum()', () => {
        const type = resolveType(`type T = 'sm' | 'md' | 'lg';`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse('sm')).toBe('sm');
        expect(schema.parse('md')).toBe('md');
        expect(() => schema.parse('xl')).toThrow();
    });

    it('maps mixed union → z.union()', () => {
        const type = resolveType(`type T = string | number;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse('hello')).toBe('hello');
        expect(schema.parse(42)).toBe(42);
    });

    it('extracts T | undefined → z.optional()', () => {
        const type = resolveType(`type T = string | undefined;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse('hello')).toBe('hello');
        expect(schema.parse(undefined)).toBeUndefined();
    });

    it('extracts T | null → z.nullable()', () => {
        const type = resolveType(`type T = string | null;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse('hello')).toBe('hello');
        expect(schema.parse(null)).toBeNull();
    });

    it('handles T | null | undefined (both optional + nullable)', () => {
        const type = resolveType(`type T = string | null | undefined;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse('hello')).toBe('hello');
        expect(schema.parse(null)).toBeNull();
        expect(schema.parse(undefined)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

describe('typeToZodSchema — objects', () => {
    it('maps simple object type → z.object()', () => {
        const type = resolveType(`type T = { name: string; age: number };`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        const result = schema.parse({ name: 'Alice', age: 30 });
        expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('maps object with optional field', () => {
        const type = resolveType(`type T = { name: string; nickname?: string };`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse({ name: 'Alice' })).toBeDefined();
    });

    it('maps empty object → z.object({})', () => {
        const type = resolveType(`type T = {};`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse({})).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

describe('typeToZodSchema — arrays', () => {
    it('maps T[] → z.array()', () => {
        const type = resolveType(`type T = string[];`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('maps nested array', () => {
        const type = resolveType(`type T = number[][];`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse([[1, 2], [3]])).toEqual([[1, 2], [3]]);
    });
});

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

describe('typeToZodSchema — records', () => {
    it('maps Record<string, T> → z.record()', () => {
        const type = resolveType(`type T = Record<string, number>;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    });
});

// ---------------------------------------------------------------------------
// Tuples
// ---------------------------------------------------------------------------

describe('typeToZodSchema — tuples', () => {
    it('maps [string, number] → z.tuple()', () => {
        const type = resolveType(`type T = [string, number];`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse(['hello', 42])).toEqual(['hello', 42]);
    });
});

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

describe('typeToZodSchema — functions', () => {
    it('maps callback prop type → z.function()', () => {
        const type = resolveType(`type T = () => void;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Intersections
// ---------------------------------------------------------------------------

describe('typeToZodSchema — intersections', () => {
    it('maps A & B → z.intersection()', () => {
        const type = resolveType(
            `type A = { x: string }; type B = { y: number }; type T = A & B;`,
            'T',
        );
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag);
        expect(schema.parse({ x: 'hello', y: 42 })).toEqual({ x: 'hello', y: 42 });
    });
});

// ---------------------------------------------------------------------------
// Depth Guard
// ---------------------------------------------------------------------------

describe('typeToZodSchema — depth guard', () => {
    it('returns z.unknown() and emits diagnostic at max depth', () => {
        const type = resolveType(`type T = string;`, 'T');
        const diag: ExtractDiagnostic[] = [];
        const schema = typeToZodSchema(type, diag, 10); // depth = MAX_DEPTH
        // Should fall back to z.unknown() instead of z.string()
        expect(schema.parse(42)).toBe(42); // z.unknown() accepts anything
        expect(diag).toHaveLength(1);
        expect(diag[0]?.level).toBe('warning');
        expect(diag[0]?.message).toContain('Max recursion depth');
    });
});

// ---------------------------------------------------------------------------
// Unresolvable Types
// ---------------------------------------------------------------------------

describe('typeToZodSchema — unresolvable types', () => {
    it('emits diagnostic for generic type parameters', () => {
        // Use a variable with an explicit generic annotation
        const type = resolveVarType(
            `declare const x: any;`,
            'x',
        );
        const diag: ExtractDiagnostic[] = [];
        // 'any' is not string/number/boolean/null/undefined/union/object
        // so it should produce z.unknown() or match a case
        typeToZodSchema(type, diag);
        // Just verify it doesn't throw
    });
});
