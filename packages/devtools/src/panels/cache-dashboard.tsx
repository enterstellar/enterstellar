'use client';

/**
 * @module @enterstellar-ai/devtools/panels/cache-dashboard
 * @description P1 Tab — Live cache performance statistics and management.
 *
 * The Cache Dashboard displays cache hit/miss statistics from a
 * `DevToolsCacheAdapter` instance, with live polling and a "Clear Cache"
 * action button. It uses a protocol-based adapter (not a direct import
 * of `@enterstellar-ai/cache`) to maintain incremental adoptability (L5).
 *
 * Data flow:
 * ```
 * DevToolsCacheAdapter.getStats() → [poll every 2s] → stat cards + progress bar
 *                                                    → "Clear Cache" button
 * ```
 *
 * When `cache` is `null` (not configured), renders an empty state
 * instructing the user to pass a `RenderCache` to `<EnterstellarDevTools />`.
 *
 * Current limitations (deferred):
 * - Cache entry listing requires `RenderCache.list()` (not yet in `@enterstellar-ai/cache`).
 * - Warmup trigger requires `WarmupEntry[]` + `CompileFn` (not available in DevTools).
 *
 * @see Bible §4.4 — Cache Dashboard tab
 * @see Design Choice DT4 — P1 tab
 * @see Design Choice DT7 — data access patterns
 *
 * @internal
 */

import { useState, useEffect, useCallback } from 'react';

import type { DevToolsCacheAdapter } from '../types.js';
import { CACHE_POLL_INTERVAL_MS } from '../constants.js';
import {
    cacheDashboardStyles as styles,
    sharedPanelStyles,
} from '../styles.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `CacheDashboard` panel.
 *
 * @internal
 */
type CacheDashboardProps = {
    /**
     * The cache adapter instance, or `null` if no cache is configured.
     * When `null`, the panel shows an instructional empty state.
     *
     * @see {@link DevToolsCacheAdapter}
     */
    readonly cache: DevToolsCacheAdapter | null;
};

// ---------------------------------------------------------------------------
// Cache Stats Shape (internal mirror of getStats return)
// ---------------------------------------------------------------------------

/**
 * Snapshot of cache statistics as returned by `DevToolsCacheAdapter.getStats()`.
 *
 * @internal
 */
type CacheStatsSnapshot = {
    readonly hits: number;
    readonly misses: number;
    readonly entries: number;
    readonly hitRate: number;
};

// ---------------------------------------------------------------------------
// Stat Card Renderer
// ---------------------------------------------------------------------------

/**
 * Renders a single stat card with label and value.
 *
 * @param label - Stat label (e.g., "Hits", "Misses").
 * @param value - Stat value to display.
 * @param suffix - Optional suffix (e.g., "%").
 * @returns The stat card element.
 *
 * @internal
 */
