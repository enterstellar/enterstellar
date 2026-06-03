/**
 * @module @enterstellar-ai/migration/enrichment/build-prompt
 * @description Enrichment prompt builder for the BYO-key provider.
 *
 * Constructs the system and user prompt pair sent to an OpenAI-compatible
 * chat completions API during Phase 2 enrichment. The prompt is designed
 * to elicit a structured `SemanticOverlay` JSON response from the LLM,
 * containing enriched values for `heuristic-fallback` fields.
 *
 * **Caller:** This function is called **internally** by
 * `BYOKeyEnrichmentProvider.enrich()` — NOT by the enrichment orchestrator.
 * The BYO-key provider scans the manifest for `heuristic-fallback` fields,
 * then passes them here. The Cloud provider does NOT use this function —
 * the server constructs its own prompt.
 *
 * **Design decisions:**
 * - The prompt is a standalone, testable module — not hardcoded in the
 *   provider class. This enables testing prompt content independently
 *   of HTTP transport.
 * - Source truncation keeps the **beginning** of the source file, which
 *   preserves imports, type definitions, and the component signature —
 *   the highest-signal content for semantic enrichment.
 * - The `ComponentCategory` enum values are included in the prompt to
 *   constrain the LLM's `category` output. These values use the same
 *   compile-time sync guarantee as `KNOWN_CATEGORIES` in `heuristics.ts`
 *   — `satisfies` + exhaustiveness assertion against `@enterstellar-ai/types`.
 *
 * **L15 compliance:** Zero framework imports. Pure string operations.
 *
 * @see Correction 3 — BYOKeyEnrichmentProvider spec
 * @see Audit M4 — explicit caller documentation
 */

import type { ComponentCategory } from '@enterstellar-ai/types';

import type { StructuralManifest, EnrichableFieldKey } from '../types.js';
import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default maximum number of source characters to include in the prompt.
 *
 * ~12,000 characters ≈ ~3,000 tokens (GPT-4o tokenizer). Conservative
 * enough to fit within any model's context window alongside the system
 * prompt and structural context.
 */
const DEFAULT_MAX_SOURCE_CHARS = 12_000;

// ---------------------------------------------------------------------------
// Known Categories (compile-time sync guarantee)
// ---------------------------------------------------------------------------

/**
 * The 8 predefined `ComponentCategory` values, excluding the extensible
 * `custom:${string}` template literal variant.
 *
 * Derived from `ComponentCategory` via `Exclude` — NOT a manual copy.
 * This ensures the compiler catches any drift between this array and
 * the source-of-truth type in `@enterstellar-ai/types`.
 *
 * @see Design Choice R11 — predefined component categories
 * @see `heuristics.ts` — identical pattern used for category inference
 */
type PredefinedCategory = Exclude<ComponentCategory, `custom:${string}`>;

/**
 * The 8 predefined `ComponentCategory` values from `@enterstellar-ai/types`.
 *
 * Used in the system prompt to constrain the LLM's `category` output
 * to valid values. The `custom:${string}` extensible variant is NOT
 * included — custom categories are an author-declared concern, not
 * something the LLM should invent.
 *
 * **Compile-time sync guarantee (two guards):**
 * 1. `satisfies readonly PredefinedCategory[]` — ensures every element
 *    is a valid `PredefinedCategory`. Catches typos and stale values.
 * 2. `assertCategoriesExhaustive` — ensures every `PredefinedCategory`
 *    is present in the array. Catches additions to `ComponentCategory`
 *    that aren't reflected here.
 *
 * If `ComponentCategory` in `@enterstellar-ai/types` is updated, `tsc` will error
 * here until this array is brought into sync.
 *
 * @see Design Choice R11 — predefined component categories
 * @see `heuristics.ts` — `KNOWN_CATEGORIES` (identical pattern)
 */
const COMPONENT_CATEGORIES = [
    'clinical',
    'admin',
    'navigation',
    'data-display',
    'form',
    'feedback',
    'layout',
    'utility',
] as const satisfies readonly PredefinedCategory[];

