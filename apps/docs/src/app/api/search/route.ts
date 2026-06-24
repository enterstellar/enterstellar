/**
 * @module api/search
 * @description Documentation search API route.
 *
 * Provides a GET endpoint for the documentation search UI component.
 * Uses `createFromSource` to build a FlexSearch-backed search server
 * from the documentation source tree, enabling full-text search across
 * all page titles, descriptions, and structured content.
 *
 * **Implementation:**
 * - `createFromSource` indexes all pages from `source.getPages()` at
 *   module load time, building an in-memory FlexSearch index.
 * - The `language` option configures FlexSearch's stemmer and tokenizer
 *   for English — improving relevance for documentation queries.
 *
 * **Performance:**
 * The search index is built once per cold start and shared across
 * requests within the same Worker instance. On Vercel,
 * this means the index is rebuilt on each deployment or cold start.
 *
 * @see components/layouts/search.tsx — Client-side search UI consumer
 * @see lib/source/index.ts — `source` API for page enumeration
 * @see Core Search documentation
 */
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

/**
 * GET /api/search — Full-text documentation search endpoint.
 *
 * Accepts a `query` search parameter and returns matching pages as JSON.
 * The response shape is defined by the core `createFromSource` and is
 * consumed by the `SearchDialog` / `AISearch` client components.
 */
export const { GET } = createFromSource(source, {
  // FlexSearch language configuration — enables English stemming and
  // stop-word filtering for improved search relevance.
  language: 'english',
});
