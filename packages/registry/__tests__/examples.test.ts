/**
 * @module @enterstellar-ai/registry/__tests__/examples
 * @description Integration test verifying all 10 example components
 * register successfully and produce a valid manifest.
 */

import { describe, it, expect } from 'vitest';

import { createRegistry } from '../src/create-registry.js';
import {
    allExampleComponents,
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
} from '../examples/components.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('10 example components', () => {
    it('all 10 contracts pass defineComponent() without errors', () => {
        // If any contract failed validation, defineComponent() would have thrown
        expect(allExampleComponents).toHaveLength(10);
    });

    it('all 10 contracts have unique names', () => {
        const names = allExampleComponents.map((c) => c.name);
        expect(new Set(names).size).toBe(10);
    });

    it('all 10 contracts register into a single registry without errors', () => {
        const registry = createRegistry({
            components: [...allExampleComponents],
        });

        expect(registry.size).toBe(10);
    });

    it('registry.list() returns all 10 names sorted alphabetically', () => {
        const registry = createRegistry({
            components: [...allExampleComponents],
        });

        expect(registry.list()).toEqual([
            'AlertBanner',
            'AppointmentCard',
            'ClinicalNote',
            'DiagnosisSummary',
            'GenericCard',
            'LabResults',
            'MedicationList',
            'PatientHeader',
            'PatientVitals',
            'VitalsChart',
        ]);
    });

    it('getManifest() produces 10 CompactManifestEntry entries', () => {
        const registry = createRegistry({
            components: [...allExampleComponents],
        });

        const manifest = registry.getManifest();
        expect(manifest).toHaveLength(10);

        // Verify each entry has required fields
        for (const entry of manifest) {
            expect(entry.name).toBeTruthy();
            expect(entry.description).toBeTruthy();
            expect(entry.category).toBeTruthy();
            expect(entry.description.length).toBeLessThanOrEqual(120);
        }
    });

    it('all contracts are frozen (Object.isFrozen)', () => {
        for (const contract of allExampleComponents) {
            expect(Object.isFrozen(contract)).toBe(true);
        }
    });

    it('all contracts have auto-generated id and _meta', () => {
        for (const contract of allExampleComponents) {
            expect(contract.id).toBe(contract.name);
            expect(contract._meta.forged).toBe(false);
            expect(contract._meta.version).toBe('1.0.0');
            expect(contract._meta.createdAt).toBeTruthy();
        }
    });

    it('all contracts include origin field', () => {
        for (const contract of allExampleComponents) {
            expect(contract.origin).toBeDefined();
            expect(contract.origin?.registryUrl).toBe('https://registry.enterstellar.dev');
            expect(contract.origin?.publisher).toBe('enterstellar-team');
        }
    });

    it('each contract has at least one example intent', () => {
        for (const contract of allExampleComponents) {
            expect(contract.examples.length).toBeGreaterThanOrEqual(1);
            for (const example of contract.examples) {
                expect(example.intent).toBeTruthy();
                expect(example.props).toBeDefined();
            }
        }
    });

    it('individual contracts are retrievable by name', () => {
        const registry = createRegistry({ components: [...allExampleComponents] });

        expect(registry.get('PatientVitals')?.name).toBe('PatientVitals');
        expect(registry.get('MedicationList')?.name).toBe('MedicationList');
        expect(registry.get('DiagnosisSummary')?.name).toBe('DiagnosisSummary');
        expect(registry.get('LabResults')?.name).toBe('LabResults');
        expect(registry.get('AppointmentCard')?.name).toBe('AppointmentCard');
        expect(registry.get('AlertBanner')?.name).toBe('AlertBanner');
        expect(registry.get('PatientHeader')?.name).toBe('PatientHeader');
        expect(registry.get('ClinicalNote')?.name).toBe('ClinicalNote');
        expect(registry.get('VitalsChart')?.name).toBe('VitalsChart');
        expect(registry.get('GenericCard')?.name).toBe('GenericCard');
    });
});
