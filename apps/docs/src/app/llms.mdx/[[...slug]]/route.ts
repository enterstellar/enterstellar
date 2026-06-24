/**
 * Enterstellar Docs — Per-Page LLM Markdown Export Route
 *
 * Serves individual documentation pages as clean, processed markdown
 * for LLM consumption. This enables granular retrieval — AI tools can
 * fetch a single page's content by appending `.mdx` to its URL
 * (e.g., `/getting-started.mdx`).
 *
 * **Route pattern:** `/llms.mdx/[[...slug]]/content.md`
 * The proxy in `proxy.ts` rewrites `/{path}.mdx` to this route,
 * making it appear as a natural `.mdx` suffix to the consumer.
 *
 * **Static generation:**
 * `generateStaticParams()` pre-renders markdown for every page at build
 * time. Combined with `revalidate = false`, all exports are bundled as
 * static assets into Vercel — no runtime processing.
 *
 * **Differences from `llms-full.txt`:**
 * - `llms-full.txt` returns ALL pages concatenated in one response.
 * - This route returns a SINGLE page, allowing selective retrieval
 *   and reducing bandwidth for targeted AI grounding queries.
 *
 * @see app/llms.txt/route.ts — LLMs.txt index (table of contents)
 * @see app/llms-full.txt/route.ts — Full concatenated content export
 * @see proxy.ts — URL rewrite rules for `.mdx` suffix
 * @see lib/source.ts — `getLLMText()` and `getPageMarkdownUrl()`
 *
 * @module
 */
import { getLLMText, getPageMarkdownUrl, source } from '@/lib/source';
import { notFound } from 'next/navigation';

/**
 * Disable ISR revalidation — per-page exports are fully static.
 * Regenerated only on the next `next build`.
 */
export const revalidate = false;

/**
 * GET handler — returns a single page's processed markdown content.
 *
 * Extracts the page slug from the route params (stripping the trailing
 * `content.md` segment), looks up the page in the documentation source tree,
 * and returns its processed markdown text via `getLLMText()`.
 *
 * Returns a 404 if the slug doesn't match any page.
 *
 * @param _req - Incoming request (unused — content is static).
 * @param context - Route context containing the `slug` segments.
 * @returns A `Response` with `text/markdown` body content.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
): Promise<Response> {
  const { slug } = await params;
  if (!slug) notFound();
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
    },
  });
}

/**
 * Pre-render markdown exports for all documentation pages at build time.
 *
 * Each page's URL segments (with the `content.md` suffix appended by
 * `getPageMarkdownUrl()`) become a static route, ensuring every doc page
 * has a pre-generated markdown export in Vercel.
 *
 * @returns Array of static params for all doc pages.
 */
export function generateStaticParams(): { lang: string | undefined; slug: string[] }[] {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageMarkdownUrl(page).segments,
  }));
}
