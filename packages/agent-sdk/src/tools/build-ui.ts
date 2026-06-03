/**
 * @module @enterstellar-ai/agent-sdk/tools/build-ui
 * @description Implements the composite `enterstellar_build_ui` MCP tool (AS2).
 *
 * Chains three atomic tools in sequence:
 * 1. **Search** — finds components matching the natural-language query.
 * 2. **Compose** — assembles a `UISpec` from zone specifications.
 * 3. **Validate** — runs the spec through the Enterstellar compiler (L3).
 *
 * This composite tool saves 2 round-trips for the 90% use case where
 * an agent wants to go from intent to validated UI in one call.
 *
 * **Auto-fill behaviour:** If a zone's `component` is empty (`''`),
 * it is auto-filled from search results by position. Zones with
 * explicit component names are kept as-is. This allows agents to
 * specify "fill this zone with whatever matches the query."
 *
 * **Error propagation:** Search and compose errors propagate normally.
 * Validation failures do NOT throw — the result is returned with
 * `validation.status === 'fail'` so the agent can decide next steps.
 *
 * @see Design Choice AS2 — 6 atomic + 1 composite tool.
 * @see Bible §4.16 — composite tool specification.
 */

import type { SemanticSearchResult } from '@enterstellar-ai/types';

import type {
    ZoneSpec,
    BuildUIResult,
    AgentSDKRegistry,
    AgentSDKCompiler,
    AgentSDKSemanticIndex,
} from '../types.js';
import { executeSearchComponents } from './search-components.js';
import { executeComposeUI } from './compose-ui.js';
import { executeValidateSpec } from './validate-spec.js';

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

/**
 * Executes the composite `enterstellar_build_ui` tool.
 *
 * Orchestrates search → compose → validate in a single call. Zones
 * with empty `component` fields are auto-filled from search results.
 *
 * @param semanticIndex - The semantic index for component search.
 * @param registry - The registry for component validation.
 * @param compiler - The compiler for spec validation (L3).
 * @param query - Natural-language intent string for search.
 * @param zones - Zone specifications (empty `component` fields auto-filled from search).
 * @returns Combined `BuildUIResult` with search results, spec, and validation.
 *
 * @throws {EnterstellarError} Code `ENS-8002` if search fails.
 * @throws {EnterstellarError} Code `ENS-8003` if compose fails (e.g., unknown component after auto-fill).
 *
 * @example
 * ```ts
 * const result = await executeBuildUI(
 *   semanticIndex, registry, compiler,
 *   'show patient vitals and medication list',
 *   [
 *     { name: 'main', component: '', props: {}, determinism: 0.5 },
 *     { name: 'sidebar', component: '', props: {}, determinism: 0.0 },
 *   ],
 * );
 * // result.searchResults — matching components
 * // result.spec.zones — auto-filled with search results
 * // result.validation.status — 'pass' | 'corrected' | 'fail'
 * ```
 */
export async function executeBuildUI(
    semanticIndex: AgentSDKSemanticIndex,
    registry: AgentSDKRegistry,
    compiler: AgentSDKCompiler,
    query: string,
    zones: readonly ZoneSpec[],
): Promise<BuildUIResult> {
    // -----------------------------------------------------------------------
    // Step 1: Search for matching components
    // -----------------------------------------------------------------------

    const searchResults = await executeSearchComponents(
        semanticIndex,
        query,
        zones.length > 0 ? zones.length : undefined,
    );

    // -----------------------------------------------------------------------
    // Step 2: Auto-fill empty component fields from search results
    // -----------------------------------------------------------------------

    const filledZones = autoFillZones(zones, searchResults);

    // -----------------------------------------------------------------------
    // Step 3: Compose the UI specification
    // -----------------------------------------------------------------------

    const spec = executeComposeUI(registry, filledZones);

    // -----------------------------------------------------------------------
    // Step 4: Validate through the compiler (L3)
    // -----------------------------------------------------------------------

    const validation = await executeValidateSpec(compiler, spec);

    // -----------------------------------------------------------------------
    // Return combined result
    // -----------------------------------------------------------------------

    return {
        searchResults,
        spec,
        validation,
    };
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Auto-fills empty `component` fields in zones from search results.
 *
 * For each zone where `component === ''`, assigns the component name
 * from the corresponding search result (by position). If there are
 * more empty zones than search results, the remaining zones keep
 * their empty component — compose will catch this as an error.
 *
 * Zones with explicit (non-empty) component names are left unchanged.
 *
 * @param zones - Original zone specifications from the agent.
 * @param searchResults - Search results to auto-fill from.
 * @returns New array of zones with auto-filled component names.
 */
function autoFillZones(
    zones: readonly ZoneSpec[],
    searchResults: readonly SemanticSearchResult[],
): readonly ZoneSpec[] {
    let searchIndex = 0;

    return zones.map((zone): ZoneSpec => {
        // Zone already has an explicit component — keep it
        if (zone.component.length > 0) {
            return zone;
        }

        // Auto-fill from search results by position
        const searchResult = searchResults[searchIndex];
        searchIndex += 1;

        if (searchResult === undefined) {
            // No more search results — keep empty (compose will error)
            return zone;
        }

        return {
            name: zone.name,
            component: searchResult.componentName,
            props: zone.props,
            determinism: zone.determinism,
        };
    });
}
