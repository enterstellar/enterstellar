/**
 * @module @enterstellar-ai/registry/__tests__/manifest-generator
 * @description Tests for the manifest generator — compact manifest format,
 * Zod type introspection, and deterministic output.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { defineComponent } from '../src/define-component.js';
import { generateManifest } from '../src/manifest-generator.js';
import type { ComponentContractInput } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeContract(name: string, overrides: Partial<ComponentContractInput> = {}) {
    return defineComponent({
        name,
        description: `Test component ${name}`,
        category: 'data-display',
        tags: ['test'],
        props: z.object({ value: z.string() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [],
        ...overrides,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateManifest()', () => {
    it('generates CompactManifestEntry[] from contracts', () => {
        const contracts = [makeContract('CompAlpha'), makeContract('CompBeta')];
        const manifest = generateManifest(contracts);

        expect(manifest).toHaveLength(2);
        expect(manifest[0]?.name).toBe('CompAlpha');
        expect(manifest[1]?.name).toBe('CompBeta');
    });

    it('sorts entries alphabetically by name', () => {
        const contracts = [makeContract('Zebra'), makeContract('Alpha'), makeContract('Mango')];
        const manifest = generateManifest(contracts);

        expect(manifest.map((e) => e.name)).toEqual(['Alpha', 'Mango', 'Zebra']);
    });

    it('includes name, description, category in each entry', () => {
        const contract = makeContract('DetailTest', {
            description: 'A detailed test component.',
            category: 'clinical',
        });
        const manifest = generateManifest([contract]);

        expect(manifest[0]?.name).toBe('DetailTest');
        expect(manifest[0]?.description).toBe('A detailed test component.');
        expect(manifest[0]?.category).toBe('clinical');
    });

    it('extracts prop keys with correct type descriptions', () => {
        const contract = makeContract('PropTest', {
            props: z.object({
                patientId: z.string(),
                riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
                count: z.number(),
                isActive: z.boolean(),
            }),
        });
        const manifest = generateManifest([contract]);
        const props = manifest[0]?.props;

        expect(props).toBeDefined();
        expect(props?.['patientId']).toBe('string');
        expect(props?.['riskLevel']).toBe('enum: low|medium|high|critical');
        expect(props?.['count']).toBe('number');
        expect(props?.['isActive']).toBe('boolean');
    });

    it('returns empty array for empty input', () => {
        expect(generateManifest([])).toEqual([]);
    });

    it('handles non-object Zod schemas gracefully (empty props)', () => {
        const contract = makeContract('StringProps', {
            props: z.string(),
        });
        const manifest = generateManifest([contract]);

        // Non-object schemas have no shape, so props should be empty
        expect(manifest[0]?.props).toEqual({});
    });

    // -----------------------------------------------------------------------
    // Nested Type Introspection (R8 compliance, Fix #5/#6)
    // -----------------------------------------------------------------------

    describe('nested type introspection', () => {
        it('describes ZodArray of primitives as "array of string"', () => {
            const contract = makeContract('ArrayPrimitive', {
                props: z.object({
                    tags: z.array(z.string()),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['tags']).toBe('array of string');
        });

        it('describes ZodArray of objects with nested shape', () => {
            const contract = makeContract('ArrayObject', {
                props: z.object({
                    items: z.array(z.object({
                        key: z.string(),
                        label: z.string(),
                    })),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['items']).toBe('array of {key: string, label: string}');
        });

        it('describes nested ZodObject with shape enumeration', () => {
            const contract = makeContract('NestedObject', {
                props: z.object({
                    address: z.object({
                        street: z.string(),
                        zip: z.number(),
                    }),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['address']).toBe('{street: string, zip: number}');
        });

        it('describes ZodUnion as "type | type"', () => {
            const contract = makeContract('UnionProp', {
                props: z.object({
                    value: z.union([z.string(), z.number()]),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['value']).toBe('string | number');
        });

        it('describes ZodOptional with inner type', () => {
            const contract = makeContract('OptionalProp', {
                props: z.object({
                    nickname: z.string().optional(),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['nickname']).toBe('string (optional)');
        });

        it('describes ZodNullable with inner type', () => {
            const contract = makeContract('NullableProp', {
                props: z.object({
                    middleName: z.string().nullable(),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['middleName']).toBe('string (nullable)');
        });

        it('unwraps ZodDefault to describe inner type', () => {
            const contract = makeContract('DefaultProp', {
                props: z.object({
                    priority: z.number().default(0),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['priority']).toBe('number');
        });

        it('handles deeply nested array of objects with enums', () => {
            const contract = makeContract('DeepNested', {
                props: z.object({
                    medications: z.array(z.object({
                        name: z.string(),
                        dosage: z.number(),
                        frequency: z.enum(['daily', 'weekly', 'monthly']),
                    })),
                }),
            });
            const manifest = generateManifest([contract]);

            expect(manifest[0]?.props?.['medications']).toBe(
                'array of {name: string, dosage: number, frequency: enum: daily|weekly|monthly}',
            );
        });

        it('returns "unknown" at max introspection depth', () => {
            // 4 levels deep: object > object > object > object
            // At depth 3 (MAX_INTROSPECTION_DEPTH), the innermost should return 'unknown'
            const contract = makeContract('TooDeep', {
                props: z.object({
                    l1: z.object({
                        l2: z.object({
                            l3: z.object({
                                l4: z.string(),
                            }),
                        }),
                    }),
                }),
            });
            const manifest = generateManifest([contract]);

            // l1 starts at depth 0, l2 at depth 1, l3 at depth 2.
            // l3's inner shape at depth 3 hits MAX_INTROSPECTION_DEPTH → 'unknown'
            // Exact output depends on depth counting:
            // extractPropSummary(top, 0) → describeZodType(l1, 0) → 'object' case →
            // extractPropSummary(l1, 1) → describeZodType(l2, 1) → 'object' case →
            // extractPropSummary(l2, 2) → describeZodType(l3, 2) → 'object' case →
            // extractPropSummary(l3, 3) → describeZodType(l4, 3) → depth >= 3 → 'unknown'
            const l1Desc = manifest[0]?.props?.['l1'];
            expect(l1Desc).toBeDefined();
            // At depth 3, the innermost field returns 'unknown' instead of 'string'
            expect(l1Desc).toContain('unknown');
        });
    });
});
