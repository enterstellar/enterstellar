/**
 * @module @enterstellar-ai/migration/__tests__/generate-example-props
 * @description Unit tests for the Zod schema → minimal valid props generator.
 *
 * Validates the recursive Zod v4 introspection walker against all 17+
 * Zod type cases, default prop priority resolution, and edge cases
 * (empty schemas, optional omission, depth guard).
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { generateExampleProps } from '../src/assembly/generate-example-props.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

describe('generateExampleProps — primitives', () => {
    it('generates empty string for z.string()', () => {
        const schema = z.object({ name: z.string() });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ name: '' });
    });

    it('generates 0 for z.number()', () => {
        const schema = z.object({ count: z.number() });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ count: 0 });
    });

    it('generates false for z.boolean()', () => {
        const schema = z.object({ active: z.boolean() });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ active: false });
    });

    it('generates null for z.null()', () => {
        const schema = z.object({ value: z.null() });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ value: null });
    });

    it('generates all primitives together', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number(),
            active: z.boolean(),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ name: '', age: 0, active: false });
    });
});

// ---------------------------------------------------------------------------
// Literals and Enums
// ---------------------------------------------------------------------------

describe('generateExampleProps — literals and enums', () => {
    it('uses the literal value for z.literal()', () => {
        const schema = z.object({ type: z.literal('button') });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ type: 'button' });
    });

    it('uses the first enum value for z.enum()', () => {
        const schema = z.object({ size: z.enum(['sm', 'md', 'lg']) });
        const result = generateExampleProps(schema, {});
        expect(result['size']).toBe('sm');
    });

    it('handles numeric literal', () => {
        const schema = z.object({ code: z.literal(42) });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ code: 42 });
    });

    it('handles boolean literal', () => {
        const schema = z.object({ enabled: z.literal(true) });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ enabled: true });
    });
});

// ---------------------------------------------------------------------------
// Default Props (Priority 1)
// ---------------------------------------------------------------------------

describe('generateExampleProps — defaultProps override', () => {
    it('uses defaultProps over type-derived values', () => {
        const schema = z.object({
            label: z.string(),
            count: z.number(),
        });
        const result = generateExampleProps(schema, { label: 'Hello' });
        expect(result).toEqual({ label: 'Hello', count: 0 });
    });

    it('uses defaultProps over Zod defaults', () => {
        const schema = z.object({
            label: z.string().default('Default Label'),
        });
        const result = generateExampleProps(schema, { label: 'Override' });
        expect(result).toEqual({ label: 'Override' });
    });

    it('passes through defaultProps for non-ZodObject schemas', () => {
        const result = generateExampleProps(z.unknown(), { label: 'Hello' });
        expect(result).toEqual({ label: 'Hello' });
    });
});

// ---------------------------------------------------------------------------
// Zod .default() (Priority 2)
// ---------------------------------------------------------------------------

describe('generateExampleProps — Zod defaults', () => {
    it('extracts Zod .default() value when no defaultProps', () => {
        const schema = z.object({
            count: z.number().default(5),
            name: z.string(),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ count: 5, name: '' });
    });

    it('extracts string default', () => {
        const schema = z.object({
            label: z.string().default('Hello World'),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ label: 'Hello World' });
    });

    it('extracts boolean default', () => {
        const schema = z.object({
            disabled: z.boolean().default(true),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ disabled: true });
    });
});

// ---------------------------------------------------------------------------
// Optional Fields (Omitted)
// ---------------------------------------------------------------------------

describe('generateExampleProps — optional fields', () => {
    it('omits optional fields from output', () => {
        const schema = z.object({
            name: z.string(),
            className: z.string().optional(),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ name: '' });
        expect(result).not.toHaveProperty('className');
    });

    it('omits z.undefined() fields', () => {
        const schema = z.object({
            name: z.string(),
            removed: z.undefined(),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ name: '' });
        expect(result).not.toHaveProperty('removed');
    });
});

// ---------------------------------------------------------------------------
// Nullable Fields
// ---------------------------------------------------------------------------

describe('generateExampleProps — nullable fields', () => {
    it('generates null for nullable fields', () => {
        const schema = z.object({
            value: z.string().nullable(),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ value: null });
    });
});

// ---------------------------------------------------------------------------
// Nested Objects
// ---------------------------------------------------------------------------

describe('generateExampleProps — nested objects', () => {
    it('recurses into nested z.object()', () => {
        const schema = z.object({
            address: z.object({
                street: z.string(),
                city: z.string(),
            }),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({
            address: { street: '', city: '' },
        });
    });

    it('handles deeply nested objects', () => {
        const schema = z.object({
            level1: z.object({
                level2: z.object({
                    value: z.number(),
                }),
            }),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({
            level1: { level2: { value: 0 } },
        });
    });
});

// ---------------------------------------------------------------------------
// Arrays, Records, and Tuples
// ---------------------------------------------------------------------------

describe('generateExampleProps — composite types', () => {
    it('generates empty array for z.array()', () => {
        const schema = z.object({
            items: z.array(z.string()),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ items: [] });
    });

    it('generates empty object for z.record()', () => {
        const schema = z.object({
            metadata: z.record(z.string(), z.unknown()),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ metadata: {} });
    });

    it('generates positional array for z.tuple()', () => {
        const schema = z.object({
            pair: z.tuple([z.string(), z.number()]),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ pair: ['', 0] });
    });
});

// ---------------------------------------------------------------------------
// Union Types
// ---------------------------------------------------------------------------

describe('generateExampleProps — union types', () => {
    it('uses first option of z.union()', () => {
        const schema = z.object({
            value: z.union([z.string(), z.number()]),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ value: '' });
    });
});

// ---------------------------------------------------------------------------
// Intersection Types
// ---------------------------------------------------------------------------

describe('generateExampleProps — intersection types', () => {
    it('merges fields from both sides of z.intersection()', () => {
        const schema = z.object({
            combined: z.intersection(
                z.object({ a: z.string() }),
                z.object({ b: z.number() }),
            ),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({
            combined: { a: '', b: 0 },
        });
    });
});

// ---------------------------------------------------------------------------
// Function Props (Omitted)
// ---------------------------------------------------------------------------

describe('generateExampleProps — function props', () => {
    it('omits function/callback props', () => {
        const schema = z.object({
            label: z.string(),
            onClick: z.function(),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ label: '' });
        expect(result).not.toHaveProperty('onClick');
    });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('generateExampleProps — edge cases', () => {
    it('returns {} for z.unknown() schema', () => {
        const result = generateExampleProps(z.unknown(), {});
        expect(result).toEqual({});
    });

    it('returns {} for z.string() schema (non-object)', () => {
        const result = generateExampleProps(z.string(), {});
        expect(result).toEqual({});
    });

    it('returns {} for z.object({}) — empty schema', () => {
        const result = generateExampleProps(z.object({}), {});
        expect(result).toEqual({});
    });

    it('returns {} with empty defaultProps', () => {
        const schema = z.object({});
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({});
    });

    it('handles mixed required and optional fields', () => {
        const schema = z.object({
            required: z.string(),
            optional: z.string().optional(),
            withDefault: z.number().default(42),
        });
        const result = generateExampleProps(schema, {});
        expect(result).toEqual({ required: '', withDefault: 42 });
        expect(result).not.toHaveProperty('optional');
    });
});
