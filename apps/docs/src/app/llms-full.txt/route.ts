/**
 * Enterstellar Docs — LLMs Full Text Route
 *
 * Generates the `llms-full.txt` endpoint — a concatenation of every
 * documentation page's processed markdown content into a single
 * plain-text response. This is the "download everything" companion to
 * the `llms.txt` index.
 *
 * **Use cases:**
 * - LLM fine-tuning and grounding pipelines that need the full corpus.
 * - AI coding assistants that pre-load entire documentation sets.
 * - Offline documentation snapshots for RAG vector databases.
 *
 * **Implementation:**
 * Maps all pages from `source.getPages()` through `getLLMText()`, which
 * calls `page.data.getText('processed')` to extract clean markdown
 * (stripped of MDX syntax, JSX components, and import statements).
 * Pages are joined with double newlines.
 *
 * **Caching:**
 * - `revalidate = false` — Fully static at build time.
 * - `Cache-Control: public, max-age=3600, s-maxage=86400` — CDN caches
 *   for 24 hours, browsers for 1 hour.
 *
 * @see app/llms.txt/route.ts — LLMs.txt index (table of contents)
 * @see app/llms.mdx/[[...slug]]/route.ts — Per-page MDX export
 * @see lib/source.ts — `getLLMText()` for per-page text extraction
 *
 * @module
 */
import { getLLMText, source } from '@/lib/source';

/**
 * Disable ISR revalidation — the full-text export is fully static.
 * Regenerated only on the next `next build`.
 */
export const revalidate = false;

/**
 * GET handler — returns all documentation content as a single plain-text response.
 *
 * Iterates over every page in the Fumadocs source tree, extracts
 * processed markdown via `getLLMText()`, and concatenates all pages
 * with double newlines. The response includes caching headers for
 * CDN-level optimization.
 *
 * @returns A `Response` with the full documentation corpus as plain text.
 */
export async function GET(): Promise<Response> {
  const scan = source.getPages().map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join('\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
