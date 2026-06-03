/**
 * @module @enterstellar-ai/state/migrations
 * @description Built-in state migrations for `@enterstellar-ai/state`.
 *
 * All migrations are forward-only: they transform a `SerializedState` from
 * an older `schemaVersion` to a newer one. Migrations chain sequentially
 * (e.g., `1.0.0 → 1.1.0 → 1.2.0`).
 *
 * This file is the **single source of truth** for all built-in migrations.
 * They are auto-registered by `createEnterstellarStore()` on initialization.
 *
 * **Adding a new migration:**
 * 1. Bump `STATE_SCHEMA_VERSION` in `version.ts`.
 * 2. Add a `MigrationConfig` to the `BUILT_IN_MIGRATIONS` array below.
 * 3. The migration function receives the old `SerializedState` and returns
 *    the new `SerializedState` with structural changes applied.
 * 4. Only handle structural changes (field additions/renames/removals).
 *    Never migrate semantic meaning.
 *
 * @see Design Choice S5 (amended v2) — semver schema versioning + chained migrations.
 */

import type { MigrationConfig } from '@enterstellar-ai/types';
import type { MigrationRegistry } from '../types.js';

// ---------------------------------------------------------------------------
// Built-in Migrations
// ---------------------------------------------------------------------------

/**
 * Array of all built-in state migrations, ordered by version.
 *
 * At `STATE_SCHEMA_VERSION = '1.0.0'`, no predecessors exist.
 * Future migrations are appended here as the serialized state shape evolves.
 *
 * @example
 * ```ts
 * // When STATE_SCHEMA_VERSION bumps to '1.1.0':
 * BUILT_IN_MIGRATIONS.push({
 *   from: '1.0.0',
 *   to: '1.1.0',
 *   migrate: (state) => ({
 *     ...state,
 *     schemaVersion: '1.1.0',
 *     newField: defaultValue,
 *   }),
 * });
 * ```
 */
const BUILT_IN_MIGRATIONS: readonly MigrationConfig[] = [
    // No migrations yet — v1.0.0 is the first version.
];

// ---------------------------------------------------------------------------
// Registry Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `MigrationRegistry` pre-populated with all built-in migrations.
 *
 * The registry is a `Map<string, MigrationConfig>` keyed by the `from` version.
 * Consumer-registered migrations (via `store.registerMigration()`) are added
 * to this same registry at runtime.
 *
 * @returns A `MigrationRegistry` with all built-in migrations.
 */
export function createMigrationRegistry(): MigrationRegistry {
    const registry: MigrationRegistry = new Map();

    for (const migration of BUILT_IN_MIGRATIONS) {
        registry.set(migration.from, migration);
    }

    return registry;
}
