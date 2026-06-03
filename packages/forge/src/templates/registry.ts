/**
 * @module @enterstellar-ai/forge/templates/registry
 * @description Internal template registry for LocalForge.
 *
 * The template registry is an in-memory `Map<string, ForgeTemplate>` that
 * stores both built-in and custom templates. It provides:
 *
 * - **`registerTemplate()`** — adds a custom template with Zod validation (F3).
 * - **`getTemplate()`** — direct lookup by name.
 * - **`matchTemplate()`** — decision tree routing a `ComponentCategory` to the
 *   best-fit template (F2).
 *
 * The 7 built-in templates are pre-loaded at construction time (F4). Custom
 * templates registered via `registerTemplate()` are also eligible for matching.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice F2 — decision tree for template selection.
 * @see Design Choice F3 — custom templates pass structural validation.
 * @see Design Choice F4 — built-in templates ship inside `@enterstellar-ai/forge`.
 */

import type { ComponentCategory } from '@enterstellar-ai/types';

import type { ForgeTemplate } from '../types.js';
import { BUILTIN_TEMPLATES } from './builtin.js';
import { ForgeTemplateSchema } from './types.js';
import { templateValidationError } from '../errors.js';

// ---------------------------------------------------------------------------
// TemplateRegistry Interface
// ---------------------------------------------------------------------------

/**
 * Internal template registry interface.
 *
 * Returned by `createTemplateRegistry()`. Provides template storage,
 * lookup, registration, and category-based matching.
 */
export interface TemplateRegistry {
    /**
     * Retrieves a template by exact name.
     *
     * @param name - The template name to look up (e.g., `'card'`, `'custom-timeline'`).
     * @returns The `ForgeTemplate`, or `undefined` if not found.
     */
    getTemplate(name: string): ForgeTemplate | undefined;

    /**
     * Registers a custom template with structural validation.
     *
     * The template is validated against `ForgeTemplateSchema` before
     * registration. Duplicate names are rejected with `ENS-4005`.
     *
     * @param name - Unique template name.
     * @param template - The template schema to register.
     * @throws {EnterstellarError} `ENS-4005` if structural validation fails or name is duplicate.
     *
     * @see Design Choice F3 — custom templates via `forge.registerTemplate()`.
     */
    registerTemplate(name: string, template: ForgeTemplate): void;

    /**
     * Finds the best-fit template for a given component category.
     *
     * The decision tree iterates all registered templates (built-in first,
     * then custom) and returns the first template whose `categories` array
     * includes the requested category.
     *
     * @param category - The `ComponentCategory` to match against.
     * @returns The best-fit `ForgeTemplate`, or `undefined` if no match.
     *
     * @see Design Choice F2 — category-based decision tree.
     */
    matchTemplate(category: ComponentCategory): ForgeTemplate | undefined;

    /**
     * Returns the names of all registered templates.
     *
     * @returns A readonly array of template names.
     */
    listTemplates(): readonly string[];

    /**
     * Returns the total number of registered templates.
     */
    readonly size: number;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an internal template registry pre-loaded with the 7 built-in templates.
 *
 * @returns A `TemplateRegistry` instance with all built-in templates registered.
 *
 * @see Design Choice F4 — built-in templates ship inside `@enterstellar-ai/forge`.
 */
export function createTemplateRegistry(): TemplateRegistry {
    /**
     * Internal storage. Built-in templates are inserted first, preserving
     * their priority in `matchTemplate()` iteration order.
     */
    const templates = new Map<string, ForgeTemplate>();

    // Pre-load built-in templates (F4)
    for (const template of BUILTIN_TEMPLATES) {
        templates.set(template.name, template);
    }

    // -----------------------------------------------------------------------
    // getTemplate
    // -----------------------------------------------------------------------

    function getTemplate(name: string): ForgeTemplate | undefined {
        return templates.get(name);
    }

    // -----------------------------------------------------------------------
    // registerTemplate
    // -----------------------------------------------------------------------

    function registerTemplate(name: string, template: ForgeTemplate): void {
        // Guard: duplicate name
        if (templates.has(name)) {
            throw templateValidationError(name, [
                `Template name '${name}' is already registered. Use a unique name.`,
            ]);
        }

        // Guard: name in template must match the registration name
        if (template.name !== name) {
            throw templateValidationError(name, [
                `Template.name '${template.name}' does not match registration name '${name}'.`,
            ]);
        }

        // Structural validation via Zod (F3)
        const parsed = ForgeTemplateSchema.safeParse(template);

        if (!parsed.success) {
            const violations = parsed.error.issues.map(
                (issue) => `${issue.path.join('.')}: ${issue.message}`,
            );
            throw templateValidationError(name, violations);
        }

        templates.set(name, template);
    }

    // -----------------------------------------------------------------------
    // matchTemplate
    // -----------------------------------------------------------------------

    function matchTemplate(category: ComponentCategory): ForgeTemplate | undefined {
        // Iterate in insertion order — built-in templates have priority.
        for (const template of templates.values()) {
            // Check if the category is a direct match against the template's categories.
            // For `custom:*` categories, we also check if the template has declared
            // that exact custom category.
            const categories = template.categories as readonly string[];
            if (categories.includes(category)) {
                return template;
            }
        }
        return undefined;
    }

    // -----------------------------------------------------------------------
    // listTemplates
    // -----------------------------------------------------------------------

    function listTemplates(): readonly string[] {
        return [...templates.keys()];
    }

    // -----------------------------------------------------------------------
    // Return frozen public API
    // -----------------------------------------------------------------------

    return {
        getTemplate,
        registerTemplate,
        matchTemplate,
        listTemplates,
        get size(): number {
            return templates.size;
        },
    };
}
