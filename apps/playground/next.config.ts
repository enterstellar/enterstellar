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
   * When Vercel builds with Root Directory set to `apps/playground`, the
   * file tracer defaults to the app directory and can miss workspace packages
   * in `packages/<name>/dist/`, causing "Module not found" for `@enterstellar-ai/*`
   * imports in serverless functions.
   *
   * Setting `outputFileTracingRoot` to the repo root ensures all workspace
   * packages are within tracing scope and included in the serverless bundle.
   *
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats
   */
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export default nextConfig;
