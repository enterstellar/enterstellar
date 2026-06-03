/**
 * @module @enterstellar-ai/global-index/publishing/badge-service
 * @description Pure utility functions for certification and badge status.
 *
 * Provides ergonomic helpers for working with the certification status
 * of `GlobalSearchResult` objects. These are **pure functions** with
 * no side effects and no HTTP calls — they operate on data already
 * returned by search/get/publish operations.
 *
 * Certification tiers (GI3):
 * - **`'indexed'`** — Passed schema + tokens + a11y verification via compiler.
 * - **`'certified'`** — Additionally passed headless Playwright + axe-core
 *   + design token visual regression tests.
 *
 * Certified contracts have CDN-backed PNG screenshots (GI4).
 *
 * @see Design Choice GI3 — two-tier verification.
 * @see Design Choice GI4 — PNG screenshots for Enterstellar Certified components.
 */

import type { CertificationTier, GlobalSearchResult } from '../types.js';

// ---------------------------------------------------------------------------
// isCertified()
// ---------------------------------------------------------------------------

/**
 * Checks whether a search result represents an Enterstellar Certified contract.
 *
 * A contract is considered Enterstellar Certified when:
 * 1. `certified` is `true`, AND
 * 2. `certificationTier` is `'certified'`
 *
 * Both conditions are checked defensively — a server-side data inconsistency
 * where `certified` is `true` but `certificationTier` is `'indexed'` will
 * return `false` (strict check).
 *
 * @param result - The `GlobalSearchResult` to inspect.
 * @returns `true` if the contract has achieved Enterstellar Certified status.
 *
 * @example
 * ```ts
 * const results = await index.search('patient vitals');
 * const certified = results.filter(isCertified);
 * ```
 */
export function isCertified(result: GlobalSearchResult): boolean {
    return result.certified && result.certificationTier === 'certified';
}

// ---------------------------------------------------------------------------
// isIndexed()
// ---------------------------------------------------------------------------

/**
 * Checks whether a search result has been indexed (base verification tier).
 *
 * An indexed contract has passed schema + tokens + accessibility verification
 * but has NOT yet passed the full Enterstellar Certified pipeline.
 *
 * @param result - The `GlobalSearchResult` to inspect.
 * @returns `true` if the contract is indexed but not yet certified.
 *
 * @example
 * ```ts
 * const results = await index.search('admin panel');
 * const indexedOnly = results.filter(isIndexed);
 * ```
 */
export function isIndexed(result: GlobalSearchResult): boolean {
    return result.certificationTier === 'indexed';
}

// ---------------------------------------------------------------------------
// getCertificationTier()
// ---------------------------------------------------------------------------

/**
 * Returns the certification tier of a search result.
 *
 * Always returns a valid `CertificationTier` value (`'indexed'` or
 * `'certified'`), regardless of the `certified` boolean flag. This
 * allows consumers to use the tier for display logic without
 * additional conditional checks.
 *
 * @param result - The `GlobalSearchResult` to inspect.
 * @returns The certification tier: `'indexed'` or `'certified'`.
 *
 * @example
 * ```ts
 * const tier = getCertificationTier(result);
 * // Display a badge: 🟢 Certified or 🔵 Indexed
 * ```
 */
export function getCertificationTier(result: GlobalSearchResult): CertificationTier {
    return result.certificationTier;
}

// ---------------------------------------------------------------------------
// getScreenshotUrl()
// ---------------------------------------------------------------------------

/**
 * Returns the screenshot URL for a search result, if available.
 *
 * Screenshots are only available for Enterstellar Certified contracts (GI4).
 * Returns `undefined` for non-certified contracts or when the screenshot
 * has not yet been generated.
 *
 * @param result - The `GlobalSearchResult` to inspect.
 * @returns The CDN-backed PNG screenshot URL, or `undefined`.
 *
 * @see Design Choice GI4 — PNG screenshots for Enterstellar Certified components.
 *
 * @example
 * ```ts
 * const url = getScreenshotUrl(result);
 * if (url) {
 *     // Render preview image
 * }
 * ```
 */
export function getScreenshotUrl(result: GlobalSearchResult): string | undefined {
    return result.screenshotUrl;
}

// ---------------------------------------------------------------------------
// hasScreenshot()
// ---------------------------------------------------------------------------

/**
 * Checks whether a search result has a screenshot URL available.
 *
 * Convenience type guard that checks for the presence of `screenshotUrl`.
 * More ergonomic than `getScreenshotUrl(result) !== undefined` in
 * conditional expressions.
 *
 * @param result - The `GlobalSearchResult` to inspect.
 * @returns `true` if a screenshot URL is present.
 */
export function hasScreenshot(result: GlobalSearchResult): boolean {
    return result.screenshotUrl !== undefined && result.screenshotUrl !== '';
}

// ---------------------------------------------------------------------------
// getRelevanceScore()
// ---------------------------------------------------------------------------

/**
 * Returns the semantic relevance score for a search result.
 *
 * The score ranges from `0.0` (no relevance) to `1.0` (perfect match).
 * Only present for results returned by `search()` — results from
 * `getContract()` or `featured()` may not have a score.
 *
 * Returns `0` when no score is available (safe default for sorting).
 *
 * @param result - The `GlobalSearchResult` to inspect.
 * @returns The relevance score (0.0–1.0), or `0` if unavailable.
 */
export function getRelevanceScore(result: GlobalSearchResult): number {
    return result.score ?? 0;
}
