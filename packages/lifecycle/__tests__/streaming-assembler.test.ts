/**
 * @module @enterstellar-ai/lifecycle/__tests__/streaming-assembler
 * @description Unit tests for the streaming assembler, path parsing, and deep-set.
 *
 * Covers fragment application, batch operations, deep path handling,
 * Zod-based completeness checks (LC5), error handling on malformed paths (ENS-3004),
 * and reset behavior. Also tests the internal parsePath and deepSet utilities.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createStreamingAssembler, parsePath, deepSet } from '../src/streaming-assembler.js';

// ---------------------------------------------------------------------------
// parsePath (internal utility)
// ---------------------------------------------------------------------------

describe('parsePath', () => {
    it('parses a simple key', () => {
        const segments = parsePath('title');
        expect(segments).toEqual([{ key: 'title' }]);
    });

    it('parses nested dot-notation', () => {
        const segments = parsePath('a.b.c');
        expect(segments).toEqual([{ key: 'a' }, { key: 'b' }, { key: 'c' }]);
    });

    it('parses array bracket notation', () => {
        const segments = parsePath('items[0]');
        expect(segments).toEqual([{ key: 'items' }, { key: 0 }]);
    });

    it('parses mixed dot and bracket notation', () => {
        const segments = parsePath('items[0].name');
        expect(segments).toEqual([{ key: 'items' }, { key: 0 }, { key: 'name' }]);
    });

    it('parses deeply nested with multiple arrays', () => {
        const segments = parsePath('data[2].values[0]');
        expect(segments).toEqual([
            { key: 'data' },
            { key: 2 },
            { key: 'values' },
            { key: 0 },
        ]);
    });

    it('throws ENS-3004 on empty path', () => {
        expect(() => parsePath('')).toThrow(EnterstellarError);
        try {
            parsePath('');
        } catch (e: unknown) {
            expect((e as EnterstellarError).code).toBe('ENS-3004');
        }
    });

    it('throws ENS-3004 on leading dot', () => {
        expect(() => parsePath('.leading')).toThrow(EnterstellarError);
    });

    it('throws ENS-3004 on trailing dot', () => {
        expect(() => parsePath('trailing.')).toThrow(EnterstellarError);
    });

    it('throws ENS-3004 on consecutive dots', () => {
        expect(() => parsePath('a..b')).toThrow(EnterstellarError);
    });
});

// ---------------------------------------------------------------------------
// deepSet (internal utility)
// ---------------------------------------------------------------------------

describe('deepSet', () => {
    it('sets a simple key', () => {
        const target: Record<string, unknown> = {};
        deepSet(target, [{ key: 'name' }], 'Alice');
        expect(target).toEqual({ name: 'Alice' });
    });

    it('sets a nested key, creating intermediates', () => {
        const target: Record<string, unknown> = {};
        deepSet(target, [{ key: 'a' }, { key: 'b' }, { key: 'c' }], 42);
        expect(target).toEqual({ a: { b: { c: 42 } } });
    });

    it('sets an array element, creating intermediate array', () => {
        const target: Record<string, unknown> = {};
        deepSet(target, [{ key: 'items' }, { key: 0 }], 'first');
        expect((target['items'] as unknown[])[0]).toBe('first');
    });

    it('sets a nested property inside an array element', () => {
        const target: Record<string, unknown> = {};
        deepSet(target, [{ key: 'items' }, { key: 0 }, { key: 'name' }], 'Widget');
        const items = target['items'] as Record<string, unknown>[];
        expect(items[0]).toEqual({ name: 'Widget' });
    });

    it('overwrites existing values', () => {
        const target: Record<string, unknown> = { name: 'old' };
        deepSet(target, [{ key: 'name' }], 'new');
        expect(target).toEqual({ name: 'new' });
    });

    it('preserves sibling keys', () => {
        const target: Record<string, unknown> = { a: 1, b: 2 };
        deepSet(target, [{ key: 'a' }], 10);
        expect(target).toEqual({ a: 10, b: 2 });
    });
});

// ---------------------------------------------------------------------------
// createStreamingAssembler — apply
// ---------------------------------------------------------------------------

describe('createStreamingAssembler — apply', () => {
    it('applies a single fragment', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'patientId', value: 'P-123' });
        expect(assembler.getAccumulated()).toEqual({ patientId: 'P-123' });
    });

    it('applies multiple fragments sequentially', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'patientId', value: 'P-123' });
        assembler.apply({ path: 'name', value: 'Alice' });
        expect(assembler.getAccumulated()).toEqual({
            patientId: 'P-123',
            name: 'Alice',
        });
    });

    it('applies nested path fragments', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'metrics[0].label', value: 'Heart Rate' });
        assembler.apply({ path: 'metrics[0].value', value: 92 });
        const result = assembler.getAccumulated();
        const metrics = result['metrics'] as Record<string, unknown>[];
        expect(metrics[0]).toEqual({ label: 'Heart Rate', value: 92 });
    });

    it('throws ENS-3004 on malformed path', () => {
        const assembler = createStreamingAssembler();
        expect(() => assembler.apply({ path: '', value: 'test' })).toThrow(EnterstellarError);
    });
});

// ---------------------------------------------------------------------------
// createStreamingAssembler — applyBatch
// ---------------------------------------------------------------------------

describe('createStreamingAssembler — applyBatch', () => {
    it('applies all fragments in order', () => {
        const assembler = createStreamingAssembler();
        assembler.applyBatch([
            { path: 'a', value: 1 },
            { path: 'b', value: 2 },
            { path: 'c', value: 3 },
        ]);
        expect(assembler.getAccumulated()).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('later fragments overwrite earlier ones at same path', () => {
        const assembler = createStreamingAssembler();
        assembler.applyBatch([
            { path: 'value', value: 'first' },
            { path: 'value', value: 'second' },
        ]);
        expect(assembler.getAccumulated()).toEqual({ value: 'second' });
    });

    it('handles empty batch', () => {
        const assembler = createStreamingAssembler();
        assembler.applyBatch([]);
        expect(assembler.getAccumulated()).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// createStreamingAssembler — getAccumulated
// ---------------------------------------------------------------------------

describe('createStreamingAssembler — getAccumulated', () => {
    it('returns a deep copy (no shared references)', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'data.value', value: 42 });

        const copy1 = assembler.getAccumulated();
        const copy2 = assembler.getAccumulated();

        expect(copy1).toEqual(copy2);
        expect(copy1).not.toBe(copy2); // different references

        // Mutating copy1 should not affect copy2 or internal state
        (copy1 as Record<string, Record<string, unknown>>)['data']['value'] = 999;
        expect(assembler.getAccumulated()).toEqual({ data: { value: 42 } });
    });

    it('returns empty object initially', () => {
        const assembler = createStreamingAssembler();
        expect(assembler.getAccumulated()).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// createStreamingAssembler — isComplete (LC5)
// ---------------------------------------------------------------------------

describe('createStreamingAssembler — isComplete', () => {
    const schema = z.object({
        patientId: z.string(),
        name: z.string(),
        heartRate: z.number(),
    });

    it('returns false when no fragments applied', () => {
        const assembler = createStreamingAssembler();
        expect(assembler.isComplete(schema)).toBe(false);
    });

    it('returns false when partial data is present', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'patientId', value: 'P-123' });
        assembler.apply({ path: 'name', value: 'Alice' });
        // missing heartRate
        expect(assembler.isComplete(schema)).toBe(false);
    });

    it('returns true when all required fields are present and valid', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'patientId', value: 'P-123' });
        assembler.apply({ path: 'name', value: 'Alice' });
        assembler.apply({ path: 'heartRate', value: 72 });
        expect(assembler.isComplete(schema)).toBe(true);
    });

    it('returns false when types do not match', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'patientId', value: 'P-123' });
        assembler.apply({ path: 'name', value: 'Alice' });
        assembler.apply({ path: 'heartRate', value: 'not-a-number' }); // wrong type
        expect(assembler.isComplete(schema)).toBe(false);
    });

    it('does not inject optimistic defaults (LC6)', () => {
        const schemaWithDefaults = z.object({
            required: z.string(),
            optional: z.string().default('fallback'),
        });

        const assembler = createStreamingAssembler();
        // Only apply the required field — optional is not in accumulated
        assembler.apply({ path: 'required', value: 'present' });

        // The accumulated object does NOT have 'optional' — safeParse
        // with Zod defaults will still pass, but the accumulated state
        // itself remains without injected defaults
        const accumulated = assembler.getAccumulated();
        expect(accumulated).not.toHaveProperty('optional');
    });

    it('works with nested schemas', () => {
        const nestedSchema = z.object({
            patient: z.object({
                id: z.string(),
                vitals: z.object({
                    heartRate: z.number(),
                }),
            }),
        });

        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'patient.id', value: 'P-123' });
        expect(assembler.isComplete(nestedSchema)).toBe(false);

        assembler.apply({ path: 'patient.vitals.heartRate', value: 72 });
        expect(assembler.isComplete(nestedSchema)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// createStreamingAssembler — reset
// ---------------------------------------------------------------------------

describe('createStreamingAssembler — reset', () => {
    it('clears all accumulated data', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'a', value: 1 });
        assembler.apply({ path: 'b', value: 2 });

        assembler.reset();
        expect(assembler.getAccumulated()).toEqual({});
    });

    it('allows new fragments after reset', () => {
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'old', value: 'data' });
        assembler.reset();

        assembler.apply({ path: 'new', value: 'data' });
        expect(assembler.getAccumulated()).toEqual({ new: 'data' });
    });

    it('isComplete returns false after reset', () => {
        const schema = z.object({ value: z.string() });
        const assembler = createStreamingAssembler();
        assembler.apply({ path: 'value', value: 'present' });
        expect(assembler.isComplete(schema)).toBe(true);

        assembler.reset();
        expect(assembler.isComplete(schema)).toBe(false);
    });
});
