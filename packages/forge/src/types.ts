/**
 * @module @enterstellar-ai/forge/types
 * @description Forge-local type definitions.
 *
 * These types are internal to `@enterstellar-ai/forge` and define the configuration,
 * template structures, factory interfaces, and callback signatures used
 * throughout the forge subsystem.
 *
 * **Naming:** Types for data shapes (`ForgeConfig`, `ForgeConstraints`),
 * interface for the public API object (`ComponentForge`) — per Design Choice T1.
 *
 * **L15 compliance:** Zero framework imports. All types are platform-agnostic.
 *
 * @see Implementation Bible §4.10
 * @see Design Choices F1–F14
 */

import type {
    ComponentCategory,
    ComponentContract,
    ComponentIntent,
    ComponentStates,
    ColdPathConfig,
    DesignTokenSet,
    ForgeResult,
    ForgeTraceRecord,
} from '@enterstellar-ai/types';

import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

// ---------------------------------------------------------------------------
// Template Types (F1, F2, F3)
// ---------------------------------------------------------------------------

/**
 * Names of the 7 pre-approved LocalForge patterns.
 *
 * @see Design Choice F2 — card, list, table, chart, form, detail, badge.
 */
export type ForgePatternName =
    | 'card'
    | 'list'
    | 'table'
    | 'chart'
    | 'form'
    | 'detail'
    | 'badge';

/**
 * A single slot in a ForgeTemplate schema.
 *
 * Slots define the dynamic prop surfaces of a template. Each slot maps
 * to a field in the generated `ComponentContract.props` Zod schema.
 *
 * @see Design Choice F1 — templates are JSON schemas with slots + token mappings.
 */
export type ForgeTemplateSlot = {
    /** Slot name, used as the prop key in the generated contract. */
    readonly name: string;
    /** TypeScript/Zod type for this slot. */
    readonly type: 'string' | 'number' | 'boolean' | 'string[]' | 'record';
    /** Whether this slot is required in the generated props schema. */
    readonly required: boolean;
    /** Human-readable description for the slot (appears in the contract manifest). */
    readonly description: string;
};

/**
 * A declarative JSON template schema used by LocalForge to generate contracts.
 *
 * Templates are NOT React components — they are pure data describing layout
 * patterns (F1). Each renderer interprets the schema per platform.
 *
 * @see Design Choice F1 — JSON schemas, not React components.
 * @see Design Choice F2 — 7 pre-approved patterns.
 * @see Design Choice F3 — custom templates via `forge.registerTemplate()`.
 */
export type ForgeTemplate = {
    /** Unique template name (e.g., `'card'`, `'list'`, `'custom-timeline'`). */
    readonly name: string;
    /** The intent categories this template serves. */
    readonly categories: readonly ComponentCategory[];
    /** Description of the pattern this template represents. */
    readonly description: string;
    /** Dynamic slots defining the prop surface of generated contracts. */
    readonly slots: readonly ForgeTemplateSlot[];
    /** Default design token bindings for the template. Values are symbolic (e.g., `'token:surface'`). */
    readonly tokens: Readonly<Record<string, string>>;
    /** Default lifecycle state renderers. */
    readonly states: ComponentStates;
    /** Default accessibility configuration. */
    readonly accessibility: {
        /** WAI-ARIA role for the component's root element. */
        readonly role: string;
        /** Default accessible label template. May contain `{name}` placeholder. */
        readonly ariaLabel: string;
        /** Whether screen readers should announce dynamic updates. */
        readonly announceOnUpdate: boolean;
    };
};

// ---------------------------------------------------------------------------
// CloudForge Callback (dependency inversion — same pattern as C4)
// ---------------------------------------------------------------------------

