/**
 * Enterstellar Playground — Sitemap
 *
 * Generates the XML sitemap for the Enterstellar Playground at `enterstellar.dev`.
 * Lists the main playground page URL. Cross-server sitemap discovery
 * (blog at `enterstellar.dev/blog/`, docs at `enterstellar.dev/docs/`) is handled
 * exclusively by `robots.txt` `Sitemap:` directives — NOT by listing
 * `.xml` URLs in this sitemap's `<urlset>`, which would cause Google
 * Search Console crawl errors.
 *
 * **`lastModified` strategy:**
 * The playground page uses a fixed date constant (`LAST_UPDATED`) that is
 * manually updated when content changes substantively. This avoids
 * the `new Date()` anti-pattern where every build marks every page as
 * "modified today" — Google's documentation warns this reduces sitemap
 * trustworthiness and may cause the field to be ignored for the domain.
 *
 * @see archive/CORE/enterstellar-web-implementation-plan.md §4.13 — SEO configuration
 *
 * @module
 */
import type { MetadataRoute } from 'next';

/**
 * Date when the playground page was last substantively updated.
 *
 * **IMPORTANT:** Update this constant when page content changes.
 * Do NOT use `new Date()` — every build would mark pages as modified today,
 * degrading Google's trust in this sitemap's `lastModified` values.
 */
const LAST_UPDATED = '2026-03-15T00:00:00Z';

/**
 * Generate the sitemap for the Enterstellar Playground.
 *
 * This is a Next.js Metadata API export — Next.js automatically serves
 * the return value as `/sitemap.xml` with the correct `Content-Type`.
 *
 * @returns Array of sitemap entries.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://enterstellar.dev';

  return [
    {
      url: baseUrl,
      lastModified: LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
  ];
}
