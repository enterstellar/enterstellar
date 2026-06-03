/**
 * @module @enterstellar-ai/connection/__tests__/reconnect.test
 * @description Unit tests for `createReconnectScheduler()`.
 *
 * Tests the exponential backoff sequence, maxDelay cap, reset behavior,
 * and attempt counter accuracy.
 *
 * @see Design Choice S11 — Exponential backoff 1s → 2s → 4s → 8s → 16s → 30s cap
 */

import { describe, it, expect } from 'vitest';

import { createReconnectScheduler } from '../src/reconnect.js';
import { INITIAL_BACKOFF_MS } from '../src/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DELAY = 30_000;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createReconnectScheduler', () => {
    it('should return a scheduler object with nextDelay, reset, and attempt', () => {
        const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

        expect(scheduler).toBeDefined();
        expect(typeof scheduler.nextDelay).toBe('function');
        expect(typeof scheduler.reset).toBe('function');
        expect(typeof scheduler.attempt).toBe('number');
    });

    describe('nextDelay()', () => {
        it('should produce the correct exponential backoff sequence', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            expect(scheduler.nextDelay()).toBe(1_000);  // 1s * 2^0
            expect(scheduler.nextDelay()).toBe(2_000);  // 1s * 2^1
            expect(scheduler.nextDelay()).toBe(4_000);  // 1s * 2^2
            expect(scheduler.nextDelay()).toBe(8_000);  // 1s * 2^3
            expect(scheduler.nextDelay()).toBe(16_000); // 1s * 2^4
        });

        it('should cap at maxDelay', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            // Burn through the sequence until we hit the cap.
            // 1s, 2s, 4s, 8s, 16s → next would be 32s but capped at 30s.
            for (let i = 0; i < 5; i++) {
                scheduler.nextDelay();
            }

            expect(scheduler.nextDelay()).toBe(DEFAULT_MAX_DELAY); // 30s cap
            expect(scheduler.nextDelay()).toBe(DEFAULT_MAX_DELAY); // stays capped
            expect(scheduler.nextDelay()).toBe(DEFAULT_MAX_DELAY); // stays capped
        });

        it('should cap immediately when maxDelay <= INITIAL_BACKOFF_MS', () => {
            const scheduler = createReconnectScheduler({ maxDelay: INITIAL_BACKOFF_MS });

            // Every delay should be exactly INITIAL_BACKOFF_MS since maxDelay equals it.
            expect(scheduler.nextDelay()).toBe(INITIAL_BACKOFF_MS);
            expect(scheduler.nextDelay()).toBe(INITIAL_BACKOFF_MS);
        });

        it('should handle a very small maxDelay', () => {
            const scheduler = createReconnectScheduler({ maxDelay: 1_000 });

            expect(scheduler.nextDelay()).toBe(1_000);
            expect(scheduler.nextDelay()).toBe(1_000); // 2000 would exceed max, so 1000
        });

        it('should handle large maxDelay without overflow', () => {
            const scheduler = createReconnectScheduler({ maxDelay: 120_000 });

            // Sequence: 1s, 2s, 4s, 8s, 16s, 32s, 64s, 120s cap
            expect(scheduler.nextDelay()).toBe(1_000);
            expect(scheduler.nextDelay()).toBe(2_000);
            expect(scheduler.nextDelay()).toBe(4_000);
            expect(scheduler.nextDelay()).toBe(8_000);
            expect(scheduler.nextDelay()).toBe(16_000);
            expect(scheduler.nextDelay()).toBe(32_000);
            expect(scheduler.nextDelay()).toBe(64_000);
            expect(scheduler.nextDelay()).toBe(120_000); // capped
        });

        it('should not produce negative or zero delays', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            for (let i = 0; i < 50; i++) {
                const delay = scheduler.nextDelay();
                expect(delay).toBeGreaterThan(0);
            }
        });
    });

    describe('reset()', () => {
        it('should restart the backoff sequence from the beginning', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            // Advance a few steps.
            scheduler.nextDelay(); // 1s
            scheduler.nextDelay(); // 2s
            scheduler.nextDelay(); // 4s

            scheduler.reset();

            // Should restart from 1s.
            expect(scheduler.nextDelay()).toBe(1_000);
            expect(scheduler.nextDelay()).toBe(2_000);
        });

        it('should reset the attempt counter to 0', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            scheduler.nextDelay();
            scheduler.nextDelay();
            expect(scheduler.attempt).toBe(2);

            scheduler.reset();
            expect(scheduler.attempt).toBe(0);
        });

        it('should be callable multiple times without issue', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            scheduler.nextDelay();
            scheduler.reset();
            scheduler.reset();
            scheduler.reset();

            expect(scheduler.attempt).toBe(0);
            expect(scheduler.nextDelay()).toBe(1_000);
        });
    });

    describe('attempt', () => {
        it('should start at 0', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            expect(scheduler.attempt).toBe(0);
        });

        it('should increment by 1 for each nextDelay() call', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            scheduler.nextDelay();
            expect(scheduler.attempt).toBe(1);

            scheduler.nextDelay();
            expect(scheduler.attempt).toBe(2);

            scheduler.nextDelay();
            expect(scheduler.attempt).toBe(3);
        });

        it('should continue incrementing past the cap', () => {
            const scheduler = createReconnectScheduler({ maxDelay: DEFAULT_MAX_DELAY });

            // Call 10 times — delay caps but attempt keeps counting.
            for (let i = 0; i < 10; i++) {
                scheduler.nextDelay();
            }

            expect(scheduler.attempt).toBe(10);
        });
    });
});
