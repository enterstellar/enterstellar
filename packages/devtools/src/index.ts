/**
 * @module @enterstellar-ai/devtools
 * @description Public API barrel for the `@enterstellar-ai/devtools` package.
 *
 * Exports the primary `<EnterstellarDevTools />` component and supporting types
 * for consumer configuration. This is the only file consumers should
 * import from.
 *
 * Usage:
 * ```tsx
 * import { EnterstellarDevTools } from '@enterstellar-ai/devtools';
 * import type { DevToolsConfig, DevToolsCacheAdapter } from '@enterstellar-ai/devtools';
 * ```
 *
 * @see Bible §4.4 — DevTools module specification
 * @see Design Choice DT3 — tree-shakeable, separate entry point
 */

// ---------------------------------------------------------------------------
// Component Export
// ---------------------------------------------------------------------------

export { EnterstellarDevTools } from './devtools.js';

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type {
    DevToolsConfig,
    DevToolsTab,
    DevToolsCacheAdapter,
    LatencyStats,
} from './types.js';

// ---------------------------------------------------------------------------
// Utility Exports
// ---------------------------------------------------------------------------

export { exportTraces } from './export-traces.js';
