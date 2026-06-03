/**
 * @module @enterstellar-ai/state/version
 * @description Schema version constant for `@enterstellar-ai/state`.
 *
 * This version tracks the shape of `SerializedState`. When the serialized
 * format changes, this version is bumped and a migration is registered
 * in `migrations/index.ts`.
 *
 * @see Design Choice S5 (amended v2) — semver schema versioning.
 * @see Design Choice T14 — version export pattern.
 */

/**
 * Current schema version for `@enterstellar-ai/state` serialized state.
 *
 * Uses semantic versioning:
 * - **Patch** (1.0.x): No migration needed, Zod validates only.
 * - **Minor** (1.x.0): Forward-compatible via `.passthrough()`, backward via chained migration.
 * - **Major** (x.0.0): Hard reject on forward incompatibility (`ENS-4007`).
 */
export const STATE_SCHEMA_VERSION = '1.0.0';
