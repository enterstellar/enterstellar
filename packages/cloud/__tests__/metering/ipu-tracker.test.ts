/**
 * @module @enterstellar-ai/cloud/__tests__/metering/ipu-tracker.test
 * @description Tests for the local IPU estimate tracker.
 *
 * Covers: cost recording, server reconciliation, drift detection (CL1),
 * drift threshold boundary conditions, over-quota pre-flight checks (CL3),
 * `serverUsed === 0` edge case, estimate snapshots, and state reset.
 *
 * @see Design Choice CL1 — hybrid metering, auto-correct on >10% drift.
 * @see Design Choice CL3 — pre-flight quota check via `isOverQuota()`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createIPUTracker, type IPUTracker } from '../../src/metering/ipu-tracker.js';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — IPUTracker (CL1)', () => {
    let tracker: IPUTracker;

    beforeEach(() => {
        tracker = createIPUTracker();
    });

    // -----------------------------------------------------------------------
    // Initial State
    // -----------------------------------------------------------------------

    describe('Initial State', () => {
        it('starts with zero usage', () => {
            const estimate = tracker.getEstimate();
            expect(estimate.used).toBe(0);
        });

        it('starts with null remaining (no server data yet)', () => {
            const estimate = tracker.getEstimate();
            expect(estimate.remaining).toBeNull();
        });

        it('starts with null limit (no server data yet)', () => {
            const estimate = tracker.getEstimate();
            expect(estimate.limit).toBeNull();
        });

        it('starts with lastReconciliationCorrected as false', () => {
            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(false);
        });

        it('reports not over quota before any reconciliation', () => {
            expect(tracker.isOverQuota()).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Recording Costs
    // -----------------------------------------------------------------------

    describe('Recording Costs', () => {
        it('increments usage by the recorded cost', () => {
            tracker.record(10); // Forge
            expect(tracker.getEstimate().used).toBe(10);
        });

        it('accumulates multiple recordings', () => {
            tracker.record(10); // Forge
            tracker.record(1);  // Semantic search
            tracker.record(5);  // Trace aggregation
            expect(tracker.getEstimate().used).toBe(16);
        });

        it('handles zero-cost recordings (usage query)', () => {
            tracker.record(0);
            expect(tracker.getEstimate().used).toBe(0);
        });

        it('handles fractional costs correctly', () => {
            tracker.record(0.5);
            tracker.record(0.5);
            expect(tracker.getEstimate().used).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // Reconciliation — No Drift
    // -----------------------------------------------------------------------

    describe('Reconciliation — No Drift', () => {
        it('sets limit from server data (serverUsed + serverRemaining)', () => {
            tracker.record(10);
            tracker.reconcile(10, 990);

            const estimate = tracker.getEstimate();
            expect(estimate.limit).toBe(1000);
        });

        it('computes remaining from limit minus local used', () => {
            tracker.record(42);
            tracker.reconcile(42, 958);

            const estimate = tracker.getEstimate();
            expect(estimate.remaining).toBe(958);
        });

        it('does not correct when drift is within threshold', () => {
            tracker.record(100);
            // Server says 105 — drift = |100-105|/105 = 4.76% < 10%
            tracker.reconcile(105, 895);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(false);
            // Local used stays at 100 (not corrected to 105).
            expect(estimate.used).toBe(100);
        });
    });

    // -----------------------------------------------------------------------
    // Reconciliation — With Drift (CL1 Auto-Correction)
    // -----------------------------------------------------------------------

    describe('Reconciliation — Drift Auto-Correction (CL1)', () => {
        it('auto-corrects when drift exceeds 10%', () => {
            tracker.record(50);
            // Server says 100 — drift = |50-100|/100 = 50% > 10%
            tracker.reconcile(100, 900);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(true);
            expect(estimate.used).toBe(100); // Snapped to server value.
        });

        it('auto-corrects when local overestimates vs server', () => {
            tracker.record(200);
            // Server says 100 — drift = |200-100|/100 = 100% > 10%
            tracker.reconcile(100, 900);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(true);
            expect(estimate.used).toBe(100);
        });

        it('updates remaining after drift correction', () => {
            tracker.record(200);
            tracker.reconcile(100, 900); // limit = 1000

            const estimate = tracker.getEstimate();
            // After correction: used=100, limit=1000, remaining=900.
            expect(estimate.remaining).toBe(900);
        });
    });

    // -----------------------------------------------------------------------
    // Drift Threshold Boundary Conditions
    // -----------------------------------------------------------------------

    describe('Drift Threshold Boundary', () => {
        it('does NOT correct at exactly 10% drift (threshold is >)', () => {
            tracker.record(90);
            // Server says 100 — drift = |90-100|/100 = 10% exactly.
            // Threshold is > 10%, not >=, so no correction.
            tracker.reconcile(100, 900);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(false);
            expect(estimate.used).toBe(90); // Unchanged.
        });

        it('corrects at 10.1% drift (just over threshold)', () => {
            // local=89, server=100 → drift = |89-100|/100 = 11% > 10%
            tracker.record(89);
            tracker.reconcile(100, 900);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(true);
            expect(estimate.used).toBe(100);
        });

        it('does not correct at 9% drift (under threshold)', () => {
            // local=91, server=100 → drift = |91-100|/100 = 9% < 10%
            tracker.record(91);
            tracker.reconcile(100, 900);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(false);
            expect(estimate.used).toBe(91);
        });
    });

    // -----------------------------------------------------------------------
    // Edge Case: serverUsed === 0
    // -----------------------------------------------------------------------

    describe('Edge Case: serverUsed === 0', () => {
        it('corrects local estimate to 0 when server reports 0 and local > 0', () => {
            tracker.record(10);
            tracker.reconcile(0, 1000);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(true);
            expect(estimate.used).toBe(0);
        });

        it('does not flag correction when both local and server are 0', () => {
            // No recordings, no usage.
            tracker.reconcile(0, 1000);

            const estimate = tracker.getEstimate();
            expect(estimate.lastReconciliationCorrected).toBe(false);
            expect(estimate.used).toBe(0);
        });

        it('sets limit correctly when serverUsed is 0', () => {
            tracker.reconcile(0, 500);

            const estimate = tracker.getEstimate();
            expect(estimate.limit).toBe(500);
            expect(estimate.remaining).toBe(500);
        });
    });

    // -----------------------------------------------------------------------
    // Over-Quota Detection (CL3)
    // -----------------------------------------------------------------------

    describe('Over-Quota Detection (CL3)', () => {
        it('returns false before any reconciliation (no limit known)', () => {
            tracker.record(999_999);
            expect(tracker.isOverQuota()).toBe(false);
        });

        it('returns false when under quota', () => {
            tracker.reconcile(10, 990); // limit = 1000
            tracker.record(10); // local used = 10

            expect(tracker.isOverQuota()).toBe(false);
        });

        it('returns true when local used equals limit (boundary)', () => {
            tracker.reconcile(0, 100); // limit = 100
            tracker.record(100);

            expect(tracker.isOverQuota()).toBe(true);
        });

        it('returns true when local used exceeds limit', () => {
            tracker.reconcile(0, 100); // limit = 100
            tracker.record(150);

            expect(tracker.isOverQuota()).toBe(true);
        });

        it('returns false after reconciliation corrects usage downward', () => {
            tracker.reconcile(0, 100); // limit = 100
            tracker.record(150); // over quota locally
            expect(tracker.isOverQuota()).toBe(true);

            // Server says actual usage is only 50.
            tracker.reconcile(50, 50); // limit = 100, drift corrects to 50
            expect(tracker.isOverQuota()).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Remaining Computation
    // -----------------------------------------------------------------------

    describe('Remaining Computation', () => {
        it('computes remaining as max(0, limit - localUsed)', () => {
            tracker.reconcile(0, 100); // limit = 100
            tracker.record(120); // exceeds limit

            const estimate = tracker.getEstimate();
            // remaining should be clamped to 0, not go negative.
            expect(estimate.remaining).toBe(0);
        });

        it('reflects local recording between reconciliations', () => {
            tracker.reconcile(10, 90); // limit = 100

            tracker.record(5); // local used = 5 (NOT 15, since reconcile didn't correct)
            // Wait — local used is 0 + record(5) = 5, but reconcile was called with serverUsed=10.
            // Drift = |5 - 10| / 10 = 50% → auto-correct to 10.
            // Hmm, but record(5) was BEFORE reconcile in this case. Let me re-read the tracker logic.
            // Actually the order is: reconcile → record. Let me restructure:

            // Reset for clean test.
            tracker.reset();

            tracker.reconcile(10, 90); // Sets limit=100. local=0, drift=|0-10|/10=100% → corrects to 10.
            tracker.record(5); // local = 10 + 5 = 15

            const estimate = tracker.getEstimate();
            expect(estimate.used).toBe(15);
            expect(estimate.remaining).toBe(85); // 100 - 15
        });
    });

    // -----------------------------------------------------------------------
    // Multiple Reconciliations
    // -----------------------------------------------------------------------

    describe('Multiple Reconciliations', () => {
        it('updates limit on each reconciliation', () => {
            tracker.reconcile(10, 990); // limit = 1000
            expect(tracker.getEstimate().limit).toBe(1000);

            tracker.reconcile(50, 1950); // limit = 2000 (upgraded tier?)
            expect(tracker.getEstimate().limit).toBe(2000);
        });

        it('resets correction flag on subsequent reconciliation without drift', () => {
            tracker.record(50);
            tracker.reconcile(100, 900); // Drift → corrected.
            expect(tracker.getEstimate().lastReconciliationCorrected).toBe(true);

            // Now local = 100, server = 105.
            // Drift = |100-105|/105 = 4.76% < 10%.
            tracker.reconcile(105, 895);
            expect(tracker.getEstimate().lastReconciliationCorrected).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------

    describe('Reset', () => {
        it('clears all state to initial values', () => {
            tracker.record(42);
            tracker.reconcile(42, 958);

            tracker.reset();

            const estimate = tracker.getEstimate();
            expect(estimate.used).toBe(0);
            expect(estimate.remaining).toBeNull();
            expect(estimate.limit).toBeNull();
            expect(estimate.lastReconciliationCorrected).toBe(false);
        });

        it('returns not over quota after reset', () => {
            tracker.reconcile(0, 100);
            tracker.record(200);
            expect(tracker.isOverQuota()).toBe(true);

            tracker.reset();
            expect(tracker.isOverQuota()).toBe(false);
        });

        it('allows normal operation after reset', () => {
            tracker.record(50);
            tracker.reset();
            tracker.record(10);

            expect(tracker.getEstimate().used).toBe(10);
        });

        it('clears lastIPUCost after reset', () => {
            tracker.reconcile(10, 990, 10);
            expect(tracker.getLastIPUCost()).toBe(10);

            tracker.reset();
            expect(tracker.getLastIPUCost()).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // getLastIPUCost() (SD7)
    // -----------------------------------------------------------------------

    describe('getLastIPUCost() (SD7)', () => {
        it('returns undefined before any reconciliation', () => {
            expect(tracker.getLastIPUCost()).toBeUndefined();
        });

        it('returns the ipuCost from the last reconcile() call', () => {
            tracker.reconcile(10, 990, 10);
            expect(tracker.getLastIPUCost()).toBe(10);
        });

        it('updates on each reconcile() call', () => {
            tracker.reconcile(10, 990, 10); // forge = 10 IPU
            expect(tracker.getLastIPUCost()).toBe(10);

            tracker.reconcile(11, 989, 1); // search = 1 IPU
            expect(tracker.getLastIPUCost()).toBe(1);
        });

        it('returns undefined when reconcile() called without ipuCost', () => {
            tracker.reconcile(10, 990, 10);
            expect(tracker.getLastIPUCost()).toBe(10);

            // Call without ipuCost — should revert to undefined.
            tracker.reconcile(20, 980);
            expect(tracker.getLastIPUCost()).toBeUndefined();
        });

        it('returns 0 for zero-cost operation reconciliation', () => {
            tracker.reconcile(10, 990, 0); // trace submit = 0 IPU
            expect(tracker.getLastIPUCost()).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // Backward Compatibility — reconcile() with 2 args
    // -----------------------------------------------------------------------

    describe('Backward Compatibility', () => {
        it('reconcile() with 2 args still works (no ipuCost)', () => {
            tracker.record(10);
            tracker.reconcile(10, 990); // 2-arg call

            const estimate = tracker.getEstimate();
            expect(estimate.limit).toBe(1000);
            expect(estimate.used).toBe(10);
        });
    });
});
