/**
 * Enterstellar Docs — Content Loader API
 *
 * This module initializes the core content loader with our MDX
 * collections. It creates the canonical `source` object used across
 * the app to query pages, extract content, and build navigation.
 *
 * **Core Exports:**
 * - `source` — The central API for looking up content pages.
 * - `getPageImage()` — Helper for generating the OG image path.
 * - `getPageMarkdownUrl()` — Helper for generating the `.mdx` Route.
 * - `getLLMText()` — Helper for extracting clean, text-only content
 *   for AI systems via the `llms-full.txt` and `.mdx` routes.
 * - `getSection()` — *(re-exported from `section.ts`)* Maps a URL path
 *   segment to a structural section identifier for section-based theming.
 *
 * @see source.config.ts — Where the `docs` collection is defined.
 * @see lib/shared.ts — Shared route constants.
 * @see content/meta.json — Content-level section ordering.
 *
 * @module
 */
import { docs } from 'collections/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsContentRoute, docsImageRoute, docsRoute } from '../shared';

/**
 * The canonical content source instance.
 *
 * Re-exports the generated `docs` collection (from `.source/server`)
 * plugged into the core loader. Contains memory structures for the
 * sidebar page tree, search indexing, and URL routing.
 *
 * We inject `lucideIconsPlugin()` to automatically map icon strings in
 * frontmatter to Lucide React components.
 */
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

/**
 * Generate the path attributes for a page's OpenGraph image.
 *
 * Maps a page to its corresponding static OG route handled by the
 * App Router.
 *
 * @param page - The page object retrieved from the `source` API.
 * @returns Object containing the route segments and the full image URL.
 */
export function getPageImage(
  page: InferPageType<typeof source>,
): { segments: string[]; url: string } {
  const segments = [...page.slugs, 'image.png'];

  return {
    segments,
    url: `${docsImageRoute}/${segments.join('/')}`,
  };
}

/**
 * Generate the path attributes for a page's LLM export route.
 *
 * Maps a page to its corresponding `.mdx` proxy route handled by the
 * `llms.mdx` route group.
 *
 * @param page - The page object retrieved from the `source` API.
 * @returns Object containing the route segments and the full markdown URL.
 */
export function getPageMarkdownUrl(
  page: InferPageType<typeof source>,
): { segments: string[]; url: string } {
  const segments = [...page.slugs, 'content.md'];

  return {
    segments,
    url: `${docsContentRoute}/${segments.join('/')}`,
  };
}

/**
 * Extract clean, plain-text markdown content from a page.
 *
 * Pulls the 'processed' content via the core loader. This text
 * has been stripped of React specific components and layout debris,
 * leaving pure Markdown suitable for LLM grounding and search indexing.
 * Prepends the page title and URL as standard Markdown headings.
 *
 * @param page - The page object retrieved from the `source` API.
 * @returns A promise resolving to the clean markdown text string.
 */
export async function getLLMText(page: InferPageType<typeof source>): Promise<string> {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title} (${page.url})

${processed}`;
}

// =============================================================================
// Section Mapping (re-exported from client-safe module)
// =============================================================================

/**
 * Re-export `getSection` from the isolated `section.ts` module.
 *
 * This barrel re-export allows server-side consumers (e.g., `docs/layout.tsx`)
 * to import `getSection` from `'@/lib/source'` alongside `source`, without
 * forcing client-side consumers to pull in server-only dependencies.
 *
 * @see lib/source/section.ts — The client-safe implementation
 */
export { getSection } from './section';
