/**
 * @module @enterstellar-ai/agent-sdk/tools
 * @description Barrel re-exports for all MCP tool implementations.
 *
 * Each tool is an independent, testable function that takes its required
 * dependencies as parameters (dependency injection). The factory function
 * `createAgentSDK()` wires these tools to the actual module instances.
 *
 * **6 Atomic Tools:**
 * - `executeSearchComponents` — semantic component search (SI).
 * - `executeComposeUI` — UI specification assembly.
 * - `executeValidateSpec` — compiler validation (L3).
 * - `executeAnalyzeTraces` — trace aggregation analytics (AS5).
 * - `executeForgeComponent` — runtime component generation.
 * - `executeGetComponentSchema` — registry introspection.
 *
 * **1 Composite Tool:**
 * - `executeBuildUI` — search → compose → validate chain (AS2).
 *
 * @see Bible §4.16 — MCP tool definitions.
 * @see Design Choice AS2 — 6 atomic + 1 composite.
 */

// ---------------------------------------------------------------------------
// Atomic Tools
// ---------------------------------------------------------------------------
export { executeSearchComponents } from './search-components.js';
export { executeComposeUI } from './compose-ui.js';
export { executeValidateSpec } from './validate-spec.js';
export { executeAnalyzeTraces } from './analyze-traces.js';
export { executeForgeComponent } from './forge-component.js';
export { executeGetComponentSchema } from './get-component-schema.js';

// ---------------------------------------------------------------------------
// Composite Tools
// ---------------------------------------------------------------------------
export { executeBuildUI } from './build-ui.js';
