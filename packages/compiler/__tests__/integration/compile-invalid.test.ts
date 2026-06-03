/**
 * @module @enterstellar-ai/compiler/__tests__/integration/compile-invalid
 * @description Integration test: compile 20 invalid intents against the example registry.
 *
 * Uses the 10 example clinical-domain components from `@enterstellar-ai/registry`.
 * Each component is tested with 2 invalid intents:
 *   - **Type 1:** Wrong data types on required fields → ENS-2001 (schema parse error)
 *   - **Type 2:** Missing all required fields → ENS-2001 (schema parse error)
 *
 * All 20 must produce `status: 'fail'` with correct error codes.
 * Self-correction is tested on a subset using the `'self-correct'` strategy.
 *
 * @see tasks-breakdown.md — M0.3, Task 12
 * @see Design Choice C4 — self-correction callback
 * @see Design Choice C6 — fallback on exhaustion
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { createCompiler } from '../../src/create-compiler.js';
import type { EnterstellarCompiler } from '../../src/types.js';
import { createRegistry } from '@enterstellar-ai/registry';
import { allExampleComponents } from '../../../registry/examples/components.js';
import type { ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a ComponentIntent from component name and props. */
function intent(component: string, props: Record<string, unknown>): ComponentIntent {
    return { component, props, confidence: 1.0 } as ComponentIntent;
}

// ---------------------------------------------------------------------------
// Suite Setup
// ---------------------------------------------------------------------------

let compiler: EnterstellarCompiler;

beforeAll(() => {
    const registry = createRegistry({
        components: [...allExampleComponents],
    });

    compiler = createCompiler({
        registry,
        strictDesignTokens: true,
        autoAccessibility: true,
        maxNestingDepth: 10,
        includeDiff: true,
        onValidationFailure: {
            strategy: 'reject',
            maxRetries: 0,
            fallbackComponent: 'GenericCard',
        },
        // Disable deterministic correction for these tests — they verify error
        // detection, not self-correction. With correction enabled, the compiler
        // would fix type mismatches and defaults before the test can assert failure.
        selfCorrection: { deterministic: false },
    });
});

// ---------------------------------------------------------------------------
// 20 Invalid Intents (2 per component)
// ---------------------------------------------------------------------------

