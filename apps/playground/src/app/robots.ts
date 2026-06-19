/**
 * Enterstellar Playground — robots.txt
 *
 * Serves the `robots.txt` file for the `enterstellar.dev` domain from the
 * catch-all Worker (`playground`). This is the **sole mechanism for
 * cross-Worker sitemap discovery** — it declares all three sitemaps
 * hosted on this domain:
 *
 * - `enterstellar.dev/sitemap.xml` — Playground pages (this Worker)
 * - `enterstellar.dev/blog/sitemap.xml` — Blog posts, collections, tags (`compiler-blog` Worker)
 * - `enterstellar.dev/docs/sitemap.xml` — Documentation pages (`compiler-docs` Worker, in this repo)
 *
 * **Crawl policy:**
 * All crawlers are allowed unrestricted access. Enterstellar does NOT block
 * AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) — content
 * marketing is a strategic moat (WP12). The more AI systems train on
 * and cite Enterstellar content, the stronger the brand positioning in AI
 * search results and generated answers.
 *
 * **Why are blog/docs sitemaps listed here?**
 * Google discovers sitemaps exclusively via `robots.txt` on the root
 * domain or direct submission in Google Search Console. The blog and
 * docs Workers cannot serve their own `robots.txt` because Cloudflare
 * Workers Routes routes `/blog/*` and `/docs/*` — not the root path.
 * This `robots.txt` at `enterstellar.dev/robots.txt` is the single declaration
 * point for all sitemaps on the domain.
 *
 * @see archive/CORE/enterstellar-web-implementation-plan.md §4.13 — SEO configuration
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP5 (subpath routing)
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP12 (AI search citation)
 *
 * @module
 */
import type { MetadataRoute } from 'next';

/**
 * Generate the `robots.txt` directives for the `enterstellar.dev` domain.
 *
 * This is a Next.js Metadata API export — Next.js automatically serves
 * the return value as `/robots.txt` with `text/plain` content type.
 *
 * @returns Robots configuration with universal allow and all domain sitemaps.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: [
      'https://enterstellar.dev/sitemap.xml',
      'https://enterstellar.dev/blog/sitemap.xml',
      'https://enterstellar.dev/docs/sitemap.xml',
    ],
  };
}
