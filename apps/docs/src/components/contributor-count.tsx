/**
 * Enterstellar Docs — Contributor Avatars Display
 *
 * Async React Server Component that fetches and displays contributor
 * avatars for a GitHub repository. Shows a stacked row of circular
 * avatar images with an overflow counter for large contributor lists.
 *
 * **Usage:** Intended for the "Contributing" documentation page to
 * showcase project contributors. Filters out the repository owner
 * to show only external contributors.
 *
 * @see lib/github/contributors.ts — `fetchContributors()` data fetcher
 *
 * @module
 */
import type { HTMLAttributes, ReactElement } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { fetchContributors } from '@/lib/github';

/**
 * Props for the `ContributorCounter` component.
 */
export interface ContributorCounterProps extends HTMLAttributes<HTMLDivElement> {
  /** GitHub repository owner/organization name. */
  repoOwner: string;
  /** GitHub repository name. */
  repoName: string;
  /**
   * Maximum number of contributor avatars to display.
   * Contributors beyond this count are shown as a `+N` badge.
   *
   * @defaultValue 20
   */
  displayCount?: number;
}

/**
 * Contributor avatars display component.
 *
 * Fetches contributor data from the GitHub API, filters out the
 * repository owner, and renders a horizontally stacked row of
 * circular avatar images. If there are more contributors than
 * `displayCount`, a `+N` overflow badge is shown.
 *
 * @param props - Component props with repository info and display options.
 * @param props.repoOwner - GitHub owner to filter from the display.
 * @param props.repoName - GitHub repository to fetch contributors for.
 * @param props.displayCount - Max avatars to show (default: 20).
 * @returns The contributor avatars element.
 */
export default async function ContributorCounter({
  repoOwner,
  repoName,
  displayCount = 20,
  ...props
}: ContributorCounterProps): Promise<ReactElement> {
  // ── Fetch & Filter ───────────────────────────────────────────────────
  // Exclude the repo owner from the list — we only want external contributors.
  // Slice to `displayCount` to cap the number of rendered avatars.
  const contributors = await fetchContributors(repoOwner, repoName);
  const topContributors = contributors
    .filter((contributor) => contributor.login !== repoOwner)
    .slice(0, displayCount);

  return (
    <div {...props} className={cn('flex flex-col items-center gap-4', props.className)}>
      <div className="flex flex-row flex-wrap items-center justify-center md:pe-4">
        {topContributors.map((contributor, i) => (
          <a
            key={contributor.login}
            href={`https://github.com/${contributor.login}`}
            rel="noreferrer noopener"
            target="_blank"
            className="size-10 overflow-hidden rounded-full border-4 border-fd-background bg-fd-background md:-mr-4 md:size-12"
            // Reverse z-index so avatars stack correctly (first = on top)
            style={{
              zIndex: topContributors.length - i,
            }}
          >
            <Image
              src={contributor.avatar_url}
              alt={`${contributor.login}'s avatar`}
              unoptimized
              width={48}
              height={48}
            />
          </a>
        ))}
        {/* Overflow badge — shown when there are more contributors than displayCount */}
        {displayCount < contributors.length ? (
          <div className="size-12 content-center rounded-full bg-fd-secondary text-center">
            +{contributors.length - displayCount}
          </div>
        ) : null}
      </div>
      <div className="text-center text-sm text-fd-muted-foreground">
        Contributors who help build Enterstellar.
      </div>
    </div>
  );
}
