/**
 * @module @enterstellar-ai/connection/__tests__/event-emitter.test
 * @description Unit tests for `createEventEmitter()`.
 *
 * Tests the typed pub/sub system: on/emit, unsubscribe, multiple listeners,
 * error isolation, removeAll, and listenerCount.
 *
 * @see Design Choice P7 — Event whitelist
 * @see Design Choice R1 — Plain objects with closures
 */

import { describe, it, expect, vi } from 'vitest';

import { createEventEmitter } from '../src/event-emitter.js';

// ---------------------------------------------------------------------------
// Test Event Map
// ---------------------------------------------------------------------------

type TestEvents = {
    ping: string;
    count: number;
    data: { readonly id: string; readonly value: number };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createEventEmitter', () => {
    it('should return an emitter with on, emit, removeAll, and listenerCount', () => {
        const emitter = createEventEmitter<TestEvents>();

        expect(typeof emitter.on).toBe('function');
        expect(typeof emitter.emit).toBe('function');
        expect(typeof emitter.removeAll).toBe('function');
        expect(typeof emitter.listenerCount).toBe('function');
    });

    describe('on() and emit()', () => {
        it('should invoke a handler when the matching event is emitted', () => {
            const emitter = createEventEmitter<TestEvents>();
            const handler = vi.fn();

            emitter.on('ping', handler);
            emitter.emit('ping', 'hello');

            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith('hello');
        });

        it('should invoke multiple handlers for the same event', () => {
            const emitter = createEventEmitter<TestEvents>();
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            emitter.on('count', handler1);
            emitter.on('count', handler2);
            emitter.emit('count', 42);

            expect(handler1).toHaveBeenCalledWith(42);
            expect(handler2).toHaveBeenCalledWith(42);
        });

        it('should not invoke handlers for different events', () => {
            const emitter = createEventEmitter<TestEvents>();
            const pingHandler = vi.fn();
            const countHandler = vi.fn();

            emitter.on('ping', pingHandler);
            emitter.on('count', countHandler);
            emitter.emit('ping', 'test');

            expect(pingHandler).toHaveBeenCalledOnce();
            expect(countHandler).not.toHaveBeenCalled();
        });

        it('should pass complex data to handlers', () => {
            const emitter = createEventEmitter<TestEvents>();
            const handler = vi.fn();

            emitter.on('data', handler);
            emitter.emit('data', { id: 'abc', value: 99 });

            expect(handler).toHaveBeenCalledWith({ id: 'abc', value: 99 });
        });

        it('should not throw when emitting an event with no listeners', () => {
            const emitter = createEventEmitter<TestEvents>();

            expect(() => emitter.emit('ping', 'no-listeners')).not.toThrow();
        });
    });

    describe('unsubscribe', () => {
        it('should return an unsubscribe function from on()', () => {
            const emitter = createEventEmitter<TestEvents>();
            const unsub = emitter.on('ping', vi.fn());

            expect(typeof unsub).toBe('function');
        });

        it('should stop invoking the handler after unsubscribe', () => {
            const emitter = createEventEmitter<TestEvents>();
            const handler = vi.fn();
            const unsub = emitter.on('ping', handler);

            emitter.emit('ping', 'first');
            expect(handler).toHaveBeenCalledOnce();

            unsub();
            emitter.emit('ping', 'second');
            expect(handler).toHaveBeenCalledOnce(); // still 1 — not called again
        });

        it('should only remove the specific handler, not others', () => {
            const emitter = createEventEmitter<TestEvents>();
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            const unsub1 = emitter.on('ping', handler1);
            emitter.on('ping', handler2);

            unsub1();
            emitter.emit('ping', 'test');

            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalledOnce();
        });

        it('should be safe to call unsubscribe multiple times', () => {
            const emitter = createEventEmitter<TestEvents>();
            const handler = vi.fn();
            const unsub = emitter.on('ping', handler);

            unsub();
            unsub(); // second call should not throw
            unsub(); // third call should not throw

            emitter.emit('ping', 'test');
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('error isolation', () => {
        it('should continue invoking other handlers when one throws', () => {
            const emitter = createEventEmitter<TestEvents>();
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            const throwingHandler = vi.fn().mockImplementation(() => {
                throw new Error('handler exploded');
            });
            const safeHandler = vi.fn();

            emitter.on('ping', throwingHandler);
            emitter.on('ping', safeHandler);
            emitter.emit('ping', 'test');

            expect(throwingHandler).toHaveBeenCalledOnce();
            expect(safeHandler).toHaveBeenCalledOnce();
            expect(consoleSpy).toHaveBeenCalledOnce();

            consoleSpy.mockRestore();
        });

        it('should log the error with the event name', () => {
            const emitter = createEventEmitter<TestEvents>();
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            emitter.on('ping', () => {
                throw new Error('boom');
            });
            emitter.emit('ping', 'test');

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("'ping'"),
                expect.any(Error),
            );

            consoleSpy.mockRestore();
        });
    });

    describe('removeAll()', () => {
        it('should remove all listeners from all events', () => {
            const emitter = createEventEmitter<TestEvents>();
            const pingHandler = vi.fn();
            const countHandler = vi.fn();

            emitter.on('ping', pingHandler);
            emitter.on('count', countHandler);
            emitter.removeAll();

            emitter.emit('ping', 'test');
            emitter.emit('count', 42);

            expect(pingHandler).not.toHaveBeenCalled();
            expect(countHandler).not.toHaveBeenCalled();
        });

        it('should reset all listener counts to 0', () => {
            const emitter = createEventEmitter<TestEvents>();

            emitter.on('ping', vi.fn());
            emitter.on('ping', vi.fn());
            emitter.on('count', vi.fn());

            expect(emitter.listenerCount('ping')).toBe(2);
            expect(emitter.listenerCount('count')).toBe(1);

            emitter.removeAll();

            expect(emitter.listenerCount('ping')).toBe(0);
            expect(emitter.listenerCount('count')).toBe(0);
        });

        it('should be safe to call when no listeners exist', () => {
            const emitter = createEventEmitter<TestEvents>();

            expect(() => emitter.removeAll()).not.toThrow();
        });
    });

    describe('listenerCount()', () => {
        it('should return 0 for events with no listeners', () => {
            const emitter = createEventEmitter<TestEvents>();

            expect(emitter.listenerCount('ping')).toBe(0);
        });

        it('should track the correct count for each event', () => {
            const emitter = createEventEmitter<TestEvents>();

            emitter.on('ping', vi.fn());
            emitter.on('ping', vi.fn());
            emitter.on('count', vi.fn());

            expect(emitter.listenerCount('ping')).toBe(2);
            expect(emitter.listenerCount('count')).toBe(1);
            expect(emitter.listenerCount('data')).toBe(0);
        });

        it('should decrement when a handler is unsubscribed', () => {
            const emitter = createEventEmitter<TestEvents>();

            const unsub = emitter.on('ping', vi.fn());
            expect(emitter.listenerCount('ping')).toBe(1);

            unsub();
            expect(emitter.listenerCount('ping')).toBe(0);
        });
    });
});
