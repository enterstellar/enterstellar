/**
 * Enterstellar Docs — MDX Component Overrides
 *
 * Barrel module that provides the canonical set of MDX component overrides
 * for all documentation pages. Merges Fumadocs UI defaults with additional
 * component registrations (Files, Tabs, Accordion) and allows per-page
 * overrides via the `components` parameter.
 *
 * **Exports:**
 * - `getMDXComponents(components?)` — Returns the merged component map.
 * - `useMDXComponents` — Alias for `getMDXComponents` (MDX v3 convention).
 *
 * **Global type:** Declares `MDXProvidedComponents` so that MDX files
 * can reference registered components without explicit imports.
 *
 * @see app/(docs)/[[...slug]]/page.tsx — Where MDX pages are rendered
 * @see {@link https://mdxjs.com/docs/using-mdx/#components MDX Components guide}
 *
 * @module
 */
import defaultMdxComponents from 'fumadocs-ui/mdx';
import * as FilesComponents from 'fumadocs-ui/components/files';
import * as TabsComponents from 'fumadocs-ui/components/tabs';
import type { MDXComponents } from 'mdx/types';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';

/**
 * Returns the merged MDX component map.
 *
 * Layers Fumadocs UI defaults with Files, Tabs, and Accordion components.
 * Additional per-page overrides can be passed via the `components` parameter
 * and will take highest precedence.
 *
 * @remarks
 * The type assertion on `defaultMdxComponents` is required because
 * Fumadocs' internal `img` component type is incompatible with the
 * `MDXComponents` type under `exactOptionalPropertyTypes: true`.
 * This is a library-level type mismatch (fumadocs-ui/mdx), not our code.
 *
 * @param components - Optional per-page component overrides.
 * @returns The complete MDX component map.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...(defaultMdxComponents as MDXComponents),
    ...TabsComponents,
    ...FilesComponents,
    Accordion,
    Accordions,
    ...components,
  };
}

/**
 * MDX v3 convention alias for `getMDXComponents`.
 *
 * Some MDX tooling expects a `useMDXComponents` export. This alias
 * ensures compatibility with both naming conventions.
 */
export const useMDXComponents = getMDXComponents;

/**
 * Global type declaration for MDX-provided components.
 *
 * Allows MDX files to reference registered components (e.g., `<Tabs>`,
 * `<Accordion>`) without explicit imports. The type is inferred from
 * the return type of `getMDXComponents`.
 */
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
