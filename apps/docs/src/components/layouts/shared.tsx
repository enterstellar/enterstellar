/**
 * Enterstellar Docs — Shared Layout Configuration
 *
 * Central layout configuration consumed by the `DocsLayout` in the docs
 * route layout. Exports navigation items, the logo element, and the
 * `baseOptions()` factory that produces the `BaseLayoutProps` for
 * Core UI.
 *
 * **Exports:**
 * - `linkItems` — Top-level navigation link entries (GitHub icon link).
 * - `logo` — The Enterstellar logo `BrandMark` SVG component used in the nav bar.
 * - `baseOptions()` — Factory returning `BaseLayoutProps` with the nav
 *   title composed of the logo and the app name.
 *
 * @see app/(docs)/layout.tsx — The primary consumer of all exports
 * @see lib/shared.ts — `appName` and `gitConfig` constants
 *
 * @module
 */
import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared';
import BrandMark from './brand-mark';
import { appName, gitConfig } from '@/lib/shared';

/**
 * Top-level navigation link entries.
 *
 * Currently contains only the GitHub repository icon link. Additional
 * entries (e.g., blog, changelog) can be added when those pages exist
 * within the Enterstellar docs app or are served via subpath routing.
 *
 * @remarks
 * Dead upstream entries (`/blog`, `/showcase`, `/sponsors`) were removed
 * because those pages do not exist in this documentation app.
 */
export const linkItems: LinkItemType[] = [
  {
    type: 'icon',
    url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    label: 'github',
    text: 'Github',
    icon: (
      <svg role="img" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
    external: true,
  },
];

/**
 * Enterstellar logo element rendered in the navigation bar.
 *
 * Uses the inline SVG BrandMark component in "icon" mode.
 */
export const logo = (
  <BrandMark mode="icon" variant="white" className="size-5" />
);

/**
 * Base layout options factory for Core UI.
 *
 * Returns `BaseLayoutProps` with the navigation title composed of the
 * Enterstellar logo image and the app name text. Consumed by both the docs
 * layout and any future sub-layouts that need consistent branding.
 *
 * @returns Base layout props containing the navigation title.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {logo}
          <span className="font-medium">{appName}</span>
        </>
      ),
    },
  };
}
