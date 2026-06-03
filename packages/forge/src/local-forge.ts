/**
 * @module @enterstellar-ai/forge/local-forge
 * @description LocalForge — template-based contract generation.
 *
 * LocalForge generates `ComponentContract` instances from the pre-approved
 * template library. It maps intent props to template slots, injects design
 * tokens, assembles `_meta.forged = true` metadata, and names the contract
 * with the `__forged_` prefix (F13).
 *
 * **LocalForge is free** — no LLM call, no IPU metering. It handles simple
 * patterns (card, list, table, chart, form, detail, badge) exclusively.
 *
 * **What LocalForge does NOT do:**
 * - It does NOT run the compiler — the caller (`createComponentForge`) does (L3).
 * - It does NOT handle complex/novel patterns — those escalate to CloudForge.
 * - It does NOT register the contract — it is ephemeral (Hot Path Rule 5).
 *
 * @see Design Choice F1 — templates are JSON schemas, not React components.
 * @see Design Choice F2 — 7 pre-approved patterns, decision tree routing.
 * @see Design Choice F13 — `__forged_{slug}_{8-char-xxHash}` naming.
 * @see Hot Path Rules 1–5 (Bible §4.10).
 */

import { z } from 'zod';
import { createComponentId } from '@enterstellar-ai/types';

import type { ComponentCategory, ComponentContract, ComponentIntent } from '@enterstellar-ai/types';

import type { ForgeConstraints, ForgeTemplate, ForgeTemplateSlot } from './types.js';
import type { TemplateRegistry } from './templates/registry.js';
import { generateForgedName } from './naming.js';

// ---------------------------------------------------------------------------
// Slot Default Values
// ---------------------------------------------------------------------------

/**
 * Returns a sensible default value for a template slot when no matching
 * prop is found in the intent.
 *
 * @param slot - The template slot to provide a default for.
 * @returns A default value matching the slot type.
 */
function getSlotDefault(slot: ForgeTemplateSlot): unknown {
    switch (slot.type) {
        case 'string':
            return '';
        case 'number':
            return 0;
        case 'boolean':
            return false;
        case 'string[]':
            return [];
        case 'record':
            return {};
    }
}

// ---------------------------------------------------------------------------
// Zod Schema Builder
// ---------------------------------------------------------------------------

/**
 * Builds a Zod object schema from an array of template slots.
 *
 * Each slot type maps to a Zod validator:
 * - `string` → `z.string()`
 * - `number` → `z.number()`
 * - `boolean` → `z.boolean()`
 * - `string[]` → `z.array(z.string())`
 * - `record` → `z.record(z.string(), z.unknown())`
 *
 * Optional slots are wrapped in `.optional()`.
 *
 * @param slots - The template slots to build the schema from.
 * @returns A Zod object schema representing the slot surface.
 */
function buildSlotsSchema(
    slots: readonly ForgeTemplateSlot[],
): z.ZodType {
    const shape: Record<string, z.ZodType> = {};

    for (const slot of slots) {
        let validator: z.ZodType;

        switch (slot.type) {
            case 'string':
                validator = z.string();
                break;
            case 'number':
                validator = z.number();
                break;
            case 'boolean':
                validator = z.boolean();
                break;
            case 'string[]':
                validator = z.array(z.string());
                break;
            case 'record':
                validator = z.record(z.string(), z.unknown());
                break;
        }

        shape[slot.name] = slot.required ? validator : validator.optional();
    }

    return z.object(shape);
}

// ---------------------------------------------------------------------------
// Props Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts props from the intent that match the template's slot definitions.
 *
 * Only slot-defined props are accepted. Extra intent props are discarded
 * (not passed to the contract). Missing required slots get defaults.
 *
 * @param intent - The original `ComponentIntent`.
 * @param slots - The template's slot definitions.
 * @returns Extracted props matching the template's slot surface.
 */
function extractSlotProps(
    intent: ComponentIntent,
    slots: readonly ForgeTemplateSlot[],
): Readonly<Record<string, unknown>> {
    const props: Record<string, unknown> = {};

    for (const slot of slots) {
        const intentValue: unknown = intent.props[slot.name];

        if (intentValue !== undefined) {
            props[slot.name] = intentValue;
        } else if (slot.required) {
            // Required slot with no intent value → use default
            props[slot.name] = getSlotDefault(slot);
        }
        // Optional slot with no intent value → omit entirely
    }

    return props;
}

