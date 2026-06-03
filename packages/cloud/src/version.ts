/**
 * @module @enterstellar-ai/cloud/version
 * @description SDK version constant for `@enterstellar-ai/cloud`.
 *
 * Used by the transport layer to set the `User-Agent` header on all
 * outgoing requests (`User-Agent: enterstellar-cloud-sdk/{CLOUD_SDK_VERSION}`),
 * and available to consumers for diagnostic logging.
 *
 * This value MUST match the `version` field in `packages/cloud/package.json`.
 * Updates are managed exclusively via Changesets (X4) — never manually.
 *
 * @see Enterstellar OS version constant convention
 * @see Design Choice SD9 — zero framework deps, `User-Agent` is the only
 *      SDK-identifying header.
 */

// ---------------------------------------------------------------------------
// SDK Version
// ---------------------------------------------------------------------------

/**
 * The current version of the `@enterstellar-ai/cloud` SDK.
 *
 * @remarks
 * - Follows semver (major.minor.patch).
 * - Must stay in sync with `packages/cloud/package.json#version`.
 * - Typed as a string literal via `as const` for compile-time narrowing.
 * - Consumed by {@link CloudHttpTransport} for the `User-Agent` header.
 *
 * @example
 * ```ts
 * import { CLOUD_SDK_VERSION } from '@enterstellar-ai/cloud';
 *
 * console.log(`Running enterstellar-cloud-sdk v${CLOUD_SDK_VERSION}`);
 * // → "Running enterstellar-cloud-sdk v0.1.0"
 * ```
 */
export const CLOUD_SDK_VERSION = '0.1.0' as const;
