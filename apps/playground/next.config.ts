/**
 * Enterstellar Playground — Next.js Configuration
 *
 * Central configuration for the Enterstellar playground app. Handles:
 *
 * **React Compiler** — `reactCompiler: true` enables automatic
 *    memoization via Babel's React Compiler plugin.
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
   * Subpath deployment prefix.
   *
   * Mounts the application under the `/playground` subdirectory at build and
   * runtime, ensuring all generated CSS, JS bundles, dynamic links, and
   * assets resolve relative to this path.
   */
  basePath: '/playground',

  /**
   * Pin Next.js's file tracer to the monorepo root.
   *
   * When Vercel Builds
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
