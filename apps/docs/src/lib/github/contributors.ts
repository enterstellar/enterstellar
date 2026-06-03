/**
 * Enterstellar Docs — GitHub Contributors Fetcher
 *
 * Fetches contributor data from the GitHub REST API for a given
 * repository. Returns a sorted, bot-filtered list of contributors
 * suitable for display in the contributor avatars component.
 *
 * **Caching:** Uses Next.js `fetch` with `next.revalidate` for
 * ISR-compatible caching (~11.5 days revalidation window).
 *
 * @see components/contributor-count.tsx — Consumer of `fetchContributors()`
 *
 * @module
 */

/**
 * GitHub contributor data from the REST API.
 */
export interface Contributor {
  /** URL of the contributor's GitHub avatar image. */
  avatar_url: string;
  /** GitHub username. */
  login: string;
  /** Total number of commits by this contributor. */
  contributions: number;
}

/**
 * Fetch contributors for a GitHub repository.
 *
 * Queries the GitHub REST API (`/repos/{owner}/{repo}/contributors`)
 * for up to 50 contributors. Filters out bot accounts (usernames
 * ending in `[bot]`) and sorts by contribution count descending.
 *
 * Optionally uses a `GITHUB_TOKEN` environment variable for
 * authenticated requests (higher rate limits).
 *
 * @param repoOwner - GitHub owner or organization name.
 * @param repoName - GitHub repository name.
 * @param baseUrl - GitHub API base URL.
 *
 * @defaultValue baseUrl — `'https://api.github.com'`
 *
 * @returns A promise resolving to the sorted, filtered contributor list.
 * @throws If the GitHub API request fails (non-200 response).
 */
export async function fetchContributors(
  repoOwner: string,
  repoName: string,
  baseUrl: string = 'https://api.github.com',
): Promise<Contributor[]> {
  const headers = new Headers();
  if (process.env['GITHUB_TOKEN']) headers.set('Authorization', `Bearer ${process.env['GITHUB_TOKEN']}`);

  const response = await fetch(
    `${baseUrl}/repos/${repoOwner}/${repoName}/contributors?per_page=50`,
    {
      headers,
      next: { revalidate: 1000 * 1000 },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch contributors: ${response.statusText}`);
  }

  const contributors: Contributor[] = await response.json();
  return contributors
    .filter((contributor) => !contributor.login.endsWith('[bot]'))
    .sort((a, b) => b.contributions - a.contributions);
}
