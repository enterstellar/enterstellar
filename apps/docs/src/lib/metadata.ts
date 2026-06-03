/**
 * Enterstellar Docs — Metadata Factory
 *
 * Central factory for generating Next.js `Metadata` objects for all pages
 * in the Enterstellar documentation app. Produces OpenGraph, Twitter Card, and
 * base URL metadata with Enterstellar-branded defaults.
 *
 * **Consumers:**
 * - `app/layout.tsx` — root-level metadata (title template, description)
 * - `app/(docs)/[[...slug]]/page.tsx` — per-page metadata (title, OG image)
 * - `app/sitemap.ts` — `baseUrl` for canonical URL generation
 *
 * **Design decisions:**
 * - `baseUrl` uses `CF_PAGES_URL` for Cloudflare Pages/Workers deployments
 *   (NOT Vercel's `VERCEL_PROJECT_PRODUCTION_URL`). Falls back to the
 *   canonical domain `https://enterstellar.dev` if the env var is absent.
 * - RSS/Atom alternate is NOT included — blog feeds live in `enterstellar-web`
 *   per WP10 (docs and blogs are separate apps in separate repos).
 * - `getPageImage()` is NOT exported from this module — the canonical
 *   version lives in `@/lib/source` and matches the actual OG image
 *   route at `og/[[...slug]]/route.tsx`.
 *
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP3 (Cloudflare deployment)
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP10 (docs in product repos)
 *
 * @module
 */
import type { Metadata } from 'next/types';

/**
 * Canonical base URL for the Enterstellar documentation site.
 *
 * Uses `CF_PAGES_URL` in production (set by Cloudflare Pages/Workers),
 * falls back to `https://enterstellar.dev` for SSG/ISR builds, and uses
 * `localhost:3000` during local development.
 *
 * The resulting `URL` object is consumed by Next.js `metadataBase` to
 * resolve relative OG image paths and canonical URLs.
 */
export const baseUrl =
  process.env.NODE_ENV === 'development'
    ? new URL('http://localhost:3000')
    : new URL(process.env['CF_PAGES_URL'] || 'https://enterstellar.dev');

/**
 * Create a `Metadata` object with Enterstellar-branded defaults.
 *
 * Merges the provided `override` into a base metadata template that
 * includes Enterstellar's OpenGraph and Twitter Card configuration. Per-page
 * overrides (title, description, images) take precedence over defaults
 * via the spread operator.
 *
 * @param override - Page-specific metadata fields to merge into the
 *   Enterstellar base template. Any field provided here overrides the default.
 * @returns A complete `Metadata` object ready for Next.js consumption.
 *
 * @example
 * ```ts
 * export const metadata = createMetadata({
 *   title: { template: '%s | Enterstellar Docs', default: 'Enterstellar Docs' },
 *   description: 'Documentation for the Enterstellar compiler engine.',
 * });
 * ```
 */
export function createMetadata(override: Metadata): Metadata {
  return {
    ...override,
    openGraph: {
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      url: 'https://enterstellar.dev/docs',
      images: '/banner.png',
      siteName: 'Enterstellar Docs',
      ...override.openGraph,
    },
    twitter: {
      card: 'summary_large_image',
      creator: '@enterstellaros',
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      images: '/banner.png',
      ...override.twitter,
    },
    ...override.alternates ? { alternates: override.alternates } : {},
  };
}
