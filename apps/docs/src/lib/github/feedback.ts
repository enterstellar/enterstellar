/**
 * Enterstellar Docs — GitHub Feedback Infrastructure
 *
 * Server-side module that creates and manages GitHub Discussion threads
 * for user feedback. Uses a GitHub App (Octokit) to authenticate and
 * submit feedback as Discussion threads or comments via the GitHub
 * GraphQL API.
 *
 * **Architecture:**
 * - `getOctokit()` — Singleton Octokit client from GitHub App credentials.
 * - `getFeedbackDestination()` — Cached repo metadata with Discussion categories.
 * - `onPageFeedbackAction()` — Server Action for page-level feedback.
 * - `onBlockFeedbackAction()` — Server Action for block-level feedback.
 * - `createDiscussionThread()` — Upsert: appends to existing thread or creates new.
 *
 * **Security:** GraphQL template strings interpolate only server-side
 * constants (`owner`, `repo`) and Zod-validated user input. No raw
 * user strings are injected without validation.
 *
 * @see components/feedback/client.tsx — Client-side UI consuming these actions
 * @see components/feedback/schema.ts — Zod schemas for payload validation
 * @see lib/shared.ts — `gitConfig` constants
 *
 * @module
 */
import { App } from 'octokit';
import type { Octokit } from 'octokit';
import {
  blockFeedback,
  pageFeedback,
  type ActionResponse,
  type BlockFeedback,
  type PageFeedback,
} from '@/components/feedback/schema';
import { gitConfig } from '../shared';

// =============================================================================
// Constants
// =============================================================================

/** GitHub repository name (derived from `gitConfig`). */
export const repo: string = gitConfig.repo;

/** GitHub repository owner (derived from `gitConfig`). */
export const owner: string = gitConfig.user;

/** Name of the GitHub Discussion category for feedback threads. */
export const DocsCategory: string = 'Docs Feedback';

// =============================================================================
// Octokit Singleton
// =============================================================================

/** Cached singleton Octokit instance. */
let instance: Octokit | undefined;

/**
 * Get or create the singleton Octokit client.
 *
 * Authenticates as a GitHub App using the `GITHUB_APP_ID` and
 * `GITHUB_APP_PRIVATE_KEY` environment variables, then obtains an
 * installation token for the target repository.
 *
 * @returns The authenticated Octokit client.
 * @throws If GitHub App credentials are not configured.
 */
