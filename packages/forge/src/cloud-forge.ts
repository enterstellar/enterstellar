/**
 * @module @enterstellar-ai/forge/cloud-forge
 * @description CloudForge — LLM-powered contract generation via consumer callback.
 *
 * CloudForge handles complex/novel patterns that LocalForge templates cannot
 * serve. It delegates to a consumer-provided `CloudForgeCallback` that wires
 * to the actual LLM transport (e.g., `@enterstellar-ai/cloud`, OpenAI, Anthropic).
 *
 * **CloudForge is metered** — each invocation consumes IPU on Enterstellar Cloud.
 *
 * **3-layer guardrails (F7):**
 * 1. **System prompt** — assembled by this module with constraints, token list,
 *    and accessibility requirements. Sent to the callback.
 * 2. **Zod validation** — returned contract parsed against `ComponentContractSchema`.
 * 3. **Token allowlist** — all token values must start with `token:` and reference
 *    only tokens present in the provided `DesignTokenSet`.
 *
 * **Safety:** CloudForge NEVER throws. On any failure (callback error, invalid
 * response, token violation), it returns `null` and the caller falls back
 * gracefully (F9).
 *
 * **L15 compliance:** Zero framework imports. Transport-agnostic via callback.
 *
 * @see Design Choice F5 — general-purpose LLM with system prompt.
 * @see Design Choice F6 — data contract only, no render function.
 * @see Design Choice F7 — 3-layer guardrails.
 * @see Design Choice F9 — never hard-fail.
 * @see Design Choice C4 — callback pattern (same as compiler CorrectionCallback).
 */

import { createComponentId, ComponentContractSchema } from '@enterstellar-ai/types';

import type { ComponentContract, ComponentIntent, DesignTokenSet } from '@enterstellar-ai/types';

import type { CloudForgeCallback, ForgeConstraints } from './types.js';
import { generateForgedName } from './naming.js';

// ---------------------------------------------------------------------------
// System Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Assembles the system prompt sent to the CloudForge LLM callback.
 *
 * The prompt constrains the LLM to generate ONLY a valid `ComponentContract`
 * data shape — no HTML, no JSX, no render functions (F6). It includes:
 * - Available design token names (from `constraints.designTokens`)
 * - Required lifecycle states
 * - Accessibility level (WCAG-A/AA/AAA)
 * - Maximum complexity
 * - The `ComponentContract` JSON schema expectations
 *
 * @param intent - The intent that triggered the forge.
 * @param constraints - Forge constraints for guardrails.
 * @returns The assembled system prompt string.
 *
 * @see Design Choice F5 — system prompt constrains LLM output.
 * @see Design Choice L13 — no advertiser content in the prompt.
 */
function buildSystemPrompt(
    intent: ComponentIntent,
    constraints: ForgeConstraints,
): string {
    const tokenNames = extractTokenNames(constraints.designTokens);
    const requiredStates = constraints.requiredStates.join(', ');
    const a11yLevel = constraints.accessibility;
    const maxComplexity = String(constraints.maxComplexity);

    return [
        'You are the Enterstellar CloudForge — a component contract generator.',
        'Generate ONLY a valid ComponentContract JSON object. NO HTML, NO JSX, NO render functions.',
        '',
        '## Rules',
        '1. The contract must include: name, description (≤120 chars), category, tags (3-10), tokens, accessibility, states, examples.',
        '2. All token values MUST start with "token:" and reference ONLY these available tokens:',
        `   [${tokenNames.join(', ')}]`,
        `3. All lifecycle states are REQUIRED: ${requiredStates}.`,
        `4. Accessibility level: ${a11yLevel}. Include role and ariaLabel.`,
        `5. Maximum complexity (nesting depth): ${maxComplexity}.`,
        '6. Do NOT include a "render" field — rendering is handled by platform-specific renderers.',
        '7. Do NOT inject any promotional, advertising, or third-party content.',
        '',
        '## Intent',
        `Component requested: "${intent.component}"`,
        `Props provided: ${JSON.stringify(intent.props)}`,
        intent.mode !== undefined ? `Display mode: "${intent.mode}"` : '',
        intent.interaction !== undefined ? `Interaction: "${intent.interaction}"` : '',
        '',
        '## Output Format',
        'Respond with a single JSON object matching the ComponentContract schema.',
    ].filter((line) => line !== '').join('\n');
}

