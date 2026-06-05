/**
 * OpenNext Cloudflare Adapter Configuration — docs
 *
 * Configures the `opennextjs-cloudflare` adapter to transform the Next.js
 * build output into a Cloudflare Workers-compatible bundle.
 *
 * **Bundle Size Strategy (handler.mjs)**
 *
 * The docs site's `handler.mjs` was originally 33+ MiB due to nft (Node File
 * Tracing) including build-time-only packages in the standalone output, which
 * esbuild then re-bundled into the Worker.
 *
 * The reduction is achieved via a two-layer defence in `next.config.ts`:
 *
 * 1. `serverExternalPackages` — Tells webpack NOT to inline these packages
 *    into server-side chunks. (Only effective for packages that webpack
 *    actually encounters at compile time.)
 *
 * 2. `outputFileTracingExcludes` — Tells nft NOT to copy these packages into
 *    `.next/standalone`. Since esbuild bundles from the standalone output,
 *    packages absent from standalone are not bundled into `handler.mjs`.
 *
 * **Important caveat:** `@opennextjs/cloudflare` v1.19.11 does NOT expose
 * an esbuild externals API via `defineCloudflareConfig`. The `bundle-server.js`
 * esbuild step has only `external: ['./middleware/handler.mjs']` hardcoded.
 * If packages are still reachable from monorepo `node_modules` during
 * esbuild's resolution, they may still be bundled. The tracing exclusions
 * are the primary control point.
 *
 * **Validated runtime-safe exclusions (June 2026 scan):**
 * - `shiki`, `@shikijs/*` — only in `source.config.ts` (build-time) and
 *   `dynamic-codeblock.tsx` (`'use client'` → browser bundle only)
 * - `fumadocs-twoslash`, `twoslash` — only in `source.config.ts` (build-time)
 * - `fumadocs-typescript`, `ts-morph`, `typescript` — only `source.config.ts`
 * - `mermaid` — `mermaid.tsx` is `'use client'` with lazy `import('mermaid')`
 * - `react-force-graph-2d`, `d3-force` — `graph-view.tsx` is `'use client'`
 * - `katex`, `rehype-katex`, `remark-math` — build-time MDX plugins only
 * - `@orama/orama` — EXCLUDED from exclusion list: used in `api/search/route.ts`
 *   via `fumadocs-core/search/server` → must be bundled
 * - `flexsearch` — EXCLUDED from exclusion list: used in `api/chat/route.ts`
 *   for the AI chat search tool → must be bundled
 *
 * @see apps/docs/next.config.ts — serverExternalPackages + outputFileTracingExcludes
 * @see https://opennext.js.org/cloudflare — OpenNext Cloudflare docs
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP3 (OpenNext adapter)
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // Uncomment to enable R2 incremental cache for static content:
  // import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
  // incrementalCache: r2IncrementalCache,
  //
  // @see https://opennext.js.org/cloudflare/caching
});
