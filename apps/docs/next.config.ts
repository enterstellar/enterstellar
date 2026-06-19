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
   * Exclude build-time-only packages from the Cloudflare Worker bundle.
   *
   * These packages are used exclusively during `next build` (Node.js
   * environment) for MDX processing, syntax highlighting, and type annotation.
   * They are NEVER called at edge runtime because:
   *
   * - `ts-morph`, `typescript`, `fumadocs-twoslash`, `fumadocs-typescript`:
   *   Used in `source.config.ts` via dynamic `await import()` — build-time only.
   * - `twoslash`: Pulled in transitively by `fumadocs-twoslash` — build-time only.
   * - `shiki`, `@shikijs/core`, `@shikijs/langs`, `@shikijs/themes`:
   *   `source.config.ts` configures the Shiki highlighter at build time.
   *   The `bundledLanguages` import in `dynamic-codeblock.tsx` is a
   *   `'use client'` component — it runs in the browser, never the Worker.
   * - `mermaid`: `components/mdx/mermaid.tsx` is `'use client'` with a
   *   lazy `import('mermaid')` — runs in the browser, never the Worker.
   * - `react-force-graph-2d`, `d3-force`: `graph-view.tsx` is `'use client'`
   *   with a lazy `import('react-force-graph-2d')` — browser-only.
   * - `@orama/orama`: Not imported in any server/Worker path.
   * - `katex`, `rehype-katex`, `remark-math`: Build-time MDX remark/rehype plugins.
   * - `@takumi-rs/image-response`, `@vercel/og`: OG image generation; the
   *   `/og/[[...slug]]` route uses `generateStaticParams()` and
   *   `revalidate = false` — all images are pre-rendered at build time.
   *
   * ⚠️ `flexsearch` is NOT listed here — it runs at Worker runtime inside
   * `/api/chat/route.ts` (the AI chat endpoint) and must be bundled.
   *
   * @see Validation: apps/docs/src/ runtime scan (June 2026)
   */
  serverExternalPackages: [
    // OG image generation (uses WASM / native dependencies at runtime)
    '@takumi-rs/image-response',
    '@vercel/og',
    // ⚠️ WARNING: Build-time packages (typescript, ts-morph, shiki, mermaid, etc.)
    // must NOT be listed here. If listed, Webpack is forced to emit external
    // require() calls, which OpenNext's esbuild step resolves from the monorepo root
    // node_modules and bundles into handler.mjs, causing severe bloat (44+ MiB).
    // Instead, they are completely excluded from the server compilation graph
    // by using `{ ssr: false }` client components or dynamic imports on the server.
  ],

  /**
   * Prevent build-time-only dependencies from entering the standalone
   * output directory that OpenNext bundles into `handler.mjs`.
   *
   * `outputFileTracingExcludes` runs during Next.js's file-tracing phase
   * (which populates `.next/standalone`). Excluding these paths here means
   * OpenNext's esbuild step never encounters them, preventing re-bundling.
   *
   * The list mirrors `serverExternalPackages` above. Keeping both in sync
   * ensures defence-in-depth: webpack doesn't bundle them AND the tracer
   * doesn't copy them into standalone.
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
      'node_modules/react-force-graph-2d/**',
      'node_modules/d3-force/**',
      'node_modules/@takumi-rs/image-response/**',
      'node_modules/@vercel/og/**',
      // NOTE: @orama/orama is NOT excluded — it runs at Worker runtime in
      // api/search/route.ts via fumadocs-core/search/server.
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