/**
 * Extracts all token names from a `DesignTokenSet` for system prompt injection.
 *
 * `DesignTokenSet` is `Readonly<Record<string, string>>` — a flat map of
 * token names to their values.
 *
 * @param tokens - The design token set from constraints.
 * @returns A flat array of all token keys prefixed with `token:`.
 */
function extractTokenNames(tokens: DesignTokenSet): string[] {
    const names: string[] = [];

    for (const key of Object.keys(tokens)) {
        names.push(`token:${key}`);
    }

    return names;
}

// ---------------------------------------------------------------------------
// Token Allowlist Validation (Guardrail Layer 3)
// ---------------------------------------------------------------------------

/**
 * Validates that all token values in a contract start with the `token:` prefix.
 *
 * This is the third guardrail layer (F7). Even if the LLM returns a
 * structurally valid contract, raw CSS values (e.g., `'#ff0000'`) are rejected.
 *
 * @param contract - The contract to validate.
 * @returns `true` if all token values are valid, `false` otherwise.
 *
 * @see Design Choice F7 — guardrail layer 3: token allowlist.
 * @see Registration Rule R6 — all token values start with `token:`.
 */
function validateTokenAllowlist(contract: ComponentContract): boolean {
    for (const value of Object.values(contract.tokens)) {
        if (!value.startsWith('token:')) {
            return false;
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// CloudForge Function
// ---------------------------------------------------------------------------

/**
 * Generates a `ComponentContract` via the consumer-provided CloudForge callback.
 *
 * **Flow:**
 * 1. Assemble the system prompt with constraints and intent context.
 * 2. Invoke the `CloudForgeCallback` with the intent and prompt.
 * 3. If the callback returns `null` or throws → return `null` (F9).
 * 4. Parse the returned contract against `ComponentContractSchema` (Zod).
 * 5. Validate the token allowlist (F7 guardrail layer 3).
 * 6. Override `name` with `__forged_` convention and set `_meta.forged = true`.
 * 7. Return the assembled, frozen `ComponentContract`.
 *
 * **This function NEVER throws.** All failures return `null`.
 *
 * @param intent - The `ComponentIntent` that triggered the forge.
 * @param constraints - Forge constraints for guardrails.
 * @param callback - The consumer-provided `CloudForgeCallback`.
 * @returns A frozen `ComponentContract` with `_meta.forged = true`, or `null` on any failure.
 *
 * @see Design Choice F5 — LLM with system prompt.
 * @see Design Choice F6 — data contract only.
 * @see Design Choice F7 — 3-layer guardrails.
 * @see Design Choice F9 — never hard-fail.
 */
export async function forgeCloud(
    intent: ComponentIntent,
    constraints: ForgeConstraints,
    callback: CloudForgeCallback,
): Promise<ComponentContract | null> {
    // -----------------------------------------------------------------------
    // Step 1: Build system prompt (guardrail layer 1)
    // -----------------------------------------------------------------------

    const systemPrompt = buildSystemPrompt(intent, constraints);

    // -----------------------------------------------------------------------
    // Step 2: Invoke the consumer callback
    // -----------------------------------------------------------------------

    let rawContract: ComponentContract | null;

    try {
        rawContract = await callback(intent, systemPrompt);
    } catch {
        // Callback failed — network error, timeout, quota, etc. (F9)
        return null;
    }

    if (rawContract === null) {
        return null;
    }

    // -----------------------------------------------------------------------
    // Step 3: Zod validation (guardrail layer 2)
    // -----------------------------------------------------------------------

    const parsed = ComponentContractSchema.safeParse(rawContract);

    if (!parsed.success) {
        // LLM returned an invalid contract structure — reject silently.
        return null;
    }

    // -----------------------------------------------------------------------
    // Step 4: Token allowlist validation (guardrail layer 3)
    // -----------------------------------------------------------------------

    if (!validateTokenAllowlist(rawContract)) {
        // LLM used raw CSS values or unknown tokens — reject silently.
        return null;
    }

    // -----------------------------------------------------------------------
    // Step 5: Override naming and metadata
    // -----------------------------------------------------------------------

    const forgedName = generateForgedName(intent.component);

    const contract: ComponentContract = {
        ...rawContract,
        name: forgedName,
        id: createComponentId(forgedName),
        _meta: {
            forged: true,
            version: '0.0.0',
            createdAt: new Date().toISOString(),
        },
    };

    // -----------------------------------------------------------------------
    // Step 6: Freeze and return
    // -----------------------------------------------------------------------

    return Object.freeze(contract);
}
