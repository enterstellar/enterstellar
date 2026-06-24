/**
 * Enterstellar Docs — Core MDX Source Configuration
 *
 * Defines the content pipeline for the Enterstellar documentation app. This file
 * is consumed at build time to:
 *
 * 1. **Discover** MDX files in `content/` and transform them into
 *    typed, searchable documentation pages.
 * 2. **Process** code blocks with Shiki syntax highlighting, Twoslash
 *    type annotations, KaTeX math rendering, and auto-generated
 *    TypeScript type tables.
 * 3. **Extract** metadata (element IDs, link references, processed
 *    markdown) for search indexing and LLM text export.
 *
 * **Collections:**
 * - `docs` — The primary documentation collection. Pages are in
 *   `content/` and have extended frontmatter (preview, index, method).
 * - ~~`blog`~~ — Removed per WP10. Blog content lives in the `enterstellar-web`
 *   monorepo, not in product documentation repos.
 *
 * **Processing pipeline (production mode):**
 *
 * | Stage      | Plugin / Transformer           | Purpose                                 |
 * |:-----------|:-------------------------------|:----------------------------------------|
 * | Remark     | `remarkSteps`                  | Step-by-step numbered sections           |
 * | Remark     | `remarkMath`                   | KaTeX math notation                      |
 * | Remark     | `remarkFeedbackBlock`          | Inline feedback widgets                  |
 * | Remark     | `remarkAutoTypeTable`          | Auto-generated TS prop tables            |
 * | Remark     | `remarkTypeScriptToJavaScript` | TS→JS code tab transpilation             |
 * | Rehype     | `rehypeKatex`                  | KaTeX rendering                          |
 * | Rehype     | `rehypeCode` (Shiki)           | Syntax highlighting + Twoslash           |
 * | Shiki      | `transformerTwoslash`          | Inline type annotations on hover         |
 * | Shiki      | `transformerEscape`            | Unescape `[\\!code` notation             |
 *
 * **Lint mode (`LINT=1`):**
 * Skips all expensive Shiki/Twoslash processing. Only extracts element
 * IDs for `next-validate-link` CI validation.
 *
 * **Plugins (global, applied to all collections):**
 * - `jsonSchema` — Auto-generates JSON Schema from Zod frontmatter schemas.
 * - `lastModified` — Extracts git last-modified timestamps per page.
 *
 * @see lib/source.ts — Consumes the `docs` collection via the core loader.
 * @see lib/shiki.ts — Shared Shiki configuration (theme, languages).
 * @see app/(docs)/[[...slug]]/page.tsx — Renders pages from this pipeline.
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP10 (blogs in enterstellar-web).
 *
 * @module
 */
