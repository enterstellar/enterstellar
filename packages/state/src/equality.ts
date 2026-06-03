/**
 * @module @enterstellar-ai/state/equality
 * @description Shallow equality utility for store subscription change detection.
 *
 * The store fires subscriptions only when values actually change (S4).
 * This module provides the comparison logic:
 * - Primitives: `Object.is()` (handles `NaN`, `+0`/`-0` correctly).
 * - Objects/arrays: shallow property comparison (one level deep).
 * - `null`/`undefined`: identity comparison.
 *
 * @see Design Choice S4 — shallow equality for subscriptions.
 */

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/**
 * Checks if a value is a non-null plain object (not an array).
 *
 * @param value - The value to check.
 * @returns `true` if the value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Shallow Equality
// ---------------------------------------------------------------------------

/**
 * Shallow comparison of two values.
 *
 * - Primitives: uses `Object.is()` for identity comparison.
 * - Arrays: compares length + every element via `Object.is()`.
 * - Plain objects: compares own key count + every value via `Object.is()`.
 * - Mixed types: returns `false`.
 *
 * This is intentionally one level deep. Nested objects are compared
 * by reference, not by structure. This matches React's shallow comparison
 * semantics and ensures predictable performance (O(n) where n = keys).
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns `true` if the values are shallowly equal.
 *
 * @see Design Choice S4
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
    // Identity check — handles primitives and reference equality
    if (Object.is(a, b)) {
        return true;
    }

    // If either is not an object, they are not equal (identity already checked)
    if (
        typeof a !== 'object' ||
        typeof b !== 'object' ||
        a === null ||
        b === null
    ) {
        return false;
    }

    // Array comparison
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!Object.is(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }

    // If one is array and other is not, not equal
    if (Array.isArray(a) !== Array.isArray(b)) {
        return false;
    }

    // Plain object comparison
    if (isPlainObject(a) && isPlainObject(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        if (keysA.length !== keysB.length) {
            return false;
        }

        for (const key of keysA) {
            if (
                !Object.prototype.hasOwnProperty.call(b, key) ||
                !Object.is(a[key], b[key])
            ) {
                return false;
            }
        }
        return true;
    }

    // All other cases (Date, RegExp, etc.) — reference comparison already done
    return false;
}
