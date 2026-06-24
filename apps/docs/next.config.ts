/**
 * Enterstellar Docs — Next.js Configuration
 *
 * Central configuration for the Enterstellar documentation app. Handles:
 *
 * 1. **MDX pipeline** — `createMDX()` wraps the
 *    config with MDX processing support.
 * 2. **GitHub avatars** — `images.remotePatterns` allows Next.js Image
 *    optimization for contributor avatars from GitHub.
 * 3. **Dev DX** — `logging.fetches.fullUrl` shows complete fetch URLs
 *    in the dev server console for debugging data loading.
 *
 * @see source.config.ts — Core MDX content pipeline
 *
 * @module
 */
import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';
import bundleAnalyzer from '@next/bundle-analyzer';

// ---------------------------------------------------------------------------
// Bundle Analyzer (env-gated)
// ---------------------------------------------------------------------------

/**
 * Bundle analyzer wrapper.
 *
 * `@next/bundle-analyzer` is always imported but only activates when
 * `ANALYZE=true` is set. When disabled, it passes the config through
 * unchanged — zero overhead in production builds.
 *
 * @example
 * ```bash
 * ANALYZE=true pnpm build
 * ```
 */
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env['ANALYZE'] === 'true',
});

// ---------------------------------------------------------------------------
// MDX
// ---------------------------------------------------------------------------

/** Core MDX plugin wrapper. Applied before bundle analyzer. */
const withMDX = createMDX();

// ---------------------------------------------------------------------------
// Core Configuration
// ---------------------------------------------------------------------------

/**
 * Next.js configuration for the Enterstellar documentation app.
 *
 * **Key settings:**
 * - `reactCompiler: true` — React Compiler (RC) for automatic
 *   memoization. We're ahead of upstream here.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,

  /**
   * Subpath deployment prefix.
   *
   * Mounts the application under the `/docs` subdirectory at build and
   * runtime, ensuring all generated CSS, JS bundles, dynamic links, and
   * assets resolve relative to this path.
   */
  basePath: '/docs',

  /** Log full fetch URLs in the dev server console for debugging. */
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  /**
   * Allow Next.js Image optimization for GitHub contributor avatars.
   *
   * Used by the contributor count component and any docs page that
   * displays GitHub user profile images.
   */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Final config: MDX → Bundle Analyzer → Next.js.
 *
 * The wrapping order matters:
 * 1. `withMDX` applies the Core MDX processing pipeline.
 * 2. `withBundleAnalyzer` (when enabled) injects the bundle analysis
 *    plugin on top of the MDX-wrapped config.
 */
export default withBundleAnalyzer(withMDX(nextConfig));
