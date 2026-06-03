/**
 * @module @enterstellar-ai/lifecycle/streaming-assembler
 * @description Accumulates streaming prop fragments into a complete props object.
 *
 * During streaming, the agent sends partial prop updates as path-based
 * fragments (LC4). The `StreamingAssembler` accumulates these fragments
 * and checks structural completeness against a Zod schema (LC5).
 *
 * No optimistic defaults are injected (LC6) — missing fields remain
 * missing until a fragment provides the value. This is critical for
 * clinical safety: a default value of `0` for heart rate is dangerous.
 *
 * @see Bible §4.8
 * @see Design Choices LC4 (path-based fragments), LC5 (Zod completeness), LC6 (no defaults)
 */

import type { z } from 'zod';

import type { PropFragment, StreamingAssembler } from './types.js';
import { createStreamingAssemblyError } from './errors.js';

// ---------------------------------------------------------------------------
// Path Parsing
// ---------------------------------------------------------------------------

/**
 * A single parsed segment of a dot-notation prop path.
 * Either a string key (object property) or a numeric index (array element).
 */
type PathSegment = {
    /** The key or index value. */
    readonly key: string | number;
};

/** Regex to match array bracket notation: `[0]`, `[12]`, etc. */
const BRACKET_REGEX = /\[(\d+)\]/g;

/**
 * Parses a dot-notation path string into an array of path segments.
 *
 * Supports:
 * - Simple keys: `'title'` → `[{ key: 'title' }]`
 * - Nested keys: `'a.b.c'` → `[{ key: 'a' }, { key: 'b' }, { key: 'c' }]`
 * - Array indices: `'items[0].name'` → `[{ key: 'items' }, { key: 0 }, { key: 'name' }]`
 * - Mixed: `'data[2].values[0]'` → `[{ key: 'data' }, { key: 2 }, { key: 'values' }, { key: 0 }]`
 *
 * @param path - The dot-notation path string.
 * @returns An array of parsed path segments.
 * @throws `EnterstellarError` with code `ENS-3004` if the path is empty or malformed.
 *
 * @internal
 */
export function parsePath(path: string): readonly PathSegment[] {
    if (path.length === 0) {
        throw createStreamingAssemblyError(path, 'Path must not be empty.');
    }

    // Replace bracket notation with dot-separated numeric keys
    // e.g., 'items[0].name' → 'items.0.name'
    const normalized = path.replace(BRACKET_REGEX, '.$1');

    // Split on dots and filter out empty segments (from leading/trailing dots)
    const rawSegments = normalized.split('.');
    const segments: PathSegment[] = [];

    for (const raw of rawSegments) {
        if (raw.length === 0) {
            throw createStreamingAssemblyError(
                path,
                'Path contains empty segment (consecutive dots or leading/trailing dot).',
            );
        }

        // Determine if the segment is a numeric array index
        const numericValue = Number(raw);
        if (Number.isInteger(numericValue) && numericValue >= 0) {
            segments.push({ key: numericValue });
        } else {
            segments.push({ key: raw });
        }
    }

    return segments;
}

// ---------------------------------------------------------------------------
// Deep Set
// ---------------------------------------------------------------------------

/**
 * Sets a value at a deeply nested path within a mutable object.
 *
 * Automatically creates intermediate objects and arrays as needed.
 * Array elements are created when the next segment is a number.
 *
 * @param target - The mutable root object to modify.
 * @param segments - Parsed path segments from `parsePath()`.
 * @param value - The value to assign at the leaf.
 *
 * @internal
 */
export function deepSet(
    target: Record<string, unknown>,
    segments: readonly PathSegment[],
    value: unknown,
): void {
    let current: Record<string, unknown> = target;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment === undefined) {
            // Unreachable under normal operation, but satisfies noUncheckedIndexedAccess
            break;
        }

        const key = segment.key;
        const isLast = i === segments.length - 1;

        if (isLast) {
            // Leaf — assign the value
            if (typeof key === 'number') {
                current[String(key)] = value;
            } else {
                current[key] = value;
            }
        } else {
            // Intermediate — ensure the container exists
            const nextSegment = segments[i + 1];
            const nextIsArray = nextSegment !== undefined && typeof nextSegment.key === 'number';

            const accessKey = typeof key === 'number' ? String(key) : key;
            const existing = current[accessKey];
            if (existing === undefined || existing === null || typeof existing !== 'object') {
                current[accessKey] = nextIsArray ? [] : {};
            }
            current = current[accessKey] as Record<string, unknown>;
        }
    }
}

// ---------------------------------------------------------------------------
// Deep Clone
// ---------------------------------------------------------------------------

/**
 * Creates a deep clone of a plain object via structured clone.
 *
 * Uses `structuredClone` (available in Node 17+, all modern browsers).
 * Falls back to JSON round-trip if `structuredClone` is unavailable.
 *
 * @param obj - The object to clone.
 * @returns A deep copy with no shared references.
 *
 * @internal
 */
function deepClone(obj: Record<string, unknown>): Record<string, unknown> {
    // structuredClone is available in all Enterstellar target environments (ES2022+)
    return structuredClone(obj);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new `StreamingAssembler` instance.
 *
 * The assembler accumulates path-based prop fragments (LC4) without
 * injecting any optimistic defaults (LC6). Structural completeness
 * is checked via Zod `safeParse` (LC5).
 *
 * @returns A `StreamingAssembler` instance.
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 *
 * const assembler = createStreamingAssembler();
 *
 * assembler.apply({ path: 'patientId', value: 'P-123' });
 * assembler.apply({ path: 'metrics[0].label', value: 'Heart Rate' });
 * assembler.apply({ path: 'metrics[0].value', value: 92 });
 *
 * const schema = z.object({
 *   patientId: z.string(),
 *   metrics: z.array(z.object({ label: z.string(), value: z.number() })),
 * });
 *
 * assembler.isComplete(schema); // true — all required fields are present
 * ```
 *
 * @see Design Choices LC4, LC5, LC6
 */
export function createStreamingAssembler(): StreamingAssembler {
    let accumulated: Record<string, unknown> = {};

    const assembler: StreamingAssembler = {
        apply(fragment: PropFragment): void {
            const segments = parsePath(fragment.path);
            deepSet(accumulated, segments, fragment.value);
        },

        applyBatch(fragments: readonly PropFragment[]): void {
            for (const fragment of fragments) {
                assembler.apply(fragment);
            }
        },

        getAccumulated(): Record<string, unknown> {
            return deepClone(accumulated);
        },

        isComplete(schema: z.ZodType): boolean {
            const result = schema.safeParse(accumulated);
            return result.success;
        },

        reset(): void {
            accumulated = {};
        },
    };

    return assembler;
}
