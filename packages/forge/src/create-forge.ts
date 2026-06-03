/**
 * @module @enterstellar-ai/forge/create-forge
 * @description Factory function for the Enterstellar Component Forge.
 *
 * `createComponentForge()` wires together all forge subsystems:
 * - **Template Registry** — built-in + custom templates for LocalForge.
 * - **LocalForge** — template-based contract generation (free, no LLM).
 * - **CloudForge** — LLM-powered contract generation via callback (metered).
 * - **Cold Path Tracker** — trace recording + clustering for promotion.
 * - **Compiler** — every forged contract passes through the compiler (L3).
 *
 * The factory validates the configuration, initializes internal state, and
 * returns a frozen `ComponentForge` object — consistent with the
 * factory-function-returning-object pattern used across Enterstellar (R1).
 *
 * **Routing chain:** LocalForge → CloudForge → fallback (F8, F9).
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
 * ```
 */

import type { ComponentCategory, ComponentIntent, ForgeResult, ForgeTraceRecord } from '@enterstellar-ai/types';

import type {
    ComponentForge,
    ForgeConfig,
    ForgeStats,
    ForgeTemplate,
} from './types.js';
import { forgeLocal } from './local-forge.js';
import { forgeCloud } from './cloud-forge.js';
import { createTemplateRegistry } from './templates/registry.js';
import { createColdPathTracker } from './cold-path.js';
import { slugifyIntent, xxHash8 } from './naming.js';
import { forgeCompilationFailedError } from './errors.js';

// ---------------------------------------------------------------------------
// Internal Stats Tracker
// ---------------------------------------------------------------------------

/**
 * Mutable internal statistics tracker.
 * Updated on every `forge()` invocation.
 */
