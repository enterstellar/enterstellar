/**
 * @module @enterstellar-ai/compiler/__tests__/deterministic-correction
 * @description Unit tests for Tier 1 deterministic correction strategies.
 *
 * Exercises all 5 Tier 1 strategies through the public
 * `attemptDeterministicCorrection()` entry point with real Zod schemas.
 *
 * Test cases map to Bible §10.1 #1–#7 plus additional edge cases
 * for empty string guard and expanded boolean coercion.
 *
 * @see Bible §10.1 — Unit test matrix.
 * @see Design Choice SC-04 — 4 Tier 1 strategies.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { attemptDeterministicCorrection } from '../src/deterministic-correction.js';
import type { CompilationError, ComponentContract, DesignTokenSet } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal `ComponentContract` with the given Zod schema and examples.
 * All non-schema fields are stubs — the correction module only reads
 * `props`, `examples`, and `tokens`.
 */
function createTestContract(
    schema: z.ZodType,
    examples: readonly { intent: string; props: Record<string, unknown> }[] = [],
): ComponentContract {
    return {
        name: 'TestComponent',
        id: 'test-component' as ComponentContract['id'],
        description: 'Test component for correction tests',
        category: 'utility',
        tags: ['test'],
        props: schema,
        tokens: {},
        accessibility: { role: 'region', ariaLabel: 'Test', announceOnUpdate: false },
        states: {
            loading: { component: 'Loading', props: {} },
            error: { component: 'Error', props: {} },
            empty: { component: 'Empty', props: {} },
            ready: { component: 'Ready', props: {} },
        },
        examples,
        _meta: { forged: false },
    } as unknown as ComponentContract;
}

/**
 * Creates a `CompilationError` with a `fix` suggestion,
 * matching the shape produced by `parse-step.ts`.
 */
function createFixableError(
    field: string,
    was: unknown,
    shouldBe: unknown,
    code: string = 'ENS-2001',
): CompilationError {
    return {
        code,
        path: `props.${field}`,
        message: `Test error for field "${field}"`,
        received: was,
        expected: shouldBe,
        fix: { field, was, shouldBe },
    };
}

/** Empty design token set for tests that don't involve tokens. */
const EMPTY_TOKENS: DesignTokenSet = {};

// ---------------------------------------------------------------------------
// Tests: Strategy 1 — Type Coercion (§3.4 Strategy 1)
// ---------------------------------------------------------------------------

describe('Tier 1: Type Coercion', () => {
    const schema = z.object({ age: z.number() });
    const contract = createTestContract(schema);

    it('#1 — string "72" → number 72', () => {
        const errors: CompilationError[] = [
            createFixableError('age', '72', 'number'),
        ];
        const props = { age: '72' };

        const result = attemptDeterministicCorrection(errors, props, contract, EMPTY_TOKENS);

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ age: 72 });
        expect(result.remaining).toHaveLength(0);
        expect(result.trace).toHaveLength(1);
        expect(result.trace[0]?.strategy).toBe('type-coercion');
        expect(result.trace[0]?.tier).toBe(1);
    });

    it('#2 — string "abc" → number fails (NaN)', () => {
        const errors: CompilationError[] = [
            createFixableError('age', 'abc', 'number'),
        ];
        const props = { age: 'abc' };

        const result = attemptDeterministicCorrection(errors, props, contract, EMPTY_TOKENS);

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
        expect(result.remaining[0]?.code).toBe('ENS-2001');
        expect(result.trace).toHaveLength(0);
    });

    it('#3 — string "" → number rejected (empty string guard)', () => {
        const errors: CompilationError[] = [
            createFixableError('age', '', 'number'),
        ];
        const props = { age: '' };

        const result = attemptDeterministicCorrection(errors, props, contract, EMPTY_TOKENS);

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
        // Empty string must NOT coerce to 0
        expect(result.props).toEqual({ age: '' });
    });

    it('number → string coercion (lossless)', () => {
        const stringSchema = z.object({ label: z.string() });
        const stringContract = createTestContract(stringSchema);
        const errors: CompilationError[] = [
            createFixableError('label', 123, 'string'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { label: 123 }, stringContract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ label: '123' });
        expect(result.trace[0]?.strategy).toBe('type-coercion');
    });

    it('boolean → string coercion (lossless)', () => {
        const stringSchema = z.object({ flag: z.string() });
        const stringContract = createTestContract(stringSchema);
        const errors: CompilationError[] = [
            createFixableError('flag', true, 'string'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { flag: true }, stringContract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ flag: 'true' });
    });
});

// ---------------------------------------------------------------------------
// Tests: Strategy 2 — Boolean Coercion (§3.4 Strategy 2)
// ---------------------------------------------------------------------------

