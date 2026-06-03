/**
 * @module @enterstellar-ai/compiler/__tests__/template-correction
 * @description Unit tests for Tier 2 template (example-based) correction.
 *
 * Verifies the staleness guard (SC-06), the activation precondition (D-1:
 * Tier 2 ONLY for missing fields), and the example fallback mechanism.
 *
 * @see Bible §10.1 #8–#10 — Tier 2 test cases.
 * @see Bible §4.3 — Tier 2 activation guard.
 * @see Design Choice SC-06 — staleness guard.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { attemptDeterministicCorrection } from '../src/deterministic-correction.js';
import type { CompilationError, ComponentContract, DesignTokenSet } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createTestContract(
    schema: z.ZodType,
    examples: readonly { intent: string; props: Record<string, unknown> }[] = [],
): ComponentContract {
    return {
        name: 'TestComponent',
        id: 'test-component' as ComponentContract['id'],
        description: 'Test component for Tier 2 tests',
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

function createMissingFieldError(field: string): CompilationError {
    return {
        code: 'ENS-2001',
        path: `props.${field}`,
        message: `Missing required field "${field}"`,
        fix: { field, was: undefined, shouldBe: 'required' },
    };
}

const EMPTY_TOKENS: DesignTokenSet = {};

// ---------------------------------------------------------------------------
// Tests: Tier 2 — Template Correction
// ---------------------------------------------------------------------------

describe('Tier 2: Template Correction', () => {
    it('#10 — empty examples → Tier 2 skipped (corrected: false)', () => {
        const schema = z.object({
            category: z.enum(['low', 'medium', 'high']),
        });
        // Contract with NO examples
        const contract = createTestContract(schema, []);
        const errors: CompilationError[] = [
            createMissingFieldError('category'),
        ];

        const result = attemptDeterministicCorrection(
            errors, {}, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
        // No Tier 2 trace entries
        const tier2Traces = result.trace.filter((t) => t.tier === 2);
        expect(tier2Traces).toHaveLength(0);
    });

    it('#11 — stale examples (fail safeParse) → Tier 2 skipped', () => {
        const schema = z.object({
            // Schema requires a number, but example has a string → stale
            score: z.number().min(0).max(100),
        });
        const contract = createTestContract(schema, [
            // This example is STALE — schema expects number, example has string
            { intent: 'Show score', props: { score: 'high' } },
        ]);
        const errors: CompilationError[] = [
            createMissingFieldError('score'),
        ];

        const result = attemptDeterministicCorrection(
            errors, {}, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });

    it('#12 — valid example fills missing field', () => {
        const schema = z.object({
            title: z.string().min(1),
            category: z.enum(['low', 'medium', 'high']),
        });
        const contract = createTestContract(schema, [
            { intent: 'Show risk', props: { title: 'Risk Report', category: 'medium' } },
        ]);
        // title is present, category is missing
        const errors: CompilationError[] = [
            createMissingFieldError('category'),
        ];

        const result = attemptDeterministicCorrection(
            errors, { title: 'My Report' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ title: 'My Report', category: 'medium' });
        expect(result.trace).toHaveLength(1);
        expect(result.trace[0]?.tier).toBe(2);
        expect(result.trace[0]?.strategy).toBe('example-fallback');
        expect(result.trace[0]?.was).toBeUndefined();
        expect(result.trace[0]?.correctedTo).toBe('medium');
    });
});

// ---------------------------------------------------------------------------
// Tests: D-1 Activation Guard (Bible §4.3)
// ---------------------------------------------------------------------------

describe('Tier 2: D-1 Activation Guard', () => {
    it('does NOT substitute example for wrong-type errors (fix.was !== undefined)', () => {
        const schema = z.object({
            patientId: z.string().min(1),
        });
        const contract = createTestContract(schema, [
            { intent: 'Show patient', props: { patientId: 'P-001' } },
        ]);
        // This is a TYPE error (number instead of string), not a missing field
        const errors: CompilationError[] = [{
            code: 'ENS-2001',
            path: 'props.patientId',
            message: 'Expected string, received number',
            fix: { field: 'patientId', was: 123, shouldBe: 'string' },
        }];

        const result = attemptDeterministicCorrection(
            errors, { patientId: 123 }, contract, EMPTY_TOKENS,
        );

        // Tier 1 type coercion should fix this (123 → "123"), NOT Tier 2
        expect(result.corrected).toBe(true);
        expect(result.props).toEqual({ patientId: '123' });
        // The correction should be type-coercion (Tier 1), NOT example-fallback (Tier 2)
        expect(result.trace[0]?.strategy).toBe('type-coercion');
        expect(result.trace[0]?.tier).toBe(1);
    });

    it('Tier 2 only applies to ENS-2001 errors', () => {
        const schema = z.object({ color: z.string() });
        const contract = createTestContract(schema, [
            { intent: 'Show color', props: { color: 'token:danger' } },
        ]);
        // ENS-2002 (token error) should NOT be handled by Tier 2
        const errors: CompilationError[] = [{
            code: 'ENS-2002',
            path: 'props.color',
            message: 'Invalid token',
            fix: { field: 'color', was: undefined, shouldBe: 'valid token' },
        }];

        const result = attemptDeterministicCorrection(
            errors, {}, contract, EMPTY_TOKENS,
        );

        // ENS-2002 with was=undefined is not handled by Tier 2 (wrong code)
        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
    });
});
