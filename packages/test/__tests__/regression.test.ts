/**
 * @module @enterstellar-ai/test/__tests__/regression
 * @description Unit tests for `detectRegressions()`.
 *
 * Verifies:
 * - No regressions when baseline matches current
 * - Detects regressions when resolved component changes
 * - Ignores intents only in baseline (removed tests)
 * - Ignores intents only in current (new tests)
 * - Handles empty baseline and current arrays
 * - Detects multiple regressions in one run
 */

import { describe, it, expect } from 'vitest';

import { detectRegressions } from '../src/regression.js';
import type { TestResultRecord } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function result(intent: string, component: string): TestResultRecord {
    return {
        intent,
        resolvedComponent: component,
        compilationPassed: true,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectRegressions()', () => {
    describe('no regressions', () => {
        it('returns empty array when baseline matches current', () => {
            const baseline = [
                result('show vitals', 'PatientVitals'),
                result('show alert', 'AlertBanner'),
            ];
            const current = [
                result('show vitals', 'PatientVitals'),
                result('show alert', 'AlertBanner'),
            ];

            const regressions = detectRegressions(baseline, current);

            expect(regressions).toHaveLength(0);
        });
    });

    describe('single regression', () => {
        it('detects when a component changes between runs', () => {
            const baseline = [
                result('show vitals', 'PatientVitals'),
                result('show alert', 'AlertBanner'),
            ];
            const current = [
                result('show vitals', 'PatientVitals'),
                result('show alert', 'NotificationCard'), // Changed!
            ];

            const regressions = detectRegressions(baseline, current);

            expect(regressions).toHaveLength(1);
            expect(regressions[0]).toEqual({
                intent: 'show alert',
                baselineComponent: 'AlertBanner',
                currentComponent: 'NotificationCard',
            });
        });
    });

    describe('multiple regressions', () => {
        it('detects all regressions in one run', () => {
            const baseline = [
                result('show vitals', 'PatientVitals'),
                result('show alert', 'AlertBanner'),
                result('show meds', 'MedicationList'),
            ];
            const current = [
                result('show vitals', 'VitalsCard'),       // Regression 1
                result('show alert', 'AlertBanner'),        // No regression
                result('show meds', 'DrugInteractions'),    // Regression 2
            ];

            const regressions = detectRegressions(baseline, current);

            expect(regressions).toHaveLength(2);
            expect(regressions[0]?.intent).toBe('show vitals');
            expect(regressions[1]?.intent).toBe('show meds');
        });
    });

    describe('asymmetric sets', () => {
        it('ignores intents only in baseline (removed tests)', () => {
            const baseline = [
                result('show vitals', 'PatientVitals'),
                result('show old feature', 'DeprecatedWidget'), // Only in baseline
            ];
            const current = [
                result('show vitals', 'PatientVitals'),
            ];

            const regressions = detectRegressions(baseline, current);

            expect(regressions).toHaveLength(0);
        });

        it('ignores intents only in current (new tests)', () => {
            const baseline = [
                result('show vitals', 'PatientVitals'),
            ];
            const current = [
                result('show vitals', 'PatientVitals'),
                result('show new feature', 'NewWidget'), // Only in current
            ];

            const regressions = detectRegressions(baseline, current);

            expect(regressions).toHaveLength(0);
        });
    });

    describe('empty inputs', () => {
        it('returns empty array for empty baseline', () => {
            const current = [result('show vitals', 'PatientVitals')];

            const regressions = detectRegressions([], current);

            expect(regressions).toHaveLength(0);
        });

        it('returns empty array for empty current', () => {
            const baseline = [result('show vitals', 'PatientVitals')];

            const regressions = detectRegressions(baseline, []);

            expect(regressions).toHaveLength(0);
        });

        it('returns empty array for both empty', () => {
            const regressions = detectRegressions([], []);

            expect(regressions).toHaveLength(0);
        });
    });

    describe('duplicate intents', () => {
        it('uses the last baseline entry when duplicates exist', () => {
            const baseline = [
                result('show vitals', 'PatientVitals'),     // First entry
                result('show vitals', 'VitalsCardV2'),       // Last entry wins
            ];
            const current = [
                result('show vitals', 'VitalsCardV2'),       // Matches last baseline
            ];

            const regressions = detectRegressions(baseline, current);

            expect(regressions).toHaveLength(0); // No regression — matches last baseline
        });

        it('detects regression against last baseline entry', () => {
            const baseline = [
                result('show vitals', 'PatientVitals'),     // First entry
                result('show vitals', 'VitalsCardV2'),       // Last entry wins
            ];
            const current = [
                result('show vitals', 'CompletelyDifferent'), // Differs from last baseline
            ];

            const regressions = detectRegressions(baseline, current);

            expect(regressions).toHaveLength(1);
            expect(regressions[0]?.baselineComponent).toBe('VitalsCardV2');
            expect(regressions[0]?.currentComponent).toBe('CompletelyDifferent');
        });
    });
});
