/**
 * @module @enterstellar-ai/cli/utils/validate-name
 * @description Name validation utilities for Enterstellar CLI scaffolding.
 *
 * Enforces Enterstellar naming conventions:
 * - **Project names**: kebab-case — lowercase letters, numbers, and hyphens.
 *   Must start with a letter. Must not end with a hyphen.
 * - **Component names**: PascalCase — starts with an uppercase letter,
 *   followed by any combination of letters and numbers.
 *
 * @see Coding Rules — Naming Conventions
 * @see Design Choice CLI2 — `enterstellar add component` requires PascalCase
 */

// ---------------------------------------------------------------------------
// Validation Patterns
// ---------------------------------------------------------------------------

/**
 * Regex for valid kebab-case project names.
 *
 * Rules:
 * - Starts with a lowercase letter (`[a-z]`)
 * - Contains only lowercase letters, numbers, and hyphens (`[a-z0-9-]*`)
 * - Must not end with a hyphen (negative lookahead would be complex;
 *   enforced via separate check for simplicity and readability)
 * - At least 1 character long
 *
 * @example Valid: `"my-app"`, `"enterstellar"`, `"clinical-dashboard-v2"`
 * @example Invalid: `"My-App"`, `"-app"`, `"app-"`, `"123app"`, `"my app"`
 */
const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Regex for valid PascalCase component names.
 *
 * Rules:
 * - Starts with an uppercase letter (`[A-Z]`)
 * - Followed by any combination of letters (upper or lower) and numbers
 * - No hyphens, underscores, or special characters
 * - At least 2 characters long (single uppercase letter is ambiguous)
 *
 * @example Valid: `"PatientVitals"`, `"ExampleCard"`, `"V2Dashboard"`
 * @example Invalid: `"patientVitals"`, `"patient-vitals"`, `"A"`, `"123Card"`
 */
const PASCAL_CASE_PATTERN = /^[A-Z][a-zA-Z0-9]+$/;

// ---------------------------------------------------------------------------
// Project Name Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a project name follows kebab-case convention.
 *
 * A valid project name:
 * - Contains only lowercase letters, numbers, and hyphens
 * - Starts with a lowercase letter
 * - Does not end with a hyphen
 * - Is at least 1 character long
 *
 * @param name - The project name to validate.
 * @returns `true` if the name is valid kebab-case, `false` otherwise.
 *
 * @example
 * ```ts
 * validateProjectName('my-enterstellar-app'); // true
 * validateProjectName('My App');      // false
 * validateProjectName('app-');        // false
 * validateProjectName('');            // false
 * ```
 */
export function validateProjectName(name: string): boolean {
    if (name.length === 0) {
        return false;
    }

    if (name.endsWith('-')) {
        return false;
    }

    return KEBAB_CASE_PATTERN.test(name);
}

// ---------------------------------------------------------------------------
// Component Name Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a component name follows PascalCase convention.
 *
 * A valid component name:
 * - Starts with an uppercase letter
 * - Contains only letters and numbers (no hyphens, underscores, or spaces)
 * - Is at least 2 characters long
 *
 * This matches Enterstellar's naming convention for `ComponentContract` names
 * as enforced by `defineComponent()` in `@enterstellar-ai/registry`.
 *
 * @param name - The component name to validate.
 * @returns `true` if the name is valid PascalCase, `false` otherwise.
 *
 * @example
 * ```ts
 * validateComponentName('PatientVitals');  // true
 * validateComponentName('ExampleCard');    // true
 * validateComponentName('patientVitals');  // false (camelCase)
 * validateComponentName('patient-vitals'); // false (kebab-case)
 * validateComponentName('A');              // false (too short)
 * validateComponentName('');               // false (empty)
 * ```
 */
export function validateComponentName(name: string): boolean {
    if (name.length < 2) {
        return false;
    }

    return PASCAL_CASE_PATTERN.test(name);
}
