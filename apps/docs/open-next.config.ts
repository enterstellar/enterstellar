/**
 * OpenNext Cloudflare Adapter Configuration — playground
 *
 * Configures the `opennextjs-cloudflare` adapter to transform the Next.js
 * build output into a Cloudflare Workers-compatible bundle.
 *
 * This is the sole integration point between Next.js and Cloudflare.
 * The app code itself remains 100% platform-agnostic — swapping this
 * config + wrangler.jsonc is all that's needed to target a different platform.
 *
 * @see archive/CORE/enterstellar-web-presence-appendix.md — WP3 (OpenNext adapter)
 * @see https://opennext.js.org/cloudflare — OpenNext Cloudflare docs
 */
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Uncomment to enable R2 incremental cache for static content:
  // import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
  // incrementalCache: r2IncrementalCache,
  //
  // @see https://opennext.js.org/cloudflare/caching
});
