/**
 * @module @enterstellar-ai/compiler/__tests__/correction-integration
 * @description Integration tests for the Tier 1 → Tier 2 correction cascade.
 *
 * Verifies the full deterministic correction flow: Tier 1 fixes what it can,
 * remaining errors pass to Tier 2, and the SC-16 short-circuit optimization
 * skips Tier 2 when Tier 1 resolves all errors.
 *
 * @see Bible §10.2 — Integration test matrix.
 * @see Design Choice SC-16 — short-circuit optimization.
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
        description: 'Test component for integration tests',
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

const EMPTY_TOKENS: DesignTokenSet = {};

// ---------------------------------------------------------------------------
// Tests: Full Cascade
// ---------------------------------------------------------------------------

describe('Tier 1 → Tier 2 Cascade', () => {
    it('#1 — each tier works on shrinking error set', () => {
        // Schema with 3 fields:
        // - age: string "72" → Tier 1 type coercion fixes it
        // - status: missing, has z.default("active") → Tier 1 default extraction fixes it
        // - category: missing, no default → Tier 2 example fallback fixes it
        const schema = z.object({
            age: z.number(),
            status: z.string().default('active'),
            category: z.enum(['low', 'medium', 'high']),
        });
        const contract = createTestContract(schema, [
            { intent: 'Show risk', props: { age: 25, status: 'active', category: 'medium' } },
        ]);

        const errors: CompilationError[] = [
            {
                code: 'ENS-2001',
                path: 'props.age',
                message: 'Expected number',
                fix: { field: 'age', was: '72', shouldBe: 'number' },
            },
            {
                code: 'ENS-2001',
                path: 'props.status',
                message: 'Missing status',
                fix: { field: 'status', was: undefined, shouldBe: 'string' },
            },
            {
                code: 'ENS-2001',
                path: 'props.category',
                message: 'Missing category',
                fix: { field: 'category', was: undefined, shouldBe: 'enum' },
            },
        ];

        const result = attemptDeterministicCorrection(
            errors, { age: '72' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.remaining).toHaveLength(0);
        expect(result.props).toEqual({
            age: 72,           // Tier 1: type-coercion
            status: 'active',  // Tier 1: default-extraction
            category: 'medium', // Tier 2: example-fallback
        });

        // Verify trace has entries from both tiers
        const tier1Traces = result.trace.filter((t) => t.tier === 1);
        const tier2Traces = result.trace.filter((t) => t.tier === 2);
        expect(tier1Traces.length).toBeGreaterThanOrEqual(2);
        expect(tier2Traces).toHaveLength(1);
        expect(tier2Traces[0]?.strategy).toBe('example-fallback');
    });

    it('#2 — Tier 1 fixes all → Tier 2 skipped (SC-16)', () => {
        const schema = z.object({
            age: z.number(),
            enabled: z.boolean(),
        });
        // Contract HAS examples, but they should NOT be touched
        const contract = createTestContract(schema, [
            { intent: 'Show', props: { age: 30, enabled: true } },
        ]);

        const errors: CompilationError[] = [
            {
                code: 'ENS-2001',
                path: 'props.age',
                message: 'Expected number',
                fix: { field: 'age', was: '25', shouldBe: 'number' },
            },
            {
                code: 'ENS-2001',
                path: 'props.enabled',
                message: 'Expected boolean',
                fix: { field: 'enabled', was: 'true', shouldBe: 'boolean' },
            },
        ];

        const result = attemptDeterministicCorrection(
            errors, { age: '25', enabled: 'true' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.remaining).toHaveLength(0);
        // All traces should be Tier 1 — Tier 2 was never invoked (SC-16)
        expect(result.trace.every((t) => t.tier === 1)).toBe(true);
        expect(result.trace.length).toBe(2);
    });

    it('#3 — uncorrectable errors pass through all tiers to remaining', () => {
        const schema = z.object({
            data: z.object({ nested: z.string() }),
        });
        const contract = createTestContract(schema);

        // Object → anything is rejected by §3.5 safety rules
        const errors: CompilationError[] = [
            {
                code: 'ENS-2001',
                path: 'props.data',
                message: 'Expected object',
                fix: { field: 'data', was: 'not-an-object', shouldBe: 'object' },
            },
        ];

        const result = attemptDeterministicCorrection(
            errors, { data: 'not-an-object' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
        expect(result.trace).toHaveLength(0);
    });

    it('#4 — mixed: some fixed, some remaining', () => {
        const schema = z.object({
            age: z.number(),
            complexField: z.array(z.string()),
        });
        const contract = createTestContract(schema);

        const errors: CompilationError[] = [
            {
                code: 'ENS-2001',
                path: 'props.age',
                message: 'Expected number',
                fix: { field: 'age', was: '42', shouldBe: 'number' },
            },
            {
                code: 'ENS-2001',
                path: 'props.complexField',
                message: 'Expected array',
                // string → string[] is rejected by §3.5
                fix: { field: 'complexField', was: 'single', shouldBe: 'array' },
            },
        ];

        const result = attemptDeterministicCorrection(
            errors, { age: '42', complexField: 'single' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(false);
        expect(result.remaining).toHaveLength(1);
        expect(result.remaining[0]?.path).toBe('props.complexField');
        // age was fixed
        expect(result.props.age).toBe(42);
        expect(result.trace).toHaveLength(1);
        expect(result.trace[0]?.field).toBe('age');
    });

    it('#5 — zero errors → zero corrections, corrected=true', () => {
        const schema = z.object({ title: z.string() });
        const contract = createTestContract(schema);

        const result = attemptDeterministicCorrection(
            [], { title: 'Hello' }, contract, EMPTY_TOKENS,
        );

        expect(result.corrected).toBe(true);
        expect(result.remaining).toHaveLength(0);
        expect(result.trace).toHaveLength(0);
        expect(result.props).toEqual({ title: 'Hello' });
    });
});
