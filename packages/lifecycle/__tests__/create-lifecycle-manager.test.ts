/**
 * @module @enterstellar-ai/lifecycle/__tests__/create-lifecycle-manager
 * @description Unit tests for the `createLifecycleManager` factory function.
 *
 * Verifies config resolution (defaults, partial overrides), API shape,
 * and integration between the factory and the underlying state machine.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createLifecycleManager } from '../src/create-lifecycle-manager.js';
import { DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES } from '../src/constants.js';
import type { LifecycleManager, LifecycleEvent } from '../src/types.js';

// ---------------------------------------------------------------------------
// Config Resolution
// ---------------------------------------------------------------------------

describe('createLifecycleManager — config resolution', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('creates a manager with no config (all defaults)', () => {
        const manager = createLifecycleManager();
        expect(manager).toBeDefined();
        expect(manager.state).toBe('idle');
    });

    it('creates a manager with partial config (timeoutMs only)', () => {
        const manager = createLifecycleManager({ timeoutMs: 10_000 });
        expect(manager).toBeDefined();
        expect(manager.state).toBe('idle');

        // Verify custom timeout is applied
        manager.transition('loading');
        vi.advanceTimersByTime(9_999);
        expect(manager.state).toBe('loading');

        vi.advanceTimersByTime(1);
        expect(manager.state).toBe('error');
    });

    it('creates a manager with partial config (maxRetries only)', () => {
        const manager = createLifecycleManager({ maxRetries: 1 });
        expect(manager).toBeDefined();

        // Verify custom maxRetries is applied
        manager.transition('loading');
        manager.transition('error');
        manager.transition('loading'); // retry 1

        manager.transition('error');
        expect(() => manager.transition('loading')).toThrow(EnterstellarError); // retry 2 exceeds max
    });

    it('creates a manager with full custom config', () => {
        const manager = createLifecycleManager({
            timeoutMs: 5_000,
            maxRetries: 0,
        });
        expect(manager).toBeDefined();
    });

    it('applies default timeoutMs when not specified', () => {
        const manager = createLifecycleManager();
        manager.transition('loading');

        // Advance to just before default timeout
        vi.advanceTimersByTime(DEFAULT_TIMEOUT_MS - 1);
        expect(manager.state).toBe('loading');

        // Advance past timeout
        vi.advanceTimersByTime(1);
        expect(manager.state).toBe('error');
    });

    it('applies default maxRetries when not specified', () => {
        const manager = createLifecycleManager();

        // Initial loading from idle (not a retry)
        manager.transition('loading');
        manager.transition('error');

        // Exhaust all default retries (error → loading counts as a retry)
        for (let i = 0; i < DEFAULT_MAX_RETRIES; i++) {
            manager.transition('loading'); // retry i+1
            manager.transition('error');
        }

        // One more retry should throw (exceeds maxRetries)
        expect(() => manager.transition('loading')).toThrow(EnterstellarError);
    });

    it('allows maxRetries of 0 (no retries permitted)', () => {
        const manager = createLifecycleManager({ maxRetries: 0 });

        manager.transition('loading');
        manager.transition('error');

        // Any retry attempt should throw immediately
        expect(() => manager.transition('loading')).toThrow(EnterstellarError);
    });
});

// ---------------------------------------------------------------------------
// API Shape
// ---------------------------------------------------------------------------

describe('createLifecycleManager — API shape', () => {
    it('returns an object with the LifecycleManager interface', () => {
        const manager: LifecycleManager = createLifecycleManager();

        // Verify all properties and methods exist
        expect(typeof manager.state).toBe('string');
        expect(typeof manager.retryCount).toBe('number');
        expect(typeof manager.disposed).toBe('boolean');
        expect(typeof manager.transition).toBe('function');
        expect(typeof manager.on).toBe('function');
        expect(typeof manager.reset).toBe('function');
        expect(typeof manager.dispose).toBe('function');
    });

    it('state is read-only (getter)', () => {
        const manager = createLifecycleManager();
        expect(manager.state).toBe('idle');

        // Attempting to set state directly should have no effect
        // (TypeScript prevents this at compile time, but verify at runtime)
        const descriptor = Object.getOwnPropertyDescriptor(manager, 'state');
        // state is implemented via getter on the object, so it might be
        // directly on the object or on its prototype
        if (descriptor !== undefined) {
            expect(descriptor.set).toBeUndefined();
        }
    });
});

// ---------------------------------------------------------------------------
// Integration
// ---------------------------------------------------------------------------

describe('createLifecycleManager — integration', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('supports full happy path lifecycle', () => {
        const manager = createLifecycleManager();
        const events: LifecycleEvent[] = [];
        manager.on((event) => events.push(event));

        manager.transition('loading');
        manager.transition('streaming');
        manager.transition('ready');

        expect(manager.state).toBe('ready');
        expect(events).toHaveLength(3);
        expect(events.map((e) => `${e.from}→${e.to}`)).toEqual([
            'idle→loading',
            'loading→streaming',
            'streaming→ready',
        ]);
    });

    it('supports retry flow', () => {
        const manager = createLifecycleManager({ maxRetries: 2 });

        manager.transition('loading');
        manager.transition('error');
        expect(manager.retryCount).toBe(0);

        manager.transition('loading'); // retry 1
        expect(manager.retryCount).toBe(1);

        manager.transition('ready');
        expect(manager.retryCount).toBe(0); // reset on success
    });

    it('supports reset and restart', () => {
        const manager = createLifecycleManager();

        manager.transition('loading');
        manager.transition('empty');
        manager.reset();

        // Fresh lifecycle after reset
        manager.transition('loading');
        manager.transition('ready');
        expect(manager.state).toBe('ready');
    });

    it('supports dispose lifecycle', () => {
        const manager = createLifecycleManager();

        manager.transition('loading');
        manager.dispose();

        expect(manager.disposed).toBe(true);
        expect(() => manager.transition('streaming')).toThrow(EnterstellarError);
    });
});
