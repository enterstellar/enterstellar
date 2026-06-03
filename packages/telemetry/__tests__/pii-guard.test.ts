/**
 * @module @enterstellar-ai/telemetry/__tests__/pii-guard
 * @description Tests for targeted PII check on component names.
 *
 * Verifies valid PascalCase names pass through, forged names with hex hashes
 * pass, error code patterns pass, and flagged cases for pure-numeric and
 * embedded numeric ID patterns per TL8.
 */

import { describe, expect, it } from 'vitest';

import { checkComponentNamePii } from '../src/pii-guard.js';

describe('checkComponentNamePii', () => {
    // -------------------------------------------------------------------------
    // Valid names — should NOT be flagged
    // -------------------------------------------------------------------------

    it('accepts valid PascalCase component names', () => {
        const result = checkComponentNamePii('PatientVitals');

        expect(result.flagged).toBe(false);
        expect(result.name).toBe('PatientVitals');
        expect(result.reason).toBeUndefined();
    });

    it('accepts forged component names with hex hashes', () => {
        const result = checkComponentNamePii('__forged_treatment_comparison_7f3a90bc');

        expect(result.flagged).toBe(false);
        expect(result.name).toBe('__forged_treatment_comparison_7f3a90bc');
    });

    it('accepts component names with short numeric segments (< 5 digits)', () => {
        // Error code style names should pass (4 digits)
        const result = checkComponentNamePii('AUR2001');

        expect(result.flagged).toBe(false);
        expect(result.name).toBe('AUR2001');
    });

    it('accepts component names with 4-digit numbers', () => {
        const result = checkComponentNamePii('Chart8080');

        expect(result.flagged).toBe(false);
        expect(result.name).toBe('Chart8080');
    });

    it('accepts empty string without crashing', () => {
        const result = checkComponentNamePii('');

        expect(result.flagged).toBe(false);
        expect(result.name).toBe('');
    });

    it('accepts single-word names', () => {
        const result = checkComponentNamePii('Dashboard');

        expect(result.flagged).toBe(false);
        expect(result.name).toBe('Dashboard');
    });

    // -------------------------------------------------------------------------
    // Flagged names — potential PII leaks
    // -------------------------------------------------------------------------

    it('flags purely numeric component names', () => {
        const result = checkComponentNamePii('12345');

        expect(result.flagged).toBe(true);
        expect(result.name).toBe('__pii_redacted__');
        expect(result.reason).toBeDefined();
    });

    it('flags long purely numeric names', () => {
        const result = checkComponentNamePii('928374651');

        expect(result.flagged).toBe(true);
        expect(result.name).toBe('__pii_redacted__');
    });

    it('flags names with embedded numeric segments ≥ 5 digits', () => {
        const result = checkComponentNamePii('Patient_928374');

        expect(result.flagged).toBe(true);
        expect(result.name).toBe('__pii_redacted__');
        expect(result.reason).toContain('numeric segment');
    });

    it('flags names with a 5-digit numeric ID embedded', () => {
        const result = checkComponentNamePii('User12345Data');

        expect(result.flagged).toBe(true);
        expect(result.name).toBe('__pii_redacted__');
    });

    it('flags names that look like database record IDs', () => {
        const result = checkComponentNamePii('Record_00192837');

        expect(result.flagged).toBe(true);
        expect(result.name).toBe('__pii_redacted__');
    });
});
