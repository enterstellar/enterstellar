/**
 * @module @enterstellar-ai/types/brands
 * @description Branded types for type-safe identifiers across the Enterstellar ecosystem.
 *
 * Branded types prevent accidentally passing a zone name where a component ID
 * is expected, or using a plain string where a trace ID is required.
 *
 * @see Design Choice T10
 *
 * @example
 * ```ts
 * import { createComponentId, createZoneId, createTraceId } from '@enterstellar-ai/types';
 *
 * const compId = createComponentId('PatientVitals');
 * const zoneId = createZoneId('main-content');
 * const traceId = createTraceId();
 * ```
 */

import { EnterstellarError } from './errors.js';

// ---------------------------------------------------------------------------
// Branded Type Definitions
// ---------------------------------------------------------------------------

/**
 * A branded string identifying a registered component.
 * Prevents accidental misuse of plain strings as component identifiers.
 */
export type ComponentId = string & { readonly __brand: 'ComponentId' };

/**
 * A branded string identifying an Zone instance.
 * Ensures zone references are explicit and type-checked.
 */
export type ZoneId = string & { readonly __brand: 'ZoneId' };

/**
 * A branded string identifying an AgentTrace record.
 * Guarantees trace references are unique and type-safe.
 */
export type TraceId = string & { readonly __brand: 'TraceId' };

// ---------------------------------------------------------------------------
// Constructor Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a type-safe `ComponentId` from a PascalCase component name.
 *
 * @param name - PascalCase component name, must be non-empty.
 * @returns A branded `ComponentId`.
 * @throws {EnterstellarError} `ENS-1009` if `name` is empty or contains only whitespace.
 *
 * @example
 * ```ts
 * const id = createComponentId('PatientVitals');
 * ```
 */
export function createComponentId(name: string): ComponentId {
    if (!name.trim()) {
        throw new EnterstellarError(
            'ENS-1009',
            'types',
            '[ENS-1009] ComponentId name must be a non-empty string.',
            false,
        );
    }
    return name as ComponentId;
}

/**
 * Creates a type-safe `ZoneId` from a zone name.
 *
 * @param name - Zone name, must be non-empty. Typically kebab-case.
 * @returns A branded `ZoneId`.
 * @throws {EnterstellarError} `ENS-1009` if `name` is empty or contains only whitespace.
 *
 * @example
 * ```ts
 * const id = createZoneId('patient-sidebar');
 * ```
 */
export function createZoneId(name: string): ZoneId {
    if (!name.trim()) {
        throw new EnterstellarError(
            'ENS-1009',
            'types',
            '[ENS-1009] ZoneId name must be a non-empty string.',
            false,
        );
    }
    return name as ZoneId;
}

/**
 * Creates a type-safe `TraceId` using a UUIDv4.
 *
 * @returns A branded `TraceId` backed by a cryptographically random UUID.
 *
 * @example
 * ```ts
 * const id = createTraceId();
 * // e.g., "c0a80164-b1c2-4d3e-a456-789012345678"
 * ```
 */
export function createTraceId(): TraceId {
    return globalThis.crypto.randomUUID() as TraceId;
}
