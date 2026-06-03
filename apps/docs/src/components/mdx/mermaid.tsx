/**
 * Enterstellar Docs — Mermaid Diagram Renderer
 *
 * Client-side component that renders Mermaid diagrams from chart
 * definition strings in MDX content. Lazy-loads the `mermaid` library
 * on first use and renders theme-aware SVG output.
 *
 * **Architecture:**
 * - `Mermaid` — Mount-guarded wrapper that defers rendering to the client.
 * - `MermaidContent` — Client-only renderer that initializes Mermaid with
 *   theme colors and renders the chart SVG.
 *
 * **Caching:** Both the `mermaid` library import and individual chart
 * renders are cached in a module-level `Map` to avoid redundant work
 * during re-renders and theme switches.
 *
 * @see app/(docs)/[[...slug]]/page.tsx — Where MDX content with Mermaid is rendered
 *
 * @module
 */
'use client';

import { type ReactElement, use, useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Mermaid diagram component.
 *
 * Renders a Mermaid chart from a definition string. Uses a mount guard
 * to prevent SSR of the client-only Mermaid library.
 *
 * @param props - Component props.
 * @param props.chart - Mermaid chart definition string (e.g., `graph TD; A-->B`).
 * @returns The rendered diagram, or `undefined` before client mount.
 */
export function Mermaid({ chart }: { chart: string }): ReactElement | undefined {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return;
  return <MermaidContent chart={chart} />;
}

/**
 * Module-level promise cache for Mermaid library and chart renders.
 *
 * Keys are either `'mermaid'` (for the library import) or
 * `'{chart}-{theme}'` (for individual chart renders). Prevents
 * redundant async work during React re-renders.
 */
const cache = new Map<string, Promise<unknown>>();

/**
 * Cache-or-create pattern for async promises.
 *
 * Returns the cached promise if one exists for the given key, otherwise
 * creates a new promise via `setPromise()` and caches it.
 *
 * @typeParam T - The resolved type of the promise.
 * @param key - Cache key for the promise.
 * @param setPromise - Factory function to create the promise if not cached.
 * @returns The cached or newly-created promise.
 */
function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

/**
 * Client-only Mermaid renderer.
 *
 * Initializes the Mermaid library with theme-aware configuration
 * (dark/light based on `next-themes`), then renders the chart SVG.
 * Uses `bindFunctions` for interactive diagram elements (e.g., click
 * handlers in flowcharts).
 *
 * @param props - Component props.
 * @param props.chart - Mermaid chart definition string.
 * @returns The rendered SVG diagram element.
 */
function MermaidContent({ chart }: { chart: string }): ReactElement {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'inherit',
    themeCSS: 'margin: 1.5rem auto 0;',
    theme: resolvedTheme === 'dark' ? 'dark' : 'default',
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${String(resolvedTheme)}`, () => {
      return mermaid.render(id, chart.replaceAll('\\n', '\n'));
    }),
  );

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