function StatCard(props: {
    readonly label: string;
    readonly value: string;
}): React.JSX.Element {
    const { label, value } = props;

    return (
        <div style={styles['statCard']}>
            <span style={styles['statLabel']}>{label}</span>
            <span style={styles['statValue']}>{value}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Cache Dashboard panel — P1 Tab.
 *
 * Renders:
 * 1. Stats grid (Hits, Misses, Entries, Hit Rate)
 * 2. Hit rate progress bar
 * 3. "Clear Cache" action button
 * 4. Empty state when no cache is connected
 *
 * Polls `cache.getStats()` every `CACHE_POLL_INTERVAL_MS` (2s)
 * for live-updating statistics.
 *
 * @param props - {@link CacheDashboardProps}
 * @returns The cache dashboard panel element.
 *
 * @see Bible §4.4 — Cache Dashboard specification
 *
 * @internal
 */
export function CacheDashboard(props: CacheDashboardProps): React.JSX.Element {
    const { cache } = props;

    // -----------------------------------------------------------------------
    // State: Cache Stats
    // -----------------------------------------------------------------------

    const [stats, setStats] = useState<CacheStatsSnapshot | null>(null);

    // -----------------------------------------------------------------------
    // Polling Effect
    // -----------------------------------------------------------------------

    useEffect(() => {
        if (cache === null) {
            setStats(null);
            return;
        }

        /**
         * Reads current stats from the cache adapter.
         * Called immediately on mount and then on each interval tick.
         */
        const readStats = (): void => {
            const current = cache.getStats();
            setStats({
                hits: current.hits,
                misses: current.misses,
                entries: current.entries,
                hitRate: current.hitRate,
            });
        };

        // Initial read
        readStats();

        // Poll at configured interval
        const intervalId = setInterval(readStats, CACHE_POLL_INTERVAL_MS);

        // Cleanup on unmount or cache change
        return () => {
            clearInterval(intervalId);
        };
    }, [cache]);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    /**
     * Handles the "Clear Cache" button click.
     * Calls `cache.invalidateAll()` and immediately refreshes stats.
     */
    const handleClearCache = useCallback(() => {
        if (cache === null) {
            return;
        }

        cache.invalidateAll();

        // Immediately refresh stats after clearing
        const refreshed = cache.getStats();
        setStats({
            hits: refreshed.hits,
            misses: refreshed.misses,
            entries: refreshed.entries,
            hitRate: refreshed.hitRate,
        });
    }, [cache]);

    // -----------------------------------------------------------------------
    // Render: Empty State
    // -----------------------------------------------------------------------

    if (cache === null) {
        return (
            <div
                style={sharedPanelStyles['panelRoot']}
                data-enterstellar-devtools-panel="cache-dashboard"
            >
                <div style={styles['emptyState']}>
                    <span style={styles['emptyIcon']} role="img" aria-label="No cache">
                        📦
                    </span>
                    <span>
                        No cache configured.
                    </span>
                    <span>
                        Pass a <code>RenderCache</code> to <code>&lt;EnterstellarDevTools /&gt;</code> to enable the Cache Dashboard.
                    </span>
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Render: Stats Dashboard
    // -----------------------------------------------------------------------

    /** Hit rate as a percentage (0–100), clamped. */
    const hitRatePercent = stats !== null
        ? Math.min(100, Math.max(0, Math.round(stats.hitRate * 100)))
        : 0;

    /** Whether clear button should be disabled (no entries to clear). */
    const isClearDisabled = stats === null || stats.entries === 0;

    return (
        <div
            style={sharedPanelStyles['panelRoot']}
            data-enterstellar-devtools-panel="cache-dashboard"
        >
            {/* Header */}
            <div style={sharedPanelStyles['header']}>
                <span style={sharedPanelStyles['headerMeta']}>
                    Cache Statistics
                </span>
            </div>

            {/* Stats Grid */}
            <div
                style={styles['statsGrid']}
                role="group"
                aria-label="Cache performance statistics"
            >
                <StatCard
                    label="Hits"
                    value={stats !== null ? String(stats.hits) : '–'}
                />
                <StatCard
                    label="Misses"
                    value={stats !== null ? String(stats.misses) : '–'}
                />
                <StatCard
                    label="Entries"
                    value={stats !== null ? String(stats.entries) : '–'}
                />
                <div style={styles['statCard']}>
                    <span style={styles['statLabel']}>Hit Rate</span>
                    <span style={styles['statValue']}>
                        {stats !== null ? `${String(hitRatePercent)}%` : '–'}
                    </span>
                    <div
                        style={styles['progressTrack']}
                        role="progressbar"
                        aria-valuenow={hitRatePercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Cache hit rate: ${String(hitRatePercent)}%`}
                    >
                        <div
                            style={{
                                ...styles['progressFill'],
                                width: `${String(hitRatePercent)}%`,
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div style={styles['actions']}>
                <button
                    type="button"
                    onClick={handleClearCache}
                    disabled={isClearDisabled}
                    style={{
                        ...styles['actionButton'],
                        ...(isClearDisabled ? styles['actionButtonDisabled'] : undefined),
                    }}
                    aria-label="Clear all cache entries"
                >
                    🗑 Clear Cache
                </button>
            </div>
        </div>
    );
}