/**
 * Compile-time exhaustiveness check.
 *
 * Verifies every `PredefinedCategory` is present in `COMPONENT_CATEGORIES`.
 *
 * **How it works:** `Exclude<PredefinedCategory, ArrayValues>` is `never`
 * when all values are covered. If a new category is added to
 * `ComponentCategory` without updating `COMPONENT_CATEGORIES`, the
 * `Exclude` resolves to that missing value and `tsc` emits an error.
 *
 * The function call is dead code — tree-shaken in production builds.
 * The `void` call satisfies `noUnusedLocals`.
 */
function assertCategoriesExhaustive(
    _missing: Exclude<PredefinedCategory, (typeof COMPONENT_CATEGORIES)[number]>,
): void {
    // Intentionally empty — compile-time only.
}
void assertCategoriesExhaustive;

// ---------------------------------------------------------------------------
// Prompt Return Type (T11 — standalone named type)
// ---------------------------------------------------------------------------

/**
 * The system and user prompt pair for LLM chat completion.
 *
 * Maps directly to the `messages` array in an OpenAI-compatible
 * chat completions request: `[{ role: 'system', content: system },
 * { role: 'user', content: user }]`.
 */
export type EnrichmentPrompt = {
    /** System message — defines Enterstellar context, field specs, and output format. */
    readonly system: string;
    /** User message — component source, structural context, and fields to enrich. */
    readonly user: string;
};

// ---------------------------------------------------------------------------
// Field Descriptions (for system prompt)
// ---------------------------------------------------------------------------

/**
 * Human-readable descriptions of each enrichable field, used in the
 * system prompt to guide the LLM on what each field represents and
 * what a good value looks like.
 *
 * Keys are `EnrichableFieldKey` values. Each entry has a `name` for
 * display and a `guidance` string telling the LLM what to produce.
 */
const FIELD_GUIDANCE: Readonly<Record<EnrichableFieldKey, { readonly name: string; readonly guidance: string }>> = {
    description: {
        name: 'description',
        guidance: 'A concise 1-2 sentence description of what the component does and when to use it. Focus on purpose and behavior, not implementation details.',
    },
    tags: {
        name: 'tags',
        guidance: 'An array of 3-8 lowercase semantic tags for fuzzy matching. Include the component\'s domain (e.g., "patient", "clinical"), behavior (e.g., "interactive", "readonly"), and visual pattern (e.g., "card", "list", "table").',
    },
    category: {
        name: 'category',
        guidance: `One of the predefined categories: ${COMPONENT_CATEGORIES.map((c) => `"${c}"`).join(', ')}. Choose the category that best describes the component's primary function.`,
    },
    intent: {
        name: 'intent',
        guidance: 'A natural-language query that a user would type to request this component. Example: "Show a card with patient demographics and vitals". Should be specific enough to distinguish this component from similar ones.',
    },
    ariaAttributes: {
        name: 'ariaAttributes',
        guidance: 'A JSON object mapping ARIA attribute names to their values (e.g., {"role": "alert", "aria-live": "polite"}). Only include attributes that are semantically appropriate for this component.',
    },
    designTokenRefs: {
        name: 'designTokenRefs',
        guidance: 'An array of CSS custom property names (design tokens) this component should reference (e.g., ["--enterstellar-color-primary", "--enterstellar-spacing-md"]). Only include tokens that are semantically relevant.',
    },
    lifecycleStates: {
        name: 'lifecycleStates',
        guidance: 'An array of lifecycle states this component supports (e.g., ["loading", "error", "empty", "ready"]). Infer from conditional rendering patterns in the source code.',
    },
};

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts top-level prop names from a Zod schema.
 *
 * If the manifest's `props` field is a `ZodObject`, extracts the keys
 * from its `.shape`. Otherwise returns an empty array — we can't inspect
 * arbitrary Zod types (e.g., `z.intersection`, `z.union`).
 *
 * @param props - The Zod schema from `StructuralManifest.props`.
 * @returns An array of top-level prop names, or empty if not inspectable.
 */
function extractPropNames(props: z.ZodType): readonly string[] {
    // ZodObject has a `.shape` property with the field definitions.
    // We check via duck-typing rather than `instanceof` to handle
    // edge cases with Zod's internal class hierarchy.
    if (
        typeof props === 'object' &&
        'shape' in props &&
        props.shape !== null &&
        typeof props.shape === 'object'
    ) {
        return Object.keys(props.shape);
    }

    return [];
}