describe('Integration: compile 20 invalid intents', () => {
    // --- 1. PatientVitals ---

    it('PatientVitals — wrong type: riskLevel as number', async () => {
        const result = await compiler.compile(
            intent('PatientVitals', { patientId: 'p-001', riskLevel: 999 }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('PatientVitals — missing required patientId', async () => {
        const result = await compiler.compile(
            intent('PatientVitals', { riskLevel: 'high' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 2. MedicationList ---

    it('MedicationList — wrong type: patientId as number', async () => {
        const result = await compiler.compile(
            intent('MedicationList', { patientId: 12345 }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('MedicationList — invalid enum: filter as "expired"', async () => {
        const result = await compiler.compile(
            intent('MedicationList', { patientId: 'p-001', filter: 'expired' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 3. DiagnosisSummary ---

    it('DiagnosisSummary — wrong type: patientId as boolean', async () => {
        const result = await compiler.compile(
            intent('DiagnosisSummary', { patientId: true }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('DiagnosisSummary — missing all required fields', async () => {
        const result = await compiler.compile(
            intent('DiagnosisSummary', {}),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 4. LabResults ---

    it('LabResults — wrong type: limit as string', async () => {
        const result = await compiler.compile(
            intent('LabResults', { patientId: 'p-001', limit: 'ten' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('LabResults — invalid enum: testCategory as "xray"', async () => {
        const result = await compiler.compile(
            intent('LabResults', { patientId: 'p-001', testCategory: 'xray' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 5. AppointmentCard ---

    it('AppointmentCard — missing 3 required fields', async () => {
        const result = await compiler.compile(
            intent('AppointmentCard', { appointmentId: 'apt-001', status: 'scheduled' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        // Should have errors for patientId, providerName, dateTime
        expect(result.errors.filter((e) => e.code === 'ENS-2001').length).toBeGreaterThanOrEqual(1);
    });

    it('AppointmentCard — wrong type: status as number', async () => {
        const result = await compiler.compile(
            intent('AppointmentCard', {
                appointmentId: 'apt-001',
                patientId: 'p-001',
                providerName: 'Dr. Test',
                dateTime: '2026-03-01T09:00:00Z',
                status: 404,
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 6. AlertBanner ---

    it('AlertBanner — wrong type: severity as number', async () => {
        const result = await compiler.compile(
            intent('AlertBanner', { severity: 1, title: 'Test', message: 'Alert' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('AlertBanner — missing all required fields', async () => {
        const result = await compiler.compile(
            intent('AlertBanner', {}),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 7. PatientHeader ---

    it('PatientHeader — wrong type: gender as boolean', async () => {
        const result = await compiler.compile(
            intent('PatientHeader', {
                patientId: 'p-001',
                fullName: 'Jane Doe',
                dateOfBirth: '1985-06-15',
                gender: true,
                mrn: 'MRN-0042',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('PatientHeader — wrong type: allergies as string instead of array', async () => {
        const result = await compiler.compile(
            intent('PatientHeader', {
                patientId: 'p-001',
                fullName: 'Test',
                dateOfBirth: '2000-01-01',
                gender: 'male',
                mrn: 'MRN-001',
                allergies: 'Penicillin',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 8. ClinicalNote ---

    it('ClinicalNote — missing all required fields', async () => {
        const result = await compiler.compile(
            intent('ClinicalNote', { noteType: 'progress' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.filter((e) => e.code === 'ENS-2001').length).toBeGreaterThanOrEqual(1);
    });

    it('ClinicalNote — invalid enum: noteType as "surgery"', async () => {
        const result = await compiler.compile(
            intent('ClinicalNote', {
                noteId: 'note-001',
                patientId: 'p-001',
                authorName: 'Dr. Test',
                createdAt: '2026-01-01T00:00:00Z',
                noteType: 'surgery',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 9. VitalsChart ---

    it('VitalsChart — wrong type: metrics as string instead of array', async () => {
        const result = await compiler.compile(
            intent('VitalsChart', { patientId: 'p-001', metrics: 'heartRate', timeRange: '7d' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('VitalsChart — missing required timeRange', async () => {
        const result = await compiler.compile(
            intent('VitalsChart', { patientId: 'p-001', metrics: ['heartRate'] }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- 10. GenericCard ---

    it('GenericCard — wrong type: title as number', async () => {
        const result = await compiler.compile(
            intent('GenericCard', { title: 42 }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    it('GenericCard — invalid enum: variant as "neon"', async () => {
        const result = await compiler.compile(
            intent('GenericCard', { title: 'Valid title', variant: 'neon' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors.some((e) => e.code === 'ENS-2001')).toBe(true);
    });

    // --- Cross-cutting: unknown component (ENS-2004) ---

    it('unknown component produces ENS-2004', async () => {
        const result = await compiler.compile(
            intent('HallucinatedWidget', { foo: 'bar' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.code).toBe('ENS-2004');
        expect(result.errors[0]?.message).toContain('HallucinatedWidget');
    });

    // --- Cross-cutting: error shape ---

    it('all errors have code, path, and message', async () => {
        const result = await compiler.compile(
            intent('PatientVitals', {}),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('fail');
        for (const error of result.errors) {
            expect(error.code).toBeDefined();
            expect(typeof error.code).toBe('string');
            expect(error.path).toBeDefined();
            expect(typeof error.path).toBe('string');
            expect(error.message).toBeDefined();
            expect(typeof error.message).toBe('string');
        }
    });
});

// ---------------------------------------------------------------------------
// Self-Correction Integration
// ---------------------------------------------------------------------------

describe('Integration: self-correction with example registry', () => {
    it('self-correction callback receives correct context (C5)', async () => {
        const registry = createRegistry({ components: [...allExampleComponents] });
        let receivedErrors: unknown = undefined;
        let receivedContext: unknown = undefined;

        const selfCorrectCompiler = createCompiler({
            registry,
            strictDesignTokens: true,
            autoAccessibility: true,
            maxNestingDepth: 10,
            includeDiff: true,
            onValidationFailure: {
                strategy: 'self-correct',
                maxRetries: 1,
                fallbackComponent: 'GenericCard',
            },
            // Disable Tier 1+2 so the LLM callback fires for type errors
            selfCorrection: { deterministic: false },
            onCorrection: async (errors, context) => {
                receivedErrors = errors;
                receivedContext = context;
                // Return corrected props
                return { component: 'GenericCard', props: { title: 'Corrected' } };
            },
        });

        const result = await selfCorrectCompiler.compile(
            intent('GenericCard', { title: 42 }), // invalid — title should be string
            { agent: 'self-correct-test' },
        );

        expect(result.status).toBe('corrected');
        expect(receivedErrors).toBeDefined();
        expect(receivedContext).toBeDefined();
    });

    it('fallback renders GenericCard when self-correction exhausted', async () => {
        const registry = createRegistry({ components: [...allExampleComponents] });

        const fallbackCompiler = createCompiler({
            registry,
            strictDesignTokens: true,
            autoAccessibility: true,
            maxNestingDepth: 10,
            includeDiff: true,
            onValidationFailure: {
                strategy: 'self-correct',
                maxRetries: 1,
                fallbackComponent: 'GenericCard',
            },
            // Disable Tier 1+2 so LLM exhaustion + fallback path is tested
            selfCorrection: { deterministic: false },
            onCorrection: async () => {
                // Return still-invalid props to exhaust retries
                return { component: 'GenericCard', props: { title: 999 } };
            },
        });

        const result = await fallbackCompiler.compile(
            intent('GenericCard', { title: false }),
            { agent: 'fallback-test' },
        );

        // After exhausted self-correction, should fallback
        expect(result.status).toBe('fail');
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
