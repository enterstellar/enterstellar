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
   * Exclude Node-specific packages from the Cloudflare Worker bundle.
   *
   * These packages use `fs`, `child_process`, or WASM binaries that are
   * incompatible with the Workers runtime. They are only needed during
   * `next build` (Node.js environment) for:
   * - `ts-morph` / `typescript` — Twoslash type annotations
   * - `twoslash` — TypeScript code block hover types
   * - `shiki` — Syntax highlighting with WASM-based grammars
   * - `@takumi-rs/image-response` — OG image generation (build-time only)
   */
  serverExternalPackages: [
    'ts-morph',
    'typescript',
    'twoslash',
    'shiki',
    '@takumi-rs/image-response',
  ],

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
initOpenNextCloudflareForDev();