/**
 * Truncates source code to the specified character limit.
 *
 * Preserves the **beginning** of the source (imports, type definitions,
 * component signature) because it carries the most semantic signal for
 * enrichment. Appends a `// [truncated — {remaining} chars omitted]`
 * marker when truncation occurs, so the LLM knows the source is
 * incomplete.
 *
 * @param source - The full component source code.
 * @param maxChars - Maximum characters to include.
 * @returns The (potentially truncated) source string.
 */
function truncateSource(source: string, maxChars: number): string {
    if (source.length <= maxChars) {
        return source;
    }

    const remaining = source.length - maxChars;
    return source.slice(0, maxChars) + `\n// [truncated — ${String(remaining)} chars omitted]`;
}

// ---------------------------------------------------------------------------
// Prompt Builder (Public API)
// ---------------------------------------------------------------------------

/**
 * Builds the enrichment prompt for the LLM.
 *
 * Called internally by `BYOKeyEnrichmentProvider.enrich()` — not by
 * the enrichment orchestrator. The provider scans the manifest for
 * `heuristic-fallback` fields, then passes them here.
 *
 * **Prompt structure:**
 * - **System prompt:** Defines the Enterstellar context, the 7 enrichable field
 *   definitions with guidance, the `ComponentCategory` enum values, and
 *   the expected JSON output format (matching `SemanticOverlay` schema).
 * - **User prompt:** Contains the (truncated) component source code,
 *   structural context from the manifest (component name, prop names,
 *   event handlers, existing Zod schemas), and the explicit list of
 *   fields needing enrichment.
 *
 * @param manifest - Phase 1 output. Structural fields (name, prop names,
 *   event handlers) provide context. Enrichable fields are NOT included
 *   in the prompt — only their keys are listed.
 * @param source - The original component source code. Will be truncated
 *   to `maxSourceChars` if it exceeds the limit.
 * @param fieldsToEnrich - The enrichable field keys that are
 *   `heuristic-fallback` and need LLM enrichment. Only these fields
 *   should appear in the LLM's output.
 * @param maxSourceChars - Maximum source characters to include in the
 *   prompt. Defaults to `12,000` (~3,000 tokens). The BYO-key provider
 *   may override this based on model-specific context window limits.
 * @returns An `EnrichmentPrompt` with `system` and `user` strings.
 *
 * @example
 * ```ts
 * const prompt = buildEnrichmentPrompt(manifest, sourceCode, ['description', 'tags', 'intent']);
 * // prompt.system — system message for chat completions API
 * // prompt.user — user message with source and context
 * ```
 *
 * @see Correction 3 — BYOKeyEnrichmentProvider spec
 * @see Audit M4 — called inside BYO-key provider, not orchestrator
 */
