/**
 * @module @enterstellar-ai/types/token
 * @description Design token types and resolver interface.
 *
 * Design tokens are symbolic references (e.g., `'token:danger'`) that the
 * compiler validates and the renderer resolves to concrete CSS values at
 * render time. This keeps contracts platform-agnostic and theme-portable.
 *
 * @see Bible §3.1b
 * @see Design Choices R13, R14
 * @see Appendix F T3 (W3C DTCG compliance)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Design Token Set
// ---------------------------------------------------------------------------

/**
 * A map of token names to symbolic token values.
 *
 * Values follow the `token:{name}` convention (e.g., `'token:danger'`,
 * `'token:card-bg'`). Actual CSS values are resolved at render time
 * by the platform-specific `TokenResolver`.
 *
 * @see Design Choice R13 — tokens resolved at render time, not registration.
 * @see Design Choice R14 — no theming in DesignTokenSet; renderer handles themes.
 */
export type DesignTokenSet = Readonly<Record<string, string>>;

/**
 * Zod schema for validating a `DesignTokenSet` at runtime.
 * Ensures all values are non-empty strings.
 */
export const DesignTokenSetSchema: z.ZodType<Record<string, string>> = z.record(
    z.string(),
    z.string().min(1, 'Token value must be a non-empty string.'),
);

// ---------------------------------------------------------------------------
// Token Resolution Context
// ---------------------------------------------------------------------------

/**
 * Contextual information provided to the `TokenResolver` during
 * token resolution. Enables platform-aware and theme-aware lookups.
 */
export type TokenResolverContext = {
    /** Active platform for resolution (e.g., `'web'`, `'native'`, `'desktop'`). */
    readonly platform?: string;
    /** Active theme (e.g., `'light'`, `'dark'`). */
    readonly theme?: string;
    /** Display density (e.g., `'compact'`, `'comfortable'`, `'spacious'`). */
    readonly density?: string;
};

// ---------------------------------------------------------------------------
// Token Resolver Interface
// ---------------------------------------------------------------------------

/**
 * Resolves symbolic design token paths to concrete CSS (or platform-specific) values.
 *
 * Implementations map W3C DTCG-compliant token paths to concrete values
 * based on the active platform, theme, and density context.
 *
 * @see Appendix F T3 — W3C DTCG path mapping.
 * @see Design Choice R13 — resolution happens at render time.
 * @see Design Choice R14 — the resolver handles light/dark mode, not the contract.
 *
 * @example
 * ```ts
 * const resolver: TokenResolver = {
 *   resolve: (path, ctx) => {
 *     if (path === 'token:danger') {
 *       return ctx?.theme === 'dark' ? '#ff4444' : '#ff0000';
 *     }
 *     return undefined;
 *   },
 *   validate: (path) => path.startsWith('token:'),
 * };
 * ```
 */
export interface TokenResolver {
    /**
     * Resolves a token path to a concrete value.
     *
     * @param tokenPath - The symbolic token path (e.g., `'token:danger'`).
     * @param context - Optional resolution context (platform, theme, density).
     * @returns The resolved concrete value, or `undefined` if the token is unknown.
     */
    resolve(tokenPath: string, context?: TokenResolverContext): string | undefined;

    /**
     * Validates whether a token path exists in the active token set.
     *
     * @param tokenPath - The symbolic token path to validate.
     * @returns `true` if the token path is known and resolvable.
     */
    validate(tokenPath: string): boolean;
}
