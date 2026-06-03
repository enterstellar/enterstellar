/**
 * @module @enterstellar-ai/adapters/create-analytics-adapter
 * @description Factory functions for creating validated `AnalyticsAdapter` instances.
 *
 * - `createAnalyticsAdapter(config)` — wraps a consumer-provided implementation,
 *   validates config via {@link validateAdapterConfig}, and wraps every method
 *   in error handling per Design Choice AD5 (raw vendor errors never leak).
 *
 * - `createNoopAnalyticsAdapter()` — returns a no-op adapter for testing and
 *   development when no real analytics service is connected.
 *
 * Both factories return a plain object with closures (R1 pattern — no classes).
 *
 * @see Bible §4.15
 * @see Design Choice AD1 — minimal but complete: track, identify
 * @see Design Choice AD5 — wrap into EnterstellarError
 */

import type { AnalyticsAdapter } from '@enterstellar-ai/types';

import { adapterMethodError } from './errors.js';
import type { AnalyticsAdapterConfig } from './types.js';
import { validateAdapterConfig } from './validate-adapter.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a validated `AnalyticsAdapter` from consumer-provided config.
 *
 * The factory:
 * 1. Validates the config (name + required methods) — throws `ENS-7001` on failure.
 * 2. Wraps `track()` in sync error handling → `ENS-7002` on throw.
 * 3. Wraps `identify()` in sync error handling → `ENS-7002` on throw.
 *
 * Both `track()` and `identify()` are fire-and-forget (void return).
 * Consumers never see raw vendor errors — all failures are `EnterstellarError` (AD5).
 *
 * @param config - The adapter implementation with a `name` and all required methods.
 * @returns A frozen `AnalyticsAdapter` instance.
 * @throws `EnterstellarError` with code `ENS-7001` if config validation fails.
 *
 * @example
 * ```ts
 * import { createAnalyticsAdapter } from '@enterstellar-ai/adapters';
 *
 * const analytics = createAnalyticsAdapter({
 *   name: 'mixpanel-analytics',
 *   track: (event, properties) => {
 *     mixpanel.track(event, properties);
 *   },
 *   identify: (userId, traits) => {
 *     mixpanel.identify(userId);
 *     if (traits) mixpanel.people.set(traits);
 *   },
 * });
 * ```
 */
export function createAnalyticsAdapter(config: AnalyticsAdapterConfig): AnalyticsAdapter {
    // -----------------------------------------------------------------------
    // Step 1: Validate config — throws ENS-7001 on failure
    // -----------------------------------------------------------------------
    validateAdapterConfig('analytics', config);

    const adapterName = config.name;

    // -----------------------------------------------------------------------
    // Step 2: Build wrapped adapter (plain object with closures — R1 pattern)
    // -----------------------------------------------------------------------
    const adapter: AnalyticsAdapter = {
        /**
         * Wrapped `track()` — catches vendor errors → `ENS-7002`.
         * Fire-and-forget: consumers do not await this method.
         */
        track(
            event: string,
            properties?: Readonly<Record<string, unknown>>,
        ): void {
            try {
                config.track(event, properties);
            } catch (error: unknown) {
                throw adapterMethodError(adapterName, 'track', error);
            }
        },

        /**
         * Wrapped `identify()` — catches vendor errors → `ENS-7002`.
         * Fire-and-forget: consumers do not await this method.
         */
        identify(
            userId: string,
            traits?: Readonly<Record<string, unknown>>,
        ): void {
            try {
                config.identify(userId, traits);
            } catch (error: unknown) {
                throw adapterMethodError(adapterName, 'identify', error);
            }
        },
    };

    // -----------------------------------------------------------------------
    // Step 3: Freeze and return — prevents accidental mutation (R4 pattern)
    // -----------------------------------------------------------------------
    return Object.freeze(adapter);
}

// ---------------------------------------------------------------------------
// No-Op Factory
// ---------------------------------------------------------------------------

/**
 * Creates a no-op `AnalyticsAdapter` for testing and development.
 *
 * All methods are silent no-ops:
 * - `track()` → void (events silently consumed)
 * - `identify()` → void (identity silently consumed)
 *
 * @returns A frozen, no-op `AnalyticsAdapter` instance.
 *
 * @example
 * ```ts
 * import { createNoopAnalyticsAdapter } from '@enterstellar-ai/adapters';
 *
 * const analytics = createNoopAnalyticsAdapter();
 * analytics.track('zone_rendered', { zone: 'main' }); // no-op
 * analytics.identify('user-123', { role: 'clinician' }); // no-op
 * ```
 */
export function createNoopAnalyticsAdapter(): AnalyticsAdapter {
    const adapter: AnalyticsAdapter = {
        track(
            _event: string,
            _properties?: Readonly<Record<string, unknown>>,
        ): void {
            // No-op — events silently consumed in noop mode.
        },

        identify(
            _userId: string,
            _traits?: Readonly<Record<string, unknown>>,
        ): void {
            // No-op — identity silently consumed in noop mode.
        },
    };

    return Object.freeze(adapter);
}
