/**
 * @module @enterstellar-ai/agent-sdk/tools/get-component-schema
 * @description Implements the `enterstellar_get_component_schema` MCP tool.
 *
 * Retrieves a registered component's props schema in JSON Schema format.
 * Agents use this to understand the expected props shape before composing
 * a UI specification. This is the introspection endpoint for the registry.
 *
 * **Schema format:** The registry stores Zod schemas internally and
 * exposes them as JSON-compatible records via the component contract's
 * `props` field. The SDK returns this record directly — no additional
 * Zod-to-JSON conversion is needed at this layer.
 *
 * **Edge cases:**
 * - Component not found → `ENS-8004` with guidance to use search.
 * - Empty component name → same error path (registry returns `undefined`).
 * - Component with no props → returns `{ schema: {} }` (valid).
 *
 * @see Bible §4.16 — `enterstellar_get_component_schema` tool definition.
 * @see Design Choice R8 — Zod v4 `.json()` for JSON Schema at the registry level.
 */

import type { ComponentSchemaResult, AgentSDKRegistry } from '../types.js';
import { componentSchemaNotFoundError } from '../errors.js';

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar_get_component_schema` tool.
 *
 * Looks up the component by name in the registry and returns its props
 * schema as a JSON-compatible record. The agent can use this schema to
 * understand what props are required/optional before calling `enterstellar_compose_ui`.
 *
 * @param registry - The component registry to search.
 * @param componentName - PascalCase component name (e.g., `'PatientVitals'`).
 * @returns A `ComponentSchemaResult` with the component's props schema.
 *
 * @throws {EnterstellarError} Code `ENS-8004` if the component is not found in the registry.
 *
 * @example
 * ```ts
 * const result = executeGetComponentSchema(registry, 'PatientVitals');
 * // result.componentName === 'PatientVitals'
 * // result.schema === { patientId: { type: 'string' }, ... }
 * ```
 */
export function executeGetComponentSchema(
    registry: AgentSDKRegistry,
    componentName: string,
): ComponentSchemaResult {
    const contract = registry.get(componentName);

    if (contract === undefined) {
        throw componentSchemaNotFoundError(componentName);
    }

    return {
        componentName: contract.name,
        schema: contract.props,
    };
}
