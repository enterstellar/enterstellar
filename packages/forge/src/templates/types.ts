/**
 * @module @enterstellar-ai/forge/templates/types
 * @description Zod schema for validating ForgeTemplate structures.
 *
 * This module provides the `ForgeTemplateSchema` — the structural validation
 * gate for both built-in and custom templates. Every template must parse
 * against this schema before it can be registered in the template registry.
 *
 * **Built-in templates** are validated at module load time (fail-fast).
 * **Custom templates** are validated during `forge.registerTemplate()` (F3).
 *
 * The TS `ForgeTemplate` type is defined in `../types.ts` via the same shape.
 * This module provides the Zod runtime validator only.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice F1 — templates are JSON schemas, not React components.
 * @see Design Choice F3 — custom templates pass structural validation.
 * @see Design Choice T7 — export both TS type and Zod schema.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Slot Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for a single template slot.
 *
 * Each slot defines one dynamic prop in the generated `ComponentContract`.
 * Slots carry type information used to construct the prop Zod schema at
 * forge time.
 *
 * @see `ForgeTemplateSlot` type in `../types.ts`.
 */
export const ForgeTemplateSlotSchema = z.object({
    /** Slot name, used as the prop key. Must be non-empty. */
    name: z.string().min(1, 'Slot name is required.'),
    /** TypeScript/Zod type for this slot. */
    type: z.enum(['string', 'number', 'boolean', 'string[]', 'record']),
    /** Whether this slot is required in the generated props schema. */
    required: z.boolean(),
    /** Human-readable description for the slot. Must be non-empty. */
    description: z.string().min(1, 'Slot description is required.'),
});

// ---------------------------------------------------------------------------
// Category Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for component categories.
 *
 * Accepts the 8 predefined categories plus the extensible `custom:{name}`
 * pattern for domain-specific categories.
 *
 * @see Design Choice R11 — predefined set + `custom:{name}` prefix.
 */
const ComponentCategorySchema = z.string().refine(
    (val): boolean => {
        const predefined = new Set([
            'clinical',
            'admin',
            'navigation',
            'data-display',
            'form',
            'feedback',
            'layout',
            'utility',
        ]);
        return predefined.has(val) || val.startsWith('custom:');
    },
    {
        message:
            'Category must be one of: clinical, admin, navigation, data-display, form, feedback, layout, utility, or custom:{name}.',
    },
);

// ---------------------------------------------------------------------------
// Token Value Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for design token values.
 *
 * All token values MUST start with `token:` — raw CSS values are never
 * acceptable in templates (C9, R6).
 *
 * @see Design Choice C9 — raw CSS values always rejected in the compiler.
 * @see Registration Rule R6 — all token values start with `token:`.
 */
const TokenValueSchema = z.string().refine(
    (val): boolean => val.startsWith('token:'),
    { message: "Token value must start with 'token:' prefix." },
);

// ---------------------------------------------------------------------------
// Accessibility Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for template accessibility defaults.
 *
 * @see Design Choice C10 — role and aria-* only, no tabindex.
 */
const TemplateAccessibilitySchema = z.object({
    /** WAI-ARIA role for the component's root element. Must be non-empty. */
    role: z.string().min(1, 'Accessibility role is required.'),
    /** Default accessible label template. May contain `{name}` placeholder. */
    ariaLabel: z.string().min(1, 'Accessibility ariaLabel is required.'),
    /** Whether screen readers should announce dynamic updates. */
    announceOnUpdate: z.boolean(),
});

// ---------------------------------------------------------------------------
// States Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for lifecycle state renderers.
 * All four states are required (L9).
 *
 * @see Principle L9 — every component must declare all 4 lifecycle states.
 */
const ComponentStatesSchema = z.object({
    /** Renderer key or content for the loading state. */
    loading: z.string().min(1, 'Loading state is required.'),
    /** Renderer key or content for the error state. */
    error: z.string().min(1, 'Error state is required.'),
    /** Renderer key or content for the empty state. */
    empty: z.string().min(1, 'Empty state is required.'),
    /** Renderer key or content for the ready state. */
    ready: z.string().min(1, 'Ready state is required.'),
});

// ---------------------------------------------------------------------------
// ForgeTemplate Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating `ForgeTemplate` structures at runtime.
 *
 * Used by:
 * - Built-in template validation at module load time.
 * - `forge.registerTemplate()` for custom template validation (F3).
 * - `@enterstellar-ai/test` for template compliance assertions.
 *
 * @see Design Choice F1 — JSON schemas describing layout patterns.
 * @see Design Choice F3 — custom templates pass structural validation.
 * @see Design Choice T7 — export both TS type and Zod schema.
 */
export const ForgeTemplateSchema = z.object({
    /** Unique template name (e.g., `'card'`, `'custom-timeline'`). */
    name: z.string().min(1, 'Template name is required.'),
    /** The intent categories this template serves. At least one required. */
    categories: z
        .array(ComponentCategorySchema)
        .min(1, 'At least one category is required.'),
    /** Description of the pattern this template represents. */
    description: z
        .string()
        .min(1, 'Template description is required.')
        .max(120, 'Description must be 120 characters or fewer.'),
    /** Dynamic slots defining the prop surface of generated contracts. */
    slots: z.array(ForgeTemplateSlotSchema),
    /** Default design token bindings. Values must start with `token:`. */
    tokens: z.record(z.string(), TokenValueSchema),
    /** Default lifecycle state renderers. All four required. */
    states: ComponentStatesSchema,
    /** Default accessibility configuration. */
    accessibility: TemplateAccessibilitySchema,
});
