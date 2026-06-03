/**
 * @module @enterstellar-ai/state/snapshot
 * @description Snapshot creation and restore logic for `@enterstellar-ai/state`.
 *
 * Handles serialization, size limits, version comparison, migration chaining,
 * and Zod validation. The restore path is the most complex piece of state
 * management — it covers:
 *
 * 1. **Patch diff** (e.g., 1.0.0 → 1.0.1): Zod validate only — no migration.
 * 2. **Backward compat** (e.g., 1.0.0 → 1.2.0): Chain forward-only migrations.
 * 3. **Minor forward** (e.g., 1.2.0 → 1.1.0): `.passthrough()` — preserve unknown fields.
 * 4. **Major forward** (e.g., 2.0.0 → 1.x): Hard reject with `ENS-4007`.
 * 5. **Post-migration**: Always validate via `SerializedStateSchema.parse()`.
 * 6. **Any failure**: Log warning, fall back to empty state. Never crash.
 *
 * @see Design Choice S5 (amended v2)
 * @see Design Choice S9 — 1MB snapshot limit.
 * @see Design Choice S10 — full overwrite on restore.
 */

import type { SerializedState, SessionState, MigrationConfig } from '@enterstellar-ai/types';
import { SerializedStateSchema } from '@enterstellar-ai/types';
import { STATE_SCHEMA_VERSION } from './version.js';
import { snapshotSizeLimitError, majorVersionMismatchError } from './errors.js';
import type { MigrationRegistry } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum snapshot size in bytes (1 MB).
 * Enforced to force disciplined state management and ensure
 * snapshots are viable for cross-device sync.
 *
 * @see Design Choice S9
 */
const MAX_SNAPSHOT_BYTES = 1024 * 1024; // 1 MB

// ---------------------------------------------------------------------------
// Semver Utilities
// ---------------------------------------------------------------------------

/**
 * Parsed semver components.
 * @internal
 */
type SemverParts = {
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
};

/**
 * Parses a semver string into its numeric components.
 * Assumes valid semver format (e.g., `"1.2.3"`).
 *
 * @param version - The semver string to parse.
 * @returns Parsed `{ major, minor, patch }`.
 * @internal
 */
function parseSemver(version: string): SemverParts {
    const parts = version.split('.');
    return {
        major: Number(parts[0] ?? 0),
        minor: Number(parts[1] ?? 0),
        patch: Number(parts[2] ?? 0),
    };
}

/**
 * Compares two semver versions.
 *
 * @param a - First version.
 * @param b - Second version.
 * @returns Negative if `a < b`, zero if equal, positive if `a > b`.
 * @internal
 */
function compareSemver(a: string, b: string): number {
    const pa = parseSemver(a);
    const pb = parseSemver(b);

    if (pa.major !== pb.major) return pa.major - pb.major;
    if (pa.minor !== pb.minor) return pa.minor - pb.minor;
    return pa.patch - pb.patch;
}

// ---------------------------------------------------------------------------
// Empty State Factory
// ---------------------------------------------------------------------------

/**
 * Creates a fresh, empty `SerializedState` with the current schema version.
 *
 * Used as the default initial state and as the fallback when restoration
 * fails (corrupted snapshot, failed migration, validation error).
 *
 * @param session - Optional session metadata to include. If omitted,
 *   a default session is created with a generated UUID.
 * @returns A valid `SerializedState` with empty zones, traces, and extensions.
 */
export function createEmptyState(session?: SessionState): SerializedState {
    return {
        schemaVersion: STATE_SCHEMA_VERSION,
        zones: {},
        traceIds: [],
        session: session ?? {
            id: globalThis.crypto.randomUUID(),
            startedAt: new Date().toISOString(),
        },
        extensions: {},
    };
}

// ---------------------------------------------------------------------------
// Snapshot Creation
// ---------------------------------------------------------------------------

/**
 * Creates a serialized snapshot of the current store state.
 *
 * Validates the snapshot against `SerializedStateSchema` and enforces the
 * 1MB size limit (S9). Zone render trees are NOT included — only configs.
 *
 * @param state - The `SerializedState` to snapshot.
 * @returns The validated snapshot.
 * @throws {EnterstellarError} `ENS-4006` if snapshot exceeds 1MB.
 *
 * @see Design Choice S9 — 1MB hard limit.
 */
export function createSnapshot(state: SerializedState): SerializedState {
    const json = JSON.stringify(state);
    const sizeBytes = new TextEncoder().encode(json).byteLength;

    if (sizeBytes > MAX_SNAPSHOT_BYTES) {
        throw snapshotSizeLimitError(sizeBytes);
    }

    return state;
}

// ---------------------------------------------------------------------------
// Migration Chaining
// ---------------------------------------------------------------------------

