/**
 * @module @enterstellar-ai/cloud/__tests__/metering/ipu-costs.test
 * @description Tests for IPU cost constants.
 *
 * Verifies all 13 operation costs match Bible §9.1 (corrected).
 * This is a regression guard — any accidental modification to the
 * constants will break these tests.
 *
 * Key regressions:
 * - `TRACE_SUBMIT === 0` (was `TRACE_AGGREGATION === 5` in v0.0.x).
 * - `CERTIFY === 20` (new in v0.1.0).
 *
 * @see Design Choice CL2 — weighted IPU costs.
 * @see Bible §9.1 — API endpoint table with IPU costs.
 */

import { describe, expect, it } from 'vitest';

import { IPU_COSTS } from '../../src/metering/ipu-costs.js';

// ---------------------------------------------------------------------------
// IPU Cost Constants Tests
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — IPU Cost Constants (CL2, §9.1)', () => {
    // -----------------------------------------------------------------------
    // Premium operations
    // -----------------------------------------------------------------------

    it('charges 10 IPU for CloudForge generation', () => {
        expect(IPU_COSTS.FORGE).toBe(10);
    });

    it('charges 20 IPU for contract certification (CR6)', () => {
        expect(IPU_COSTS.CERTIFY).toBe(20);
    });

    // -----------------------------------------------------------------------
    // Standard operations
    // -----------------------------------------------------------------------

    it('charges 1 IPU for cloud semantic search', () => {
        expect(IPU_COSTS.SEMANTIC_SEARCH).toBe(1);
    });

    it('charges 1 IPU for single intent route', () => {
        expect(IPU_COSTS.ROUTE).toBe(1);
    });

    it('charges 1 IPU per intent in batch route', () => {
        expect(IPU_COSTS.ROUTE_BATCH_PER_INTENT).toBe(1);
    });

    it('charges 5 IPU for trace analytics (TA5)', () => {
        expect(IPU_COSTS.TRACE_ANALYTICS).toBe(5);
    });

    it('charges 5 IPU for business analytics (TA10)', () => {
        expect(IPU_COSTS.BUSINESS_ANALYTICS).toBe(5);
    });

    // -----------------------------------------------------------------------
    // Free operations (0 IPU)
    // -----------------------------------------------------------------------

    it('charges 0 IPU for signal submission (data collection is free)', () => {
        expect(IPU_COSTS.SIGNAL_SUBMIT).toBe(0);
    });

    it('charges 0 IPU for trace submission — regression from TRACE_AGGREGATION=5', () => {
        expect(IPU_COSTS.TRACE_SUBMIT).toBe(0);
    });

    it('charges 0 IPU for usage queries', () => {
        expect(IPU_COSTS.USAGE_QUERY).toBe(0);
    });

    it('charges 0 IPU for ledger queries', () => {
        expect(IPU_COSTS.LEDGER_QUERY).toBe(0);
    });

    it('charges 0 IPU for trace listing queries', () => {
        expect(IPU_COSTS.GET_TRACES).toBe(0);
    });

    it('charges 0 IPU for GDPR data deletion', () => {
        expect(IPU_COSTS.DELETE_PROJECT_DATA).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Structural integrity
    // -----------------------------------------------------------------------

    it('exports exactly 13 cost constants', () => {
        const keys = Object.keys(IPU_COSTS);
        expect(keys).toHaveLength(13);
    });

    it('contains all expected constant keys', () => {
        const keys = Object.keys(IPU_COSTS);
        expect(keys).toEqual(
            expect.arrayContaining([
                'FORGE',
                'SEMANTIC_SEARCH',
                'ROUTE',
                'ROUTE_BATCH_PER_INTENT',
                'SIGNAL_SUBMIT',
                'TRACE_SUBMIT',
                'TRACE_ANALYTICS',
                'BUSINESS_ANALYTICS',
                'CERTIFY',
                'USAGE_QUERY',
                'LEDGER_QUERY',
                'GET_TRACES',
                'DELETE_PROJECT_DATA',
            ]),
        );
    });

    it('all cost values are non-negative integers', () => {
        for (const [key, value] of Object.entries(IPU_COSTS)) {
            expect(value, `IPU_COSTS.${key} must be >= 0`).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(value), `IPU_COSTS.${key} must be integer`).toBe(true);
        }
    });

    it('is frozen — values cannot be mutated at runtime', () => {
        expect(Object.isFrozen(IPU_COSTS)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Regression: old constant removed
    // -----------------------------------------------------------------------

    it('does NOT contain the old TRACE_AGGREGATION constant', () => {
        expect('TRACE_AGGREGATION' in IPU_COSTS).toBe(false);
    });
});
