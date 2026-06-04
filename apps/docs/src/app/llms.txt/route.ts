/**
 * Enterstellar Docs — LLMs.txt Index Route
 *
 * Generates the `llms.txt` standard index — a machine-readable table of
 * contents for LLM agents, AI coding assistants, and retrieval-augmented
 * generation (RAG) systems.
 *
 * The index lists every documentation page with its URL and description
 * in a standardized plain-text format. This allows LLM tools to discover
 * the complete documentation structure and selectively fetch individual
 * pages via the companion `llms.mdx` per-page route.
 *
 * **Implementation:**
 * Uses the core `llms()` utility,
 * which reads from the canonical `source` API (same data as search,
 * sidebar, and sitemap). This is the most maintainable approach — zero
 * custom code to keep in sync with content changes.
 *
 * **Caching:**
 * - `revalidate = false` — Fully static at build time.
 * - `Cache-Control: public, max-age=3600, s-maxage=86400` — CDN caches
 *   for 24 hours, browsers for 1 hour. Matches the Enterstellar blog's caching
 *   strategy for LLM text routes.
 *
 * @see app/llms-full.txt/route.ts — Full concatenated content export
 * @see app/llms.mdx/[[...slug]]/route.ts — Per-page MDX export
 * @see https://llmstxt.org — LLMs.txt specification
 *
 * @module
 */
import { source } from '@/lib/source';
import { llms } from 'fumadocs-core/source';

/**
 * Disable ISR revalidation — the LLMs.txt index is fully static.
 * Regenerated only on the next `next build`.
 */
export const revalidate = false;

/**
 * GET handler — returns the LLMs.txt index as a plain-text response.
 *
 * Generates a table of contents listing every documentation page's URL
 * and description. The response includes a `Cache-Control` header for
 * CDN-level caching.
 *
 * @returns A `Response` with `text/plain` body and cache headers.
 */
export function GET(): Response {
  const body = llms(source).index();

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
