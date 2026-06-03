/**
 * @module @enterstellar-ai/registry/define-component
 * @description `defineComponent()` — the factory for creating ComponentContracts.
 *
 * This is the primary authoring API for Enterstellar component developers. It accepts
 * the domain-relevant fields, auto-generates the `id` and `_meta`, validates
 * against all 10 registration-time rules, and returns a **frozen** contract.
 *
 * **Fail fast:** Validation runs immediately (Design Choice R5). The developer
 * sees the error at the call site where they defined the contract, not deep
 * inside registry initialization.
 *
 * **Frozen output:** `Object.freeze()` prevents accidental mutation after
 * definition (Design Choice R4). The contract is data, not behavior.
 *
 * @see Implementation Bible §5.1
 * @see Design Choices R4, R5, R6
 *
 * @example
 * ```ts
 * import { defineComponent } from '@enterstellar-ai/registry';
 * import { z } from 'zod';
 *
 * const PatientVitals = defineComponent({
 *   name: 'PatientVitals',
 *   description: 'Displays real-time patient vital signs with risk stratification.',
 *   category: 'clinical',
 *   tags: ['patient', 'vitals', 'monitoring'],
 *   props: z.object({
 *     patientId: z.string().uuid(),
 *     riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
 *   }),
 *   tokens: { statusColor: 'token:danger', cardBg: 'token:card-bg' },
 *   accessibility: { role: 'region', ariaLabel: 'Patient vitals', announceOnUpdate: true },
 *   states: {
 *     loading: 'VitalsLoading',
 *     error: 'VitalsError',
 *     empty: 'VitalsEmpty',
 *     ready: 'PatientVitals',
 *   },
 *   examples: [
 *     { intent: 'Show patient vitals', props: { patientId: '123e4567-e89b-12d3-a456-426614174000', riskLevel: 'high' } },
 *   ],
 * });
 * ```
 */

import { createComponentId } from '@enterstellar-ai/types';
import type { ComponentContract } from '@enterstellar-ai/types';

import type { ComponentContractInput } from './types.js';
import { validateContract } from './validators/contract-validator.js';
import {
    invalidNameError,
    descriptionTooLongError,
    invalidTagCountError,
    missingStateError,
    invalidReadyStateError,
    invalidTokenValueError,
    invalidPropsSchemaError,
    invalidAriaRoleError,
    missingDescriptionError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Error Code → Factory Mapping
// ---------------------------------------------------------------------------

/**
 * Maps a validation rule ID to the corresponding `EnterstellarError` factory.
 * Used to throw the exact error for the first violation found.
 */
function throwForViolation(
    rule: string,
    contract: ComponentContractInput,
): never {
    switch (rule) {
        case 'R1':
            throw invalidNameError(contract.name);
        case 'R2':
            throw descriptionTooLongError(contract.description.length);
        case 'R3':
            throw invalidTagCountError(contract.tags.length);
        case 'R4': {
            // Find the first missing state
            const states = ['loading', 'error', 'empty', 'ready'] as const;
            for (const state of states) {
                if (!contract.states[state].trim()) {
                    throw missingStateError(state);
                }
            }
            // Fallback (should not reach here if validation reported R4)
            throw missingStateError('unknown');
        }
        case 'R5':
            throw invalidReadyStateError(contract.name, contract.states.ready);
        case 'R6': {
            // Find the first invalid token
            for (const [key, value] of Object.entries(contract.tokens)) {
                if (!value.startsWith('token:')) {
                    throw invalidTokenValueError(key, value);
                }
            }
            // Fallback
            throw invalidTokenValueError('unknown', '');
        }
        case 'R7':
            throw invalidPropsSchemaError();
        case 'R8':
            throw invalidAriaRoleError(contract.accessibility.role);
        case 'R9':
            throw missingDescriptionError();
        default:
            // Unreachable by design — all rule IDs (R1–R9) are handled above.
            // Plain Error, not EnterstellarError: this is an internal invariant violation.
            throw new Error(
                `[Enterstellar Internal] Unknown validation rule: '${rule}'. ` +
                'All known rules should be handled in throwForViolation().',
            );
    }
}

// ---------------------------------------------------------------------------
// defineComponent() Factory
// ---------------------------------------------------------------------------

/**
 * Creates a validated, frozen `ComponentContract` from developer input.
 *
 * **Auto-generated fields:**
 * - `id` — Branded `ComponentId` derived from `name` via `createComponentId()`.
 * - `_meta.forged` — `false` (hand-authored, not Forge-generated).
 * - `_meta.version` — `'1.0.0'` (initial version).
 * - `_meta.createdAt` — ISO 8601 timestamp at creation time.
 *
 * **Validation:** All 10 rules (R1–R9) are checked. Throws `EnterstellarError` on the
 * first violation with the exact error code from the `ENS-1xxx` range.
 *
 * **Immutability:** The returned contract is `Object.freeze()`-d. All fields
 * are `readonly` at the type level and frozen at runtime. Accidental mutation
 * after definition is prevented (Design Choice R4).
 *
 * @param input - A `ComponentContractInput` with all domain-relevant fields.
 * @returns A frozen `ComponentContract` with auto-generated `id` and `_meta`.
 * @throws {EnterstellarError} If any registration-time validation rule fails.
 *
 * @see Design Choice R4 — returns `Object.freeze(contract)`.
 * @see Design Choice R5 — validate immediately (fail fast).
 * @see Design Choice R6 — no `render` field on the contract.
 */
export function defineComponent(input: ComponentContractInput): ComponentContract {
    // ----- Validate all rules -----
    const result = validateContract(input);

    if (!result.valid) {
        // Throw on the first violation (fail fast at the call site)
        const firstViolation = result.violations[0];
        if (firstViolation !== undefined) {
            throwForViolation(firstViolation.rule, input);
        }
    }

    // ----- Build the full contract -----
    const contract: ComponentContract = {
        ...input,
        id: createComponentId(input.name),
        _meta: {
            forged: false,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
        },
    };

    // ----- Freeze and return -----
    return Object.freeze(contract);
}
