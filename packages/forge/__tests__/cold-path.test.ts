/**
 * @module @enterstellar-ai/forge/__tests__/cold-path
 * @description Unit tests for the Cold Path tracker.
 *
 * Verifies trace recording, history retrieval, clustering by intentHash,
 * success rate calculation, and history clearing.
 *
 * @see Design Choice F10 — Cold Path pipeline runs server-side.
 * @see Design Choice F11 — default cluster threshold: 5.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { ForgeTraceRecord } from '@enterstellar-ai/types';

import { createColdPathTracker } from '../src/cold-path.js';

import type { ColdPathTracker } from '../src/cold-path.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a `ForgeTraceRecord` with configurable overrides.
 */
function createTrace(overrides: Partial<ForgeTraceRecord> = {}): ForgeTraceRecord {
    return {
        intentSlug: 'patient-vitals',
        intentHash: 'a1b2c3d4',
        forgeMode: 'local',
        success: true,
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createColdPathTracker', () => {
    let tracker: ColdPathTracker;

    beforeEach(() => {
        tracker = createColdPathTracker();
    });

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    describe('initialization', () => {
        it('starts with size 0', () => {
            expect(tracker.size).toBe(0);
        });

        it('returns empty trace history', () => {
            expect(tracker.getTraceHistory()).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // recordTrace
    // -----------------------------------------------------------------------

    describe('recordTrace', () => {
        it('increments size after recording', () => {
            tracker.recordTrace(createTrace());
            expect(tracker.size).toBe(1);
        });

        it('records multiple traces', () => {
            tracker.recordTrace(createTrace());
            tracker.recordTrace(createTrace({ intentSlug: 'treatment-comparison' }));
            tracker.recordTrace(createTrace({ intentSlug: 'lab-results' }));
            expect(tracker.size).toBe(3);
        });
    });

    // -----------------------------------------------------------------------
    // getTraceHistory
    // -----------------------------------------------------------------------

    describe('getTraceHistory', () => {
        it('returns all recorded traces in order', () => {
            const trace1 = createTrace({ intentSlug: 'first' });
            const trace2 = createTrace({ intentSlug: 'second' });
            tracker.recordTrace(trace1);
            tracker.recordTrace(trace2);

            const history = tracker.getTraceHistory();
            expect(history).toHaveLength(2);
            expect(history[0]?.intentSlug).toBe('first');
            expect(history[1]?.intentSlug).toBe('second');
        });

        it('returns a copy — mutations do not affect internal state', () => {
            tracker.recordTrace(createTrace());
            const history = tracker.getTraceHistory();
            // Attempt to mutate the returned array
            (history as ForgeTraceRecord[]).length = 0;
            expect(tracker.size).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // getClusteredIntents
    // -----------------------------------------------------------------------

    describe('getClusteredIntents', () => {
        it('returns empty array when no traces exist', () => {
            expect(tracker.getClusteredIntents()).toEqual([]);
        });

        it('returns empty array when no intent reaches default threshold (5)', () => {
            for (let i = 0; i < 4; i++) {
                tracker.recordTrace(createTrace());
            }
            expect(tracker.getClusteredIntents()).toEqual([]);
        });

        it('returns clustered intent when threshold is reached', () => {
            for (let i = 0; i < 5; i++) {
                tracker.recordTrace(createTrace());
            }
            const clustered = tracker.getClusteredIntents();
            expect(clustered).toHaveLength(1);
            expect(clustered[0]?.intentHash).toBe('a1b2c3d4');
            expect(clustered[0]?.count).toBe(5);
        });

        it('respects custom threshold', () => {
            for (let i = 0; i < 3; i++) {
                tracker.recordTrace(createTrace());
            }
            const clustered = tracker.getClusteredIntents(3);
            expect(clustered).toHaveLength(1);
        });

        it('threshold of 1 returns every unique intent', () => {
            tracker.recordTrace(createTrace({ intentHash: 'hash1' }));
            tracker.recordTrace(createTrace({ intentHash: 'hash2' }));
            const clustered = tracker.getClusteredIntents(1);
            expect(clustered).toHaveLength(2);
        });

        it('calculates success rate correctly', () => {
            // 3 successes + 2 failures = 60% success rate
            for (let i = 0; i < 3; i++) {
                tracker.recordTrace(createTrace({ success: true }));
            }
            for (let i = 0; i < 2; i++) {
                tracker.recordTrace(createTrace({ success: false }));
            }

            const clustered = tracker.getClusteredIntents(1);
            expect(clustered).toHaveLength(1);
            expect(clustered[0]?.successRate).toBeCloseTo(0.6);
        });

        it('calculates 0% success rate when all fail', () => {
            for (let i = 0; i < 5; i++) {
                tracker.recordTrace(createTrace({ success: false }));
            }

            const clustered = tracker.getClusteredIntents(1);
            expect(clustered[0]?.successRate).toBe(0);
        });

        it('sorts by count descending (most frequent first)', () => {
            // Intent A: 5 occurrences
            for (let i = 0; i < 5; i++) {
                tracker.recordTrace(createTrace({ intentHash: 'hashA', intentSlug: 'intent-a' }));
            }
            // Intent B: 10 occurrences
            for (let i = 0; i < 10; i++) {
                tracker.recordTrace(createTrace({ intentHash: 'hashB', intentSlug: 'intent-b' }));
            }

            const clustered = tracker.getClusteredIntents(1);
            expect(clustered[0]?.intentSlug).toBe('intent-b');
            expect(clustered[1]?.intentSlug).toBe('intent-a');
        });

        it('includes timestamps for each occurrence', () => {
            for (let i = 0; i < 3; i++) {
                tracker.recordTrace(createTrace());
            }

            const clustered = tracker.getClusteredIntents(1);
            expect(clustered[0]?.timestamps).toHaveLength(3);
        });
    });

    // -----------------------------------------------------------------------
    // clearHistory
    // -----------------------------------------------------------------------

    describe('clearHistory', () => {
        it('resets size to 0', () => {
            tracker.recordTrace(createTrace());
            tracker.recordTrace(createTrace());
            tracker.clearHistory();
            expect(tracker.size).toBe(0);
        });

        it('clears all traces from history', () => {
            tracker.recordTrace(createTrace());
            tracker.clearHistory();
            expect(tracker.getTraceHistory()).toEqual([]);
        });

        it('clears clustered intents', () => {
            for (let i = 0; i < 5; i++) {
                tracker.recordTrace(createTrace());
            }
            tracker.clearHistory();
            expect(tracker.getClusteredIntents()).toEqual([]);
        });
    });
});
