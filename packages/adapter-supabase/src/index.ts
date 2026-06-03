/**
 * @module @enterstellar-ai/adapter-supabase
 * @description Supabase adapter — Auth + Data adapters for Supabase.
 *
 * This package provides factory functions that map Supabase SDK calls to
 * Enterstellar adapter interfaces. Each factory delegates to `createAuthAdapter()`
 * or `createDataAdapter()` from `@enterstellar-ai/adapters` for validation and
 * AD5 error wrapping.
 *
 * ## Quick Start
 *
 * ```ts
 * import { createClient } from '@supabase/supabase-js';
 * import {
 *   createSupabaseAuthAdapter,
 *   createSupabaseDataAdapter,
 * } from '@enterstellar-ai/adapter-supabase';
 *
 * const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *
 * const auth = createSupabaseAuthAdapter({ client: supabase });
 * const data = createSupabaseDataAdapter({ client: supabase });
 *
 * // Pass adapters to Provider
 * // <Provider adapters={{ auth, data }} ... />
 * ```
 *
 * @see Bible §4.15
 * @see Design Choice AD1, AD4
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export { createSupabaseAuthAdapter } from './create-supabase-auth-adapter.js';
export { createSupabaseDataAdapter } from './create-supabase-data-adapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type { SupabaseAuthConfig, SupabaseDataConfig } from './types.js';

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { SUPABASE_ADAPTER_VERSION } from './version.js';
