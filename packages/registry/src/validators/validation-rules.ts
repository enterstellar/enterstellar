/**
 * @module @enterstellar-ai/registry/validators/validation-rules
 * @description Individual validation rule functions for ComponentContract.
 *
 * Each function validates a single aspect of the contract and returns
 * a `ValidationViolation` if the contract fails that check, or `null`
 * if valid. The rules are composed by `contract-validator.ts`.
 *
 * **Rules are always enforced** — no configurable toggles (Design Choice R7).
 *
 * @see Implementation Bible §5.1 — Registration rules R1–R10
 * @see Design Choice R7 — all rules always enforced
 */

import type { ValidationViolation } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * PascalCase validation regex.
 *
 * Matches names starting with an uppercase ASCII letter, followed by
 * one or more alphanumeric characters. Multi-word names like
 * `PatientVitals` and `GenericCard` pass, while `patientVitals`,
 * `patient_vitals`, and `_Foo` fail.
 */
const PASCAL_CASE_PATTERN = /^[A-Z][A-Za-z0-9]+$/;

/**
 * Set of valid WAI-ARIA roles for accessibility validation (R8).
 *
 * This set covers the most common abstract, widget, document structure,
 * and landmark roles from the WAI-ARIA 1.2 specification. It is not
 * exhaustive of every ARIA role but covers all roles relevant to UI
 * components that Enterstellar would render.
 *
 * @see https://www.w3.org/TR/wai-aria-1.2/#role_definitions
 */
const VALID_ARIA_ROLES: ReadonlySet<string> = new Set([
    // Widget roles
    'alert',
    'alertdialog',
    'button',
    'checkbox',
    'combobox',
    'dialog',
    'grid',
    'gridcell',
    'link',
    'listbox',
    'log',
    'marquee',
    'menu',
    'menubar',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'progressbar',
    'radio',
    'radiogroup',
    'scrollbar',
    'searchbox',
    'separator',
    'slider',
    'spinbutton',
    'status',
    'switch',
    'tab',
    'tablist',
    'tabpanel',
    'textbox',
    'timer',
    'toolbar',
    'tooltip',
    'tree',
    'treegrid',
    'treeitem',
    // Document structure roles
    'article',
    'cell',
    'columnheader',
    'definition',
    'directory',
    'document',
    'feed',
    'figure',
    'group',
    'heading',
    'img',
    'list',
    'listitem',
    'math',
    'none',
    'note',
    'presentation',
    'row',
    'rowgroup',
    'rowheader',
    'table',
    'term',
    // Landmark roles
    'banner',
    'complementary',
    'contentinfo',
    'form',
    'main',
    'navigation',
    'region',
    'search',
    // Live region roles
    'application',
    'generic',
    'meter',
]);

/**
 * Required lifecycle states per L9.
 * Every ComponentContract must define all four.
 */
const REQUIRED_STATES = ['loading', 'error', 'empty', 'ready'] as const;

// ---------------------------------------------------------------------------
// Rule Functions
// ---------------------------------------------------------------------------

/**
 * **R1:** Validates that the component name is PascalCase.
 *
 * @param name - The component name to check.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validatePascalCase(name: string): ValidationViolation | null {
    if (!PASCAL_CASE_PATTERN.test(name)) {
        return {
            rule: 'R1',
            field: 'name',
            message: `Component name must be PascalCase: got '${name}'.`,
        };
    }
    return null;
}

/**
 * **R9:** Validates that the description is non-empty.
 *
 * @param description - The description string to check.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validateDescriptionPresence(description: string): ValidationViolation | null {
    if (!description.trim()) {
        return {
            rule: 'R9',
            field: 'description',
            message: 'Description is required.',
        };
    }
    return null;
}

/**
 * **R2:** Validates that the description is 120 characters or fewer.
 *
 * @param description - The description string to check.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validateDescriptionLength(description: string): ValidationViolation | null {
    if (description.length > 120) {
        return {
            rule: 'R2',
            field: 'description',
            message: `Description exceeds 120 characters (${String(description.length)}).`,
        };
    }
    return null;
}

/**
 * **R3:** Validates that tags has 1–10 entries.
 * Overlap across components is expected (R12).
 *
 * @param tags - The tags array to check.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validateTags(tags: readonly string[]): ValidationViolation | null {
    if (tags.length < 1 || tags.length > 10) {
        return {
            rule: 'R3',
            field: 'tags',
            message: `Tags must have 1–10 entries, got ${String(tags.length)}.`,
        };
    }
    return null;
}

/**
 * **R4 + R5:** Validates that all four lifecycle states are present and
 * that `states.ready` references the component's own name.
 *
 * @param states - The lifecycle states object to check.
 * @param componentName - The component's PascalCase name.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validateStates(
    states: { readonly loading: string; readonly error: string; readonly empty: string; readonly ready: string },
    componentName: string,
): ValidationViolation | null {
    // R4: Check all required states are present and non-empty
    for (const state of REQUIRED_STATES) {
        const value = states[state];
        if (!value.trim()) {
            return {
                rule: 'R4',
                field: `states.${state}`,
                message: `Missing required lifecycle state: '${state}'.`,
            };
        }
    }

    // R5: states.ready must reference the component's own name
    if (states.ready !== componentName) {
        return {
            rule: 'R5',
            field: 'states.ready',
            message: `states.ready must reference the component's own name: expected '${componentName}', got '${states.ready}'.`,
        };
    }

    return null;
}

/**
 * **R6:** Validates that all token values start with `'token:'`.
 * Tokens are symbolic references resolved at render time (R13).
 *
 * @param tokens - The design token record to check.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validateTokens(tokens: Readonly<Record<string, string>>): ValidationViolation | null {
    for (const [key, value] of Object.entries(tokens)) {
        if (!value.startsWith('token:')) {
            return {
                rule: 'R6',
                field: `tokens.${key}`,
                message: `Token value must start with 'token:': key '${key}' has value '${value}'.`,
            };
        }
    }
    return null;
}

/**
 * **R7:** Validates that props is a Zod schema with a `safeParse` method.
 *
 * The `ComponentContract.props` field is typed as `z.ZodType`. This check
 * verifies at runtime that the value is actually a Zod schema by duck-typing
 * the `safeParse` method — the minimal contract needed by the compiler.
 *
 * @param props - The value to check.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validatePropsSchema(props: unknown): ValidationViolation | null {
    if (
        props === null ||
        props === undefined ||
        typeof props !== 'object' ||
        !('safeParse' in props) ||
        typeof (props as Record<string, unknown>)['safeParse'] !== 'function'
    ) {
        return {
            rule: 'R7',
            field: 'props',
            message: 'Props must be a Zod schema with a safeParse method.',
        };
    }
    return null;
}

/**
 * **R8:** Validates that the accessibility role is a known WAI-ARIA role.
 *
 * @param role - The ARIA role string to check.
 * @returns A `ValidationViolation` or `null` if valid.
 */
export function validateAriaRole(role: string): ValidationViolation | null {
    if (!VALID_ARIA_ROLES.has(role)) {
        return {
            rule: 'R8',
            field: 'accessibility.role',
            message: `Invalid WAI-ARIA role: '${role}'.`,
        };
    }
    return null;
}
