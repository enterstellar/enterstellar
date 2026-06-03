/**
 * Enterstellar Docs — Documentation Graph Builder
 *
 * Builds the `Graph` data structure consumed by the force-directed graph
 * visualization component. Iterates all documentation pages from the
 * content source, extracts cross-references (internal links), and
 * constructs a node-link graph suitable for `react-force-graph-2d`.
 *
 * **Algorithm:**
 * 1. Iterate all pages from `source.getPages()`.
 * 2. Create a node for each page (title, description, URL).
 * 3. Load the page content and extract `extractedReferences` (cross-links).
 * 4. For each reference, resolve the target page and create a directed edge.
 *
 * @see components/graph-view.tsx — Consumer of the `Graph` type
 * @see lib/source/index.ts — `source` API for page enumeration
 *
 * @module
 */
import { source } from '@/lib/source';
import type { Graph } from '@/components/graph-view';

/**
 * Build the documentation page graph.
 *
 * Asynchronously processes all documentation pages to extract nodes
 * (pages) and links (cross-references). Uses `Promise.all` for
 * concurrent page loading.
 *
 * @returns A promise resolving to the complete `Graph` data structure
 *          with nodes and links ready for visualization.
 */
export async function buildGraph(): Promise<Graph> {
  const graph: Graph = { links: [], nodes: [] };

  // Process all pages concurrently — each page contributes one node
  // and zero-or-more edges (cross-references extracted from MDX).
  await Promise.all(
    source.getPages().map(async (page) => {

      // ── Create Node ────────────────────────────────────────────────────
      graph.nodes.push({
        id: page.url,
        url: page.url,
        text: page.data.title,
        description: page.data.description ?? '',
      });

      // ── Extract Edges ──────────────────────────────────────────────────
      // Each page's MDX body is parsed for internal links at build time.
      // `extractedReferences` contains all `[text](href)` targets found.
      const { extractedReferences } = await page.data.load();
      for (const ref of extractedReferences) {
        // Resolve the href to an actual page — skip broken/external links
        const refPage = source.getPageByHref(ref.href);
        if (!refPage) continue;

        graph.links.push({
          source: page.url,
          target: refPage.page.url,
        });
      }
    }),
  );

  return graph;
}
