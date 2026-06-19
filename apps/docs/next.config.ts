/**
 * Enterstellar Docs — Next.js Configuration
 *
 * Central configuration for the Enterstellar documentation app. Handles:
 *
 * 1. **MDX pipeline** — `createMDX()` wraps the
 *    config with MDX processing support.
 * 2. **Bundle analysis** — `@next/bundle-analyzer` wraps the config
 *    when `ANALYZE=true` is set, generating a visual bundle map for
 *    debugging Cloudflare Worker size constraints.
 * 3. **Cloudflare Workers compatibility** — `serverExternalPackages`
 *    excludes Node-specific packages from the Worker bundle to prevent
 *    exceeding the 10MB Worker size limit or WASM runtime errors.
 * 4. **GitHub avatars** — `images.remotePatterns` allows Next.js Image
 *    optimization for contributor avatars from GitHub.
 * 5. **Dev DX** — `logging.fetches.fullUrl` shows complete fetch URLs
 *    in the dev server console for debugging data loading.
 *
 * **Deployment:**
 * The app is deployed via `@opennextjs/cloudflare`. The
 * `initOpenNextCloudflareForDev()` call at the bottom enables local
 * access to Cloudflare bindings (KV, D1, etc.) during `next dev`.
 *
 * @see open-next.config.ts — OpenNext Cloudflare adapter configuration
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
 * - `serverExternalPackages` — Prevents Node-specific packages from
 *   being bundled into the Cloudflare Worker. Without this, `ts-morph`,
 *   `typescript`, `twoslash`, and `shiki` would be included in the
 *   Worker bundle, potentially exceeding the 10MB size limit or causing
 *   WASM-related runtime errors.
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

  /**
   * Prevent build-time-only dependencies from entering the standalone
   * output directory that OpenNext bundles into `handler.mjs`.
   *
   * `outputFileTracingExcludes` runs during Next.js's file-tracing phase
   * (which populates `.next/standalone`). Excluding these paths here means
   * OpenNext's esbuild step never encounters them, preventing re-bundling.
   *
   * Build-time-only packages (like `typescript`, `shiki`, `mermaid`, etc.) are
   * completely excluded from the server compilation graph by using `{ ssr: false }`
   * client components, client-side dynamic imports, or build-time MDX plugins.
   */
  outputFileTracingExcludes: {
    '*': [
      'node_modules/ts-morph/**',
      'node_modules/typescript/**',
      'node_modules/twoslash/**',
      'node_modules/fumadocs-twoslash/**',
      'node_modules/fumadocs-typescript/**',
      'node_modules/shiki/**',
      'node_modules/@shikijs/**',
      'node_modules/mermaid/**',
      'node_modules/katex/**',
      'node_modules/**/*.wasm',
    ],
  },

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

// ---------------------------------------------------------------------------
// Cloudflare Dev Bindings
// ---------------------------------------------------------------------------

/**
 * Enable calling `getCloudflareContext()` in `next dev`.
 *
 * This initializes the OpenNext Cloudflare adapter's dev-time binding
 * proxy, allowing local development to access Cloudflare bindings
 * (KV, D1, R2, etc.) without deploying to Workers.
 *
 * @see https://opennext.js.org/cloudflare/bindings#local-access-to-bindings
 */
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
void initOpenNextCloudflareForDev();
