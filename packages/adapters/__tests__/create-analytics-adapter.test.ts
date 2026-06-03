/**
 * @module @enterstellar-ai/adapters/__tests__/create-analytics-adapter
 * @description Unit tests for `createAnalyticsAdapter()` and `createNoopAnalyticsAdapter()`.
 *
 * Tests:
 * - Valid config → working adapter with all methods
 * - AD5 error wrapping: `track` → ENS-7002, `identify` → ENS-7002
 * - Sync fire-and-forget semantics (void return)
 * - Invalid config → ENS-7001 delegation to validateAdapterConfig
 * - Returned adapter is frozen (Object.freeze — R4 pattern)
 * - Noop adapter: track → void, identify → void
 *
 * @see src/create-analytics-adapter.ts
 * @see Design Choice AD5 — wrap into EnterstellarError
 */

import { describe, it, expect, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createAnalyticsAdapter, createNoopAnalyticsAdapter } from '../src/create-analytics-adapter.js';
import type { AnalyticsAdapterConfig } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid AnalyticsAdapterConfig with spy functions. */
function createValidConfig(
    overrides?: Partial<AnalyticsAdapterConfig>,
): AnalyticsAdapterConfig {
    return {
        name: 'test-analytics',
        track: vi.fn(),
        identify: vi.fn(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Valid Creation
// ---------------------------------------------------------------------------

describe('createAnalyticsAdapter — valid creation', () => {
    it('creates an adapter from valid config', () => {
        const adapter = createAnalyticsAdapter(createValidConfig());

        expect(adapter).toBeDefined();
        expect(typeof adapter.track).toBe('function');
        expect(typeof adapter.identify).toBe('function');
    });

    it('returns a frozen object (R4 pattern)', () => {
        const adapter = createAnalyticsAdapter(createValidConfig());

        expect(Object.isFrozen(adapter)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — track
// ---------------------------------------------------------------------------

describe('createAnalyticsAdapter — method delegation (track)', () => {
    it('track() delegates to config with event and properties', () => {
        const config = createValidConfig();
        const adapter = createAnalyticsAdapter(config);
        const properties = { zone: 'main', component: 'PatientVitals' };

        adapter.track('zone_rendered', properties);

        expect(config.track).toHaveBeenCalledWith('zone_rendered', properties);
    });

    it('track() delegates without properties when not provided', () => {
        const config = createValidConfig();
        const adapter = createAnalyticsAdapter(config);

        adapter.track('intent_resolved');

        expect(config.track).toHaveBeenCalledWith('intent_resolved', undefined);
    });

    it('track() returns void (fire-and-forget)', () => {
        const adapter = createAnalyticsAdapter(createValidConfig());

        const result = adapter.track('test_event');

        expect(result).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Method Delegation — identify
// ---------------------------------------------------------------------------

describe('createAnalyticsAdapter — method delegation (identify)', () => {
    it('identify() delegates to config with userId and traits', () => {
        const config = createValidConfig();
        const adapter = createAnalyticsAdapter(config);
        const traits = { role: 'clinician', plan: 'pro' };

        adapter.identify('user-123', traits);

        expect(config.identify).toHaveBeenCalledWith('user-123', traits);
    });

    it('identify() delegates without traits when not provided', () => {
        const config = createValidConfig();
        const adapter = createAnalyticsAdapter(config);

        adapter.identify('user-456');

        expect(config.identify).toHaveBeenCalledWith('user-456', undefined);
    });

    it('identify() returns void (fire-and-forget)', () => {
        const adapter = createAnalyticsAdapter(createValidConfig());

        const result = adapter.identify('user-789');

        expect(result).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — track (ENS-7002)
// ---------------------------------------------------------------------------

describe('createAnalyticsAdapter — AD5 error wrapping (track → ENS-7002)', () => {
    it('wraps track() errors in ENS-7002', () => {
        const originalError = new Error('Mixpanel SDK unavailable');
        const config = createValidConfig({
            track: vi.fn().mockImplementation(() => {
                throw originalError;
            }),
        });
        const adapter = createAnalyticsAdapter(config);

        try {
            adapter.track('test_event');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7002');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name and method in ENS-7002 message', () => {
        const config = createValidConfig({
            name: 'mixpanel-analytics',
            track: vi.fn().mockImplementation(() => {
                throw new Error('fail');
            }),
        });
        const adapter = createAnalyticsAdapter(config);

        try {
            adapter.track('zone_rendered');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('mixpanel-analytics');
            expect(error.message).toContain('track');
        }
    });
});

// ---------------------------------------------------------------------------
// AD5 Error Wrapping — identify (ENS-7002)
// ---------------------------------------------------------------------------

describe('createAnalyticsAdapter — AD5 error wrapping (identify → ENS-7002)', () => {
    it('wraps identify() errors in ENS-7002', () => {
        const originalError = new TypeError('invalid user ID');
        const config = createValidConfig({
            identify: vi.fn().mockImplementation(() => {
                throw originalError;
            }),
        });
        const adapter = createAnalyticsAdapter(config);

        try {
            adapter.identify('user-bad');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error).toBeInstanceOf(EnterstellarError);
            expect(error.code).toBe('ENS-7002');
            expect(error.module).toBe('adapters');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes adapter name and method in ENS-7002 message', () => {
        const config = createValidConfig({
            name: 'amplitude-analytics',
            identify: vi.fn().mockImplementation(() => {
                throw new Error('fail');
            }),
        });
        const adapter = createAnalyticsAdapter(config);

        try {
            adapter.identify('user-bad');
            expect.unreachable('should have thrown');
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('amplitude-analytics');
            expect(error.message).toContain('identify');
        }
    });
});

// ---------------------------------------------------------------------------
// Config Validation Delegation (ENS-7001)
// ---------------------------------------------------------------------------

describe('createAnalyticsAdapter — config validation (ENS-7001)', () => {
    it('throws ENS-7001 when name is empty', () => {
        expect(() => {
            createAnalyticsAdapter(createValidConfig({ name: '' }));
        }).toThrow(EnterstellarError);

        try {
            createAnalyticsAdapter(createValidConfig({ name: '' }));
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
        }
    });

    it('throws ENS-7001 when a required method is missing', () => {
        const config = {
            name: 'test-analytics',
            track: vi.fn(),
            // identify intentionally omitted
        } as unknown as AnalyticsAdapterConfig;

        expect(() => createAnalyticsAdapter(config)).toThrow(EnterstellarError);
        try {
            createAnalyticsAdapter(config);
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-7001');
            expect(error.message).toContain('identify');
        }
    });
});

// ---------------------------------------------------------------------------
// Noop Factory
// ---------------------------------------------------------------------------

describe('createNoopAnalyticsAdapter', () => {
    it('creates a frozen adapter', () => {
        const adapter = createNoopAnalyticsAdapter();

        expect(Object.isFrozen(adapter)).toBe(true);
    });

    it('track() executes without error (silent no-op)', () => {
        const adapter = createNoopAnalyticsAdapter();

        expect(() => {
            adapter.track('zone_rendered', { zone: 'main' });
        }).not.toThrow();
    });

    it('identify() executes without error (silent no-op)', () => {
        const adapter = createNoopAnalyticsAdapter();

        expect(() => {
            adapter.identify('user-123', { role: 'clinician' });
        }).not.toThrow();
    });

    it('track() returns undefined (void)', () => {
        const adapter = createNoopAnalyticsAdapter();

        const result = adapter.track('test');

        expect(result).toBeUndefined();
    });

    it('identify() returns undefined (void)', () => {
        const adapter = createNoopAnalyticsAdapter();

        const result = adapter.identify('user-1');

        expect(result).toBeUndefined();
    });
});
