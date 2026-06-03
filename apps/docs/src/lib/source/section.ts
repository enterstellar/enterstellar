/**
 * Enterstellar Docs — Section Mapping
 *
 * Pure-logic module that maps URL path segments to structural section
 * identifiers for section-based theming (accent colors per nav tab).
 *
 * **Why a separate file?**
 * This module is consumed by `layout.client.tsx` (`'use client'`). It
 * MUST NOT import anything from the Fumadocs content pipeline
 * (`collections/server`, `fumadocs-core/source`) because those modules
 * transitively depend on `node:fs/promises`, which cannot be bundled
 * for the browser. Keeping this logic isolated ensures the client
 * component's import chain stays browser-safe.
 *
 * **Scaling:** To add sections for Enterstellar Cloud or new product areas,
 * simply add entries to `SECTION_MAP`. Works with 6-10+ sections.
 *
 * @example
 * ```ts
 * const SECTION_MAP: Record<string, string> = {
 *   ui: 'ui',
 *   cloud: 'cloud',
 *   compiler: 'compiler',
 * };
 * ```
 *
 * @see app/layout.client.tsx — Client-side consumer (via direct import)
 * @see app/(docs)/layout.tsx — Server-side consumer (via barrel re-export)
 * @see content/meta.json — Content-level section ordering
 *
 * @module
 */

/**
 * Registry mapping root directory names to their structural section identifiers.
 *
 * Used to categorize documentation pages for section-based theming. Each
 * top-level content folder can be assigned a unique CSS mode class (which
 * drives accent colors). If a page's root path doesn't match any key in
 * this registry, it falls back to `DEFAULT_SECTION`.
 */
const SECTION_MAP: Record<string, string> = {
  ui: 'ui',
};

/** Default section identifier assigned to unmatched routes. */
const DEFAULT_SECTION = 'framework';

/**
 * Determine the structural section of a given path.
 *
 * Inspects a routing path (typically the `url` or `path` of an MDX page),
 * extracts its root directory segment, and maps it to a canonical section
 * identifier using `SECTION_MAP`.
 *
 * @param path - The relative file path or route string of the page.
 *               Can be `undefined` (e.g., on index pages without subpaths).
 * @returns The mapped section identifier (e.g., `'ui'`) or the
 *          default identifier (`'framework'`) if the path is empty/unmapped.
 */
export function getSection(path?: string): string {
  if (!path) return DEFAULT_SECTION;

  // Split by '/' and take only the first segment.
  const [dir] = path.split('/', 1);

  if (!dir) return DEFAULT_SECTION;

  // Dictionary lookup (safe under `noUncheckedIndexedAccess`).
  const mappedSection = SECTION_MAP[dir];

  return mappedSection ?? DEFAULT_SECTION;
}
