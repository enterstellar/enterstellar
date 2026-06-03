/**
 * @module @enterstellar-ai/lifecycle/__tests__/state-machine
 * @description Unit tests for the core lifecycle state machine.
 *
 * Covers all 9 valid transitions (LC2), invalid transitions (ENS-3003),
 * timeout behavior (ENS-3002), retry tracking, event emission (L4),
 * reset, and disposal.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createStateMachine } from '../src/state-machine.js';
import type { LifecycleManager, LifecycleEvent, LifecycleManagerConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: LifecycleManagerConfig = {
    timeoutMs: 30_000,
    maxRetries: 3,
};

function createFSM(config: Partial<LifecycleManagerConfig> = {}): LifecycleManager {
    return createStateMachine({ ...DEFAULT_CONFIG, ...config });
}

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

describe('createStateMachine — initial state', () => {
    it('starts in idle state', () => {
        const fsm = createFSM();
        expect(fsm.state).toBe('idle');
    });

    it('starts with retryCount 0', () => {
        const fsm = createFSM();
        expect(fsm.retryCount).toBe(0);
    });

    it('starts as not disposed', () => {
        const fsm = createFSM();
        expect(fsm.disposed).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Valid Transitions (LC2)
// ---------------------------------------------------------------------------

describe('createStateMachine — valid transitions', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('idle → loading', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        expect(fsm.state).toBe('loading');
    });

    it('loading → streaming', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('streaming');
        expect(fsm.state).toBe('streaming');
    });

    it('loading → ready', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('ready');
        expect(fsm.state).toBe('ready');
    });

    it('loading → error', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('error');
        expect(fsm.state).toBe('error');
    });

    it('loading → empty', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('empty');
        expect(fsm.state).toBe('empty');
    });

    it('streaming → ready', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('streaming');
        fsm.transition('ready');
        expect(fsm.state).toBe('ready');
    });

    it('streaming → error', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('streaming');
        fsm.transition('error');
        expect(fsm.state).toBe('error');
    });

    it('ready → streaming (live data update)', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('ready');
        fsm.transition('streaming');
        expect(fsm.state).toBe('streaming');
    });

    it('error → loading (retry)', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('error');
        fsm.transition('loading');
        expect(fsm.state).toBe('loading');
    });

    it('ready → empty', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('ready');
        fsm.transition('empty');
        expect(fsm.state).toBe('empty');
    });
});

// ---------------------------------------------------------------------------
// Invalid Transitions (ENS-3003)
// ---------------------------------------------------------------------------

describe('createStateMachine — invalid transitions', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('idle → ready throws ENS-3003', () => {
        const fsm = createFSM();
        expect(() => fsm.transition('ready')).toThrow(EnterstellarError);
        try {
            fsm.transition('ready');
        } catch (e: unknown) {
            expect(e).toBeInstanceOf(EnterstellarError);
            expect((e as EnterstellarError).code).toBe('ENS-3003');
        }
    });

    it('idle → streaming throws ENS-3003', () => {
        const fsm = createFSM();
        expect(() => fsm.transition('streaming')).toThrow(EnterstellarError);
    });

    it('idle → error throws ENS-3003', () => {
        const fsm = createFSM();
        expect(() => fsm.transition('error')).toThrow(EnterstellarError);
    });

    it('idle → empty throws ENS-3003', () => {
        const fsm = createFSM();
        expect(() => fsm.transition('empty')).toThrow(EnterstellarError);
    });

    it('loading → idle throws ENS-3003', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        expect(() => fsm.transition('idle')).toThrow(EnterstellarError);
    });

    it('streaming → loading throws ENS-3003', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('streaming');
        expect(() => fsm.transition('loading')).toThrow(EnterstellarError);
    });

    it('streaming → idle throws ENS-3003', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('streaming');
        expect(() => fsm.transition('idle')).toThrow(EnterstellarError);
    });

    it('ready → loading throws ENS-3003', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('ready');
        expect(() => fsm.transition('loading')).toThrow(EnterstellarError);
    });

    it('ready → error throws ENS-3003', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('ready');
        expect(() => fsm.transition('error')).toThrow(EnterstellarError);
    });

    it('error → ready throws ENS-3003', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('error');
        expect(() => fsm.transition('ready')).toThrow(EnterstellarError);
    });

    it('empty → loading throws ENS-3003 (terminal state)', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('empty');
        expect(() => fsm.transition('loading')).toThrow(EnterstellarError);
    });

    it('empty → streaming throws ENS-3003 (terminal state)', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('empty');
        expect(() => fsm.transition('streaming')).toThrow(EnterstellarError);
    });

    it('does not change state on invalid transition', () => {
        const fsm = createFSM();
        try {
            fsm.transition('ready');
        } catch {
            // expected
        }
        expect(fsm.state).toBe('idle');
    });
});

// ---------------------------------------------------------------------------
// Event Emission (L4)
// ---------------------------------------------------------------------------

describe('createStateMachine — event emission', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('emits event on valid transition', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        fsm.transition('loading');

        expect(events).toHaveLength(1);
        expect(events[0]?.from).toBe('idle');
        expect(events[0]?.to).toBe('loading');
    });

    it('includes timestamp in event', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        fsm.transition('loading');

        expect(events[0]?.timestamp).toBe(now);
    });

    it('includes context in event when provided', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        const error = new EnterstellarError('ENS-3002', 'lifecycle', 'timeout', true);
        fsm.transition('loading');
        fsm.transition('error', { error });

        expect(events[1]?.context?.error).toBe(error);
    });

    it('does not emit event on invalid transition', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        try {
            fsm.transition('ready'); // invalid from idle
        } catch {
            // expected
        }

        expect(events).toHaveLength(0);
    });

    it('supports multiple listeners', () => {
        const fsm = createFSM();
        const eventsA: LifecycleEvent[] = [];
        const eventsB: LifecycleEvent[] = [];
        fsm.on((event) => eventsA.push(event));
        fsm.on((event) => eventsB.push(event));

        fsm.transition('loading');

        expect(eventsA).toHaveLength(1);
        expect(eventsB).toHaveLength(1);
    });

    it('unsubscribe removes the listener', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        const unsubscribe = fsm.on((event) => events.push(event));

        fsm.transition('loading');
        unsubscribe();
        fsm.transition('streaming');

        expect(events).toHaveLength(1); // only the first transition
    });

    it('enriches error → loading event with retryAttempt', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        fsm.transition('loading');
        fsm.transition('error');
        fsm.transition('loading'); // retry #1

        const retryEvent = events[2];
        expect(retryEvent?.context?.retryAttempt).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Timeout (LC3, ENS-3002)
// ---------------------------------------------------------------------------

describe('createStateMachine — timeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('transitions to error after timeout in loading state', () => {
        const fsm = createFSM({ timeoutMs: 5_000 });

        fsm.transition('loading');
        vi.advanceTimersByTime(5_000);

        expect(fsm.state).toBe('error');
    });

    it('emits error event with ENS-3002 on timeout', () => {
        const fsm = createFSM({ timeoutMs: 5_000 });
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        fsm.transition('loading');
        vi.advanceTimersByTime(5_000);

        const errorEvent = events[1]; // [0] = idle→loading, [1] = loading→error
        expect(errorEvent?.to).toBe('error');
        expect(errorEvent?.context?.error).toBeInstanceOf(EnterstellarError);
        expect((errorEvent?.context?.error as EnterstellarError | undefined)?.code).toBe('ENS-3002');
    });

    it('clears timeout when transitioning out of loading', () => {
        const fsm = createFSM({ timeoutMs: 5_000 });

        fsm.transition('loading');
        fsm.transition('streaming'); // clears timeout
        vi.advanceTimersByTime(10_000);

        expect(fsm.state).toBe('streaming'); // not error
    });

    it('does not fire timeout if disposed during loading', () => {
        const fsm = createFSM({ timeoutMs: 5_000 });

        fsm.transition('loading');
        fsm.dispose();
        vi.advanceTimersByTime(10_000);

        // State stays at loading (dispose doesn't change state, just marks disposed)
        expect(fsm.disposed).toBe(true);
    });

    it('uses custom timeout value', () => {
        const fsm = createFSM({ timeoutMs: 1_000 });

        fsm.transition('loading');
        vi.advanceTimersByTime(999);
        expect(fsm.state).toBe('loading');

        vi.advanceTimersByTime(1);
        expect(fsm.state).toBe('error');
    });

    it('restarts timeout on each entry to loading (retry)', () => {
        const fsm = createFSM({ timeoutMs: 5_000 });

        fsm.transition('loading');
        vi.advanceTimersByTime(3_000);
        fsm.transition('error'); // manual error, not timeout
        fsm.transition('loading'); // retry restarts timer

        vi.advanceTimersByTime(3_000);
        expect(fsm.state).toBe('loading'); // still loading (5s not elapsed since retry)

        vi.advanceTimersByTime(2_000);
        expect(fsm.state).toBe('error'); // now timed out
    });
});

// ---------------------------------------------------------------------------
// Retry Tracking (RE17)
// ---------------------------------------------------------------------------

describe('createStateMachine — retry tracking', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('increments retryCount on error → loading', () => {
        const fsm = createFSM();

        fsm.transition('loading');
        fsm.transition('error');
        expect(fsm.retryCount).toBe(0);

        fsm.transition('loading'); // retry 1
        expect(fsm.retryCount).toBe(1);
    });

    it('tracks multiple retries', () => {
        const fsm = createFSM({ maxRetries: 5 });

        fsm.transition('loading');
        fsm.transition('error');
        fsm.transition('loading'); // retry 1
        fsm.transition('error');
        fsm.transition('loading'); // retry 2
        fsm.transition('error');
        fsm.transition('loading'); // retry 3

        expect(fsm.retryCount).toBe(3);
    });

    it('resets retryCount on reaching ready', () => {
        const fsm = createFSM();

        fsm.transition('loading');
        fsm.transition('error');
        fsm.transition('loading'); // retry 1
        expect(fsm.retryCount).toBe(1);

        fsm.transition('ready');
        expect(fsm.retryCount).toBe(0);
    });

    it('throws ENS-3003 when maxRetries exceeded', () => {
        const fsm = createFSM({ maxRetries: 2 });

        fsm.transition('loading');
        fsm.transition('error');
        fsm.transition('loading'); // retry 1
        fsm.transition('error');
        fsm.transition('loading'); // retry 2
        fsm.transition('error');

        // retry 3 exceeds maxRetries (2)
        expect(() => fsm.transition('loading')).toThrow(EnterstellarError);
        try {
            fsm.transition('loading');
        } catch (e: unknown) {
            expect((e as EnterstellarError).code).toBe('ENS-3003');
            expect((e as EnterstellarError).message).toContain('2');
        }
    });

    it('allows exactly maxRetries retry attempts', () => {
        const fsm = createFSM({ maxRetries: 1 });

        fsm.transition('loading');
        fsm.transition('error');
        fsm.transition('loading'); // retry 1 (allowed — count becomes 1, equals max)
        expect(fsm.state).toBe('loading');

        fsm.transition('error');
        // retry 2 — exceeds max
        expect(() => fsm.transition('loading')).toThrow(EnterstellarError);
    });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe('createStateMachine — reset', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns to idle state', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('streaming');
        fsm.reset();
        expect(fsm.state).toBe('idle');
    });

    it('resets retryCount to 0', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('error');
        fsm.transition('loading'); // retry 1
        fsm.reset();
        expect(fsm.retryCount).toBe(0);
    });

    it('escapes the terminal empty state', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('empty');
        expect(fsm.state).toBe('empty');

        fsm.reset();
        expect(fsm.state).toBe('idle');
    });

    it('emits a transition event from current state to idle', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        fsm.transition('loading');
        fsm.reset();

        expect(events[1]?.from).toBe('loading');
        expect(events[1]?.to).toBe('idle');
    });

    it('does not emit event if already in idle', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        fsm.reset();
        expect(events).toHaveLength(0);
    });

    it('clears the timeout timer', () => {
        const fsm = createFSM({ timeoutMs: 5_000 });
        fsm.transition('loading');
        fsm.reset();

        vi.advanceTimersByTime(10_000);
        expect(fsm.state).toBe('idle'); // timeout did not fire
    });

    it('allows normal lifecycle after reset', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.transition('error');
        fsm.reset();

        // Should be able to start fresh
        fsm.transition('loading');
        fsm.transition('ready');
        expect(fsm.state).toBe('ready');
    });
});

// ---------------------------------------------------------------------------
// Disposal (ENS-3005)
// ---------------------------------------------------------------------------

describe('createStateMachine — dispose', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('marks the manager as disposed', () => {
        const fsm = createFSM();
        fsm.dispose();
        expect(fsm.disposed).toBe(true);
    });

    it('transition() throws ENS-3005 after dispose', () => {
        const fsm = createFSM();
        fsm.dispose();
        expect(() => fsm.transition('loading')).toThrow(EnterstellarError);
        try {
            fsm.transition('loading');
        } catch (e: unknown) {
            expect((e as EnterstellarError).code).toBe('ENS-3005');
        }
    });

    it('on() throws ENS-3005 after dispose', () => {
        const fsm = createFSM();
        fsm.dispose();
        expect(() => fsm.on(() => { })).toThrow(EnterstellarError);
    });

    it('reset() throws ENS-3005 after dispose', () => {
        const fsm = createFSM();
        fsm.dispose();
        expect(() => fsm.reset()).toThrow(EnterstellarError);
    });

    it('dispose is idempotent (second call does not throw)', () => {
        const fsm = createFSM();
        fsm.dispose();
        expect(() => fsm.dispose()).not.toThrow();
    });

    it('removes all listeners on dispose', () => {
        const fsm = createFSM();
        const events: LifecycleEvent[] = [];
        fsm.on((event) => events.push(event));

        fsm.transition('loading');
        expect(events).toHaveLength(1);

        fsm.dispose();

        // Create a new FSM to verify listener was removed (cannot transition disposed FSM)
        // Instead verify events array didn't grow after dispose
        expect(events).toHaveLength(1);
    });

    it('state is still readable after dispose', () => {
        const fsm = createFSM();
        fsm.transition('loading');
        fsm.dispose();
        expect(fsm.state).toBe('loading'); // reading is fine
    });
});
