/**
 * @module @enterstellar-ai/compiler/utils/token-utils
 * @description Shared design token validation and matching utilities.
 *
 * Extracted from `pipeline/token-step.ts` to enable reuse across the pipeline
 * (Step 3: token enforcement) and the deterministic self-correction module
 * (Tier 1: token nearest-match strategy).
 *
 * These utilities operate exclusively on `DesignTokenSet` (a `Readonly<Record<string, string>>`
 * from `@enterstellar-ai/types`) and `token:*` string references. They contain no framework
 * imports, no side effects, and no state — pure functions only.
 *
 * **L15 compliance:** Zero framework imports.
 * **R13 compliance:** Token existence validation only — CSS resolution is deferred
 *   to the renderer at render time.
 *
 * @see Design Choice C8 — strict vs. non-strict token enforcement.
 * @see Design Choice C9 — raw CSS values always rejected.
 * @see Design Choice R13 — tokens resolved at render time.
 * @see Design Choice SC-04 — Tier 1 includes `token-nearest` strategy.
 */

import type { DesignTokenSet } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Token Reference Detection
// ---------------------------------------------------------------------------

/**
 * Checks whether a value is a valid token reference (starts with `token:`).
 *
 * Token references in the Enterstellar ecosystem use the `token:{name}` format
 * (e.g., `'token:danger'`, `'token:card-bg'`). Any string not starting with
 * `token:` is considered a raw CSS value or invalid reference.
 *
 * @param value - The value to check. Accepts `unknown` because LLM-provided
 *   prop values may be any type.
 * @returns `true` if the value is a string starting with `'token:'`.
 *
 * @example
 * ```ts
 * isTokenReference('token:danger');   // true
 * isTokenReference('#ff0000');        // false
 * isTokenReference(42);              // false
 * ```
 */
export function isTokenReference(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('token:');
}

// ---------------------------------------------------------------------------
// Token Existence Check
// ---------------------------------------------------------------------------

/**
 * Checks whether a token reference exists in the design token set.
 *
 * Handles prefix inconsistency: `DesignTokenSet` keys may or may not include
 * the `token:` prefix. This function checks both forms — the full reference
 * (e.g., `'token:danger'`) and the stripped name (e.g., `'danger'`).
 *
 * @param tokenRef - The token reference to check (e.g., `'token:danger'`).
 * @param designTokens - The registry's design token set.
 * @returns `true` if the token exists under either naming convention.
 *
 * @example
 * ```ts
 * const tokens: DesignTokenSet = { danger: '#dc2626' };
 * tokenExists('token:danger', tokens); // true — matches stripped name
 * tokenExists('token:unknown', tokens); // false
 * ```
 */
export function tokenExists(
    tokenRef: string,
    designTokens: DesignTokenSet,
): boolean {
    // Token references in contracts use the `token:{name}` format.
    // The DesignTokenSet keys may or may not include the `token:` prefix.
    // Try both: with and without prefix.
    if (tokenRef in designTokens) {
        return true;
    }

    // Strip prefix and check raw name
    const rawName = tokenRef.replace(/^token:/, '');
    return rawName in designTokens;
}

// ---------------------------------------------------------------------------
// Semantic Category Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the semantic category from a token name.
 *
 * Token names follow `token:{category}` or `token:{category}-{variant}`
 * patterns (e.g., `token:danger`, `token:danger-500`, `token:card-bg`).
 * The semantic category is the first segment before any `-` suffix.
 *
 * For tokens without a dash separator, the entire stripped name is returned
 * as the category (e.g., `'token:danger'` → `'danger'`).
 *
 * @param tokenRef - The token reference (with or without `token:` prefix).
 * @returns The semantic category string.
 *
 * @example
 * ```ts
 * getTokenCategory('token:danger');     // 'danger'
 * getTokenCategory('token:danger-500'); // 'danger'
 * getTokenCategory('token:card-bg');    // 'card'
 * getTokenCategory('danger');           // 'danger' (prefix-less input)
 * ```
 */
export function getTokenCategory(tokenRef: string): string {
    const name = tokenRef.replace(/^token:/, '');
    const dashIndex = name.indexOf('-');
    if (dashIndex === -1) {
        return name;
    }
    return name.substring(0, dashIndex);
}

// ---------------------------------------------------------------------------
// Nearest Token Matching
// ---------------------------------------------------------------------------

/**
 * Finds the nearest valid token by semantic category match, then falls back
 * to the first available token.
 *
 * **Matching strategy (deterministic):**
 * 1. Extract the semantic category from the invalid token (e.g., `'danger'`
 *    from `'token:danger-xyz'`).
 * 2. Filter all tokens in the `DesignTokenSet` that share the same category.
 * 3. Return the first category match (deterministic — `Object.keys()` insertion order).
 * 4. If no category match exists, return the first available token as a
 *    last-resort fallback.
 * 5. If the token set is empty, return `undefined`.
 *
 * Used in two contexts:
 * - **Pipeline (non-strict mode):** `token-step.ts` coerces invalid tokens inline.
 * - **Tier 1 correction (strict mode):** `deterministic-correction.ts` applies
 *   token nearest-match after pipeline failure in strict mode.
 *
 * @param invalidToken - The invalid token reference (e.g., `'token:denger'`).
 * @param designTokens - The registry's design token set.
 * @returns The nearest valid token (with `token:` prefix), or `undefined`
 *   if the token set is empty.
 *
 * @see Design Choice C8 — coercion is the safety net, not the happy path.
 * @see Design Choice SC-04 — Tier 1 `token-nearest` strategy.
 *
 * @example
 * ```ts
 * const tokens: DesignTokenSet = {
 *   danger: '#dc2626',
 *   'danger-500': '#ef4444',
 *   success: '#16a34a',
 * };
 *
 * findNearestToken('token:denger', tokens);   // 'token:danger' (category match)
 * findNearestToken('token:unknown', tokens);  // 'token:danger' (first available)
 * findNearestToken('token:xyz', {});           // undefined (empty set)
 * ```
 */
export function findNearestToken(
    invalidToken: string,
    designTokens: DesignTokenSet,
): string | undefined {
    const targetCategory = getTokenCategory(invalidToken);
    const tokenKeys = Object.keys(designTokens);

    // First pass: find tokens in the same semantic category
    const categoryMatches = tokenKeys.filter((key) => {
        const keyCategory = getTokenCategory(
            key.startsWith('token:') ? key : `token:${key}`,
        );
        return keyCategory === targetCategory;
    });

    if (categoryMatches.length > 0) {
        // Return the first category match (deterministic — insertion order)
        const match = categoryMatches[0];
        if (match !== undefined) {
            return match.startsWith('token:') ? match : `token:${match}`;
        }
    }

    // Second pass: no category match — return the first available token
    const firstKey = tokenKeys[0];
    if (firstKey !== undefined) {
        return firstKey.startsWith('token:') ? firstKey : `token:${firstKey}`;
    }

    return undefined;
}