// ---------------------------------------------------------------------------
// Accessibility Label Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the `{name}` placeholder in a template's `ariaLabel`.
 *
 * @param template - The template whose label to resolve.
 * @param componentName - The component name replacing `{name}`.
 * @returns The resolved aria label string.
 */
function resolveAriaLabel(template: ForgeTemplate, componentName: string): string {
    return template.accessibility.ariaLabel.replace('{name}', componentName);
}

// ---------------------------------------------------------------------------
// LocalForge Function
// ---------------------------------------------------------------------------

/**
 * Generates a `ComponentContract` from a matched LocalForge template.
 *
 * **Flow:**
 * 1. Extract the intent category (from `intent.component` as a category hint,
 *    or fall back to `'data-display'`).
 * 2. Query the template registry for a matching template.
 * 3. If no match → return `null` (caller escalates to CloudForge).
 * 4. Extract props from the intent using the template's slot definitions.
 * 5. Assemble the full `ComponentContract` with:
 *    - `name`: `__forged_{slug}_{8-char-xxHash}` (F13)
 *    - `_meta.forged`: `true`
 *    - `tokens`: from the template defaults
 *    - `states`: from the template defaults
 *    - `accessibility`: from the template, with resolved `{name}` placeholder
 *    - `props`: Zod schema built from the template's slots
 * 6. Return the assembled contract (NOT compiled — the caller does that).
 *
 * @param intent - The `ComponentIntent` that had no registry match.
 * @param templateRegistry - The internal template registry to query.
 * @param constraints - Forge constraints (used for validation).
 * @param category - Optional explicit category. Defaults derived from intent.
 * @returns A `ComponentContract` with `_meta.forged = true`, or `null` if no template matches.
 *
 * @see Hot Path Rules 1–5 (Bible §4.10).
 * @see Design Choice F2 — decision tree routing.
 * @see Design Choice F13 — naming convention.
 */
export function forgeLocal(
    intent: ComponentIntent,
    templateRegistry: TemplateRegistry,
    constraints: ForgeConstraints,
    category?: ComponentCategory,
): ComponentContract | null {
    // -----------------------------------------------------------------------
    // Step 1: Determine the category to match against
    // -----------------------------------------------------------------------

    // Use explicit category if provided, else derive from intent.
    // Intent component names like "PatientVitals" suggest 'clinical',
    // but without semantic analysis, we default to 'data-display'.
    const targetCategory: ComponentCategory = category ?? 'data-display';

    // -----------------------------------------------------------------------
    // Step 2: Query the template registry
    // -----------------------------------------------------------------------

    const template = templateRegistry.matchTemplate(targetCategory);

    if (template === undefined) {
        // No matching template — caller should escalate to CloudForge.
        return null;
    }

    // -----------------------------------------------------------------------
    // Step 3: Guard against disallowed patterns
    // -----------------------------------------------------------------------

    const allowedPatterns = constraints.componentPatterns as readonly string[];
    if (!allowedPatterns.includes(template.name)) {
        // Template exists but is not in the allowed pattern list — skip.
        return null;
    }

    // -----------------------------------------------------------------------
    // Step 4: Extract props from intent → template slots
    // -----------------------------------------------------------------------

    const extractedProps = extractSlotProps(intent, template.slots);

    // -----------------------------------------------------------------------
    // Step 5: Generate forged name
    // -----------------------------------------------------------------------

    const forgedName = generateForgedName(intent.component);

    // -----------------------------------------------------------------------
    // Step 6: Build the Zod schema for the contract's props
    // -----------------------------------------------------------------------

    const propsSchema = buildSlotsSchema(template.slots);

    // -----------------------------------------------------------------------
    // Step 7: Assemble the ComponentContract
    // -----------------------------------------------------------------------

    const contract: ComponentContract = {
        name: forgedName,
        id: createComponentId(forgedName),
        description: `Forged ${template.name} component for "${intent.component}".`,
        category: targetCategory,
        tags: ['forged', template.name, intent.component],
        props: propsSchema,
        tokens: { ...template.tokens },
        accessibility: {
            role: template.accessibility.role,
            ariaLabel: resolveAriaLabel(template, intent.component),
            announceOnUpdate: template.accessibility.announceOnUpdate,
        },
        states: { ...template.states },
        examples: [
            {
                intent: intent.component,
                props: extractedProps,
            },
        ],
        _meta: {
            forged: true,
            version: '0.0.0',
            createdAt: new Date().toISOString(),
        },
    };

    return Object.freeze(contract);
}
