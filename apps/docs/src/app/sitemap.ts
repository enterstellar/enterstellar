/**
 * Enterstellar Docs — Sitemap Generator
 *
 * Generates a `sitemap.xml` conforming to the Sitemaps 0.9 protocol for
 * search engine crawlers. The sitemap includes every documentation page
 * from the Fumadocs source tree, with:
 *
 * - **Priority tiers:**
 *   - `1.0` — Root `/` index (docs landing page)
 *   - `0.8` — Category index pages (`page.data.index === true`)
 *   - `0.5` — Standard leaf documentation pages
 *
 * - **Last modified** — Extracted from git timestamps via the
 *   `lastModified` plugin in `source.config.ts`.
 *
 * - **Change frequency** — `monthly` for the root, `weekly` for all
 *   content pages (docs content changes more frequently).
 *
 * **Deployment:**
 * `revalidate = false` ensures the sitemap is generated once at build
 * time and served as a static asset from the Cloudflare Worker bundle.
 * The `baseUrl` is derived from `@/lib/metadata` (Cloudflare-compatible,
 * NOT Vercel).
 *
 * **Exclusions:**
 * - `/showcase` — Fumadocs upstream entry, not applicable to Enterstellar.
 * - `openapi` type pages — Removed. We do not use `fumadocs-openapi`.
 *
 * @see lib/metadata.ts — `baseUrl` (resolves to `https://enterstellar.dev`)
 * @see lib/source.ts — `source.getPages()` for content enumeration
 * @see source.config.ts — `lastModified` plugin for git timestamps
 *
 * @module
 */
import type { MetadataRoute } from 'next';
import { baseUrl } from '@/lib/metadata';
import { source } from '@/lib/source';

/**
 * Disable ISR revalidation — the sitemap is fully static.
 * Regenerated only on the next `next build`.
 */
export const revalidate = false;

/**
 * Generate the sitemap for the Enterstellar documentation site.
 *
 * Enumerates all pages from the Fumadocs source tree, loads their
 * `lastModified` git timestamps, and produces a flat array of sitemap
 * entries with differentiated priority. The root `/docs` entry is
 * always included at priority `1.0`.
 *
 * @returns A promise resolving to the complete sitemap array.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /**
   * Construct a fully-qualified URL from a relative path.
   *
   * @param path - Relative URL path (e.g., `/getting-started`).
   * @returns Absolute URL string using the canonical `baseUrl`.
   */
  const url = (path: string): string => new URL(path, baseUrl).toString();

  // ── Page Entries ────────────────────────────────────────────────────
  // Load lastModified from git timestamps for each page.
  // Index pages get higher priority (0.8) than leaf pages (0.5).
  const pages = await Promise.all(
    source.getPages().map(async (page) => {
      const { lastModified } = await page.data.load();

      return {
        url: url(page.url),
        lastModified: lastModified ? new Date(lastModified) : undefined,
        changeFrequency: 'weekly' as const,
        priority: page.data.index ? 0.8 : 0.5,
      };
    }),
  );

  // ── Assemble Sitemap ───────────────────────────────────────────────
  // Root entry at highest priority, followed by all content pages.
  return [
    {
      url: url('/'),
      changeFrequency: 'monthly',
      priority: 1,
    },
    ...pages,
  ];
}
