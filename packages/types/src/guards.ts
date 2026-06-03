/**
 * @module @enterstellar-ai/types/guards
 * @description Type guard functions for runtime type narrowing.
 *
 * Type guards are lightweight checks (one `typeof` + field existence)
 * for branded types and discriminated unions. Full Zod-based validation
 * remains in consumer modules (e.g., `@enterstellar-ai/registry`).
 *
 * @see Design Choice T17
 */

import type { ComponentId, ZoneId, TraceId } from './brands.js';
import type { ForgeSignal } from './telemetry.js';
import type { CompilationResult } from './compiler.js';
import type { ComponentIntent } from './intent.js';
import type { AgentTrace } from './trace.js';
import type { UserSignal } from './connection.js';

// ---------------------------------------------------------------------------
// Branded Type Guards
// ---------------------------------------------------------------------------

/**
 * Checks whether a value is a valid `ComponentId`.
 * Validates that the value is a non-empty string.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a valid `ComponentId`.
 */
export function isComponentId(value: unknown): value is ComponentId {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Checks whether a value is a valid `ZoneId`.
 * Validates that the value is a non-empty string.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a valid `ZoneId`.
 */
export function isZoneId(value: unknown): value is ZoneId {
    return typeof value === 'string' && value.length > 0;
}

/**
 * Checks whether a value is a valid `TraceId`.
 * Validates that the value is a non-empty string.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a valid `TraceId`.
 */
export function isTraceId(value: unknown): value is TraceId {
    return typeof value === 'string' && value.length > 0;
}

// ---------------------------------------------------------------------------
// Data Shape Type Guards
// ---------------------------------------------------------------------------

/**
 * Checks whether a value is a valid `ForgeSignal` shape.
 * Lightweight structural check — NOT full Zod validation.
 *
 * @param value - The value to check.
 * @returns `true` if the value has the shape of a `ForgeSignal`.
 */
export function isForgeSignal(value: unknown): value is ForgeSignal {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj['intentHash'] === 'string' &&
        typeof obj['componentName'] === 'string' &&
        typeof obj['compilationStatus'] === 'string' &&
        typeof obj['forgeMode'] === 'string' &&
        typeof obj['latencyMs'] === 'number' &&
        typeof obj['timestamp'] === 'string'
    );
}

/**
 * Checks whether a value is a valid `CompilationResult` shape.
 * Lightweight structural check — NOT full Zod validation.
 *
 * @param value - The value to check.
 * @returns `true` if the value has the shape of a `CompilationResult`.
 */
export function isCompilationResult(value: unknown): value is CompilationResult {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj['componentName'] === 'string' &&
        typeof obj['status'] === 'string' &&
        typeof obj['provenance'] === 'object' &&
        obj['provenance'] !== null &&
        Array.isArray(obj['errors'])
    );
}

/**
 * Checks whether a value is a valid `ComponentIntent` shape.
 * Lightweight structural check — NOT full Zod validation.
 *
 * @param value - The value to check.
 * @returns `true` if the value has the shape of a `ComponentIntent`.
 */
export function isComponentIntent(value: unknown): value is ComponentIntent {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj['component'] === 'string' &&
        typeof obj['props'] === 'object' &&
        obj['props'] !== null &&
        typeof obj['confidence'] === 'number'
    );
}

/**
 * Checks whether a value is a valid `AgentTrace` shape.
 * Lightweight structural check — NOT full Zod validation.
 *
 * @param value - The value to check.
 * @returns `true` if the value has the shape of an `AgentTrace`.
 */
export function isAgentTrace(value: unknown): value is AgentTrace {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj['id'] === 'string' &&
        typeof obj['timestamp'] === 'string' &&
        typeof obj['intent'] === 'object' &&
        obj['intent'] !== null &&
        typeof obj['resolution'] === 'object' &&
        obj['resolution'] !== null &&
        typeof obj['compilation'] === 'object' &&
        obj['compilation'] !== null
    );
}

/**
 * Checks whether a value is a valid `UserSignal` shape.
 * Lightweight structural check — NOT full Zod validation.
 *
 * @param value - The value to check.
 * @returns `true` if the value has the shape of a `UserSignal`.
 */
export function isUserSignal(value: unknown): value is UserSignal {
    if (typeof value !== 'object' || value === null) return false;
    const obj = value as Record<string, unknown>;
    return (
        typeof obj['type'] === 'string' &&
        typeof obj['zone'] === 'string' &&
        typeof obj['component'] === 'string' &&
        typeof obj['payload'] === 'object' &&
        obj['payload'] !== null &&
        typeof obj['timestamp'] === 'string'
    );
}
