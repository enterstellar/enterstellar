/**
 * @module @enterstellar-ai/cli/__tests__/validate-name
 * @description Tests for project name and component name validation.
 *
 * Verifies kebab-case validation for project names and PascalCase
 * validation for component names, including all edge cases.
 */

import { describe, it, expect } from 'vitest';

import {
    validateProjectName,
    validateComponentName,
} from '../src/utils/validate-name.js';

// ---------------------------------------------------------------------------
// validateProjectName (kebab-case)
// ---------------------------------------------------------------------------

describe('validateProjectName', () => {
    // --- Valid names ---

    it('accepts a simple kebab-case name', () => {
        expect(validateProjectName('my-app')).toBe(true);
    });

    it('accepts a single lowercase letter', () => {
        expect(validateProjectName('a')).toBe(true);
    });

    it('accepts a name with numbers', () => {
        expect(validateProjectName('app-v2')).toBe(true);
    });

    it('accepts a long kebab-case name', () => {
        expect(validateProjectName('clinical-dashboard-v2-beta')).toBe(true);
    });

    it('accepts a name without hyphens', () => {
        expect(validateProjectName('myapp')).toBe(true);
    });

    // --- Invalid names ---

    it('rejects an empty string', () => {
        expect(validateProjectName('')).toBe(false);
    });

    it('rejects a name with uppercase letters', () => {
        expect(validateProjectName('MyApp')).toBe(false);
    });

    it('rejects a name with spaces', () => {
        expect(validateProjectName('my app')).toBe(false);
    });

    it('rejects a name with underscores', () => {
        expect(validateProjectName('my_app')).toBe(false);
    });

    it('rejects a name starting with a number', () => {
        expect(validateProjectName('2app')).toBe(false);
    });

    it('rejects a name starting with a hyphen', () => {
        expect(validateProjectName('-app')).toBe(false);
    });

    it('rejects a name ending with a hyphen', () => {
        expect(validateProjectName('app-')).toBe(false);
    });

    it('rejects a name with special characters', () => {
        expect(validateProjectName('my@app')).toBe(false);
    });

    it('rejects a name with dots', () => {
        expect(validateProjectName('my.app')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// validateComponentName (PascalCase)
// ---------------------------------------------------------------------------

describe('validateComponentName', () => {
    // --- Valid names ---

    it('accepts a PascalCase name', () => {
        expect(validateComponentName('PatientVitals')).toBe(true);
    });

    it('accepts a two-letter PascalCase name', () => {
        expect(validateComponentName('Ab')).toBe(true);
    });

    it('accepts a name with numbers', () => {
        expect(validateComponentName('V2Dashboard')).toBe(true);
    });

    it('accepts a single-word PascalCase name', () => {
        expect(validateComponentName('Card')).toBe(true);
    });

    it('accepts a multi-word PascalCase name', () => {
        expect(validateComponentName('ExampleCardWithBadge')).toBe(true);
    });

    // --- Invalid names ---

    it('rejects an empty string', () => {
        expect(validateComponentName('')).toBe(false);
    });

    it('rejects a single character (too short)', () => {
        expect(validateComponentName('A')).toBe(false);
    });

    it('rejects camelCase (starts with lowercase)', () => {
        expect(validateComponentName('patientVitals')).toBe(false);
    });

    it('rejects kebab-case', () => {
        expect(validateComponentName('patient-vitals')).toBe(false);
    });

    it('rejects snake_case', () => {
        expect(validateComponentName('Patient_Vitals')).toBe(false);
    });

    it('rejects a name starting with a number', () => {
        expect(validateComponentName('123Card')).toBe(false);
    });

    it('rejects a name with spaces', () => {
        expect(validateComponentName('Patient Vitals')).toBe(false);
    });

    it('rejects a name with special characters', () => {
        expect(validateComponentName('Patient@Vitals')).toBe(false);
    });

    it('rejects all lowercase', () => {
        expect(validateComponentName('patient')).toBe(false);
    });
});