/**
 * Consumer-provided async callback for CloudForge LLM inference.
 *
 * The forge module does NOT own LLM transport. The consumer (typically
 * `Provider` or `@enterstellar-ai/cloud`) wires this callback to the actual
 * LLM connection. This keeps the forge testable, transport-agnostic,
 * and consistent with the compiler's `CorrectionCallback` (C4).
 *
 * @param intent - The `ComponentIntent` that triggered the forge.
 * @param systemPrompt - The forge-assembled system prompt with constraints.
 * @returns A `ComponentContract` on success, or `null` on failure.
 *
 * @see Design Choice F5 — general-purpose model with specialized system prompt.
 * @see Design Choice F6 — data contract only, no render function.
 */
export type CloudForgeCallback = (
    intent: ComponentIntent,
    systemPrompt: string,
) => Promise<ComponentContract | null>;

// ---------------------------------------------------------------------------
// Forge Constraints (from Bible §4.10)
// ---------------------------------------------------------------------------

/**
 * Constraints applied to all forge generation (LocalForge and CloudForge).
 *
 * These guardrails prevent the forge from producing invalid, unsafe, or
 * overly complex contracts. Validated at forge creation time.
 *
 * @see Bible §4.10 — `constraints` in `createComponentForge()`.
 * @see Design Choice F7 — 3-layer guardrails.
 */
export type ForgeConstraints = {
    /** Design tokens the forged contract must adhere to. */
    readonly designTokens: DesignTokenSet;
    /** Allowed base patterns for LocalForge. Default: all 7 built-in patterns. */
    readonly componentPatterns: readonly ForgePatternName[];
    /** Maximum nesting depth for forged component trees. Default: `5`. */
    readonly maxComplexity: number;
    /** Required lifecycle states. Default: all 4 (`loading`, `error`, `empty`, `ready`). */
    readonly requiredStates: readonly ('loading' | 'error' | 'empty' | 'ready')[];
    /** WCAG accessibility level. Default: `'WCAG-AA'`. */
    readonly accessibility: 'WCAG-A' | 'WCAG-AA' | 'WCAG-AAA';
};

// ---------------------------------------------------------------------------
// Forge Configuration
// ---------------------------------------------------------------------------

/**
 * Full configuration for `createComponentForge()`.
 *
 * @see Bible §4.10 — public API.
 * @see Design Choice R1 — factory pattern, plain object with closures.
 */
export type ForgeConfig = {
    /**
     * Routing mode for LocalForge vs CloudForge.
     * - `'auto'` — simple intents → LocalForge, complex → CloudForge (default).
     * - `'local-only'` — never call CloudForge.
     * - `'cloud-only'` — skip LocalForge, always use CloudForge callback.
     *
     * @see Design Choice F8 — semantic index confidence as primary signal.
     */
    readonly routing: 'auto' | 'local-only' | 'cloud-only';
    /** Generation constraints and guardrails. */
    readonly constraints: ForgeConstraints;
    /** Cold Path pipeline configuration. */
    readonly coldPath: ColdPathConfig;
    /**
     * The Enterstellar compiler instance. Forged contracts MUST pass compilation (L3).
     * Injected by the consumer (typically `Provider`).
     */
    readonly compiler: EnterstellarCompiler;
    /**
     * The Enterstellar registry instance. Used for design token resolution and
     * for registering promoted forged contracts.
     */
    readonly registry: EnterstellarRegistry;
    /**
     * Optional CloudForge callback for LLM inference.
     * Required when `routing` is `'auto'` or `'cloud-only'`.
     * When `routing: 'local-only'`, this may be omitted.
     *
     * @see `CloudForgeCallback` type documentation.
     */
    readonly onCloudForge?: CloudForgeCallback;
};

// ---------------------------------------------------------------------------
// Forge Statistics
// ---------------------------------------------------------------------------

/**
 * Statistics returned by `forge.getStats()`.
 *
 * @see Bible §4.10 — `getStats()` signature.
 */
export type ForgeStats = {
    /** Total number of forge invocations (local + cloud). */
    readonly totalForged: number;
    /** Number of successful forge generations. */
    readonly successCount: number;
    /** Number of failed forge generations (fallback used). */
    readonly failureCount: number;
    /** Number of LocalForge invocations. */
    readonly localCount: number;
    /** Number of CloudForge invocations. */
    readonly cloudCount: number;
    /** Top forged intents by frequency. */
    readonly topIntents: readonly ForgeIntentStat[];
};

