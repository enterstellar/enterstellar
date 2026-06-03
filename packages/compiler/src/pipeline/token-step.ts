/**
 * @module @enterstellar-ai/compiler/pipeline/token-step
 * @description Pipeline Step 3: Design Token Compliance Enforcement.
 *
 * Validates that all design token references in `contract.tokens` map to
 * valid tokens in the registry's `DesignTokenSet`. Rejects hallucinated
 * tokens and raw CSS values, even if the raw value happens to match a
 * token's resolved value today (C9: tokens are aliases, not values).
 *
 * **Strict mode** (default, C8): rejects invalid tokens with `ENS-2002`.
 * **Non-strict mode**: coerces to nearest valid token by semantic category
 * and logs `ENS-2007` warning. Coercion is the safety net, not the happy path.
 *
 * **L15 compliance:** Zero framework imports.
 * **R13 compliance:** Compiler validates token existence, NOT resolution.
 *   Actual CSS values are resolved at render time by the renderer.
 *
 * @see Design Choice C8 — `strictDesignTokens: true` rejects, `false` coerces.
 * @see Design Choice C9 — raw CSS values always rejected.
 * @see Design Choice R13 — tokens resolved at render time.
 */

import type { CompilationContext, CompilationStep } from '../types.js';
import { invalidTokenError } from '../errors.js';
import {
    isTokenReference,
    tokenExists,
    findNearestToken,
} from '../utils/token-utils.js';


// ---------------------------------------------------------------------------
// Token Step
// ---------------------------------------------------------------------------

/**
 * Pipeline Step 3: Validates design token compliance in compiled props.
 *
 * Iterates over the `contract.tokens` map, which declares which prop fields
 * should contain design token references. For each token field:
 *
 * 1. Checks that the prop value is a `token:*` reference (not a raw CSS value).
 * 2. Checks that the referenced token exists in the registry's `DesignTokenSet`.
 * 3. In strict mode: emits `ENS-2002` error on failure.
 * 4. In non-strict mode: coerces to nearest valid token, emits `ENS-2007` warning.
 *
 * @param context - The compilation context with `props`, `contract`, and config.
 * @param next - Invokes the downstream pipeline.
 * @returns The context with token errors/warnings added.
 *
 * @see Design Choice C8 — strict vs. non-strict token enforcement.
 * @see Design Choice C9 — raw CSS values always rejected.
 */
export const tokenStep: CompilationStep = async (
    context: CompilationContext,
    next: () => Promise<CompilationContext>,
): Promise<CompilationContext> => {
    const { contract, config, designTokens } = context;
    const contractTokens = contract.tokens;

    // If the contract declares no token fields, skip validation
    if (Object.keys(contractTokens).length === 0) {
        return next();
    }

    for (const [fieldPath, expectedTokenRef] of Object.entries(contractTokens)) {
        // The contract's `tokens` map declares which fields should be tokens.
        // `fieldPath` is the prop key, `expectedTokenRef` is the expected token value.
        // The actual prop value at `fieldPath` must be a valid token reference.
        const actualValue = context.props[fieldPath];

        // Skip if the prop field doesn't exist (may have been stripped by parse step)
        if (actualValue === undefined) {
            continue;
        }

        // Check 1: Is the value a token reference at all?
        if (!isTokenReference(actualValue)) {
            // Stringify the value safely — token fields should be strings,
            // but unknown values from LLM props might be anything.
            const displayValue = typeof actualValue === 'string'
                ? actualValue
                : JSON.stringify(actualValue);

            // Raw CSS value or non-token string — always reject (C9)
            if (config.strictDesignTokens) {
                context.errors.push(
                    invalidTokenError(
                        `props.${fieldPath}`,
                        displayValue,
                        expectedTokenRef,
                    ),
                );
            } else {
                // Non-strict: coerce to the expected token from the contract
                context.props[fieldPath] = expectedTokenRef;
                context.tokenCoercions += 1;
                context.warnings.push({
                    code: 'ENS-2007',
                    path: `props.${fieldPath}`,
                    message: `Token coerced: '${displayValue}' → '${expectedTokenRef}'.`,
                });
            }
            continue;
        }

        // Check 2: Does the referenced token exist in the design token set?
        if (!tokenExists(actualValue, designTokens)) {
            if (config.strictDesignTokens) {
                // Find nearest for the error suggestion
                const nearest = findNearestToken(actualValue, designTokens);
                context.errors.push(
                    invalidTokenError(
                        `props.${fieldPath}`,
                        actualValue,
                        nearest,
                    ),
                );
            } else {
                // Non-strict: coerce to nearest valid token
                const nearest = findNearestToken(actualValue, designTokens);
                const coercedTo = nearest ?? expectedTokenRef;
                context.props[fieldPath] = coercedTo;
                context.tokenCoercions += 1;
                context.warnings.push({
                    code: 'ENS-2007',
                    path: `props.${fieldPath}`,
                    message: `Token coerced: '${actualValue}' → '${coercedTo}'.`,
                });
            }
        }
    }

    return next();
};
