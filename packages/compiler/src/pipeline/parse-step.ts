/**
 * @module @enterstellar-ai/compiler/pipeline/parse-step
 * @description Pipeline Step 2: Zod Schema Parse with unknown prop stripping.
 *
 * Validates `intent.props` against the component contract's Zod schema.
 * Unknown props are silently stripped (P10) and logged as `ENS-2008` warnings.
 * Schema validation failures produce `ENS-2001` errors with fix suggestions.
 *
 * This step is the core type-checking gate of the compiler — it guarantees
 * that only schema-compliant props reach the component at render time.
 *
 * **L3 compliance:** Compiler never bypassed. Every prop passes through Zod.
 * **L15 compliance:** Zero framework imports. Uses Zod (peer dep) only.
 *
 * @see Design Choice P10 — strip unknown props via Zod `.strip()`.
 * @see Design Choice C15 — errors include machine-readable fix suggestions.
 */

import { z } from 'zod';

import type { CompilationContext, CompilationStep } from '../types.js';
import { schemaParseError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detects props that were present in the raw input but absent from the
 * parsed output. These are the "stripped" (hallucinated) props.
 *
 * @param rawKeys - Keys from the original intent props.
 * @param parsedKeys - Keys from the Zod-parsed output.
 * @returns Array of stripped key names.
 */
function detectStrippedProps(
    rawKeys: readonly string[],
    parsedKeys: readonly string[],
): string[] {
    const parsedSet = new Set(parsedKeys);
    return rawKeys.filter((key) => !parsedSet.has(key));
}

/**
 * Maps a single Zod issue to a `CompilationError` with code `ENS-2001`.
 *
 * Extracts the dot-path, received value, expected type, and generates
 * a machine-readable fix suggestion where possible.
 *
 * @param issue - A single Zod validation issue.
 * @returns A `CompilationError` with code `'ENS-2001'`.
 */
function zodIssueToCompilationError(
    issue: z.core.$ZodIssue,
): ReturnType<typeof schemaParseError> {
    const path = issue.path.length > 0
        ? `props.${issue.path.join('.')}`
        : 'props';

    // Build expected description from the Zod issue
    const expected = 'expected' in issue
        ? String((issue as unknown as Record<string, unknown>)['expected'])
        : issue.message;

    // Build received value description
    const received = 'received' in issue
        ? (issue as unknown as Record<string, unknown>)['received']
        : undefined;

    // Build fix suggestion — expected is always a string at this point
    const fix = { field: path, was: received, shouldBe: expected };

    return schemaParseError(path, received, expected, fix);
}

// ---------------------------------------------------------------------------
// Parse Step
// ---------------------------------------------------------------------------

/**
 * Pipeline Step 2: Validates intent props against the contract's Zod schema.
 *
 * **Sequence:**
 * 1. Attempts `safeParse` on `context.props` using `contract.props` schema.
 * 2. On success: replaces `context.props` with parsed output (stripped of unknowns).
 * 3. Detects and logs stripped props as `ENS-2008` warnings (P10).
 * 4. On failure: maps each Zod issue to `ENS-2001` errors, does NOT short-circuit
 *    (downstream steps may add more errors for the self-correction loop).
 * 5. Calls `next()` to proceed to the token enforcement step.
 *
 * @param context - The compilation context with `props` and `contract`.
 * @param next - Invokes the downstream pipeline.
 * @returns The context with parsed props (on success) or accumulated errors.
 *
 * @see Design Choice P10 — strip unknown props, log as warning.
 * @see Design Choice C15 — errors include fix suggestions.
 *
 * @example
 * ```ts
 * const steps: NamedStep[] = [
 *   { name: 'resolve', execute: resolveStep },
 *   { name: 'parse', execute: parseStep },
 *   // ...
 * ];
 * ```
 */
export const parseStep: CompilationStep = async (
    context: CompilationContext,
    next: () => Promise<CompilationContext>,
): Promise<CompilationContext> => {
    const { contract } = context;
    const rawProps = context.props;
    const rawKeys = Object.keys(rawProps);

    // Wrap the contract schema with .strip() to remove unknown fields.
    // Zod v4: z.object().strip() silently removes unrecognized keys.
    // For non-object schemas (unlikely but defensive), fall through to raw parse.
    let schema: z.ZodType = contract.props;

    if (schema instanceof z.ZodObject) {
        schema = schema.strip();
    }

    const result = schema.safeParse(rawProps);

    if (result.success) {
        // Replace context props with the validated + stripped output
        const parsed = result.data as Record<string, unknown>;
        context.props = parsed;

        // Detect stripped props (hallucinated by the LLM)
        const parsedKeys = Object.keys(parsed);
        const stripped = detectStrippedProps(rawKeys, parsedKeys);

        if (stripped.length > 0) {
            context.strippedProps = stripped;
            context.warnings.push({
                code: 'ENS-2008',
                path: 'props',
                message: `Unknown props stripped: [${stripped.join(', ')}].`,
            });
        }
    } else {
        // Map each Zod issue to a CompilationError
        for (const issue of result.error.issues) {
            context.errors.push(zodIssueToCompilationError(issue));
        }
    }

    return next();
};
