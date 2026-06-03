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
initOpenNextCloudflareForDev();