/**
 * A single entry in the `topIntents` array of `ForgeStats`.
 */
export type ForgeIntentStat = {
    /** Slugified intent name. */
    readonly intent: string;
    /** Number of times this intent was forged. */
    readonly count: number;
};

// ---------------------------------------------------------------------------
// ComponentForge Interface (public API)
// ---------------------------------------------------------------------------

/**
 * The Enterstellar Component Forge — the self-growing registry's brain.
 *
 * Created via `createComponentForge(config)`. Returns a plain object
 * with closures — no class instance, no prototype chain (R1 pattern).
 *
 * **Hot Path:** `forge()` generates ephemeral `ComponentContract` instances
 * for unmatched intents. LocalForge handles simple patterns (free),
 * CloudForge handles complex generation (IPU metered).
 *
 * **Cold Path:** Every invocation is logged to the trace store. The
 * Cold Path pipeline (server-side) clusters frequent intents and
 * generates candidate contracts for HITL promotion.
 *
 * @see Implementation Bible §4.10
 * @see Design Choices F1–F14
 *
 * @example
 * ```ts
 * import { createComponentForge } from '@enterstellar-ai/forge';
 *
 * const forge = createComponentForge({
 *   routing: 'auto',
 *   compiler,
 *   registry,
 *   constraints: { designTokens, componentPatterns: ['card', 'list'], ... },
 *   coldPath: { enabled: true, clusterThreshold: 5, autoPromote: false },
 *   onCloudForge: async (intent, prompt) => cloudClient.forge(intent, prompt),
 * });
 *
 * const result = await forge.forge(intent);
 * // result.success === true, result.contract is a valid ComponentContract
 * ```
 */
export interface ComponentForge {
    /**
     * Generates a temporary `ComponentContract` for an unmatched intent.
     *
     * Routes to LocalForge or CloudForge based on the `routing` config
     * and intent complexity. The generated contract MUST pass the Enterstellar
     * compiler before being returned (L3, L13).
     *
     * @param intent - The `ComponentIntent` that had no registry match.
     * @param context - Optional context metadata for CloudForge enrichment.
     * @returns A `ForgeResult` with the generated contract, compilation status, and forge mode.
     *
     * @see Hot Path Rules 1–7 (Bible §4.10)
     * @see Design Choice F8 — auto-routing chain: registry → LocalForge → CloudForge.
     */
    forge(
        intent: ComponentIntent,
        context?: Readonly<Record<string, unknown>>,
    ): Promise<ForgeResult>;

    /**
     * Registers a custom template for LocalForge.
     *
     * Custom templates pass structural validation against `ForgeTemplateSchema`
     * but NOT the full compiler pipeline. On `routing: 'auto'`, if LocalForge
     * can't match any template (including custom ones), it silently escalates
     * to CloudForge.
     *
     * @param name - Unique template name (e.g., `'timeline'`).
     * @param template - The template schema to register.
     * @throws {EnterstellarError} `ENS-4005` if the template fails structural validation.
     *
     * @see Design Choice F3 — custom templates via `forge.registerTemplate()`.
     */
    registerTemplate(name: string, template: ForgeTemplate): void;

    /**
     * Returns forge invocation statistics.
     *
     * @returns `ForgeStats` with totals, success/failure counts, and top intents.
     *
     * @see Bible §4.10 — `getStats()` signature.
     */
    getStats(): ForgeStats;

    /**
     * Returns the Cold Path trace history.
     *
     * Each forge invocation is logged as a `ForgeTraceRecord` for clustering
     * analysis by the Cold Path pipeline (server-side, F10).
     *
     * @returns Array of `ForgeTraceRecord` entries.
     */
    getTraceHistory(): readonly ForgeTraceRecord[];
}
