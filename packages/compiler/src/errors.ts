/**
 * @module @enterstellar-ai/compiler/errors
 * @description Compiler-specific error factory functions for `ENS-2xxx` codes.
 *
 * Each factory creates a well-typed `CompilationError` with a machine-readable
 * `code`, human-readable `message`, field `path`, and (where applicable) a
 * `fix` suggestion for auto-correction in DevTools and the self-correction loop.
 *
 * Error codes are defined in `@enterstellar-ai/types/errors` (`EnterstellarErrorCode` union).
 * This module provides the compiler-domain factories only.
 *
 * @see Coding Rules — Error Taxonomy (ENS-2xxx range)
 * @see Design Choice C14 — ~15 error codes at launch, `ENS-2xxx` for compiler.
 * @see Design Choice C15 — all errors include machine-readable `fix` suggestion.
 */

import type { CompilationError, CompilationFix } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts an `unknown` value to a display string without triggering
 * `@typescript-eslint/no-base-to-string`. Objects use `JSON.stringify`,
 * primitives use `String()`.
 */
function safeStringify(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/**
 * Creates a `CompilationError` with all required fields.
 * Internal helper — not exported.
 */
function createError(
    code: string,
    path: string,
    message: string,
    options?: {
        readonly received?: unknown;
        readonly expected?: unknown;
        readonly fix?: CompilationFix;
    },
): CompilationError {
    const base: CompilationError = { code, path, message };
    if (options?.received !== undefined) {
        (base as { received: unknown }).received = options.received;
    }
    if (options?.expected !== undefined) {
        (base as { expected: unknown }).expected = options.expected;
    }
    if (options?.fix !== undefined) {
        (base as { fix: CompilationFix }).fix = options.fix;
    }
    return base;
}

// ---------------------------------------------------------------------------
// ENS-2001: Schema Parse Failure
// ---------------------------------------------------------------------------

/**
 * Creates an error for Zod schema parse failures (`ENS-2001`).
 *
 * Emitted when the LLM-provided props fail validation against the
 * component's Zod schema. The `fix` field suggests the expected value.
 *
 * @param path - Dot-path to the invalid field (e.g., `'props.riskLevel'`).
 * @param received - The invalid value that was provided.
 * @param expected - Description of what was expected.
 * @param fix - Optional machine-readable fix suggestion.
 * @returns A `CompilationError` with code `'ENS-2001'`.
 *
 * @see Design Choice C15 — errors include fix suggestions.
 */
export function schemaParseError(
    path: string,
    received: unknown,
    expected: string,
    fix?: CompilationFix,
): CompilationError {
    const opts: { received: unknown; expected: string; fix?: CompilationFix } = { received, expected };
    if (fix !== undefined) {
        opts.fix = fix;
    }
    return createError(
        'ENS-2001',
        path,
        `Schema validation failed at '${path}': expected ${expected}, received ${String(received)}.`,
        opts,
    );
}

// ---------------------------------------------------------------------------
// ENS-2002: Invalid Design Token
// ---------------------------------------------------------------------------

/**
 * Creates an error for hallucinated or invalid design tokens (`ENS-2002`).
 *
 * Emitted when a prop value uses a raw CSS value or an unknown token name
 * instead of a valid `token:*` reference from the registry's design tokens.
 *
 * @param path - Dot-path to the invalid token field.
 * @param value - The invalid token value (e.g., `'#ff0000'`).
 * @param suggestion - Optional valid token to use (e.g., `'token:danger'`).
 * @returns A `CompilationError` with code `'ENS-2002'`.
 *
 * @see Design Choice C8 — strict token enforcement.
 * @see Design Choice C9 — raw CSS values always rejected.
 */
export function invalidTokenError(
    path: string,
    value: string,
    suggestion?: string,
): CompilationError {
    const fix: CompilationFix | undefined = suggestion !== undefined
        ? { field: path, was: value, shouldBe: suggestion }
        : undefined;

    const opts: { received: string; fix?: CompilationFix } = { received: value };
    if (fix !== undefined) {
        opts.fix = fix;
    }

    return createError(
        'ENS-2002',
        path,
        `Invalid design token at '${path}': '${value}' is not a registered token.${suggestion !== undefined ? ` Use '${suggestion}' instead.` : ''
        }`,
        opts,
    );
}

// ---------------------------------------------------------------------------
// ENS-2003: Missing Accessibility Attribute
// ---------------------------------------------------------------------------

/**
 * Creates an error for missing accessibility attributes (`ENS-2003`).
 *
 * Emitted when the component contract declares accessibility requirements
 * that are not satisfied and `autoAccessibility` is disabled.
 *
 * @param attr - The missing accessibility attribute (e.g., `'aria-label'`).
 * @param componentName - PascalCase name of the component.
 * @returns A `CompilationError` with code `'ENS-2003'`.
 *
 * @see Design Choice C10 — role and aria-* only, no tabindex.
 */
export function missingAccessibilityError(
    attr: string,
    componentName: string,
): CompilationError {
    return createError(
        'ENS-2003',
        `accessibility.${attr}`,
        `Missing accessibility attribute '${attr}' on component '${componentName}'.`,
        {
            expected: `A valid '${attr}' value`,
            fix: {
                field: `accessibility.${attr}`,
                was: undefined,
                shouldBe: `[provide ${attr}]`,
            },
        },
    );
}

// ---------------------------------------------------------------------------
// ENS-2004: Unknown Component
// ---------------------------------------------------------------------------

/**
 * Creates an error for unknown component names (`ENS-2004`).
 *
 * Emitted when `intent.component` does not match any component in the registry.
 *
 * @param name - The unknown component name.
 * @returns A `CompilationError` with code `'ENS-2004'`.
 */
export function unknownComponentError(name: string): CompilationError {
    return createError(
        'ENS-2004',
        'component',
        `Unknown component '${name}': not found in the registry.`,
        { received: name },
    );
}

// ---------------------------------------------------------------------------
// ENS-2005: Self-Correction Exhausted
// ---------------------------------------------------------------------------

/**
 * Creates an error when self-correction retries are exhausted (`ENS-2005`).
 *
 * After `maxRetries` attempts, the compiler falls back to the configured
 * fallback component. This error is informational — it appears in the trace.
 *
 * @param attempts - Number of self-correction attempts made.
 * @param maxRetries - The configured maximum retries.
 * @returns A `CompilationError` with code `'ENS-2005'`.
 *
 * @see Design Choice C6 — fallback component after max retries.
 */
export function selfCorrectionExhaustedError(
    attempts: number,
    maxRetries: number,
): CompilationError {
    return createError(
        'ENS-2005',
        'self-correction',
        `Self-correction exhausted after ${String(attempts)}/${String(maxRetries)} attempts. Falling back to fallback component.`,
        { received: attempts, expected: `≤${String(maxRetries)} successful corrections` },
    );
}

// ---------------------------------------------------------------------------
// ENS-2006: Fallback Rendered
// ---------------------------------------------------------------------------

/**
 * Creates an informational error when a fallback component is rendered (`ENS-2006`).
 *
 * @param originalComponent - The component that failed validation.
 * @param fallbackComponent - The fallback component that was rendered instead.
 * @returns A `CompilationError` with code `'ENS-2006'`.
 *
 * @see Design Choice C6 — fallback receives error details as props.
 */
export function fallbackRenderedError(
    originalComponent: string,
    fallbackComponent: string,
): CompilationError {
    return createError(
        'ENS-2006',
        'component',
        `Fallback rendered: '${fallbackComponent}' used instead of '${originalComponent}'.`,
        { received: originalComponent, expected: fallbackComponent },
    );
}

// ---------------------------------------------------------------------------
// ENS-2007: Token Coercion Warning
// ---------------------------------------------------------------------------

/**
 * Creates a warning-level error for token coercion (`ENS-2007`).
 *
 * Emitted in non-strict mode when a hallucinated token is coerced to the
 * nearest valid token by semantic category.
 *
 * @param path - Dot-path to the coerced token field.
 * @param was - The original invalid token value.
 * @param coercedTo - The valid token it was coerced to.
 * @returns A `CompilationError` with code `'ENS-2007'`.
 *
 * @see Design Choice C8 — coercion is the safety net, not the happy path.
 */
export function tokenCoercionWarning(
    path: string,
    was: string,
    coercedTo: string,
): CompilationError {
    return createError(
        'ENS-2007',
        path,
        `Token coerced at '${path}': '${was}' → '${coercedTo}'.`,
        {
            received: was,
            expected: coercedTo,
            fix: { field: path, was, shouldBe: coercedTo },
        },
    );
}

// ---------------------------------------------------------------------------
// ENS-2008: Unknown Props Stripped
// ---------------------------------------------------------------------------

/**
 * Creates a warning-level error for stripped unknown props (`ENS-2008`).
 *
 * Emitted when the Zod `.strip()` call removes props not defined in the
 * component's schema. Logged for debugging — hallucinated props never
 * reach the component.
 *
 * @param fields - Names of the stripped prop fields.
 * @returns A `CompilationError` with code `'ENS-2008'`.
 *
 * @see Design Choice P10 — strip unknown, log as warning.
 */
export function propsStrippedWarning(
    fields: readonly string[],
): CompilationError {
    return createError(
        'ENS-2008',
        'props',
        `Unknown props stripped: [${fields.join(', ')}]. Hallucinated props are discarded.`,
        { received: fields },
    );
}

// ---------------------------------------------------------------------------
// ENS-2009: Correction Callback Error
// ---------------------------------------------------------------------------

/**
 * Creates an error when the self-correction callback itself fails (`ENS-2009`).
 *
 * This indicates a transport or agent failure, not a validation failure.
 * The compiler falls through to fallback handling.
 *
 * @param cause - The underlying error message or description.
 * @returns A `CompilationError` with code `'ENS-2009'`.
 */
export function correctionCallbackError(cause: string): CompilationError {
    return createError(
        'ENS-2009',
        'self-correction',
        `Self-correction callback failed: ${cause}`,
        { received: cause },
    );
}

// ---------------------------------------------------------------------------
// ENS-2010: Max Nesting Depth Exceeded
// ---------------------------------------------------------------------------

/**
 * Creates an error when component nesting exceeds the configured maximum (`ENS-2010`).
 *
 * Prevents stack overflows and DOM performance degradation from deeply nested
 * layouts generated by malicious or buggy agents.
 *
 * @param depth - The actual nesting depth found.
 * @param max - The configured maximum nesting depth.
 * @returns A `CompilationError` with code `'ENS-2010'`.
 *
 * @see Design Choice P4 — default 10, configurable 3–20.
 */
export function maxNestingDepthError(
    depth: number,
    max: number,
): CompilationError {
    return createError(
        'ENS-2010',
        'nesting',
        `Maximum nesting depth exceeded: depth ${String(depth)} exceeds limit of ${String(max)}.`,
        {
            received: depth,
            expected: `≤${String(max)}`,
            fix: {
                field: 'nesting',
                was: depth,
                shouldBe: `Flatten component tree to ≤${String(max)} levels`,
            },
        },
    );
}

// ---------------------------------------------------------------------------
// ENS-2011: Deterministic Correction Applied (info-level)
// ---------------------------------------------------------------------------

/**
 * Creates an informational diagnostic when a Tier 1 deterministic correction
 * is applied (`ENS-2011`).
 *
 * This is NOT an error — it records that the compiler successfully auto-corrected
 * a prop value using one of the 5 Tier 1 strategies (type coercion, boolean
 * coercion, default extraction, enum nearest match, or token nearest match).
 *
 * Included in `CompilationResult.errors` for observability. DevTools and
 * telemetry consumers can filter by code `'ENS-2011'` to distinguish
 * corrections from failures.
 *
 * @param field - The field that was corrected (e.g., `'age'`, `'riskLevel'`).
 * @param was - The original invalid value. `undefined` for missing fields.
 * @param correctedTo - The corrected value that replaced the original.
 * @param strategy - The correction strategy used (e.g., `'type-coercion'`, `'enum-nearest'`).
 * @returns A `CompilationError` with code `'ENS-2011'`.
 *
 * @see Bible §3.7 — ENS-2011 info code.
 * @see Design Choice SC-17 — info-level correction diagnostics.
 */
export function deterministicCorrectionInfo(
    field: string,
    was: unknown,
    correctedTo: unknown,
    strategy: string,
): CompilationError {
    const wasDisplay = was === undefined ? '(missing)' : safeStringify(was);
    const correctedDisplay = safeStringify(correctedTo);
    return createError(
        'ENS-2011',
        `props.${field}`,
        `Tier 1 correction applied [${strategy}]: "${field}" changed from ${wasDisplay} to ${correctedDisplay}.`,
        {
            received: was,
            expected: correctedTo,
            fix: {
                field,
                was,
                shouldBe: correctedTo,
            },
        },
    );
}

// ---------------------------------------------------------------------------
// ENS-2012: Template Correction Applied (info-level)
// ---------------------------------------------------------------------------

/**
 * Creates an informational diagnostic when a Tier 2 template correction
 * is applied (`ENS-2012`).
 *
 * Records that a missing field was filled from `contract.examples[0].props`.
 * This only fires for missing-field errors where `fix.was === undefined`
 * and the example value passes the field's own schema validation.
 *
 * @param field - The field that was corrected (e.g., `'category'`).
 * @param correctedTo - The value from the example props used as fallback.
 * @returns A `CompilationError` with code `'ENS-2012'`.
 *
 * @see Bible §3.7 — ENS-2012 info code.
 * @see Design Choice SC-17 — info-level correction diagnostics.
 * @see Bible §4.3 — Tier 2 only fires for missing fields.
 */
export function templateCorrectionInfo(
    field: string,
    correctedTo: unknown,
): CompilationError {
    return createError(
        'ENS-2012',
        `props.${field}`,
        `Tier 2 correction applied [example-fallback]: "${field}" set to ${String(correctedTo)} from contract example.`,
        {
            received: undefined,
            expected: correctedTo,
            fix: {
                field,
                was: undefined,
                shouldBe: correctedTo,
            },
        },
    );
}

