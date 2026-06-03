/**
 * Enterstellar Docs — GitHub Sponsors Fetcher
 *
 * Fetches sponsor data from the GitHub GraphQL API for a given user.
 * Returns a sorted list of sponsors with their tier information,
 * suitable for display on a "Sponsors" page.
 *
 * **Caching:** The `revalidate` constant controls the ISR revalidation
 * interval (~30 minutes) for pages that import this module.
 *
 * @module
 */
import { Octokit } from 'octokit';

// =============================================================================
// Types
// =============================================================================

/**
 * A GitHub sponsor with their tier information.
 */
export interface Sponsor extends SponsorEntity {
  /** The sponsor's subscription tier. */
  tier: Tier;
}

/**
 * GitHub user or organization entity from the Sponsorships API.
 */
interface SponsorEntity {
  /** GitHub username. */
  login: string;
  /** URL of the sponsor's avatar image. */
  avatarUrl: string;
  /** URL of the sponsor's website (if set). */
  websiteUrl: string;
  /** Display name (falls back to `login` if empty). */
  name: string;
  /** GraphQL type discriminator (`'User'` or `'Organization'`). */
  __typename: string;
}

/**
 * GitHub Sponsors tier metadata.
 */
interface Tier {
  /** Monthly price in USD for this tier. */
  monthlyPriceInDollars: number;
  /** Optional tier display name. */
  name?: string;
}

/**
 * ISR revalidation interval in seconds (~30 minutes).
 *
 * Exported for consumption by Next.js pages that import this module
 * as a `route` segment config value.
 */

export const revalidate: number = 60 * 30;

// =============================================================================
// Data Fetcher
// =============================================================================

/**
 * Fetch sponsors for a GitHub user.
 *
 * Queries the GitHub GraphQL API for up to 100 sponsorships as
 * maintainer. Returns sponsors sorted by tier price (highest first).
 * Gracefully handles missing `GITHUB_TOKEN` by returning an empty array.
 *
 * @param owner - GitHub username to fetch sponsors for.
 * @returns A promise resolving to the sorted sponsor list.
 * @throws If the GitHub GraphQL request fails.
 */
export async function getSponsors(owner: string): Promise<Sponsor[]> {
  // ── Auth Guard ──────────────────────────────────────────────────────────
  // Graceful degradation: return empty array when no token is configured,
  // so the sponsors section renders as empty instead of crashing.
  if (!process.env['GITHUB_TOKEN']) {
    console.warn('GITHUB_TOKEN environment variable is required for fetching sponsors.');
    return [];
  }

  const octokit = new Octokit({
    auth: process.env['GITHUB_TOKEN'],
  });

  // ── GraphQL Query ─────────────────────────────────────────────────────
  // Uses a union type spread (`... on User`, `... on Organization`) because
  // sponsors can be either entity type — both share the same fields here.
  try {
    const response = await octokit.graphql<{
      user: {
        sponsorshipsAsMaintainer: {
          nodes: Array<{
            sponsorEntity: SponsorEntity;
            tier: Tier;
          }>;
        };
      };
    }>(`
      query {
        user(login: ${JSON.stringify(owner)}) {
          sponsorshipsAsMaintainer(first: 100) {
            nodes {
              sponsorEntity {
                __typename
                ... on User {
                    login
                    avatarUrl
                    name
                    websiteUrl
                }
                ... on Organization {
                    login
                    avatarUrl
                    websiteUrl
                    name
                }
              }
              tier {
                monthlyPriceInDollars
                name
              }
            }
          }
        }
      }
    `);

    // ── Transform Response ────────────────────────────────────────────────
    // Flatten the GraphQL node structure and ensure `name` always has a
    // display value (falls back to GitHub username if profile name is empty).
    const sponsors = response.user.sponsorshipsAsMaintainer.nodes.map((node) => ({
      ...node.sponsorEntity,
      name: node.sponsorEntity.name || node.sponsorEntity.login,
      tier: node.tier,
    }));

    // Sort by tier price descending — highest-tier sponsors appear first
    return sponsors.sort((a, b) => b.tier.monthlyPriceInDollars - a.tier.monthlyPriceInDollars);
  } catch (error) {
    console.error('Error fetching sponsors:', error);
    throw error;
  }
}