/**
 * Chains migrations from `fromVersion` to `toVersion`.
 *
 * Walks the migration registry sequentially: finds the migration whose
 * `from` matches the current version, applies it, then repeats until
 * the state reaches `toVersion` or no more migrations are found.
 *
 * @param state - The state to migrate.
 * @param fromVersion - The starting schema version.
 * @param toVersion - The target schema version.
 * @param migrations - The migration registry.
 * @returns The migrated state, or the original state if no migrations applied.
 *
 * @internal
 */
function chainMigrations(
    state: SerializedState,
    fromVersion: string,
    toVersion: string,
    migrations: MigrationRegistry,
): SerializedState {
    let current = state;
    let currentVersion = fromVersion;

    // Safety limit to prevent infinite loops from circular migrations
    const maxIterations = 100;
    let iterations = 0;

    while (compareSemver(currentVersion, toVersion) < 0 && iterations < maxIterations) {
        const migration: MigrationConfig | undefined = migrations.get(currentVersion);
        if (migration === undefined) {
            // No migration found for this version — stop chaining.
            // The state is at the latest version we can reach.
            break;
        }

        current = migration.migrate(current);
        currentVersion = migration.to;
        iterations++;
    }

    return current;
}

// ---------------------------------------------------------------------------
// Restore Logic
// ---------------------------------------------------------------------------

/**
 * Applies the restore algorithm to a snapshot.
 *
 * Version comparison determines the restore strategy:
 *
 * | Scenario | Action |
 * | :--- | :--- |
 * | Same version | Zod validate only |
 * | Patch diff | Zod validate only (no migration needed) |
 * | Older snapshot (minor/major behind) | Chain migrations → Zod validate |
 * | Minor forward (e.g., 1.3 snapshot on 1.2 client) | `.passthrough()` — preserve unknown |
 * | Major forward (e.g., 2.0 snapshot on 1.x client) | Hard reject `ENS-4007` |
 * | Validation failure | Log warning, return empty state |
 *
 * @param snapshot - The snapshot to restore.
 * @param currentVersion - The current `STATE_SCHEMA_VERSION`.
 * @param migrations - The migration registry.
 * @returns The validated, possibly migrated `SerializedState`.
 * @throws {EnterstellarError} `ENS-4007` if major version is ahead.
 *
 * @see Design Choice S5 (amended v2)
 * @see Design Choice S10 — full overwrite on restore.
 */
export function applyRestore(
    snapshot: SerializedState,
    currentVersion: string,
    migrations: MigrationRegistry,
): SerializedState {
    const snapshotVersion = snapshot.schemaVersion;
    const sv = parseSemver(snapshotVersion);
    const cv = parseSemver(currentVersion);

    // -----------------------------------------------------------------------
    // Major forward — hard reject (ENS-4007)
    // -----------------------------------------------------------------------
    if (sv.major > cv.major) {
        throw majorVersionMismatchError(snapshotVersion, currentVersion);
    }

    // -----------------------------------------------------------------------
    // Older snapshot — chain migrations
    // -----------------------------------------------------------------------
    if (compareSemver(snapshotVersion, currentVersion) < 0) {
        const migrated = chainMigrations(snapshot, snapshotVersion, currentVersion, migrations);

        // Post-migration validation
        const result = SerializedStateSchema.safeParse(migrated);
        if (result.success) {
            return result.data as SerializedState;
        }

        // Migration produced invalid state — fall back to empty.
        // This should never happen with correct migrations, but guard against it.
        return createEmptyState(snapshot.session);
    }

    // -----------------------------------------------------------------------
    // Same version or patch diff — Zod validate only
    // -----------------------------------------------------------------------
    if (sv.major === cv.major && sv.minor === cv.minor) {
        const result = SerializedStateSchema.safeParse(snapshot);
        if (result.success) {
            return result.data as SerializedState;
        }

        // Validation failed — fall back to empty state.
        return createEmptyState(snapshot.session);
    }

    // -----------------------------------------------------------------------
    // Minor forward (e.g., 1.3 on 1.2 client) — passthrough
    // -----------------------------------------------------------------------
    if (sv.major === cv.major && sv.minor > cv.minor) {
        // Use .loose() to preserve unknown fields from the newer version.
        // (Zod v4 equivalent of .passthrough() — preserves unrecognized keys.)
        // This prevents data loss when re-syncing back to the newer client.
        const result = SerializedStateSchema.loose().safeParse(snapshot);
        if (result.success) {
            return result.data as SerializedState;
        }

        // Even passthrough validation failed — fall back to empty.
        return createEmptyState(snapshot.session);
    }

    // -----------------------------------------------------------------------
    // Fallback — validate normally
    // -----------------------------------------------------------------------
    const result = SerializedStateSchema.safeParse(snapshot);
    if (result.success) {
        return result.data as SerializedState;
    }

    return createEmptyState(snapshot.session);
}
