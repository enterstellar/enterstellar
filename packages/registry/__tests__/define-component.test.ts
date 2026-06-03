/**
 * @module @enterstellar-ai/registry/__tests__/define-component
 * @description Tests for `defineComponent()` — validation rules R1–R9,
 * Object.freeze(), auto-generated fields, and happy path.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { EnterstellarError } from '@enterstellar-ai/types';

import { defineComponent } from '../src/define-component.js';
import type { ComponentContractInput } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a valid `ComponentContractInput` that passes all 10 rules.
 * Tests override specific fields to trigger individual violations.
 */
function validInput(overrides: Partial<ComponentContractInput> = {}): ComponentContractInput {
    return {
        name: 'PatientVitals',
        description: 'Displays real-time patient vital signs with risk stratification.',
        category: 'clinical',
        tags: ['patient', 'vitals', 'monitoring'],
        props: z.object({
            patientId: z.string(),
            riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
        }),
        tokens: { statusColor: 'token:danger', cardBg: 'token:card-bg' },
        accessibility: { role: 'region', ariaLabel: 'Patient vitals', announceOnUpdate: true },
        states: {
            loading: 'VitalsLoading',
            error: 'VitalsError',
            empty: 'VitalsEmpty',
            ready: 'PatientVitals',
        },
        examples: [
            {
                intent: 'Show patient vitals',
                props: { patientId: '123e4567-e89b-12d3-a456-426614174000', riskLevel: 'high' },
            },
        ],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Happy Path
// ---------------------------------------------------------------------------

describe('defineComponent()', () => {
    it('returns a frozen ComponentContract with auto-generated id and _meta', () => {
        const contract = defineComponent(validInput());

        // Auto-generated fields
        expect(contract.id).toBe('PatientVitals');
        expect(contract._meta.forged).toBe(false);
        expect(contract._meta.version).toBe('1.0.0');
        expect(contract._meta.createdAt).toBeTruthy();

        // ISO 8601 format
        expect(() => new Date(contract._meta.createdAt)).not.toThrow();

        // Passed-through fields
        expect(contract.name).toBe('PatientVitals');
        expect(contract.description).toBe('Displays real-time patient vital signs with risk stratification.');
        expect(contract.category).toBe('clinical');
        expect(contract.tags).toEqual(['patient', 'vitals', 'monitoring']);
    });

    it('returns an Object.freeze()-d contract (R4)', () => {
        const contract = defineComponent(validInput());

        expect(Object.isFrozen(contract)).toBe(true);

        // Attempting to mutate should fail silently (strict mode would throw)
        expect(() => {
            (contract as Record<string, unknown>)['name'] = 'MutatedName';
        }).toThrow();
    });

    it('accepts components with no dataSource, auth, or origin (optional fields)', () => {
        const contract = defineComponent(validInput());

        // These fields should be absent, not undefined (exactOptionalPropertyTypes)
        expect('dataSource' in contract).toBe(false);
        expect('auth' in contract).toBe(false);
        expect('origin' in contract).toBe(false);
    });

    it('accepts components with optional fields provided', () => {
        const contract = defineComponent(
            validInput({
                dataSource: { adapter: 'supabase', resource: 'vitals' },
                auth: { required: true, roles: ['clinician'] },
                origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
            }),
        );

        expect(contract.dataSource?.adapter).toBe('supabase');
        expect(contract.auth?.required).toBe(true);
        expect(contract.origin?.publisher).toBe('enterstellar-team');
    });

    it('accepts components with empty tokens object', () => {
        const contract = defineComponent(validInput({ tokens: {} }));
        expect(contract.tokens).toEqual({});
    });

    it('accepts components with empty examples array', () => {
        const contract = defineComponent(validInput({ examples: [] }));
        expect(contract.examples).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Validation Rule Tests
// ---------------------------------------------------------------------------

describe('defineComponent() — validation rules', () => {
    // R1: PascalCase name
    describe('R1 — PascalCase name', () => {
        it('rejects camelCase names', () => {
            expect(() => defineComponent(validInput({ name: 'patientVitals' }))).toThrow(EnterstellarError);
            expect(() => defineComponent(validInput({ name: 'patientVitals' }))).toThrow(/ENS-1002/);
        });

        it('rejects snake_case names', () => {
            expect(() => defineComponent(validInput({ name: 'patient_vitals' }))).toThrow(EnterstellarError);
        });

        it('rejects kebab-case names', () => {
            expect(() => defineComponent(validInput({ name: 'patient-vitals' }))).toThrow(EnterstellarError);
        });

        it('rejects single-character names', () => {
            expect(() => defineComponent(validInput({ name: 'P' }))).toThrow(EnterstellarError);
        });

        it('accepts valid PascalCase names', () => {
            expect(() =>
                defineComponent(
                    validInput({
                        name: 'GenericCard',
                        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'GenericCard' },
                    }),
                ),
            ).not.toThrow();
        });
    });

    // R9: Description presence
    describe('R9 — Description required', () => {
        it('rejects empty descriptions', () => {
            expect(() => defineComponent(validInput({ description: '' }))).toThrow(EnterstellarError);
            expect(() => defineComponent(validInput({ description: '' }))).toThrow(/ENS-1010/);
        });

        it('rejects whitespace-only descriptions', () => {
            expect(() => defineComponent(validInput({ description: '   ' }))).toThrow(EnterstellarError);
        });
    });

    // R2: Description length
    describe('R2 — Description ≤ 120 characters', () => {
        it('rejects descriptions over 120 characters', () => {
            const longDesc = 'x'.repeat(121);
            expect(() => defineComponent(validInput({ description: longDesc }))).toThrow(EnterstellarError);
            expect(() => defineComponent(validInput({ description: longDesc }))).toThrow(/ENS-1003/);
        });

        it('accepts descriptions of exactly 120 characters', () => {
            const desc120 = 'x'.repeat(120);
            expect(() => defineComponent(validInput({ description: desc120 }))).not.toThrow();
        });
    });

    // R3: Tag count
    describe('R3 — Tags 1–10 entries', () => {
        it('rejects empty tags array', () => {
            expect(() => defineComponent(validInput({ tags: [] }))).toThrow(EnterstellarError);
            expect(() => defineComponent(validInput({ tags: [] }))).toThrow(/ENS-1004/);
        });

        it('rejects more than 10 tags', () => {
            const elevenTags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
            expect(() => defineComponent(validInput({ tags: elevenTags }))).toThrow(EnterstellarError);
        });

        it('accepts 1 tag', () => {
            expect(() => defineComponent(validInput({ tags: ['single'] }))).not.toThrow();
        });

        it('accepts 10 tags', () => {
            const tenTags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
            expect(() => defineComponent(validInput({ tags: tenTags }))).not.toThrow();
        });
    });

    // R7: Props is a Zod schema
    describe('R7 — Props must be a Zod schema', () => {
        it('rejects null props', () => {
            expect(() => defineComponent(validInput({ props: null as unknown as z.ZodType }))).toThrow(EnterstellarError);
            expect(() => defineComponent(validInput({ props: null as unknown as z.ZodType }))).toThrow(/ENS-1008/);
        });

        it('rejects plain objects (not Zod schemas)', () => {
            expect(() =>
                defineComponent(validInput({ props: { name: 'string' } as unknown as z.ZodType })),
            ).toThrow(EnterstellarError);
        });

        it('accepts a valid z.object() schema', () => {
            expect(() =>
                defineComponent(validInput({ props: z.object({ value: z.string() }) })),
            ).not.toThrow();
        });

        it('accepts a z.string() schema (non-object Zod types)', () => {
            expect(() => defineComponent(validInput({ props: z.string() }))).not.toThrow();
        });
    });

    // R6: Token values start with 'token:'
    describe('R6 — Token values must start with token:', () => {
        it('rejects raw CSS values', () => {
            expect(() =>
                defineComponent(validInput({ tokens: { color: '#ff0000' } })),
            ).toThrow(EnterstellarError);
            expect(() =>
                defineComponent(validInput({ tokens: { color: '#ff0000' } })),
            ).toThrow(/ENS-1007/);
        });

        it('rejects tokens without prefix', () => {
            expect(() =>
                defineComponent(validInput({ tokens: { bg: 'danger' } })),
            ).toThrow(EnterstellarError);
        });

        it('accepts valid token values', () => {
            expect(() =>
                defineComponent(validInput({ tokens: { color: 'token:danger', bg: 'token:card-bg' } })),
            ).not.toThrow();
        });
    });

    // R8: Valid WAI-ARIA role
    describe('R8 — Valid WAI-ARIA role', () => {
        it('rejects invalid ARIA roles', () => {
            expect(() =>
                defineComponent(
                    validInput({
                        accessibility: { role: 'invalid-role', ariaLabel: 'Test', announceOnUpdate: false },
                    }),
                ),
            ).toThrow(EnterstellarError);
            expect(() =>
                defineComponent(
                    validInput({
                        accessibility: { role: 'invalid-role', ariaLabel: 'Test', announceOnUpdate: false },
                    }),
                ),
            ).toThrow(/ENS-1009/);
        });

        it.each(['region', 'alert', 'button', 'grid', 'table', 'status', 'form', 'navigation'])(
            'accepts valid ARIA role: %s',
            (role) => {
                expect(() =>
                    defineComponent(
                        validInput({
                            accessibility: { role, ariaLabel: 'Test', announceOnUpdate: false },
                        }),
                    ),
                ).not.toThrow();
            },
        );
    });

    // R4 + R5: Lifecycle states
    describe('R4 + R5 — Lifecycle states', () => {
        it('rejects empty loading state (R4)', () => {
            expect(() =>
                defineComponent(
                    validInput({
                        states: { loading: '', error: 'Err', empty: 'Empty', ready: 'PatientVitals' },
                    }),
                ),
            ).toThrow(EnterstellarError);
            expect(() =>
                defineComponent(
                    validInput({
                        states: { loading: '', error: 'Err', empty: 'Empty', ready: 'PatientVitals' },
                    }),
                ),
            ).toThrow(/ENS-1005/);
        });

        it('rejects states.ready not matching component name (R5)', () => {
            expect(() =>
                defineComponent(
                    validInput({
                        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'WrongName' },
                    }),
                ),
            ).toThrow(EnterstellarError);
            expect(() =>
                defineComponent(
                    validInput({
                        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'WrongName' },
                    }),
                ),
            ).toThrow(/ENS-1006/);
        });

        it('accepts valid states with ready matching component name', () => {
            expect(() =>
                defineComponent(
                    validInput({
                        states: { loading: 'VitalsLoading', error: 'VitalsError', empty: 'VitalsEmpty', ready: 'PatientVitals' },
                    }),
                ),
            ).not.toThrow();
        });
    });
});