describe('Tier 1: Boolean Coercion', () => {
    const schema = z.object({ enabled: z.boolean() });
    const contract = createTestContract(schema);

    it('#4 — string "yes" → boolean true', () => {
        const errors: CompilationError[] = [
            createFixableError('enabled', 'yes', 'boolean'),
        ];
        const props = { enabled: 'yes' };

        const result = attemptDeterministicCorrection(errors, props, contract, EMPTY_TOKENS);

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ enabled: true });
        // "yes" is handled by boolean-coercion, not type-coercion
        expect(result.trace[0]?.strategy).toBe('boolean-coercion');
    });

    it('number 1 → boolean true (exact match)', () => {
        const errors: CompilationError[] = [
            createFixableError('enabled', 1, 'boolean'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { enabled: 1 }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ enabled: true });
        expect(result.trace[0]?.strategy).toBe('boolean-coercion');
    });

    it('number 0 → boolean false (exact match)', () => {
        const errors: CompilationError[] = [
            createFixableError('enabled', 0, 'boolean'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { enabled: 0 }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ enabled: false });
    });

    it('number 42 → boolean NOT corrected (not 0 or 1)', () => {
        const errors: CompilationError[] = [
            createFixableError('enabled', 42, 'boolean'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { enabled: 42 }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Tests: Strategy 3 — Default Extraction (§3.4 Strategy 3)
// ---------------------------------------------------------------------------

describe('Tier 1: Default Extraction', () => {
    it('#5 — missing field with z.default("active")', () => {
        const schema = z.object({
            status: z.string().default('active'),
        });
        const contract = createTestContract(schema);
        const errors: CompilationError[] = [
            createFixableError('status', undefined, 'string'),
        ];

        const result = attemptDeterministicCorrection(errors, {}, contract, EMPTY_TOKENS);

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ status: 'active' });
        expect(result.trace[0]?.strategy).toBe('default-extraction');
    });

    it('#6 — missing field, no default → remains in remaining', () => {
        const schema = z.object({
            patientId: z.string().min(1),
        });
        const contract = createTestContract(schema);
        const errors: CompilationError[] = [
            createFixableError('patientId', undefined, 'string'),
        ];

        const result = attemptDeterministicCorrection(errors, {}, contract, EMPTY_TOKENS);

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });

    it('null → default extraction (§3.5 null coercion path)', () => {
        const schema = z.object({
            priority: z.string().default('medium'),
        });
        const contract = createTestContract(schema);
        const errors: CompilationError[] = [
            createFixableError('priority', null, 'string'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { priority: null }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ priority: 'medium' });
        expect(result.trace[0]?.strategy).toBe('default-extraction');
    });
});

// ---------------------------------------------------------------------------
// Tests: Strategy 4 — Enum Nearest Match (§3.4 Strategy 4)
// ---------------------------------------------------------------------------

describe('Tier 1: Enum Nearest Match', () => {
    const schema = z.object({
        variant: z.enum(['default', 'outline', 'ghost']),
    });
    const contract = createTestContract(schema);

    it('#7 — enum "defualt" → "default" (distance 1)', () => {
        const errors: CompilationError[] = [
            createFixableError('variant', 'defualt', 'enum'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { variant: 'defualt' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ variant: 'default' });
        expect(result.trace[0]?.strategy).toBe('enum-nearest');
    });

    it('#8 — enum "banana" vs ["default", "outline", "ghost"] (distance > 2, NOT corrected)', () => {
        const errors: CompilationError[] = [
            createFixableError('variant', 'banana', 'enum'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { variant: 'banana' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });

    it('custom enumMatchThreshold=1 rejects distance-2 typo', () => {
        const errors: CompilationError[] = [
            // "ghoozt" → "ghost" = distance 2 (deletion + substitution)
            createFixableError('variant', 'ghoozt', 'enum'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { variant: 'ghoozt' }, contract, EMPTY_TOKENS, 1,
        );

        // "ghoozt" → "ghost" is distance 2, threshold 1 rejects it
        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Tests: Strategy 5 — Token Nearest Match (§3.4 Strategy 5)
// ---------------------------------------------------------------------------

describe('Tier 1: Token Nearest Match', () => {
    const schema = z.object({ color: z.string() });
    const contract = createTestContract(schema);

    it('#9 — token "token:denger" → "token:danger" (category match)', () => {
        const tokens: DesignTokenSet = {
            danger: '#dc2626',
            'danger-500': '#ef4444',
            success: '#16a34a',
        };
        const errors: CompilationError[] = [
            createFixableError('color', 'token:denger', 'token', 'ENS-2002'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { color: 'token:denger' }, contract, tokens,
        );

        expect(result.corrected).toBe(true);
        expect(result.props.color).toBe('token:danger');
        expect(result.trace[0]?.strategy).toBe('token-nearest');
    });

    it('empty token set → token correction fails gracefully', () => {
        const errors: CompilationError[] = [
            createFixableError('color', 'token:unknown', 'token', 'ENS-2002'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { color: 'token:unknown' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Tests: Edge Cases
// ---------------------------------------------------------------------------

describe('Tier 1: Edge Cases', () => {
    it('error without fix field → pushed to remaining (no crash)', () => {
        const schema = z.object({ title: z.string() });
        const contract = createTestContract(schema);
        const error: CompilationError = {
            code: 'ENS-2001',
            path: 'props.title',
            message: 'Missing title',
            // No fix field
        };

        const result = attemptDeterministicCorrection(
            [error], {}, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });

    it('props.field prefix is stripped correctly', () => {
        const schema = z.object({ age: z.number() });
        const contract = createTestContract(schema);
        const errors: CompilationError[] = [{
            code: 'ENS-2001',
            path: 'props.age',
            message: 'Type mismatch',
            fix: { field: 'props.age', was: '25', shouldBe: 'number' },
        }];

        const result = attemptDeterministicCorrection(
            errors, { age: '25' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ age: 25 });
    });

    it('inputs are not mutated (pure function)', () => {
        const schema = z.object({ age: z.number() });
        const contract = createTestContract(schema);
        const originalProps = { age: '72' };
        const originalPropsCopy = { ...originalProps };
        const errors: CompilationError[] = [
            createFixableError('age', '72', 'number'),
        ];

        attemptDeterministicCorrection(errors, originalProps, contract, EMPTY_TOKENS);

        // Original props must not be mutated
        expect(originalProps).toEqual(originalPropsCopy);
    });
});