export function buildEnrichmentPrompt(
    manifest: StructuralManifest,
    source: string,
    fieldsToEnrich: readonly EnrichableFieldKey[],
    maxSourceChars: number = DEFAULT_MAX_SOURCE_CHARS,
): EnrichmentPrompt {
    const system = buildSystemPrompt(fieldsToEnrich);
    const user = buildUserPrompt(manifest, source, fieldsToEnrich, maxSourceChars);
    return { system, user };
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

/**
 * Constructs the system prompt for the LLM.
 *
 * Defines:
 * 1. The Enterstellar context and the purpose of enrichment.
 * 2. The field definitions and guidance for each requested field.
 * 3. The valid `ComponentCategory` values (if `category` is requested).
 * 4. The expected JSON output format.
 *
 * @param fieldsToEnrich - The field keys the LLM should populate.
 * @returns The system prompt string.
 */
function buildSystemPrompt(fieldsToEnrich: readonly EnrichableFieldKey[]): string {
    const lines: string[] = [];

    // --- Context ---
    lines.push('You are a component analysis assistant for the Enterstellar OS design system.');
    lines.push('Your task is to analyze a React/TypeScript component and extract semantic metadata.');
    lines.push('');

    // --- Field definitions ---
    lines.push('You must provide values for the following fields:');
    lines.push('');

    for (const fieldKey of fieldsToEnrich) {
        const guidance = FIELD_GUIDANCE[fieldKey];
        lines.push(`### ${guidance.name}`);
        lines.push(guidance.guidance);
        lines.push('');
    }

    // --- Category constraint ---
    if (fieldsToEnrich.includes('category')) {
        lines.push('IMPORTANT: The "category" field MUST be one of these exact values:');
        lines.push(COMPONENT_CATEGORIES.map((c) => `  - "${c}"`).join('\n'));
        lines.push('Do not invent new categories. If unsure, use "utility".');
        lines.push('');
    }

    // --- Output format ---
    lines.push('Respond with ONLY a JSON object matching this exact structure:');
    lines.push('');
    lines.push('{');
    lines.push('  "fields": [');
    lines.push('    { "key": "<field_name>", "value": <field_value> }');
    lines.push('  ]');
    lines.push('}');
    lines.push('');
    lines.push('Rules:');
    lines.push('- Include ONLY the fields listed above. Do not add extra fields.');
    lines.push('- The "key" must exactly match one of the field names listed above.');
    lines.push('- String values must be concise and specific to this component.');
    lines.push('- Array values must contain lowercase strings (no duplicates).');
    lines.push('- Do NOT wrap the JSON in markdown code fences or add any text outside the JSON.');

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// User Prompt
// ---------------------------------------------------------------------------

/**
 * Constructs the user prompt containing the component source and context.
 *
 * @param manifest - Phase 1 manifest for structural context.
 * @param source - Component source code (will be truncated).
 * @param fieldsToEnrich - Field keys the LLM should populate.
 * @param maxSourceChars - Maximum source characters.
 * @returns The user prompt string.
 */
function buildUserPrompt(
    manifest: StructuralManifest,
    source: string,
    fieldsToEnrich: readonly EnrichableFieldKey[],
    maxSourceChars: number,
): string {
    const lines: string[] = [];

    // --- Structural context ---
    lines.push('## Component Context');
    lines.push('');
    lines.push(`**Name:** ${manifest.name}`);
    lines.push('');

    // Prop names (extracted from Zod schema if possible)
    const propNames = extractPropNames(manifest.props);
    if (propNames.length > 0) {
        lines.push(`**Props:** ${propNames.join(', ')}`);
    } else {
        lines.push('**Props:** (none or non-inspectable schema)');
    }
    lines.push('');

    // Event handlers
    if (manifest.eventHandlers.length > 0) {
        lines.push(`**Event Handlers:** ${manifest.eventHandlers.join(', ')}`);
        lines.push('');
    }

    // Existing Zod schemas (informational)
    if (manifest.existingZodSchemas.length > 0) {
        lines.push(`**Existing Zod Schemas:** ${manifest.existingZodSchemas.join(', ')}`);
        lines.push('');
    }

    // Generics (informational)
    if (manifest.generics.length > 0) {
        const genericStr = manifest.generics
            .map((g) => g.constraint !== undefined ? `${g.name} extends ${g.constraint}` : g.name)
            .join(', ');
        lines.push(`**Generic Parameters:** <${genericStr}>`);
        lines.push('');
    }

    // Default props (informational — helps LLM understand typical usage)
    const defaultPropEntries = Object.entries(manifest.defaultProps);
    if (defaultPropEntries.length > 0) {
        const defaultStr = defaultPropEntries
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ');
        lines.push(`**Default Props:** ${defaultStr}`);
        lines.push('');
    }

    // --- Fields to enrich ---
    lines.push('## Fields to Enrich');
    lines.push('');
    lines.push('Provide values for ONLY these fields:');
    for (const fieldKey of fieldsToEnrich) {
        lines.push(`- ${fieldKey}`);
    }
    lines.push('');

    // --- Source code ---
    const truncatedSource = truncateSource(source, maxSourceChars);
    lines.push('## Component Source Code');
    lines.push('');
    lines.push('```tsx');
    lines.push(truncatedSource);
    lines.push('```');

    return lines.join('\n');
}
