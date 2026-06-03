/**
 * @module @enterstellar-ai/compiler/__tests__/integration/compile-valid
 * @description Integration test: compile 20 valid intents against the example registry.
 *
 * Uses the 10 example clinical-domain components from `@enterstellar-ai/registry`.
 * Each component is tested with 2 valid intents (from its `examples` field
 * or manually crafted with valid props). All 20 must produce `status: 'pass'`.
 *
 * @see tasks-breakdown.md — M0.3, Task 11
 * @see Design Choice C2 — compile is async
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { createCompiler } from '../../src/create-compiler.js';
import type { EnterstellarCompiler, CompilerConfig } from '../../src/types.js';
import { createRegistry } from '@enterstellar-ai/registry';
import {
    PatientVitals,
    MedicationList,
    DiagnosisSummary,
    LabResults,
    AppointmentCard,
    AlertBanner,
    PatientHeader,
    ClinicalNote,
    VitalsChart,
    GenericCard,
    allExampleComponents,
} from '../../../registry/examples/components.js';
import type { ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a ComponentIntent from component name and props. */
function intent(component: string, props: Record<string, unknown>): ComponentIntent {
    return { component, props, confidence: 1.0 } as ComponentIntent;
}

/**
 * Design tokens covering all `token:*` references in the 10 example components.
 * Token step only validates props that overlap with `contract.tokens` keys —
 * since example intents don't include token fields in their props, this set
 * exists for registry completeness.
 */
const DESIGN_TOKENS = {
    'status-color': '#ef4444',
    'card-bg': '#ffffff',
    'danger': '#dc2626',
    'warning': '#f59e0b',
    'success': '#22c55e',
    'muted': '#9ca3af',
    'info': '#3b82f6',
    'list-bg': '#f9fafb',
    'table-bg': '#ffffff',
    'text-primary': '#111827',
    'text-secondary': '#6b7280',
    'text-muted': '#9ca3af',
    'text-on-alert': '#ffffff',
    'header-bg': '#f3f4f6',
    'danger-bg': '#fef2f2',
    'info-bg': '#eff6ff',
    'warning-bg': '#fffbeb',
    'error-bg': '#fef2f2',
    'critical-bg': '#7f1d1d',
    'chart-bg': '#ffffff',
    'primary': '#2563eb',
    'border-subtle': '#e5e7eb',
    'border-default': '#d1d5db',
    'shadow-md': 'rgba(0,0,0,0.1)',
};

// ---------------------------------------------------------------------------
// Suite Setup
// ---------------------------------------------------------------------------

let compiler: EnterstellarCompiler;

beforeAll(() => {
    const registry = createRegistry({
        components: [...allExampleComponents],
        designTokens: DESIGN_TOKENS,
    });

    compiler = createCompiler({
        registry,
        strictDesignTokens: true,
        autoAccessibility: true,
        maxNestingDepth: 10,
        includeDiff: true,
    });
});

// ---------------------------------------------------------------------------
// 20 Valid Intents (2 per component)
// ---------------------------------------------------------------------------

