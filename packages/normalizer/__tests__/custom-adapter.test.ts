/**
 * @module @enterstellar-ai/normalizer/__tests__/custom-adapter
 * @description Unit tests for `createCustomAdapter()`.
 *
 * Verifies:
 * - User-provided normalize function is wrapped correctly
 * - `null` return propagation (no UI intent)
 * - `_source` metadata injection with `protocol: 'custom'`
 * - `canHandle()` delegation vs catch-all default
 * - Immutability (user's returned intent not mutated)
 *
 * @see Design Choice N2 — custom normalizer function signature
 * @see Design Choice N3 — explicit factory
 */

import { describe, it, expect, vi } from 'vitest';
import type { ComponentIntent } from '@enterstellar-ai/types';

import { createCustomAdapter } from '../src/adapters/custom-adapter.js';
import { CUSTOM_PROTOCOL } from '../src/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid ComponentIntent for testing. */
function createTestIntent(overrides?: Partial<ComponentIntent>): ComponentIntent {
    return {
        component: 'TestComponent',
        props: { foo: 'bar' },
        confidence: 0.9,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Protocol Identity
// ---------------------------------------------------------------------------

describe('createCustomAdapter — protocol', () => {
    it('has protocol set to "custom"', () => {
        const adapter = createCustomAdapter({
            normalize: () => null,
        });
        expect(adapter.protocol).toBe(CUSTOM_PROTOCOL);
    });
});

// ---------------------------------------------------------------------------
// canHandle()
// ---------------------------------------------------------------------------

describe('createCustomAdapter — canHandle()', () => {
    it('delegates to the provided canHandle function', () => {
        const canHandle = vi.fn().mockReturnValue(true);
        const adapter = createCustomAdapter({
            normalize: () => null,
            canHandle,
        });

        const event = { type: 'my-event' };
        const result = adapter.canHandle(event);

        expect(canHandle).toHaveBeenCalledWith(event);
        expect(result).toBe(true);
    });

    it('returns false when provided canHandle returns false', () => {
        const adapter = createCustomAdapter({
            normalize: () => null,
            canHandle: () => false,
        });

        expect(adapter.canHandle({ type: 'unknown' })).toBe(false);
    });

    it('defaults to catch-all (returns true) when canHandle not provided', () => {
        const adapter = createCustomAdapter({
            normalize: () => null,
        });

        expect(adapter.canHandle(undefined)).toBe(true);
        expect(adapter.canHandle(null)).toBe(true);
        expect(adapter.canHandle('string')).toBe(true);
        expect(adapter.canHandle(42)).toBe(true);
        expect(adapter.canHandle({ anything: true })).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// normalize()
// ---------------------------------------------------------------------------

describe('createCustomAdapter — normalize()', () => {
    it('calls the user-provided normalize function with the event', () => {
        const normalize = vi.fn().mockReturnValue(createTestIntent());
        const adapter = createCustomAdapter({ normalize });

        const event = { type: 'my-event', data: { id: '123' } };
        adapter.normalize(event);

        expect(normalize).toHaveBeenCalledWith(event);
    });

    it('returns null when user function returns null', () => {
        const adapter = createCustomAdapter({
            normalize: () => null,
        });

        const result = adapter.normalize({ some: 'event' });
        expect(result).toBeNull();
    });

    it('returns a ComponentIntent with _source injected', () => {
        const adapter = createCustomAdapter({
            normalize: () => createTestIntent(),
        });

        const result = adapter.normalize({ some: 'event' });
        expect(result).not.toBeNull();
        expect(result!._source).toBeDefined();
        expect(result!._source!.protocol).toBe('custom');
    });

    it('preserves user-provided _source fields but overrides protocol', () => {
        const adapter = createCustomAdapter({
            normalize: () => createTestIntent({
                _source: {
                    protocol: 'websocket', // should be overridden
                    rawEventId: 'user-event-123',
                    correlationId: 'user-corr-456',
                },
            }),
        });

        const result = adapter.normalize({});
        expect(result).not.toBeNull();
        expect(result!._source!.protocol).toBe('custom'); // overridden
        expect(result!._source!.rawEventId).toBe('user-event-123'); // preserved
        expect(result!._source!.correlationId).toBe('user-corr-456'); // preserved
    });

    it('preserves all other intent fields from user function', () => {
        const adapter = createCustomAdapter({
            normalize: () => createTestIntent({
                component: 'Dashboard',
                props: { userId: '123' },
                confidence: 0.95,
                layout: 'grid',
                mode: 'summary',
                interaction: 'read-only',
            }),
        });

        const result = adapter.normalize({});
        expect(result).not.toBeNull();
        expect(result!.component).toBe('Dashboard');
        expect(result!.props).toEqual({ userId: '123' });
        expect(result!.confidence).toBe(0.95);
        expect(result!.layout).toBe('grid');
        expect(result!.mode).toBe('summary');
        expect(result!.interaction).toBe('read-only');
    });

    it('does not mutate the original intent object from user function', () => {
        const originalIntent = createTestIntent();
        const adapter = createCustomAdapter({
            normalize: () => originalIntent,
        });

        adapter.normalize({});

        // Original should NOT have _source.protocol = 'custom' added
        // because the adapter creates a new object via spread
        expect(originalIntent._source).toBeUndefined();
    });
});
