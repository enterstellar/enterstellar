/**
 * @module @enterstellar-ai/agent-sdk/version
 * @description SDK version constant for runtime compatibility checks and telemetry.
 *
 * Follows Design Choice T14 — every Enterstellar module exports a version constant.
 * Used by DevTools version display, `ForgeSignal.sdkVersion`, and runtime
 * compatibility validation between SDK and cloud API endpoints.
 *
 * @see Design Choice T14 — version export requirement.
 */

/**
 * Current version of the `@enterstellar-ai/agent-sdk` package.
 *
 * Follows semver. Incremented via Changesets on each release.
 * The value `'0.0.0'` indicates a pre-release development version.
 */
export const AGENT_SDK_VERSION = '0.0.0';
