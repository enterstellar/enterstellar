/**
 * Enterstellar Docs — Shared Constants
 *
 * Central registry of constants consumed across the documentation app's
 * layouts, navigation, proxy rewrites, feedback system, and OG image
 * routes. All path-based constants are relative to the Next.js app root
 * (relative to the Next.js app root).
 *
 * **`gitConfig`** controls:
 * - "Edit on GitHub" links in the `ViewOptionsPopover` component
 * - Feedback system's GitHub Discussions target repository
 * - `MarkdownCopyButton` source link URLs
 *
 * @see proxy.ts — consumes `docsRoute` and `docsContentRoute`
 * @see app/og/[[...slug]]/route.tsx — consumes `docsImageRoute`
 * @see lib/github/feedback.ts — consumes `gitConfig` for feedback Discussions
 *
 * @module
 */

/** Display name for the documentation app. Used in OG metadata and navigation. */
export const appName = 'Enterstellar Docs';

/** Route prefix for documentation pages (relative to app root). */
export const docsRoute = '/';

/** Route prefix for dynamically generated OG images. */
export const docsImageRoute = '/og';

/** Route prefix for per-page LLM-friendly markdown exports. */
export const docsContentRoute = '/llms.mdx';

/**
 * GitHub repository configuration for the Enterstellar OSS repo.
 *
 * Used by the feedback system (GitHub Discussions via Octokit) and
 * \"Edit on GitHub\" / \"View Source\" links in the docs UI.
 */
export const gitConfig = {
  user: 'enterstellar-ai',
  repo: 'enterstellar',
  branch: 'main',
};
