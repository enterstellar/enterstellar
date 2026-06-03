/**
 * Enterstellar Docs — GitHub API Module
 *
 * Barrel re-export for all GitHub-related server-side utilities:
 *
 * - **Feedback** — Server Actions for page-level and block-level feedback
 *   via GitHub Discussions (Octokit + GraphQL).
 * - **Contributors** — REST API fetcher for repository contributor avatars.
 * - **Sponsors** — GraphQL fetcher for GitHub Sponsors tier data.
 *
 * @see lib/github/feedback.ts — Discussion thread upsert and server actions
 * @see lib/github/contributors.ts — Contributor avatar data fetcher
 * @see lib/github/sponsors.ts — Sponsor tier data fetcher
 *
 * @module
 */
export {
  repo,
  owner,
  DocsCategory,
  onPageFeedbackAction,
  onBlockFeedbackAction,
} from './feedback';

export { fetchContributors } from './contributors';
export type { Contributor } from './contributors';

export { getSponsors, revalidate as sponsorsRevalidate } from './sponsors';
export type { Sponsor } from './sponsors';
