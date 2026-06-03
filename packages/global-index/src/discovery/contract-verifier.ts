/**
 * @module @enterstellar-ai/global-index/discovery/contract-verifier
 * @description Client-side contract verification for the Global Index.
 *
 * Provides a local, synchronous validation check against the canonical
 * `ComponentContractSchema` from `@enterstellar-ai/types`. Used as a **fail-fast
 * guard** before publishing contracts to the Global Index service —
 * catches obvious schema violations (missing fields, invalid types)
 * without a network round-trip.
 *
 * **Important:** This is NOT a replacement for the server-side
 * verification pipeline (GI3). The server runs the full compiler
 * verification (schema + tokens + a11y), and optionally the Enterstellar
 * Certified pipeline (headless Playwright + axe-core). This module
 * only validates the Zod schema shape.
 *
 * @see Design Choice GI3 — two-tier verification.
 * @see Design Choice T7 — Zod schemas alongside TS types.
 * @internal
 */

import { ComponentContractSchema } from '@enterstellar-ai/types';

import type { ContractVerification, ContractVerificationIssue } from '../types.js';

// ---------------------------------------------------------------------------
// Issue Mapping
// ---------------------------------------------------------------------------

/**
 * Converts a Zod validation issue into an Enterstellar `ContractVerificationIssue`.
 *
 * Maps the Zod `path` array (which can contain strings and numbers)
 * into a dot-path string (e.g., `'accessibility.role'`), and preserves
 * the Zod error message.
 *
 * @param issue - A single Zod validation issue.
 * @returns A formatted `ContractVerificationIssue`.
 *
 * @internal
 */
function mapZodIssue(issue: {
    readonly path: readonly PropertyKey[];
    readonly message: string;
}): ContractVerificationIssue {
    const path = issue.path.length > 0
        ? issue.path.map(String).join('.')
        : '(root)';

    return Object.freeze({
        path,
        message: issue.message,
    });
}

// ---------------------------------------------------------------------------
// verifyContract()
// ---------------------------------------------------------------------------

/**
 * Validates a contract against the canonical `ComponentContractSchema`.
 *
 * Performs a synchronous Zod `safeParse` on the provided contract data.
 * Returns a `ContractVerification` result indicating whether the contract
 * is valid, along with a list of any schema violations found.
 *
 * **This is a local check only.** It validates the data shape against
 * the Zod schema but does NOT:
 * - Run the full compiler pipeline (L3)
 * - Check design token compliance
 * - Run accessibility audits
 * - Generate screenshots (GI4)
 *
 * Those checks are performed server-side by the Global Index verification
 * pipeline (GI3).
 *
 * @param contract - The contract data to validate. Accepts `unknown` to
 *   safely handle any input — callers do not need to pre-cast.
 * @returns A `ContractVerification` with `valid` flag and issues list.
 *   The returned object is frozen (immutable).
 *
 * @example
 * ```ts
 * const result = verifyContract(myContract);
 * if (!result.valid) {
 *     console.error('Invalid contract:', result.issues);
 * }
 * ```
 */
export function verifyContract(contract: unknown): ContractVerification {
    const result = ComponentContractSchema.safeParse(contract);

    if (result.success) {
        return Object.freeze({
            valid: true,
            issues: Object.freeze([]),
        });
    }

    // Map Zod issues to Enterstellar verification issues
    const issues: readonly ContractVerificationIssue[] = Object.freeze(
        result.error.issues.map(mapZodIssue),
    );

    return Object.freeze({
        valid: false,
        issues,
    });
}

// ---------------------------------------------------------------------------
// isValidContract() — Type Guard
// ---------------------------------------------------------------------------

/**
 * Type guard that checks whether an unknown value is a structurally valid
 * `ComponentContract`.
 *
 * Delegates to `verifyContract()` internally. Useful for conditional
 * logic where a boolean check is more ergonomic than inspecting a
 * verification result.
 *
 * @param value - The value to check.
 * @returns `true` if the value passes Zod schema validation.
 *
 * @example
 * ```ts
 * if (isValidContract(data)) {
 *     // TypeScript now knows `data` matches ComponentContractSchema
 *     await index.publishContract(data);
 * }
 * ```
 */
export function isValidContract(value: unknown): boolean {
    return verifyContract(value).valid;
}
