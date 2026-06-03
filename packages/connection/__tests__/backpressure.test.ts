/**
 * @module @enterstellar-ai/connection/__tests__/backpressure.test
 * @description Unit tests for `createIntentBuffer()`.
 *
 * Tests the intent backpressure buffer: push/drain, oldest/newest drop
 * strategies, actionable bypass, full flag, peek, and edge cases.
 *
 * @see Design Choice P5 — Backpressure on connection
 */

import { describe, it, expect } from 'vitest';

import type { ComponentIntent } from '@enterstellar-ai/types';

import { createIntentBuffer } from '../src/backpressure.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal `ComponentIntent` for testing. */
function makeIntent(
    component: string,
    interaction?: 'read-only' | 'editable' | 'actionable',
): ComponentIntent {
    return {
        component,
        props: {},
        confidence: 0.9,
        interaction,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createIntentBuffer', () => {
    it('should return a buffer with push, drain, peek, size, full, and maxBuffer', () => {
        const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

        expect(typeof buffer.push).toBe('function');
        expect(typeof buffer.drain).toBe('function');
        expect(typeof buffer.peek).toBe('function');
        expect(typeof buffer.size).toBe('number');
        expect(typeof buffer.full).toBe('boolean');
        expect(typeof buffer.maxBuffer).toBe('number');
    });

    describe('basic push and drain', () => {
        it('should buffer intents and drain them in FIFO order', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            buffer.push(makeIntent('A'));
            buffer.push(makeIntent('B'));
            buffer.push(makeIntent('C'));

            const drained = buffer.drain();

            expect(drained).toHaveLength(3);
            expect(drained[0]?.component).toBe('A');
            expect(drained[1]?.component).toBe('B');
            expect(drained[2]?.component).toBe('C');
        });

        it('should empty the buffer after drain', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            buffer.push(makeIntent('A'));
            buffer.drain();

            expect(buffer.size).toBe(0);
            expect(buffer.drain()).toHaveLength(0);
        });

        it('should return an empty array when draining an empty buffer', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            expect(buffer.drain()).toHaveLength(0);
        });
    });

    describe('size and full', () => {
        it('should track the current buffer size', () => {
            const buffer = createIntentBuffer({ maxBuffer: 3, dropStrategy: 'oldest' });

            expect(buffer.size).toBe(0);

            buffer.push(makeIntent('A'));
            expect(buffer.size).toBe(1);

            buffer.push(makeIntent('B'));
            expect(buffer.size).toBe(2);

            buffer.push(makeIntent('C'));
            expect(buffer.size).toBe(3);
        });

        it('should report full when size equals maxBuffer', () => {
            const buffer = createIntentBuffer({ maxBuffer: 2, dropStrategy: 'oldest' });

            expect(buffer.full).toBe(false);

            buffer.push(makeIntent('A'));
            expect(buffer.full).toBe(false);

            buffer.push(makeIntent('B'));
            expect(buffer.full).toBe(true);
        });

        it('should expose maxBuffer', () => {
            const buffer = createIntentBuffer({ maxBuffer: 42, dropStrategy: 'oldest' });

            expect(buffer.maxBuffer).toBe(42);
        });
    });

    describe('peek', () => {
        it('should return the oldest intent without removing it', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            buffer.push(makeIntent('A'));
            buffer.push(makeIntent('B'));

            expect(buffer.peek()?.component).toBe('A');
            expect(buffer.size).toBe(2); // unchanged
        });

        it('should return null when the buffer is empty', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            expect(buffer.peek()).toBeNull();
        });
    });

    describe('drop strategy: oldest', () => {
        it('should drop the oldest intent when buffer is full', () => {
            const buffer = createIntentBuffer({ maxBuffer: 2, dropStrategy: 'oldest' });

            buffer.push(makeIntent('A'));
            buffer.push(makeIntent('B'));

            const result = buffer.push(makeIntent('C'));

            expect(result.dropped?.component).toBe('A'); // oldest dropped
            expect(result.bypassed).toBe(false);
            expect(buffer.size).toBe(2); // stays at max

            const drained = buffer.drain();
            expect(drained[0]?.component).toBe('B');
            expect(drained[1]?.component).toBe('C');
        });

        it('should return dropped: null when buffer has capacity', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            const result = buffer.push(makeIntent('A'));

            expect(result.dropped).toBeNull();
            expect(result.bypassed).toBe(false);
        });
    });

    describe('drop strategy: newest', () => {
        it('should reject the incoming intent when buffer is full', () => {
            const buffer = createIntentBuffer({ maxBuffer: 2, dropStrategy: 'newest' });

            buffer.push(makeIntent('A'));
            buffer.push(makeIntent('B'));

            const result = buffer.push(makeIntent('C'));

            expect(result.dropped?.component).toBe('C'); // incoming rejected
            expect(result.bypassed).toBe(false);
            expect(buffer.size).toBe(2);

            const drained = buffer.drain();
            expect(drained[0]?.component).toBe('A');
            expect(drained[1]?.component).toBe('B');
        });
    });

    describe('actionable bypass', () => {
        it('should bypass the buffer for actionable intents', () => {
            const buffer = createIntentBuffer({ maxBuffer: 2, dropStrategy: 'oldest' });

            buffer.push(makeIntent('A'));
            buffer.push(makeIntent('B'));

            // Buffer is full, but actionable intent bypasses.
            const result = buffer.push(makeIntent('Action', 'actionable'));

            expect(result.bypassed).toBe(true);
            expect(result.dropped).toBeNull();
            expect(buffer.size).toBe(2); // buffer unchanged
        });

        it('should not buffer actionable intents even when buffer has capacity', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            const result = buffer.push(makeIntent('Action', 'actionable'));

            expect(result.bypassed).toBe(true);
            expect(buffer.size).toBe(0); // not in buffer
        });

        it('should not count non-actionable interactions as bypassed', () => {
            const buffer = createIntentBuffer({ maxBuffer: 10, dropStrategy: 'oldest' });

            const readResult = buffer.push(makeIntent('Reader', 'read-only'));
            expect(readResult.bypassed).toBe(false);
            expect(buffer.size).toBe(1);

            const editResult = buffer.push(makeIntent('Editor', 'editable'));
            expect(editResult.bypassed).toBe(false);
            expect(buffer.size).toBe(2);
        });
    });

    describe('edge cases', () => {
        it('should work with maxBuffer of 1', () => {
            const buffer = createIntentBuffer({ maxBuffer: 1, dropStrategy: 'oldest' });

            buffer.push(makeIntent('A'));
            expect(buffer.full).toBe(true);

            const result = buffer.push(makeIntent('B'));
            expect(result.dropped?.component).toBe('A');
            expect(buffer.size).toBe(1);
            expect(buffer.peek()?.component).toBe('B');
        });

        it('should handle rapid push-drain cycles', () => {
            const buffer = createIntentBuffer({ maxBuffer: 3, dropStrategy: 'oldest' });

            for (let i = 0; i < 100; i++) {
                buffer.push(makeIntent(`Cycle-${String(i)}`));
                if (i % 5 === 0) {
                    buffer.drain();
                }
            }

            // Should not throw or leak.
            expect(buffer.size).toBeLessThanOrEqual(3);
        });
    });
});
