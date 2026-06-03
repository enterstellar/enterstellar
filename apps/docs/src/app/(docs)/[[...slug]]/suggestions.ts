/**
 * @module suggestions
 * @description Provides page suggestions for the 404 not-found page.
 *
 * Uses Fumadocs' built-in source API to search for pages matching
 * the requested pathname. Replaces the previous Orama Cloud integration
 * with a zero-dependency, server-side search using the local page tree.
 */

import type { Suggestion } from '@/components/layouts/not-found';
import { source } from '@/lib/source';

/**
 * Searches documentation pages for suggestions matching the given pathname.
 *
 * Called server-side from the catch-all `[[...slug]]/page.tsx` when
 * no page matches the requested slug. Returns up to 5 pages whose
 * titles or slugs partially match the input.
 *
 * @param pathname - The requested path segments joined by spaces (e.g., 'getting started')
 * @returns An array of up to 5 page suggestions with `id`, `href`, and `title`
 */
export function getSuggestions(pathname: string): Promise<Suggestion[]> {
  const normalizedQuery = pathname.toLowerCase().trim();
  if (normalizedQuery.length === 0) return Promise.resolve([]);

  const pages = source.getPages();

  // Score each page by how well its title or URL matches the query
  const scored = pages
    .map((page) => {
      const title = page.data.title.toLowerCase();
      const url = page.url.toLowerCase();
      let score = 0;

      // Exact title match
      if (title === normalizedQuery) {
        score += 100;
      }
      // Title contains query
      else if (title.includes(normalizedQuery)) {
        score += 50;
      }
      // Query words appear in title
      else {
        const queryWords = normalizedQuery.split(/\s+/);
        for (const word of queryWords) {
          if (title.includes(word)) score += 10;
          if (url.includes(word)) score += 5;
        }
      }

      return { page, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return Promise.resolve(scored.map((entry, index) => ({
    id: String(index),
    href: entry.page.url,
    title: entry.page.data.title,
  })));
}
