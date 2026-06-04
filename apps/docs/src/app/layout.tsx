/**
 * Enterstellar Docs — Root Layout
 *
 * Top-level layout component for the Enterstellar documentation app. Wraps every
 * page with:
 *
 * 1. **Global CSS** — Tailwind v4 + core UI theme + interactive component previews preset.
 * 2. **Typography** — Geist (sans) and Geist Mono (mono) from Google Fonts,
 *    exposed as CSS custom properties `--font-sans` and `--font-mono`.
 * 3. **Theme** — `next-themes` provider (via `Provider`) for dark/light mode.
 * 4. **Navigation** — `TreeContextProvider` hydrates the sidebar page tree
 *    from the documentation source at build time.
 * 5. **Framework** — `NextProvider` enables framework-
 *    level features (link prefetching, scroll restoration, etc.).
 *
 * **Metadata exports:**
 * - `metadata` — Default OpenGraph, Twitter Card, and title template for
 *   all pages. Individual pages override via `generateMetadata()`.
 * - `viewport` — Theme-color meta tags for mobile browser chrome.
 *
 * @see lib/metadata.ts — `createMetadata()` factory and `baseUrl`
 * @see lib/source.ts — `source.getPageTree()` for sidebar tree
 * @see app/layout.client.tsx — `Body` client component for hydration
 *
 * @module
 */

import './global.css';
import './swatches.css';
import type { Viewport } from 'next';
import { baseUrl, createMetadata } from '@/lib/metadata';
import { Body } from '@/app/layout.client';
import { Provider } from './provider';
import type { ReactNode } from 'react';
import { TreeContextProvider } from 'fumadocs-ui/contexts/tree';
import { source } from '@/lib/source';
import { NextProvider } from 'fumadocs-core/framework/next';

/**
 * Root-level metadata for the Enterstellar documentation site.
 *
 * Sets the title template (`%s | Enterstellar`), default title, description,
 * and `metadataBase` for resolving relative OG image URLs. Per-page
 * metadata is merged on top of these defaults by `createMetadata()`.
 */
export const metadata = createMetadata({
  title: {
    template: '%s | Enterstellar',
    default: 'Enterstellar — The TypeScript of Generative UI',
  },
  description:
    'Type-safe, deterministic, observable AI-generated interfaces. The compiler layer between AI and your screen.',
  metadataBase: baseUrl,
});

// Enterstellar Design System Swatch Constants for Browser Viewport Theming
const SWATCH_BLACK = '#080808';      // Matches `--swatch--black`
const SWATCH_WHITE_SMOKE = '#f6f7f8'; // Matches `--swatch--bg-whte-smoke`

/**
 * Viewport configuration for mobile browser chrome theming.
 *
 * Sets the browser toolbar color to official Enterstellar background colors:
 * `#080808` (black) in dark mode and `#f6f7f8` (smoke) in light mode.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: SWATCH_BLACK },
    { media: '(prefers-color-scheme: light)', color: SWATCH_WHITE_SMOKE },
  ],
};

/**
 * Root layout component.
 *
 * Renders the `<html>` element with font CSS variables, hydration
 * suppression (for `next-themes`), and the full provider stack:
 *
 * ```
 * <html>
 *   <Body>              ← client component (className, scroll lock)
 *     <NextProvider>     ← core framework features
 *       <TreeContext>    ← sidebar navigation tree
 *         <Provider>     ← next-themes + app-level providers
 *           {children}
 *         </Provider>
 *       </TreeContext>
 *     </NextProvider>
 *   </Body>
 * </html>
 * ```
 *
 * @param props - Layout props containing `children` to render.
 * @returns The root HTML document structure with all providers.
 */
export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en" suppressHydrationWarning>
      <Body>
        <NextProvider>
          <TreeContextProvider tree={source.getPageTree()}>
            <Provider>{children}</Provider>
          </TreeContextProvider>
        </NextProvider>
      </Body>
    </html>
  );
}
