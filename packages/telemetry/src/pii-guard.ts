/**
 * @module @enterstellar-ai/telemetry/pii-guard
 * @description Targeted PII check for `ForgeSignal.componentName`.
 *
 * Validates that the component name does not accidentally contain
 * personally identifiable information (e.g., a patient ID, user ID,
 * or numeric record identifier).
 *
 * **Scope:** Checks `componentName` ONLY. Does NOT scan all signal
 * fields — aggressive regex scanning across all fields triggers false
 * positives on version numbers, hex codes, and UUIDs (TL8).
 *
 * **Behavior:** Returns a sanitized name or the original if clean.
 * Logs a warning for flagged names. Does NOT throw.
 *
 * @see Design Choice TL8 — targeted PII check on `componentName` only.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Matches a string that is entirely numeric digits (e.g., `"12345"`, `"928374"`).
 * These are almost certainly accidental ID leaks, not valid PascalCase component names.
 */
const PURE_NUMERIC_PATTERN = /^\d+$/;

/**
 * Matches segments of 5+ consecutive digits within a larger string.
 * Catches patterns like `Patient_928374` or `User12345678`.
 *
 * Threshold of 5 digits avoids false positives on:
 * - Error codes (`AUR2001` — 4 digits)
 * - Hex hash suffixes in forged names (`7f3a90bc` — hex, not matched by `\d`)
 * - Port numbers (`8080` — 4 digits)
 */
const NUMERIC_ID_SEGMENT_PATTERN = /\d{5,}/;

/**
 * Replacement value for flagged component names.
 * Preserves signal utility while stripping potential PII.
 */
const SANITIZED_NAME = '__pii_redacted__';

// ---------------------------------------------------------------------------
// PII Check Result
// ---------------------------------------------------------------------------

/**
 * The result of a PII guard check on a component name.
 */
export type PiiCheckResult = {
    /** The (possibly sanitized) component name. */
    readonly name: string;

    /** Whether the original name was flagged as a potential PII leak. */
    readonly flagged: boolean;

    /** Human-readable reason, if flagged. `undefined` if clean. */
    readonly reason?: string | undefined;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks a `componentName` for potential PII leakage.
 *
 * Returns the original name if clean, or a sanitized placeholder
 * if a numeric ID pattern is detected. Does NOT throw.
 *
 * @param componentName - The component name to validate.
 * @returns A {@link PiiCheckResult} with the (possibly sanitized) name and metadata.
 *
 * @example
 * ```ts
 * checkComponentNamePii('PatientVitals');
 * // → { name: 'PatientVitals', flagged: false }
 *
 * checkComponentNamePii('12345');
 * // → { name: '__pii_redacted__', flagged: true, reason: '...' }
 *
 * checkComponentNamePii('Patient_928374');
 * // → { name: '__pii_redacted__', flagged: true, reason: '...' }
 * ```
 *
 * @see Design Choice TL8
 */
export function checkComponentNamePii(componentName: string): PiiCheckResult {
    // Check 1: Entirely numeric — definitely an ID, not a component name.
    if (PURE_NUMERIC_PATTERN.test(componentName)) {
        return {
            name: SANITIZED_NAME,
            flagged: true,
            reason:
                `Component name "${componentName}" is purely numeric and likely a PII identifier. ` +
                'Sanitized to prevent accidental PII leakage in ForgeSignal.',
        };
    }

    // Check 2: Contains a segment of 5+ consecutive digits — likely an embedded ID.
    if (NUMERIC_ID_SEGMENT_PATTERN.test(componentName)) {
        return {
            name: SANITIZED_NAME,
            flagged: true,
            reason:
                `Component name "${componentName}" contains a numeric segment ≥5 digits, ` +
                'which may be a PII identifier. Sanitized to prevent accidental PII leakage in ForgeSignal.',
        };
    }

    // Clean — no PII detected.
    return { name: componentName, flagged: false };
}
