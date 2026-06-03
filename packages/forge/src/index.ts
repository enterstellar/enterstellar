/**
 * @module @enterstellar-ai/forge
 * @description Enterstellar Component Forge — runtime component generation when the
 * registry has no match. LocalForge (templates, free) and CloudForge
 * (LLM-powered, metered) contract generation.
 *
 * The Forge is the self-growing registry's brain — Moat M2 (ForgeSignal Corpus)
 * and Moat M5 (Forge Model). It generates ephemeral `ComponentContract`
 * instances that MUST pass the compiler (L3), uses only approved templates
 * or LLM-constrained generation (F7), and logs every invocation to the
 * Cold Path for clustering and promotion.
 *
 * ## Quick Start
 *
 * ```ts
 * import { createComponentForge } from '@enterstellar-ai/forge';
 *
 * const forge = createComponentForge({
 *   routing: 'auto',
 *   compiler,
 *   registry,
 *   constraints: {
 *     designTokens: registry.getDesignTokens(),
 *     componentPatterns: ['card', 'list', 'table', 'chart', 'form', 'detail', 'badge'],
 *     maxComplexity: 5,
 *     requiredStates: ['loading', 'error', 'empty', 'ready'],
 *     accessibility: 'WCAG-AA',
 *   },
 *   coldPath: { enabled: true, clusterThreshold: 5, autoPromote: false },
 *   onCloudForge: async (intent, prompt) => cloudClient.forge(intent, prompt),
 * });
 *
 * const result = await forge.forge(intent);
 * // result.success === true → result.contract is a valid ComponentContract
 * ```
 *
 * @see Implementation Bible §4.10
 * @see Design Choices F1–F14
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export { createComponentForge } from './create-forge.js';

// ---------------------------------------------------------------------------
// Types (public API surface)
// ---------------------------------------------------------------------------
export type {
    ComponentForge,
    ForgeConfig,
    ForgeConstraints,
    ForgePatternName,
    ForgeStats,
    ForgeIntentStat,
    ForgeTemplate,
    ForgeTemplateSlot,
    CloudForgeCallback,
} from './types.js';

// ---------------------------------------------------------------------------
// Cold Path Types
// ---------------------------------------------------------------------------
export type { ClusteredIntent, ColdPathTracker } from './cold-path.js';

// ---------------------------------------------------------------------------
// Template Registry Types
// ---------------------------------------------------------------------------
export type { TemplateRegistry } from './templates/registry.js';

// ---------------------------------------------------------------------------
// Built-in Templates (for testing, documentation, and inspection)
// ---------------------------------------------------------------------------
export { BUILTIN_TEMPLATES, BUILTIN_TEMPLATE_NAMES } from './templates/builtin.js';

// ---------------------------------------------------------------------------
// Template Schema (for custom template validation in consumer code)
// ---------------------------------------------------------------------------
export { ForgeTemplateSchema, ForgeTemplateSlotSchema } from './templates/types.js';

// ---------------------------------------------------------------------------
// Naming Utilities (for testing and advanced usage)
// ---------------------------------------------------------------------------
export { generateForgedName, slugifyIntent, xxHash8 } from './naming.js';

// ---------------------------------------------------------------------------
// Error Factories (for testing and consumer error handling)
// ---------------------------------------------------------------------------
export {
    forgeGenerationFailedError,
    templateNotFoundError,
    cloudForgeNetworkError,
    forgeCompilationFailedError,
    templateValidationError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { FORGE_VERSION } from './version.js';