async function getOctokit(): Promise<Octokit> {
  // Return cached instance if already authenticated
  if (instance) return instance;
  const appId = process.env['GITHUB_APP_ID'];
  const privateKey = process.env['GITHUB_APP_PRIVATE_KEY'];

  if (!appId || !privateKey) {
    throw new Error('No GitHub keys provided for Github app, docs feedback feature will not work.');
  }

  const app = new App({
    appId,
    privateKey,
  });

  // Look up the GitHub App installation for this repository.
  // This is required to obtain a scoped installation token.
  const { data } = await app.octokit.request('GET /repos/{owner}/{repo}/installation', {
    owner,
    repo,
    headers: {
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  // Cache the installation-scoped Octokit for subsequent calls
  instance = await app.getInstallationOctokit(data.id);
  return instance;
}

// =============================================================================
// Repository Metadata Cache
// =============================================================================

/**
 * GitHub repository metadata with Discussion category IDs.
 *
 * Cached after the first fetch to avoid redundant GraphQL queries.
 */
interface RepositoryInfo {
  /** The repository's global GraphQL node ID. */
  id: string;
  /** Available Discussion categories. */
  discussionCategories: {
    nodes: {
      /** Category's global GraphQL node ID. */
      id: string;
      /** Category display name (e.g., "Docs Feedback"). */
      name: string;
    }[];
  };
}

/** Cached repository info (populated by `getFeedbackDestination()`). */
let cachedDestination: RepositoryInfo | undefined;

/**
 * Get or fetch the target repository's Discussion metadata.
 *
 * Queries the GitHub GraphQL API for the repository ID and available
 * Discussion categories. Results are cached for the process lifetime.
 *
 * @returns The repository info with Discussion category list.
 */
async function getFeedbackDestination(): Promise<RepositoryInfo> {
  // Return cached metadata if already fetched
  if (cachedDestination) return cachedDestination;
  const octokit = await getOctokit();

  const {
    repository,
  }: {
    repository: RepositoryInfo;
  } = await octokit.graphql(`
  query {
    repository(owner: "${owner}", name: "${repo}") {
      id
      discussionCategories(first: 25) {
        nodes { id name }
      }
    }
  }
`);

  // Cache and return the repository metadata
  return (cachedDestination = repository);
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Server Action — process page-level feedback.
 *
 * Validates the incoming payload against the `pageFeedback` Zod schema,
 * then creates or appends to a GitHub Discussion thread.
 *
 * @param feedback - The page feedback payload from the client.
 * @returns The action response containing the GitHub Discussion URL.
 */
export async function onPageFeedbackAction(feedback: PageFeedback): Promise<ActionResponse> {
  'use server';
  // Validate and sanitize via Zod before touching the GitHub API
  feedback = pageFeedback.parse(feedback);
  return createDiscussionThread(
    feedback.url,
    `[${feedback.opinion}] ${feedback.message}\n\n> Forwarded from user feedback.`,
  );
}

/**
 * Server Action — process block-level feedback.
 *
 * Validates the incoming payload against the `blockFeedback` Zod schema,
 * then creates or appends to a GitHub Discussion thread. Includes the
 * block's text content as a quoted reference.
 *
 * @param feedback - The block feedback payload from the client.
 * @returns The action response containing the GitHub Discussion URL.
 */
export async function onBlockFeedbackAction(feedback: BlockFeedback): Promise<ActionResponse> {
  'use server';
  // Validate and sanitize via Zod before touching the GitHub API
  feedback = blockFeedback.parse(feedback);
  return createDiscussionThread(
    feedback.url,
    `> ${feedback.blockBody ?? feedback.blockId}\n\n${feedback.message}\n\n> Forwarded from user feedback.`,
  );
}

// =============================================================================
// Discussion Thread Upsert
// =============================================================================

/**
 * Create or append to a GitHub Discussion thread for feedback.
 *
 * Implements an upsert pattern:
 * 1. Search for an existing Discussion with a matching title.
 * 2. If found, add a comment to the existing thread.
 * 3. If not found, create a new Discussion in the "Docs Feedback" category.
 *
 * @param pageId - The page URL used as the Discussion title identifier.
 * @param body - The formatted feedback message body (markdown).
 * @returns The action response with the GitHub Discussion/comment URL.
 * @throws If the "Docs Feedback" category doesn't exist in the repository.
 */
async function createDiscussionThread(pageId: string, body: string): Promise<ActionResponse> {
  const octokit = await getOctokit();
  const destination = await getFeedbackDestination();

  // Find the "Docs Feedback" category — must exist in the repo's Discussions
  const category = destination.discussionCategories.nodes.find(
    (category) => category.name === DocsCategory,
  );

  if (!category) throw new Error(`Please create a "${DocsCategory}" category in GitHub Discussion`);

  // ── Search for Existing Thread ───────────────────────────────────────
  // Look for a Discussion with a matching title owned by the App.
  // If found, we'll append a comment instead of creating a new thread.
  const title = `Feedback for ${pageId}`;
  const {
    search: {
      nodes: [discussion],
    },
  }: {
    search: {
      nodes: { id: string; url: string }[];
    };
  } = await octokit.graphql(`
          query {
            search(type: DISCUSSION, query: ${JSON.stringify(`${title} in:title repo:${owner}/${repo} author:@me`)}, first: 1) {
              nodes {
                ... on Discussion { id, url }
              }
            }
          }`);

  // ── Upsert: Append Comment or Create Thread ───────────────────────
  if (discussion) {
    // Thread exists — add a comment to consolidate feedback
    const result: {
      addDiscussionComment: {
        comment: { id: string; url: string };
      };
    } = await octokit.graphql(`
            mutation {
              addDiscussionComment(input: { body: ${JSON.stringify(body)}, discussionId: "${discussion.id}" }) {
                comment { id, url }
              }
            }`);

    return {
      githubUrl: result.addDiscussionComment.comment.url,
    };
  } else {
    // No existing thread — create a new Discussion
    const result: {
      discussion: { id: string; url: string };
    } = await octokit.graphql(`
            mutation {
              createDiscussion(input: { repositoryId: "${destination.id}", categoryId: "${category.id}", body: ${JSON.stringify(body)}, title: ${JSON.stringify(title)} }) {
                discussion { id, url }
              }
            }`);

    return {
      githubUrl: result.discussion.url,
    };
  }
}
