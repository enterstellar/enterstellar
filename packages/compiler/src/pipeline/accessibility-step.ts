/**
 * @module @enterstellar-ai/compiler/pipeline/accessibility-step
 * @description Pipeline Step 4: Accessibility Validation and Auto-Injection.
 *
 * Validates that the compiled props satisfy the component contract's
 * accessibility requirements. When `autoAccessibility: true`, injects
 * missing `role` and `aria-*` attributes automatically.
 *
 * **Critical constraint (C10):** NEVER injects `tabindex`. Auto-injecting
 * `tabindex` is dangerous — it can trap keyboard users or destroy the
 * natural tab order. Focus management belongs to the component author.
 *
 * **C11 compliance:** AST-based lightweight check (no DOM dependency).
 * Full `axe-core` audits are deferred to `@enterstellar-ai/test` for CI testing.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C10 — role and aria-* only, per-component.
 * @see Design Choice C11 — AST-based in compiler, axe-core in @enterstellar-ai/test.
 */

import type { CompilationContext, CompilationStep } from '../types.js';
import { missingAccessibilityError } from '../errors.js';
import type { ComponentCategory } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Accessibility Attribute Derivation
// ---------------------------------------------------------------------------

/**
 * The 8 predefined `ComponentCategory` values, excluding `custom:*`.
 *
 * @see Design Choice R11 — predefined component categories
 */
type PredefinedCategory = Exclude<ComponentCategory, `custom:${string}`>;

/**
 * Default ARIA role mappings based on component category.
 *
 * When `autoAccessibility: true` and the props don't include a `role`,
 * the compiler injects a default role from this map based on the
 * component's category. These defaults follow WAI-ARIA best practices.
 *
 * **Compile-time sync guarantee:** The `satisfies` constraint ensures
 * every key is a valid `PredefinedCategory`. The exhaustiveness check
 * below ensures every `PredefinedCategory` is present as a key.
 * If `ComponentCategory` in `@enterstellar-ai/types` changes, `tsc` errors here.
 *
 * @see Design Choice C10 — per-component based on category and semantic role
 * @see Design Choice R11 — compile-time exhaustiveness via `satisfies`
 */
const CATEGORY_ROLE_DEFAULTS: Readonly<Record<PredefinedCategory, string>> = {
    'clinical': 'region',
    'admin': 'region',
    'navigation': 'navigation',
    'data-display': 'article',
    'form': 'form',
    'feedback': 'alert',
    'layout': 'group',
    'utility': 'complementary',
} satisfies Record<PredefinedCategory, string>;


/**
 * Derives a default ARIA role from the component's category.
 *
 * Falls back to `'region'` for unknown or custom categories.
 *
 * @param category - The component's category string.
 * @returns A WAI-ARIA role string.
 */
function deriveRoleFromCategory(category: string): string {
    // Handle custom categories (e.g., 'custom:dashboard')
    const baseCategory = category.startsWith('custom:')
        ? category
        : category;

    return (CATEGORY_ROLE_DEFAULTS as Readonly<Record<string, string>>)[baseCategory] ?? 'region';
}

// ---------------------------------------------------------------------------
// Accessibility Step
// ---------------------------------------------------------------------------

/**
 * Pipeline Step 4: Validates and optionally auto-injects accessibility attributes.
 *
 * **Sequence:**
 * 1. Reads `contract.accessibility` for the required `role` and `ariaLabel`.
 * 2. Checks if `context.props` already includes these attributes.
 * 3. If `autoAccessibility: true`: injects missing `role` and `aria-label`
 *    into `context.props`. Tracks injections in `context.accessibilityInjections`.
 * 4. If `autoAccessibility: false`: emits `ENS-2003` errors for missing attrs.
 * 5. **NEVER injects `tabindex`** — this is a hard constraint (C10).
 * 6. Calls `next()` to proceed to the trace step.
 *
 * @param context - The compilation context with `props`, `contract`, and config.
 * @param next - Invokes the downstream pipeline.
 * @returns The context with a11y attributes injected or errors added.
 *
 * @see Design Choice C10 — role and aria-* only, NO tabindex.
 * @see Design Choice C11 — lightweight AST-based check.
 *
 * @example
 * ```ts
 * const steps: NamedStep[] = [
 *   // ... resolve, parse, token ...
 *   { name: 'accessibility', execute: accessibilityStep },
 *   { name: 'trace', execute: traceStep },
 * ];
 * ```
 */
export const accessibilityStep: CompilationStep = async (
    context: CompilationContext,
    next: () => Promise<CompilationContext>,
): Promise<CompilationContext> => {
    const { contract, config } = context;
    const { accessibility } = contract;

    // --- 1. Validate and inject `role` ---

    const existingRole = context.props['role'];

    if (existingRole === undefined || existingRole === '') {
        if (config.autoAccessibility) {
            // Auto-inject role from contract or derive from category
            const role = accessibility.role !== ''
                ? accessibility.role
                : deriveRoleFromCategory(contract.category);

            context.props['role'] = role;
            context.accessibilityInjections.push('role');
        } else {
            // Report missing role as error
            context.errors.push(
                missingAccessibilityError('role', contract.name),
            );
        }
    }

    // --- 2. Validate and inject `aria-label` ---

    const existingAriaLabel = context.props['aria-label'];

    if (existingAriaLabel === undefined || existingAriaLabel === '') {
        if (config.autoAccessibility) {
            // Auto-inject ariaLabel from contract accessibility config
            const ariaLabel = accessibility.ariaLabel !== ''
                ? accessibility.ariaLabel
                : contract.description;

            context.props['aria-label'] = ariaLabel;
            context.accessibilityInjections.push('aria-label');
        } else {
            // Report missing aria-label as error
            context.errors.push(
                missingAccessibilityError('aria-label', contract.name),
            );
        }
    }

    // --- 3. Auto-inject `aria-live` for dynamic components ---

    if (
        config.autoAccessibility &&
        accessibility.announceOnUpdate &&
        context.props['aria-live'] === undefined
    ) {
        context.props['aria-live'] = 'polite';
        context.accessibilityInjections.push('aria-live');
    }

    // --- 4. HARD CONSTRAINT: Never inject tabindex (C10) ---
    // This is intentionally a no-op. The comment exists as documentation
    // and as a guard against future modifications. If someone adds tabindex
    // injection here, the PR review and this comment should catch it.
    //
    // > "Auto-injecting tabindex is dangerous: it can trap keyboard users
    // >  or destroy the natural tab order. Focus management belongs to the
    // >  component author, not the compiler." — Design Choice C10

    return next();
};
