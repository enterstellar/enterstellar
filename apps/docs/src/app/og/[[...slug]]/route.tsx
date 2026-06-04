/**
 * Enterstellar Docs — OpenGraph Image Route Handler
 *
 * Generates branded 1200×630px OG images for each documentation page.
 * These images appear when docs pages are shared on social media,
 * Slack, Discord, or any platform that renders OpenGraph previews.
 *
 * **Static generation:**
 * `generateStaticParams()` pre-renders all OG images at build time.
 * Combined with `revalidate = false`, images are bundled as static
 * assets into the Cloudflare Worker deployment — no runtime image
 * generation occurs.
 *
 * **Route pattern:** `/og/{...slug}/image.png`
 * The slug includes the page path segments plus an `image.png` suffix,
 * produced by `getPageImage()` in `@/lib/source`.
 *
 * @see lib/source.ts — `getPageImage()` generates the slug segments
 * @see app/(docs)/[[...slug]]/page.tsx — references OG images in metadata
 *
 * @module
 */
import { getPageImage, source } from '@/lib/source';
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';
import { generate as DefaultImage } from 'fumadocs-ui/og';

/**
 * Disable ISR revalidation — OG images are fully static.
 * Regenerated only on the next `next build`.
 */
export const revalidate = false;

/**
 * GET handler — renders an Enterstellar-branded OG image for a single doc page.
 *
 * Extracts the page slug from the route params, looks up the page in
 * the documentation source tree, and renders a 1200×630 image using the
 * core UI generator with Enterstellar branding.
 *
 * @param _req - Incoming request (unused — image content is static).
 * @param context - Route context containing the `slug` segments.
 * @returns An `ImageResponse` with the rendered OG image.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
): Promise<ImageResponse> {
  const { slug } = await params;
  if (!slug) notFound();
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return new ImageResponse(
    <DefaultImage
      title={page.data.title}
      description={page.data.description}
      site="Enterstellar Docs"
    />,
    {
      width: 1200,
      height: 630,
    },
  );
}

/**
 * Pre-render OG images for all documentation pages at build time.
 *
 * Each page's slug segments (with the `image.png` suffix appended by
 * `getPageImage()`) become a static route, ensuring every doc page
 * has a pre-generated OG image in the Cloudflare Worker bundle.
 *
 * @returns Array of static params for all doc pages.
 */
export function generateStaticParams(): { lang: string | undefined; slug: string[] }[] {
  return source.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImage(page).segments,
  }));
}
