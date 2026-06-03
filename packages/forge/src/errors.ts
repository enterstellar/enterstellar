/**
 * @module @enterstellar-ai/forge/errors
 * @description Forge-specific error factory functions for `ENS-4xxx` codes.
 *
 * Each factory creates a well-typed `EnterstellarError` with:
 * - Machine-readable `code` (e.g., `'ENS-4001'`)
 * - Module identifier `'forge'`
 * - `recoverable` flag indicating whether fallback is appropriate
 *
 * Forge errors are recoverable by design — the system always falls back to
 * LocalForge, then to a generic fallback component. Hard failures never
 * reach the user (Design Choice F9).
 *
 * @see Coding Rules — Error Taxonomy (ENS-4xxx range)
 * @see Design Choice F9 — always fall back to LocalForge, never hard-fail.
 */

import { EnterstellarError } from '@enterstellar-ai/types';


// ---------------------------------------------------------------------------
// ENS-4001: Forge Generation Failed
// ---------------------------------------------------------------------------

/**
 * Creates an error when forge generation fails entirely (`ENS-4001`).
 *
 * Emitted when neither LocalForge nor CloudForge can produce a valid
 * `ComponentContract`. The caller should render the fallback component.
 *
 * @param intentComponent - The component name from the original intent.
 * @param reason - Human-readable reason for the failure.
 * @returns An `EnterstellarError` with code `'ENS-4001'`, module `'forge'`, recoverable `true`.
 *
 * @see Design Choice F9 — never hard-fail the user.
 */
export function forgeGenerationFailedError(
    intentComponent: string,
    reason: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-4001',
        'forge',
        `Forge generation failed for intent component '${intentComponent}': ${reason}`,
        true,
    );
}

// ---------------------------------------------------------------------------
// ENS-4002: Template Not Found
// ---------------------------------------------------------------------------

/**
 * Creates an error when no LocalForge template matches the intent category (`ENS-4002`).
 *
 * This is a soft error — the forge escalates to CloudForge (if `routing: 'auto'`)
 * or returns `null` to signal no local match.
 *
 * @param category - The intent category that had no matching template.
 * @returns An `EnterstellarError` with code `'ENS-4002'`, module `'forge'`, recoverable `true`.
 *
 * @see Design Choice F2 — decision tree for template selection.
 * @see Design Choice F3 — silent escalation to CloudForge on no match.
 */
export function templateNotFoundError(
    category: string,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-4002',
        'forge',
        `No LocalForge template matches category '${category}'. Escalating to CloudForge.`,
        true,
    );
}

// ---------------------------------------------------------------------------
// ENS-4003: CloudForge Network Error
// ---------------------------------------------------------------------------

/**
 * Creates an error when the CloudForge callback fails (`ENS-4003`).
 *
 * Covers network failures, timeouts, and quota exhaustion from the
 * consumer-provided `CloudForgeCallback`. The forge falls back to
 * LocalForge (Design Choice F9).
 *
 * @param cause - The underlying error that caused the failure.
 * @returns An `EnterstellarError` with code `'ENS-4003'`, module `'forge'`, recoverable `true`.
 *
 * @see Design Choice F9 — always fall back, never hard-fail.
 */
export function cloudForgeNetworkError(
    cause: unknown,
): EnterstellarError {
    const message = cause instanceof Error
        ? cause.message
        : String(cause);

    return new EnterstellarError(
        'ENS-4003',
        'forge',
        `CloudForge callback failed: ${message}. Falling back to LocalForge.`,
        true,
        cause,
    );
}

// ---------------------------------------------------------------------------
// ENS-4004: Forged Contract Compilation Failed
// ---------------------------------------------------------------------------

/**
 * Creates an error when a forged contract fails compiler validation (`ENS-4004`).
 *
 * This indicates a guardrail violation — the forged contract produced by
 * LocalForge or CloudForge did not pass the Enterstellar compiler (L3). The
 * fallback component is rendered instead.
 *
 * @param forgedName - The `__forged_` name of the component that failed.
 * @param errorCount - Number of compilation errors found.
 * @returns An `EnterstellarError` with code `'ENS-4004'`, module `'forge'`, recoverable `true`.
 *
 * @see Principle L3 — compiler never bypassed, even for forged contracts.
 */
export function forgeCompilationFailedError(
    forgedName: string,
    errorCount: number,
): EnterstellarError {
    return new EnterstellarError(
        'ENS-4004',
        'forge',
        `Forged contract '${forgedName}' failed compilation with ${String(errorCount)} error(s). Rendering fallback.`,
        true,
    );
}

// ---------------------------------------------------------------------------
// ENS-4005: Custom Template Validation Failed
// ---------------------------------------------------------------------------

/**
 * Creates an error when a custom template fails structural validation (`ENS-4005`).
 *
 * Emitted during `forge.registerTemplate()` when the provided template schema
 * does not conform to the `ForgeTemplateSchema`. This is a developer error —
 * non-recoverable at runtime.
 *
 * @param templateName - The name of the invalid template.
 * @param violations - Human-readable list of validation failures.
 * @returns An `EnterstellarError` with code `'ENS-4005'`, module `'forge'`, recoverable `false`.
 *
 * @see Design Choice F3 — custom templates pass structural validation.
 */
export function templateValidationError(
    templateName: string,
    violations: readonly string[],
): EnterstellarError {
    return new EnterstellarError(
        'ENS-4005',
        'forge',
        `Custom template '${templateName}' failed validation: ${violations.join('; ')}`,
        false,
    );
}
