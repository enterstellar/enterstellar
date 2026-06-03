/**
 * Enterstellar Docs — Next.js Configuration
 *
 * Central configuration for the Enterstellar documentation app. Handles:
 *
 * 1. **MDX pipeline** — `createMDX()` from `fumadocs-mdx` wraps the
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
 * @see source.config.ts — Fumadocs MDX content pipeline
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

/** Fumadocs MDX plugin wrapper. Applied before bundle analyzer. */
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
 *   memoization. We're ahead of Fumadocs upstream here.
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

  /**
   * Transpile `@enterstellar-web/*` cross-repo shared packages.
   *
   * These packages live in the Enterstellar WEB monorepo and are consumed here
   * via the `file:` protocol (development) or published npm versions
   * (production). Next.js's bundler treats external packages as opaque
   * by default — adding them to `transpilePackages` forces the bundler
   * to include them in the same compilation pass as this app, which is
   * required for two reasons:
   *
   * 1. **CSS processing:** `@enterstellar-web/tokens` and `@enterstellar-web/ui` ship
   *    CSS files (`base.css`, `globals.css`, Tailwind `@theme` blocks)
   *    that must pass through PostCSS / Tailwind v4 to be processed
   *    correctly. Without transpilation, the bundler treats these as
   *    opaque binary blobs and skips the CSS pipeline.
   *
   * 2. **HMR / live reload:** Including them in the module graph means
   *    Hot Module Replacement picks up changes from the Enterstellar WEB source
   *    during `file:` linked development sessions without requiring a
   *    full server restart.
   *
   * Note: `@enterstellar-web/assets` exports only typed path manifests (no CSS,
   * no JSX). It is included here for completeness and future-proofing —
   * if the assets package ever ships JSX components or CSS, the bundler
   * will already handle them correctly.
   *
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/transpilePackages
   * @see apps/docs/package.json — `@enterstellar-web/*` file: dependencies
   */
  transpilePackages: [
    '@enterstellar-web/assets',
    '@enterstellar-web/core',
    '@enterstellar-web/tokens',
    '@enterstellar-web/ui',
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
 * 1. `withMDX` applies the Fumadocs MDX processing pipeline.
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
