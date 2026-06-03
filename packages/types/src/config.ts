/**
 * @module @enterstellar-ai/types/config
 * @description ZoneConfig — configuration for an Zone instance.
 *
 * A `ZoneConfig` defines the behavior, constraints, and rendering rules
 * for a specific Zone. The `determinism` dial (0.0–1.0) controls
 * how much AI influence the zone allows.
 *
 * @see Bible §3.5
 * @see Design Choices T13 (determinism as raw number), RE5–RE8
 */

import { z } from 'zod';

import type { ZoneId } from './brands.js';

// ---------------------------------------------------------------------------
// Nested Data Types
// ---------------------------------------------------------------------------

/**
 * Cache configuration for a zone.
 * Controls whether and how the zone caches compiled results.
 */
export type ZoneCacheConfig = {
    /** Whether caching is enabled for this zone. */
    readonly enabled: boolean;
    /** Time-to-live for cached entries in seconds. Default: 3600. */
    readonly ttl: number;
};

// ---------------------------------------------------------------------------
// ZoneConfig Type
// ---------------------------------------------------------------------------

/**
 * Configuration for an Zone instance.
 *
 * The `determinism` value is the primary control:
 * - `0.0` → fully static, agent never called (compliance zones)
 * - `0.0–1.0` → hybrid: fixed layout with agent-selected components in slots
 * - `1.0` → fully dynamic, agent controls everything in the zone
 *
 * @see Bible §3.5
 * @see Design Choice T13 — raw number with Zod validation, not branded type.
 */
export type ZoneConfig = {
    /** Branded zone identifier. */
    readonly id: ZoneId;
    /** Human-readable zone name (e.g., `'patient-sidebar'`). */
    readonly name: string;
    /**
     * Determinism level (0.0–1.0).
     * Controls AI influence over the zone's content.
     *
     * @see Design Choice T13 — validated via `z.number().min(0).max(1)`.
     */
    readonly determinism: number;
    /** Whitelist of component names allowed in this zone. Empty = all allowed. */
    readonly allowedComponents: readonly string[];
    /** Fallback component name to render when the agent fails or times out. */
    readonly fallbackComponent: string;
    /** Maximum time in milliseconds to wait for the agent before rendering fallback. */
    readonly agentTimeoutMs: number;
    /** Cache configuration for this zone. */
    readonly cache: ZoneCacheConfig;
    /**
     * Zone activation strategy.
     * - `'mount'` — call agent on component mount (default).
     * - `'visible'` — call agent when zone enters viewport (IntersectionObserver).
     * - `'manual'` — consumer calls `zone.activate()` programmatically.
     *
     * @see Design Choice RE6
     */
    readonly activateOn: 'mount' | 'visible' | 'manual';
};

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating `ZoneConfig` data at runtime.
 *
 * @see Design Choice T7, T13
 */
export const ZoneConfigSchema = z.object({
    id: z.string().min(1, 'Zone ID is required.'),
    name: z.string().min(1, 'Zone name is required.'),
    determinism: z
        .number()
        .min(0, 'Determinism must be >= 0.')
        .max(1, 'Determinism must be <= 1.'),
    allowedComponents: z.array(z.string()),
    fallbackComponent: z.string().min(1, 'Fallback component is required.'),
    agentTimeoutMs: z.number().int().positive('Agent timeout must be positive.'),
    cache: z.object({
        enabled: z.boolean(),
        ttl: z.number().int().positive('TTL must be positive.'),
    }),
    activateOn: z.enum(['mount', 'visible', 'manual']),
});