import { applyMdxPreset, defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { z } from 'zod';
import type { ElementContent } from 'hast';
import jsonSchema from 'fumadocs-mdx/plugins/json-schema';
import lastModified from 'fumadocs-mdx/plugins/last-modified';
import type { ShikiTransformer } from 'shiki';
import type { RemarkAutoTypeTableOptions } from 'fumadocs-typescript';
import { defaultShikiOptions } from './src/lib/shiki';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { visit } from 'unist-util-visit';
import type { Transformer } from 'unified';
import type { Root } from 'mdast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Whether the pipeline is running in lint mode.
 *
 * When `true`, expensive Shiki/Twoslash code processing is skipped.
 * Instead, only element IDs are extracted for link validation. Set by
 * CI lint scripts and `next-validate-link`.
 *
 * @see scripts/lint.ts — Sets `LINT=1` before running validation.
 */
const isLint = process.env['LINT'] === '1';

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Primary documentation collection.
 *
 * Reads MDX files from `content/` with extended frontmatter schema:
 *
 * - `preview` — Optional key referencing a live preview component from
 *   `@/components/preview`. Used for interactive component demos.
 * - `index` — Whether this page is a category index (renders sibling
 *   pages as cards below content). Defaults to `false`.
 * - `method` — HTTP method label for API route documentation pages
 *   (GET, POST, etc.). Displayed as a badge in the sidebar.
 *
 * **Postprocess flags:**
 * - `includeProcessedMarkdown` — Generates clean markdown for LLM
 *   text export routes (`llms.txt`, `llms-full.txt`, `llms.mdx`).
 * - `extractLinkReferences` — Enables cross-page link validation
 *   for `next-validate-link` CI integration.
 * - `valueToExport: ['elementIds']` — Exports extracted element IDs
 *   for anchor link validation in lint mode.
 *
 * @see source.config.ts §Lint mode — `LINT=1` skips expensive processing.
 */
export const docs = defineDocs({
  // Content is at `content/` (not the default `content/docs/`) because
  // the docs subfolder was removed to flatten the content structure.
  dir: 'content',
  docs: {
    schema: pageSchema.extend({
      /** Optional key referencing a live preview component name. */
      preview: z.string().optional(),
      /** Whether this page is a category index page. */
      index: z.boolean().default(false),
      /** API routes only — displayed as a method badge (GET, POST, etc.). */
      method: z.string().optional(),
    }),
    postprocess: {
      // Generate clean markdown for LLM text export routes.
      includeProcessedMarkdown: true,
      // Enable cross-page link reference extraction for lint validation.
      extractLinkReferences: true,
      // Export element IDs for anchor link validation in lint mode.
      valueToExport: ['elementIds'],
    },
    async: true,
    async mdxOptions(environment) {
      // -----------------------------------------------------------------
      // Dynamic imports — evaluated during MDX compilation at build time.
      // Each import is async to avoid bundling these heavy Node.js
      // packages into the production server bundle on Vercel.
      // -----------------------------------------------------------------
      const { rehypeCodeDefaultOptions } = await import('fumadocs-core/mdx-plugins/rehype-code');
      const { remarkSteps } = await import('fumadocs-core/mdx-plugins/remark-steps');
      const { remarkFeedbackBlock } =
        await import('fumadocs-core/mdx-plugins/remark-feedback-block');
      const { transformerTwoslash } = await import('fumadocs-twoslash');
      const { createFileSystemTypesCache } = await import('fumadocs-twoslash/cache-fs');
      const { default: remarkMath } = await import('remark-math');
      const { remarkTypeScriptToJavaScript } = await import('fumadocs-docgen/remark-ts2js');
      const { default: rehypeKatex } = await import('rehype-katex');
      const { remarkAutoTypeTable, createGenerator, createFileSystemGeneratorCache } =
        await import('fumadocs-typescript');

      // -----------------------------------------------------------------
      // TypeTable Generator
      // Caches generated type tables to `.next/fumadocs-typescript`
      // to avoid re-analysing unchanged TypeScript source files.
      // -----------------------------------------------------------------
      const typeTableOptions: RemarkAutoTypeTableOptions = {
        generator: createGenerator({
          cache: createFileSystemGeneratorCache('.next/fumadocs-typescript'),
        }),
        shiki: defaultShikiOptions,
      };

      // -----------------------------------------------------------------
      // MDX Preset — assembles the full remark/rehype pipeline.
      // -----------------------------------------------------------------
      return applyMdxPreset({
        // --- Syntax Highlighting (Shiki) ---
        // Skipped in lint mode to avoid expensive WASM-based processing.
        rehypeCodeOptions: isLint
          ? false
          : {
              langs: ['ts', 'js', 'html', 'tsx', 'mdx'],
              inline: 'tailing-curly-colon',
              themes: {
                light: 'catppuccin-latte',
                dark: 'catppuccin-mocha',
              },
              transformers: [
                // Default Core transformers (line numbers, etc.)
                ...(rehypeCodeDefaultOptions.transformers ?? []),
                // Twoslash — inline type annotations with FS-cached types.
                transformerTwoslash({
                  typesCache: createFileSystemTypesCache(),
                  twoslashOptions: {
                    compilerOptions: {
                      types: ['@types/node'],
                    },
                  },
                }),
                // Unescape `[\!code` → `[!code` for meta-documentation.
                transformerEscape(),
              ],
            },

        // --- Code Tab Configuration ---
        // Enables MDX-aware code tab parsing for TS/JS dual tabs.
        remarkCodeTabOptions: {
          parseMdx: true,
        },

        // --- Search Index Structure ---
        // Controls how MDX content is stringified for FlexSearch/Orama
        // indexing. Custom MDX components are filtered to extract only
        // their text content ('children-only'), while specific components
        // (File, TypeTable, Callout, Card, Custom) are preserved as-is.
        remarkStructureOptions: {
          stringify: {
            filterElement(node) {
              if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
                if (
                  node.name === 'File' ||
                  node.name === 'TypeTable' ||
                  node.name === 'Callout' ||
                  node.name === 'Card' ||
                  node.name === 'Custom'
                ) {
                  return true;
                }
                // All other MDX components: extract children text only,
                // discarding the component wrapper itself.
                return 'children-only';
              }

              return true;
            },
          },
        },

        // --- Package Manager Tabs ---
        // Persists the user's preferred package manager (npm/pnpm/yarn)
        // across all code tabs via a shared `package-manager` key.
        remarkNpmOptions: {
          persist: {
            id: 'package-manager',
          },
        },

        // --- Remark Plugins ---
        // In lint mode: only extract element IDs for link validation.
        // In production: full pipeline with math, feedback, types, TS→JS.
        remarkPlugins: isLint
          ? [remarkElementIds]
          : [
              remarkSteps,
              remarkMath,
              remarkFeedbackBlock,
              [remarkAutoTypeTable, typeTableOptions],
              remarkTypeScriptToJavaScript,
            ],

        // --- Rehype Plugins ---
        // KaTeX is prepended to the default rehype plugins to ensure
        // math rendering happens before code highlighting.
        rehypePlugins: (v) => [rehypeKatex, ...v],
      })(environment);
    },
  },
  meta: {
    schema: metaSchema.extend({
      /** Optional section description for navigation UI. */
      description: z.string().optional(),
    }),
  },
});