type MutableStats = {
    totalForged: number;
    successCount: number;
    failureCount: number;
    localCount: number;
    cloudCount: number;
    intentCounts: Map<string, number>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `ComponentForge` — the self-growing registry's brain.
 *
 * **Configuration:**
 * - `routing` — `'auto'` (default), `'local-only'`, or `'cloud-only'`.
 * - `constraints` — design tokens, allowed patterns, complexity, accessibility.
 * - `coldPath` — trace recording and clustering config.
 * - `compiler` — the Enterstellar compiler instance (forged contracts MUST compile).
 * - `registry` — the Enterstellar registry (for design token resolution).
 * - `onCloudForge` — optional callback for LLM-powered generation.
 *
 * **Returns** a frozen `ComponentForge` object with:
 * - `forge(intent)` — generates a temporary contract.
 * - `registerTemplate(name, template)` — adds a custom LocalForge template.
 * - `getStats()` — forge invocation statistics.
 * - `getTraceHistory()` — Cold Path trace records.
 *
 * @param config - Full forge configuration.
 * @returns A `ComponentForge` instance.
 *
 * @see Design Choice R1 — factory pattern, plain object with closures.
 * @see Design Choice F8 — routing chain: LocalForge → CloudForge → fallback.
 */
export function createComponentForge(config: ForgeConfig): ComponentForge {
    // -----------------------------------------------------------------------
    // Initialize subsystems
    // -----------------------------------------------------------------------

    const templateRegistry = createTemplateRegistry();
    const coldPathTracker = createColdPathTracker();

    /** Mutable stats — encapsulated, never leaked. */
    const stats: MutableStats = {
        totalForged: 0,
        successCount: 0,
        failureCount: 0,
        localCount: 0,
        cloudCount: 0,
        intentCounts: new Map<string, number>(),
    };

    // -----------------------------------------------------------------------
    // forge() — the core Hot Path function
    // -----------------------------------------------------------------------

    /**
     * Generates a temporary `ComponentContract` for an unmatched intent.
     *
     * **Routing chain (F8):**
     * 1. If `routing` is `'auto'` or `'local-only'` → try LocalForge.
     * 2. If LocalForge returns `null` and `routing` is `'auto'` or `'cloud-only'` → try CloudForge.
     * 3. If CloudForge returns `null` → fallback result.
     * 4. Compile the forged contract (L3). If compilation fails → fallback.
     * 5. Record trace for Cold Path (Hot Path Rule 6).
     * 6. Return `ForgeResult`.
     */
    async function forge(
        intent: ComponentIntent,
        context?: Readonly<Record<string, unknown>>,
    ): Promise<ForgeResult> {
        stats.totalForged += 1;

        // Track intent frequency
        const intentSlug = slugifyIntent(intent.component);
        const currentCount = stats.intentCounts.get(intentSlug);
        stats.intentCounts.set(intentSlug, (currentCount ?? 0) + 1);

        // ----- Phase 1: Attempt LocalForge -----
        let forgedContract = null;
        let forgeMode: 'local' | 'cloud' = 'local';

        if (config.routing === 'auto' || config.routing === 'local-only') {
            // Derive category from intent (simple heuristic — default data-display)
            const category = deriveCategory(intent);
            forgedContract = forgeLocal(
                intent,
                templateRegistry,
                config.constraints,
                category,
            );

            if (forgedContract !== null) {
                forgeMode = 'local';
                stats.localCount += 1;
            }
        }

        // ----- Phase 2: Attempt CloudForge (if LocalForge returned null) -----
        if (forgedContract === null && config.routing !== 'local-only') {
            if (config.onCloudForge !== undefined) {
                forgedContract = await forgeCloud(
                    intent,
                    config.constraints,
                    config.onCloudForge,
                );

                if (forgedContract !== null) {
                    forgeMode = 'cloud';
                    stats.cloudCount += 1;
                }
            }
        }

        // ----- Phase 3: No contract generated → fallback -----
        if (forgedContract === null) {
            stats.failureCount += 1;
            recordTrace(intent, 'local', false, context);

            return createFallbackResult(forgeMode);
        }

        // ----- Phase 4: Compile the forged contract (L3 — never bypassed) -----
        const compilationResult = await config.compiler.compile(
            {
                component: forgedContract.name,
                props: {},
                confidence: 0.5,
            },
            { agent: 'forge' },
        );

        if (compilationResult.status === 'fail') {
            stats.failureCount += 1;
            recordTrace(intent, forgeMode, false, context);

            // Log the compilation failure (ENS-4004) but don't throw.
            // The error is available via getStats() and trace history.
            void forgeCompilationFailedError(
                forgedContract.name,
                compilationResult.errors.length,
            );

            return createFallbackResult(forgeMode);
        }

        // ----- Phase 5: Success -----
        stats.successCount += 1;
        recordTrace(intent, forgeMode, true, context);

        return {
            success: true,
            contract: forgedContract,
            compilationResult,
            fallbackUsed: false,
            forgeMode,
        };
    }

    // -----------------------------------------------------------------------
    // Cold Path trace recording (Hot Path Rule 6)
    // -----------------------------------------------------------------------

    /**
     * Records a forge trace for Cold Path analysis.
     * Called on every forge invocation, regardless of success/failure.
     */
    function recordTrace(
        intent: ComponentIntent,
        forgeMode: 'local' | 'cloud',
        success: boolean,
        context?: Readonly<Record<string, unknown>>,
    ): void {
        if (!config.coldPath.enabled) {
            return;
        }

        const record: ForgeTraceRecord = {
            intentSlug: slugifyIntent(intent.component),
            intentHash: xxHash8(intent.component),
            forgeMode,
            success,
            timestamp: new Date().toISOString(),
            ...(context !== undefined ? { context } : {}),
        };

        coldPathTracker.recordTrace(record);
    }

    // -----------------------------------------------------------------------
    // Category derivation (simple heuristic)
    // -----------------------------------------------------------------------

    /**
     * Derives a `ComponentCategory` from intent metadata.
     *
     * This is a simple heuristic — in production, the Semantic Index would
     * provide category classification. For LocalForge, we use intent
     * `interaction` and `mode` hints to narrow the match.
     */
    function deriveCategory(intent: ComponentIntent): ComponentCategory {
        // Use interaction hint if available
        if (intent.interaction === 'editable') {
            return 'form';
        }

        // Use mode hint if available
        if (intent.mode !== undefined) {
            const modeMap: Readonly<Record<string, ComponentCategory>> = {
                'list': 'data-display',
                'detail': 'data-display',
                'summary': 'data-display',
                'comparison': 'data-display',
                'time-series': 'data-display',
                'snapshot': 'data-display',
            };
            const mapped = modeMap[intent.mode];
            if (mapped !== undefined) {
                return mapped;
            }
        }

        // Default
        return 'data-display';
    }

    // -----------------------------------------------------------------------
    // Fallback result builder
    // -----------------------------------------------------------------------

    /**
     * Creates a `ForgeResult` indicating fallback was used.
     */
    function createFallbackResult(forgeMode: 'local' | 'cloud'): ForgeResult {
        return {
            success: false,
            contract: null,
            compilationResult: null,
            fallbackUsed: true,
            forgeMode,
        };
    }

    // -----------------------------------------------------------------------
    // registerTemplate
    // -----------------------------------------------------------------------

    function registerTemplate(name: string, template: ForgeTemplate): void {
        templateRegistry.registerTemplate(name, template);
    }

    // -----------------------------------------------------------------------
    // getStats
    // -----------------------------------------------------------------------

    function getStats(): ForgeStats {
        // Build topIntents sorted by count descending
        const topIntents: Array<{ intent: string; count: number }> = [];

        for (const [intent, count] of stats.intentCounts) {
            topIntents.push({ intent, count });
        }

        topIntents.sort((a, b) => b.count - a.count);

        return {
            totalForged: stats.totalForged,
            successCount: stats.successCount,
            failureCount: stats.failureCount,
            localCount: stats.localCount,
            cloudCount: stats.cloudCount,
            topIntents: topIntents.slice(0, 20),
        };
    }

    // -----------------------------------------------------------------------
    // getTraceHistory
    // -----------------------------------------------------------------------

    function getTraceHistory(): readonly ForgeTraceRecord[] {
        return coldPathTracker.getTraceHistory();
    }

    // -----------------------------------------------------------------------
    // Return frozen public API
    // -----------------------------------------------------------------------

    return Object.freeze({
        forge,
        registerTemplate,
        getStats,
        getTraceHistory,
    });
}