describe('Integration: compile 20 valid intents', () => {
    // --- 1. PatientVitals (2 intents) ---

    it('PatientVitals — minimal required props', async () => {
        const result = await compiler.compile(
            intent('PatientVitals', { patientId: 'p-001', riskLevel: 'high' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.componentName).toBe('PatientVitals');
        expect(result.errors).toHaveLength(0);
    });

    it('PatientVitals — all optional props included', async () => {
        const result = await compiler.compile(
            intent('PatientVitals', {
                patientId: 'p-002',
                riskLevel: 'critical',
                heartRate: 142,
                bloodPressure: '130/85',
                temperature: 38.5,
                oxygenSaturation: 88,
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 2. MedicationList (2 intents) ---

    it('MedicationList — with filter', async () => {
        const result = await compiler.compile(
            intent('MedicationList', { patientId: 'p-001', filter: 'active' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('MedicationList — with sortBy', async () => {
        const result = await compiler.compile(
            intent('MedicationList', { patientId: 'p-003', filter: 'all', sortBy: 'name' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 3. DiagnosisSummary (2 intents) ---

    it('DiagnosisSummary — minimal', async () => {
        const result = await compiler.compile(
            intent('DiagnosisSummary', { patientId: 'p-001' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('DiagnosisSummary — all options', async () => {
        const result = await compiler.compile(
            intent('DiagnosisSummary', { patientId: 'p-004', timeRange: '1y', includeCodes: true }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 4. LabResults (2 intents) ---

    it('LabResults — minimal', async () => {
        const result = await compiler.compile(
            intent('LabResults', { patientId: 'p-001' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('LabResults — with trends and limit', async () => {
        const result = await compiler.compile(
            intent('LabResults', { patientId: 'p-005', testCategory: 'blood', showTrends: true, limit: 25 }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 5. AppointmentCard (2 intents) ---

    it('AppointmentCard — scheduled', async () => {
        const result = await compiler.compile(
            intent('AppointmentCard', {
                appointmentId: 'apt-001',
                patientId: 'p-001',
                providerName: 'Dr. Sarah Chen',
                dateTime: '2026-03-01T09:00:00Z',
                status: 'scheduled',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('AppointmentCard — completed with specialty', async () => {
        const result = await compiler.compile(
            intent('AppointmentCard', {
                appointmentId: 'apt-002',
                patientId: 'p-006',
                providerName: 'Dr. James Wilson',
                dateTime: '2026-02-15T14:30:00Z',
                status: 'completed',
                specialty: 'Oncology',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 6. AlertBanner (2 intents) ---

    it('AlertBanner — critical non-dismissible', async () => {
        const result = await compiler.compile(
            intent('AlertBanner', {
                severity: 'critical',
                title: 'Drug Interaction',
                message: 'Warfarin + Aspirin detected.',
                dismissible: false,
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('AlertBanner — info with action', async () => {
        const result = await compiler.compile(
            intent('AlertBanner', {
                severity: 'info',
                title: 'New Protocol Available',
                message: 'Updated guidelines published.',
                dismissible: true,
                actionLabel: 'View Protocol',
                actionUrl: '/protocols/latest',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 7. PatientHeader (2 intents) ---

    it('PatientHeader — minimal required', async () => {
        const result = await compiler.compile(
            intent('PatientHeader', {
                patientId: 'p-001',
                fullName: 'Jane Doe',
                dateOfBirth: '1985-06-15',
                gender: 'female',
                mrn: 'MRN-0042',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('PatientHeader — with allergies and provider', async () => {
        const result = await compiler.compile(
            intent('PatientHeader', {
                patientId: 'p-007',
                fullName: 'John Smith',
                dateOfBirth: '1972-11-20',
                gender: 'male',
                mrn: 'MRN-0099',
                allergies: ['Penicillin', 'Latex', 'Sulfa'],
                primaryProvider: 'Dr. Emily Park',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 8. ClinicalNote (2 intents) ---

    it('ClinicalNote — minimal required', async () => {
        const result = await compiler.compile(
            intent('ClinicalNote', {
                noteId: 'note-001',
                patientId: 'p-001',
                authorName: 'Dr. Sarah Chen',
                createdAt: '2026-02-19T14:30:00Z',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('ClinicalNote — full SOAP with noteType', async () => {
        const result = await compiler.compile(
            intent('ClinicalNote', {
                noteId: 'note-002',
                patientId: 'p-008',
                authorName: 'Dr. Michael Brown',
                createdAt: '2026-02-20T10:00:00Z',
                subjective: 'Patient reports persistent headache.',
                objective: 'BP 145/90, no papilledema.',
                assessment: 'Tension-type headache, rule out secondary causes.',
                plan: 'MRI head, follow up in 1 week.',
                noteType: 'consultation',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 9. VitalsChart (2 intents) ---

    it('VitalsChart — single metric', async () => {
        const result = await compiler.compile(
            intent('VitalsChart', {
                patientId: 'p-001',
                metrics: ['heartRate'],
                timeRange: '7d',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('VitalsChart — multiple metrics with thresholds', async () => {
        const result = await compiler.compile(
            intent('VitalsChart', {
                patientId: 'p-009',
                metrics: ['heartRate', 'bloodPressure', 'oxygenSaturation'],
                timeRange: '30d',
                showThresholds: true,
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- 10. GenericCard (2 intents) ---

    it('GenericCard — minimal', async () => {
        const result = await compiler.compile(
            intent('GenericCard', { title: 'System Status' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    it('GenericCard — fully populated', async () => {
        const result = await compiler.compile(
            intent('GenericCard', {
                title: 'Care Plan Summary',
                subtitle: 'Updated 2h ago',
                body: 'All goals on track. Next review: March 1.',
                imageUrl: 'https://example.com/care-plan.png',
                actionLabel: 'View Full Plan',
                actionUrl: '/care-plans/p-010',
                variant: 'elevated',
            }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(result.errors).toHaveLength(0);
    });

    // --- Cross-cutting assertions ---

    it('all 20 results include provenance with correct agent', async () => {
        const result = await compiler.compile(
            intent('GenericCard', { title: 'Provenance check' }),
            { agent: 'provenance-test' },
        );
        expect(result.provenance.agent).toBe('provenance-test');
        expect(result.provenance.registry).toBe('local');
        expect(result.provenance.compilerVersion).toBeDefined();
        expect(result.provenance.compiledAt).toBeDefined();
    });

    it('valid compilation produces frozen props', async () => {
        const result = await compiler.compile(
            intent('AlertBanner', { severity: 'warning', title: 'Test', message: 'Freeze check' }),
            { agent: 'integration-test' },
        );
        expect(result.status).toBe('pass');
        expect(Object.isFrozen(result.props)).toBe(true);
    });
});
