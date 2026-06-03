/**
 * Enterstellar Docs — Content Proxy Middleware
 *
 * Provides URL negotiation and rewriting for LLM-friendly documentation.
 * Allows consumers (like AI agents or fetch clients) to request raw
 * markdown content via two methods:
 *
 * 1. **URL Suffix** — Appending `.mdx` to any doc URL.
 *    Example: `/getting-started.mdx` → `/llms.mdx/getting-started/content.md`
 * 2. **Content Negotiation** — Sending an `Accept` header preferring markdown.
 *    Example: `Accept: text/markdown` on `/getting-started`
 *
 * This function should be invoked from the main Next.js `middleware.ts`.
 *
 * @see app/llms.mdx/[slug]/route.ts — Destination route handling the markdown exports
 * @see lib/shared.ts — Source string constants for routing rules
 *
 * @module
 */
import { NextRequest, NextResponse } from 'next/server';
import { isMarkdownPreferred, rewritePath } from 'fumadocs-core/negotiation';
import { docsContentRoute, docsRoute } from '@/lib/shared';

// ---------------------------------------------------------------------------
// Rewrite Rules Configuration
// ---------------------------------------------------------------------------

/**
 * Rewrite rule for content negotiation.
 * Matches `/{path}` and rewrites to `/llms.mdx/{path}/content.md`.
 */
const { rewrite: rewriteDocs } = rewritePath(
  `${docsRoute}{/*path}`,
  `${docsContentRoute}{/*path}/content.md`,
);

/**
 * Rewrite rule for explicit suffix matching.
 * Matches `/{path}.mdx` and rewrites to `/llms.mdx/{path}/content.md`.
 */
const { rewrite: rewriteSuffix } = rewritePath(
  `${docsRoute}{/*path}.mdx`,
  `${docsContentRoute}{/*path}/content.md`,
);

// ---------------------------------------------------------------------------
// Proxy Middleware
// ---------------------------------------------------------------------------

/**
 * Executes content negotiation and proxy logic.
 *
 * Checks requests against suffix rules first, then header rules.
 * If a match is found, returns a `NextResponse.rewrite` directing the request
 * to the LLM-friendly markdown export route. Otherwise, returns `NextResponse.next()`
 * to allow the request to proceed normally.
 *
 * @param request - The incoming Next.js request object.
 * @returns A Next.js response indicating the rewrite destination or a passthrough.
 */
export default function proxy(request: NextRequest): NextResponse {
  // Pass 1: Direct `.mdx` suffix match
  const suffixMatch: string | false = rewriteSuffix(request.nextUrl.pathname);
  if (suffixMatch) {
    return NextResponse.rewrite(new URL(suffixMatch, request.nextUrl));
  }

  // Pass 2: Content negotiation (Accept header)
  if (isMarkdownPreferred(request)) {
    const headerMatch: string | false = rewriteDocs(request.nextUrl.pathname);
    if (headerMatch) {
      return NextResponse.rewrite(new URL(headerMatch, request.nextUrl));
    }
  }

  // Fallback: Proceed normally
  return NextResponse.next();
}
