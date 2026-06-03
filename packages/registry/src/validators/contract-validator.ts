/**
 * @module @enterstellar-ai/registry/validators/contract-validator
 * @description Orchestrates all 10 registration-time validation rules.
 *
 * `validateContract()` runs every rule function from `validation-rules.ts`
 * and collects all violations into a single `ValidationResult`. Used by:
 * - `defineComponent()` — throws `EnterstellarError` on first violation.
 * - `registry.validate()` — returns all violations without throwing.
 *
 * @see Design Choice R7 — all rules always enforced (no toggles).
 * @see Design Choice R5 — validate immediately in `defineComponent()`.
 */

import type { ComponentContract } from '@enterstellar-ai/types';

import type { ValidationResult, ValidationViolation } from '../types.js';
import {
    validatePascalCase,
    validateDescriptionPresence,
    validateDescriptionLength,
    validateTags,
    validateStates,
    validateTokens,
    validatePropsSchema,
    validateAriaRole,
} from './validation-rules.js';

// ---------------------------------------------------------------------------
// Contract Validator
// ---------------------------------------------------------------------------

/**
 * Validates a `ComponentContract` against all 10 registration-time rules.
 *
 * Rules are executed in a deterministic order. All violations are collected
 * (no early exit) so the developer gets a complete error report. Each
 * violation maps to a specific rule ID (R1–R9) and an `ENS-1xxx` error code.
 *
 * **Rule execution order:**
 * 1. R1  — PascalCase name
 * 2. R9  — Description presence
 * 3. R2  — Description length (≤120 chars)
 * 4. R3  — Tag count (1–10)
 * 5. R7  — Props is a valid Zod schema
 * 6. R6  — All token values start with `token:`
 * 7. R8  — Valid WAI-ARIA role
 * 8. R4  — All lifecycle states present
 * 9. R5  — `states.ready` references own name
 *
 * Note: R4 and R5 are combined in `validateStates()` for efficiency.
 * R10 (duplicate name detection) is handled by `createRegistry.register()`,
 * not by this validator — it requires registry context, not just the contract.
 *
 * @param contract - The `ComponentContract` to validate. May be a full
 *   contract (with `id` and `_meta`) or a partial input being validated
 *   during `defineComponent()`.
 * @returns A `ValidationResult` with all violations (if any).
 *
 * @example
 * ```ts
 * const result = validateContract(contract);
 * if (!result.valid) {
 *   console.error('Violations:', result.violations);
 * }
 * ```
 */
export function validateContract(
    contract: Pick<
        ComponentContract,
        'name' | 'description' | 'tags' | 'props' | 'tokens' | 'accessibility' | 'states'
    >,
): ValidationResult {
    const violations: ValidationViolation[] = [];

    // R1: PascalCase name
    const nameViolation = validatePascalCase(contract.name);
    if (nameViolation !== null) {
        violations.push(nameViolation);
    }

    // R9: Description presence (check before length)
    const descPresenceViolation = validateDescriptionPresence(contract.description);
    if (descPresenceViolation !== null) {
        violations.push(descPresenceViolation);
    } else {
        // R2: Description length — only check if description is present
        const descLengthViolation = validateDescriptionLength(contract.description);
        if (descLengthViolation !== null) {
            violations.push(descLengthViolation);
        }
    }

    // R3: Tag count (1–10)
    const tagViolation = validateTags(contract.tags);
    if (tagViolation !== null) {
        violations.push(tagViolation);
    }

    // R7: Props is a Zod schema
    const propsViolation = validatePropsSchema(contract.props);
    if (propsViolation !== null) {
        violations.push(propsViolation);
    }

    // R6: Token values start with 'token:'
    const tokenViolation = validateTokens(contract.tokens);
    if (tokenViolation !== null) {
        violations.push(tokenViolation);
    }

    // R8: Valid WAI-ARIA role
    const ariaViolation = validateAriaRole(contract.accessibility.role);
    if (ariaViolation !== null) {
        violations.push(ariaViolation);
    }

    // R4 + R5: All lifecycle states present + states.ready = component name
    const statesViolation = validateStates(contract.states, contract.name);
    if (statesViolation !== null) {
        violations.push(statesViolation);
    }

    return {
        valid: violations.length === 0,
        violations,
    };
}
