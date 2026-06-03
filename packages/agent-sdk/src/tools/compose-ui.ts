/**
 * @module @enterstellar-ai/agent-sdk/tools/compose-ui
 * @description Implements the `enterstellar_compose_ui` MCP tool.
 *
 * Constructs a validated `UISpec` from an array of `ZoneSpec` assignments.
 * Each zone is validated against the registry (component must exist) and
 * structural rules (determinism must be 0.0–1.0, zone names must be unique).
 *
 * **Validation rules:**
 * 1. Each zone's `component` must exist in the registry.
 * 2. Each zone's `determinism` must be in [0.0, 1.0].
 * 3. Zone names must be unique within the spec.
 * 4. Empty zones array is valid (clears all zones).
 *
 * **Error handling:** All validation failures produce `ENS-8003` with
 * descriptive messages so the agent can self-correct.
 *
 * @see Bible §4.16 — `enterstellar_compose_ui` tool definition.
 * @see Design Choice AS3 — flat list, reference by name, determinism per zone.
 * @see Design Choice T13 — determinism is raw `number`, runtime validated.
 */

import type { ZoneSpec, UISpec, AgentSDKRegistry } from '../types.js';
import { composeFailedError } from '../errors.js';

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar_compose_ui` tool.
 *
 * Validates each zone specification and assembles a `UISpec`. The `layout`
 * parameter is stored as metadata but does not affect zone structure in v1
 * (per C20 — no layout compilation until the pattern matures).
 *
 * @param registry - The component registry to validate component names against.
 * @param zones - Array of zone specifications from the agent.
 * @param _layout - Layout hint (e.g., `'grid'`, `'stack'`). Reserved for future use.
 * @returns A validated `UISpec` containing the zone assignments.
 *
 * @throws {EnterstellarError} Code `ENS-8003` if any validation rule is violated.
 *
 * @example
 * ```ts
 * const spec = await executeComposeUI(registry, [
 *   { name: 'main', component: 'PatientVitals', props: { patientId: '123' }, determinism: 0.5 },
 *   { name: 'sidebar', component: 'MedicationList', props: {}, determinism: 0.0 },
 * ]);
 * // spec.zones.length === 2
 * ```
 */
export function executeComposeUI(
    registry: AgentSDKRegistry,
    zones: readonly ZoneSpec[],
    _layout?: string,
): UISpec {
    // Empty zones → valid empty spec (clears all zones)
    if (zones.length === 0) {
        return { zones: [] };
    }

    // -----------------------------------------------------------------------
    // Validation Pass 1: Unique zone names
    // -----------------------------------------------------------------------

    const seenNames = new Set<string>();

    for (const zone of zones) {
        if (seenNames.has(zone.name)) {
            throw composeFailedError(
                `Duplicate zone name '${zone.name}'. Each zone must have a unique name.`,
            );
        }
        seenNames.add(zone.name);
    }

    // -----------------------------------------------------------------------
    // Validation Pass 2: Component existence + determinism range
    // -----------------------------------------------------------------------

    for (const zone of zones) {
        // Validate component exists in registry
        const contract = registry.get(zone.component);
        if (contract === undefined) {
            throw composeFailedError(
                `Zone '${zone.name}' references unknown component '${zone.component}'. ` +
                `Use enterstellar_search_components to discover available components.`,
            );
        }

        // Validate determinism range (T13: raw number, Zod-validated)
        if (zone.determinism < 0 || zone.determinism > 1) {
            throw composeFailedError(
                `Zone '${zone.name}' has invalid determinism ${String(zone.determinism)}. ` +
                `Must be between 0.0 (locked) and 1.0 (generative).`,
            );
        }
    }

    // -----------------------------------------------------------------------
    // Assemble validated UISpec
    // -----------------------------------------------------------------------

    return {
        zones: zones.map((zone) => ({
            name: zone.name,
            component: zone.component,
            props: zone.props,
            determinism: zone.determinism,
        })),
    };
}
