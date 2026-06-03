/**
 * @module @enterstellar-ai/migration/__tests__/assemble-test
 * @description Tests for Phase 3 `assembleTest()` — test scaffold
 * string generation from `StructuralManifest`.
 *
 * @see assemble-test.ts
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { assembleTest } from '../src/assembly/assemble-test.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a minimal valid `StructuralManifest` for test scaffold generation.
 */
function createManifest(name: string = 'PatientCard'): Parameters<typeof assembleTest>[0] {
    return {
        name,
        props: z.object({ name: z.string() }),
        defaultProps: {},
        generics: [],
        existingZodSchemas: [],
        eventHandlers: [],
        description: { value: 'A card', source: 'ast-determined' },
        tags: { value: ['clinical'], source: 'ast-determined' },
        category: { value: 'clinical', source: 'ast-determined' },
        intent: { value: 'Show card', source: 'ast-determined' },
        ariaAttributes: { value: {}, source: 'ast-determined' },
        designTokenRefs: { value: [], source: 'ast-determined' },
        lifecycleStates: { value: [], source: 'ast-determined' },
    };
}

// ---------------------------------------------------------------------------
// Tests — Structure
// ---------------------------------------------------------------------------

describe('assembleTest — scaffold structure', () => {
    it('returns a string (sync)', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(typeof result).toBe('string');
    });

    it('includes @enterstellar-generated provenance', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain('@enterstellar-generated');
    });

    it('includes vitest imports', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain("import { describe, it, expect } from 'vitest';");
    });

    it('includes ComponentContractSchema import', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain("import { ComponentContractSchema } from '@enterstellar-ai/types';");
    });

    it('includes contract import with provided path', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain("import { PatientCardContract } from './PatientCard.contract';");
    });

    it('uses correct contract variable name for different components', () => {
        const result = assembleTest(createManifest('VitalSign'), './VitalSign.contract');
        expect(result).toContain('VitalSignContract');
        expect(result).toContain("describe('VitalSign Contract'");
    });
});

// ---------------------------------------------------------------------------
// Tests — Test Cases
// ---------------------------------------------------------------------------

describe('assembleTest — generated test cases', () => {
    it('includes schema validation test', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain('satisfies ComponentContractSchema');
        expect(result).toContain('ComponentContractSchema.parse(PatientCardContract)');
    });

    it('includes name validation test', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain("expect(PatientCardContract.name).toBe('PatientCard')");
    });

    it('includes tags validation test', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain('at least one tag');
    });

    it('includes examples validation test', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain('at least one example');
    });

    it('includes example props schema validation', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain('example props satisfy the props schema');
        expect(result).toContain('props.parse(example.props)');
    });

    it('includes lifecycle states validation', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain('all four lifecycle states');
        expect(result).toContain('states.loading');
        expect(result).toContain('states.error');
        expect(result).toContain('states.empty');
        expect(result).toContain('states.ready');
    });

    it('includes accessibility validation', () => {
        const result = assembleTest(createManifest(), './PatientCard.contract');
        expect(result).toContain('accessibility configuration');
        expect(result).toContain('accessibility.role');
        expect(result).toContain('accessibility.ariaLabel');
    });
});
