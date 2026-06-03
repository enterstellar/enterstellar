/**
 * @module @enterstellar-ai/cli/version
 * @description CLI version constant.
 *
 * Displayed by `enterstellar --version` and embedded in scaffold metadata.
 * Must be kept in sync with the `version` field in `package.json`.
 *
 * @see Design Choice T14 — version exports for runtime compatibility checks.
 */

/**
 * Semantic version of the `@enterstellar-ai/cli` package.
 *
 * @remarks
 * This value MUST match the `version` field in `package.json`.
 * Update this constant whenever a new version is released via Changesets.
 */
export const CLI_VERSION = '0.0.0' as const;