// ---------------------------------------------------------------------------
// Shiki Transformers
// ---------------------------------------------------------------------------

/**
 * Shiki transformer that unescapes `[\\!code` notation back to `[!code`.
 *
 * The `@shikijs/transformers` package uses `[!code highlight]` etc. as
 * special annotations. When authoring code blocks that _show_ these
 * annotations (e.g., in meta-documentation about Shiki itself), authors
 * escape them as `[\\!code`. This transformer reverses the escape in the
 * rendered output so the annotation text appears verbatim.
 *
 * @returns A Shiki transformer that processes `code` HAST nodes.
 */
function transformerEscape(): ShikiTransformer {
  return {
    name: '@shikijs/transformers:remove-notation-escape',
    code(hast) {
      /**
       * Recursively replace escaped notation in all text nodes.
       *
       * @param node - The HAST element or text node to process.
       */
      function replace(node: ElementContent): void {
        if (node.type === 'text') {
          node.value = node.value.replace('[\\!code', '[!code');
        } else if ('children' in node) {
          for (const child of node.children) {
            replace(child);
          }
        }
      }

      replace(hast);
      return hast;
    },
  };
}

// ---------------------------------------------------------------------------
// Remark Plugins
// ---------------------------------------------------------------------------

/**
 * Remark plugin that extracts element IDs from MDX JSX flow elements.
 *
 * Used in **lint mode only** (`LINT=1`). Visits all `mdxJsxFlowElement`
 * nodes in the MDAST, collects their `id` attributes, and attaches them
 * to `file.data['elementIds']`. This data is consumed by
 * `next-validate-link` to verify that internal anchor links (e.g.,
 * `#some-id`) resolve to real elements in the rendered output.
 *
 * @returns A unified transformer that populates `file.data['elementIds']`.
 */
function remarkElementIds(): Transformer<Root, Root> {
  return (tree, file) => {
    // Initialize the elementIds array if not already present.
    file.data['elementIds'] ??= [];

    visit(tree, 'mdxJsxFlowElement', (element) => {
      if (!element.name) return;

      // Find the `id` attribute on the JSX element.
      const idAttr = element.attributes.find(
        (attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'id',
      );

      // Collect string-valued IDs for anchor validation.
      if (idAttr && typeof idAttr.value === 'string') {
        (file.data['elementIds'] as string[]).push(idAttr.value);
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Pipeline Configuration
// ---------------------------------------------------------------------------

/**
 * Root Core MDX configuration.
 *
 * Applies global plugins to all collections:
 *
 * - `jsonSchema` — Auto-generates a JSON Schema file from Zod frontmatter
 *   schemas. Enables IDE autocompletion in `.mdx` files when editors
 *   support the `$schema` frontmatter key.
 * - `lastModified` — Reads `git log` timestamps for each content file
 *   and injects `lastModified` into page data. Consumed by:
 *   - `PageLastUpdate` component in `page.tsx` (shown below content).
 *   - `sitemap.ts` for `<lastmod>` entries.
 *
 * @see app/sitemap.ts — Consumes `lastModified` for sitemap generation.
 * @see app/(docs)/[[...slug]]/page.tsx — Renders `PageLastUpdate` from timestamps.
 */
export default defineConfig({
  plugins: [
    // Generate JSON Schema for IDE frontmatter autocompletion.
    jsonSchema({
      insert: true,
    }),
    // Extract git last-modified timestamps per content file.
    lastModified(),
  ],
});
