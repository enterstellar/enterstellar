/**
 * @module @enterstellar-ai/adapters
 * @description Pluggable infrastructure adapters — auth, data, error handling, analytics.
 *
 * This package provides factory functions for creating validated adapter instances
 * that bridge Enterstellar components to external services. Every adapter method is wrapped
 * in error handling (AD5) — raw vendor errors never leak to consumers.
 *
 * ## Quick Start
 *
 * ```ts
 * import {
 *   createAuthAdapter,
 *   createDataAdapter,
 *   createErrorAdapter,
 *   createAnalyticsAdapter,
 * } from '@enterstellar-ai/adapters';
 *
 * // Create adapters with your implementations
 * const auth = createAuthAdapter({
 *   name: 'supabase-auth',
 *   getSession: async () => { ... },
 *   hasRole: async (role) => { ... },
 *   onAuthChange: (cb) => { ... },
 * });
 *
 * const data = createDataAdapter({
 *   name: 'supabase-data',
 *   query: async (resource, params) => { ... },
 *   mutate: async (resource, action, payload) => { ... },
 *   subscribe: (resource, callback) => { ... },
 * });
 *
 * // Pass to Provider
 * <Provider adapters={{ auth, data }} ... />
 *
 * // For testing, use noop adapters
 * import { createNoopAuthAdapter, createNoopDataAdapter } from '@enterstellar-ai/adapters';
 * ```
 *
 * @see Implementation Bible §4.15
 * @see Design Choices AD1–AD5
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export { createAuthAdapter } from './create-auth-adapter.js';
export { createDataAdapter } from './create-data-adapter.js';
export { createErrorAdapter } from './create-error-adapter.js';
export { createAnalyticsAdapter } from './create-analytics-adapter.js';

// ---------------------------------------------------------------------------
// No-Op Factories (testing & development)
// ---------------------------------------------------------------------------
export { createNoopAuthAdapter } from './create-auth-adapter.js';
export { createNoopDataAdapter } from './create-data-adapter.js';
export { createNoopErrorAdapter } from './create-error-adapter.js';
export { createNoopAnalyticsAdapter } from './create-analytics-adapter.js';

// ---------------------------------------------------------------------------
// Error Factories (ENS-7001–7005)
// ---------------------------------------------------------------------------
export {
    adapterValidationError,
    adapterMethodError,
    adapterQueryError,
    adapterMutationError,
    adapterAuthError,
} from './errors.js';

// ---------------------------------------------------------------------------
// Validation Utilities
// ---------------------------------------------------------------------------
export { validateAdapterConfig } from './validate-adapter.js';

// ---------------------------------------------------------------------------
// Types (module-local config types)
// ---------------------------------------------------------------------------
export type {
    AuthAdapterConfig,
    DataAdapterConfig,
    ErrorAdapterConfig,
    AnalyticsAdapterConfig,
    AdapterType,
} from './types.js';

// ---------------------------------------------------------------------------
// Re-exports from @enterstellar-ai/types (consumer convenience)
// ---------------------------------------------------------------------------
export type {
    AuthAdapter,
    DataAdapter,
    ErrorAdapter,
    AnalyticsAdapter,
} from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { ADAPTERS_VERSION } from './version.js';
