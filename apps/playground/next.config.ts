/**
 * Enterstellar Playground — Next.js Configuration
 *
 * Central configuration for the Enterstellar playground app. Handles:
 *
 * 1. **React Compiler** — `reactCompiler: true` enables automatic
 *    memoization via Babel's React Compiler plugin.
 *
 * **Deployment:**
 * The app is deployed via `@opennextjs/cloudflare`. The
 * `initOpenNextCloudflareForDev()` call at the bottom enables local
 * access to Cloudflare bindings (KV, D1, etc.) during `next dev`.
 *
 * @see open-next.config.ts — OpenNext Cloudflare adapter configuration
 *
 * @module
 */
import path from 'path';
import type { NextConfig } from 'next';

// ---------------------------------------------------------------------------
// Core Configuration
// ---------------------------------------------------------------------------

/**
 * Next.js configuration for the Enterstellar playground app.
 *
 * **Key settings:**
 * - `reactCompiler: true` — React Compiler (RC) for automatic memoization.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  reactCompiler: true,

  /**
   * Pin Next.js's file tracer to the monorepo root.
   *
   * `opennextjs-cloudflare` detects the monorepo root by walking upward
   * from CWD looking for `pnpm-lock.yaml`. When Cloudflare Workers Builds
   * sets `Root directory: /apps/playground`, the parent directories that
   * contain the lock file are invisible, so OpenNext concludes
   * `monorepoRoot = appPath` and sets:
   *
   *   process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = options.monorepoRoot
   *                                              = /apps/playground  ← WRONG
   *
   * With the wrong tracing root, Next.js's file tracer excludes
   * `../../packages/[name]/dist/` from the standalone output, causing esbuild
   * to fail with "Module not found" for all `@enterstellar-ai/*` imports.
   *
   * Setting `outputFileTracingRoot` here overrides
   * `process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT` via the config field:
   *
   *   const outputFileTracingRoot = config.outputFileTracingRoot || dir;
   *
   * This pins the tracing root to the repo root, ensuring all workspace
   * packages in `packages/[name]/dist/` are within scope and copied into the
   * standalone output regardless of CWD.
   *
   * @see next/dist/build/index.js:841 — config.outputFileTracingRoot || dir
   * @see @opennextjs/aws/build/buildNextApp.js — setStandaloneBuildMode()
   */
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default nextConfig;

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
