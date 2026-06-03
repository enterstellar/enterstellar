/**
 * Enterstellar Docs — Link Validation Script
 *
 * Programmatic link validator using `next-validate-link`. Scans all
 * documentation pages from the content source, builds a URL registry
 * with heading anchors, and validates all internal links and references
 * across the MDX content.
 *
 * **Usage:**
 * ```bash
 * pnpm lint:links
 * ```
 *
 * This runs `fumadocs-mdx` first (to generate the `.source/` artifacts),
 * then executes this script with `node --experimental-strip-types`.
 *
 * **How it works:**
 * 1. `scanURLs()` — Builds a registry of all valid URLs and their
 *    heading anchors from the generated page tree.
 * 2. `validateFiles()` — Scans raw MDX file content for internal links
 *    and validates each against the URL registry.
 * 3. `printErrors()` — Outputs validation errors and exits with code 1
 *    if any broken links are found.
 *
 * @see source.config.ts — Content pipeline that generates page data
 * @see lib/source/index.ts — `source` API consumed here
 *
 * @module
 */
import {
  type FileObject,
  printErrors,
  scanURLs,
  validateFiles,
} from 'next-validate-link';
import type { InferPageType } from 'fumadocs-core/source';
import { source } from '@/lib/source';

/**
 * Validate all internal links across the documentation.
 *
 * Builds a URL+anchor registry from the page tree, then validates
 * every internal link in every MDX file against it. Prints errors
 * to stdout and exits with code 1 if broken links are found.
 */
async function checkLinks(): Promise<void> {
  const scanned = await scanURLs({
    populate: {
      '[[...slug]]': await Promise.all(
        source.getPages().map(async (page: InferPageType<typeof source>) => ({
          value: {
            slug: page.slugs,
          },
          hashes: await getHeadings(page),
        })),
      ),
    },
  });

  console.log(`collected ${scanned.urls.size} URLs, ${scanned.fallbackUrls.length} fallbacks`);

  const files = await getFiles();
  console.log(`Scanning ${files.length} MDX files for broken links...`);

  printErrors(
    await validateFiles(files, {
      scanned,
      markdown: {
        components: {
          Card: { attributes: ['href'] },
        },
      },
      checkRelativePaths: 'as-url',
    }),
    true,
  );
}

/**
 * Extract heading anchor IDs from a documentation page.
 *
 * Loads the page's TOC and exported element IDs to build a list of
 * valid hash targets for anchor link validation.
 *
 * @param page - The page object from the source API.
 * @returns An array of heading anchor strings (without `#` prefix).
 */
async function getHeadings({ data }: InferPageType<typeof source>): Promise<string[]> {
  let loaded;
  try {
    loaded = await data.load();
  } catch (error) {
    // Gracefully handle raw Node MDX AST evaluation faults (like remark-rehype crashes)
    // so the overarching link validation scan can continue gracefully without crashing.
    return [];
  }

  const toc = loaded?.toc || [];
  const _exports = loaded?._exports || {};

  const headings = toc.map((item: { url: string }) => item.url.slice(1));
  const elementIds = _exports?.['elementIds'];
  if (Array.isArray(elementIds)) {
    headings.push(...elementIds);
  }

  return headings;
}

/**
 * Build the file list for link validation.
 *
 * Iterates all pages from the source API and constructs `FileObject`
 * entries with the raw MDX content for `next-validate-link` to scan.
 *
 * @returns An array of file objects for validation.
 */
async function getFiles(): Promise<FileObject[]> {
  const files: FileObject[] = [];
  for (const page of source.getPages()) {
    files.push({
      data: page.data,
      url: page.url,
      path: page.data.info.fullPath,
      content: await page.data.getText('raw'),
    });
  }

  return files;
}

void checkLinks();
