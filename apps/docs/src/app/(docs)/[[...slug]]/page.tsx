/**
 * Enterstellar Docs — Documentation Page Renderer
 *
 * Renders individual documentation pages from the documentation source tree.
 * Each page includes:
 *
 * - **MDX content** — Rendered with custom component overrides (Twoslash
 *   type annotations, Mermaid diagrams, Preview demos, Feedback blocks).
 * - **Table of Contents** — Clerk-style sticky sidebar ToC.
 * - **Toolbar** — Markdown copy button and custom view options popover with
 *   "Edit on GitHub", "View Source", and LLM integration links.
 * - **Feedback** — Per-page and per-block feedback via GitHub Discussions.
 * - **HoverCards** — Internal links show page title/description on hover.
 * - **Preview system** — interactive component previews for live
 *   demos (retained for future Enterstellar Compiler showcasing).
 *
 * **MDX component override map (14 overrides):**
 *
 * | MDX Tag          | Override Component           | Purpose                                      |
 * |:-----------------|:-----------------------------|:---------------------------------------------|
 * | `a`              | `HoverCard` + `Link`         | Cross-reference hover previews               |
 * | `blockquote`     | `Callout`                    | Styled callout blocks (info/warn/error)      |
 * | `FeedbackBlock`  | `FeedbackBlock` (wired)      | Inline user feedback via GitHub Discussions  |
 * | `Banner`         | Core UI `Banner`             | Page-level announcement banners              |
 * | `Mermaid`        | `@/components/mdx/mermaid`   | Mermaid diagram rendering                    |
 * | `TypeTable`      | Core UI `TypeTable`          | Auto-generated prop type tables              |
 * | `Step`           | Core UI `Step`               | Step-by-step instruction formatting          |
 * | `Steps`          | Core UI `Steps`              | Container for Step components                |
 * | `Wrapper`        | `@/components/preview`       | Story preview wrapper                        |
 * | `DocsCategory`   | Local `DocsCategory`         | Sibling page navigation cards                |
 * | `Installation`   | `@/components/preview`       | Package installation instructions            |
 * | `Customisation`  | `@/components/preview`       | Component customisation demos                |
 * | `...Twoslash`    | Core Twoslash UI             | Inline TypeScript type hover annotations     |
 *
 * **Static generation:**
 * All pages are pre-rendered at build time via `generateStaticParams()`.
 * `revalidate = false` ensures pages are only regenerated on the next
 * `next build`, which is correct for Cloudflare Workers (no ISR runtime).
 *
 * @see lib/source.ts — `source` API for page tree, page lookup.
 * @see lib/github/feedback.ts — `owner`, `repo`, feedback server actions.
 * @see lib/metadata.ts — `createMetadata()` for OG/Twitter card defaults.
 * @see components/preview/ — Live component preview infrastructure.
 * @see source.config.ts — MDX frontmatter schema (`preview`, `index`).
 *
 * @module
 */
import type { Metadata } from 'next';
import { type ComponentProps, type FC, type ReactNode } from 'react';
import * as Twoslash from 'fumadocs-twoslash/ui';
import { Callout } from 'fumadocs-ui/components/callout';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import * as Preview from '@/components/preview';
import { createMetadata } from '@/lib/metadata';
import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source';
import { Wrapper } from '@/components/preview/wrapper';
import { Mermaid } from '@/components/mdx/mermaid';
import { Feedback, FeedbackBlock } from '@/components/feedback/client';
import { onBlockFeedbackAction, onPageFeedbackAction, owner, repo } from '@/lib/github';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/layouts/menu-hover-card';
import Link from 'fumadocs-core/link';
import { findSiblings } from 'fumadocs-core/page-tree';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { getMDXComponents } from '@/components/mdx';
import { Banner } from 'fumadocs-ui/components/banner';
import { Installation } from '@/components/preview/installation';
import { Customisation } from '@/components/preview/customisation';
import { DocsPage, PageLastUpdate, MarkdownCopyButton } from 'fumadocs-ui/layouts/docs/page';
import { ViewOptionsPopover } from '@/components/layouts/view-options';
import { NotFound } from '@/components/layouts/not-found';
import { getSuggestions } from './suggestions';
import { PathUtils } from 'fumadocs-core/source';

// ---------------------------------------------------------------------------
// Internal Components
// ---------------------------------------------------------------------------

/**
 * Render a live component preview by name.
 *
 * Looks up the `preview` key in the `Preview` namespace (which re-exports
 * all preview components from `@/components/preview`). If a match is found,
 * the corresponding component is rendered. Otherwise, returns `null`.
 *
 * This system is retained for future Enterstellar Compiler demo showcasing —
 * preview components will be rebranded from default UI demos to
 * Enterstellar `ComponentContract` → rendered UI demonstrations.
 *
 * @param props - Component props.
 * @param props.preview - The preview component key to look up in the
 *   `Preview` namespace. Must match an export name exactly.
 * @returns The rendered preview component, or `null` if no match found.
 */
function PreviewRenderer({ preview }: { preview: string }): ReactNode {
  if (preview && preview in Preview) {
    const Comp = Preview[preview as keyof typeof Preview];
    return <Comp />;
  }

  return null;
}

/**
 * Render sibling pages as navigation cards.
 *
 * Used both as an MDX component override (`<DocsCategory />`) and
 * appended to index pages automatically. Finds sibling nodes in the
 * page tree and renders each as a clickable {@link Card} with title
 * and description.
 *
 * Separator nodes are skipped. Folder nodes render their index page
 * if one exists, otherwise they are skipped entirely.
 *
 * @param props - Component props.
 * @param props.url - The current page URL to find siblings for.
 * @returns A `Cards` grid of sibling page links.
 */
function DocsCategory({ url }: { url: string }): ReactNode {
  return (
    <Cards>
      {findSiblings(source.getPageTree(), url).map((item) => {
        // --- Skip non-linkable nodes ---
        if (item.type === 'separator') return;
        if (item.type === 'folder') {
          if (!item.index) return;
          // Promote folder's index page to the link target.
          item = item.index;
        }

        return (
          <Card key={item.url} title={item.name} href={item.url}>
            {item.description}
          </Card>
        );
      })}
    </Cards>
  );
}

// ---------------------------------------------------------------------------
// Next.js Exports
// ---------------------------------------------------------------------------

/**
 * Disable ISR revalidation — all doc pages are fully static.
 * Regenerated only on the next `next build`.
 */
export const revalidate = false;

/**
 * Documentation page component.
 *
 * Fetches the page from the documentation source tree by slug, loads the
 * MDX body and table of contents, and renders the full page layout
 * with toolbar, content, and feedback sections.
 *
 * If the slug doesn't match any page, renders the {@link NotFound}
 * component with AI-powered search suggestions via FlexSearch.
 *
 * @param props - Next.js page props containing route `params`.
 * @returns The rendered documentation page or a not-found view.
 */
export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<ReactNode> {
  const params = await props.params;
  const page = source.getPage(params.slug);

  // --- 404: Page not found — render suggestions UI ---
  if (!page)
    return (
      <NotFound
        getSuggestions={async () => (params.slug ? getSuggestions(params.slug.join(' ')) : [])}
      />
    );

  // --- Load MDX body, table of contents, and git last-modified date ---
  const { body: Mdx, toc, lastModified } = await page.data.load();

  return (
    <DocsPage
      toc={toc}
      tableOfContent={{
        style: 'clerk',
      }}
    >
      {/* --- Page Header --- */}
      <h1 className="text-[1.75em] font-semibold">{page.data.title}</h1>
      <p className="text-lg text-fd-muted-foreground mb-2">{page.data.description}</p>

      {/* --- Toolbar: Copy Markdown + View Options (Edit on GitHub) --- */}
      <div className="flex flex-row flex-wrap gap-2 items-center border-b pb-6">
        <MarkdownCopyButton markdownUrl={getPageMarkdownUrl(page).url} />
        <ViewOptionsPopover
          markdownUrl={getPageMarkdownUrl(page).url}
          githubUrl={`https://github.com/${owner}/${repo}/blob/dev/apps/docs/content/${page.path}`}
        />
      </div>

      {/* --- MDX Content --- */}
      <div className="prose flex-1 text-fd-foreground/90">
        {/* Live component preview (if frontmatter `preview` key is set) */}
        {page.data.preview && <PreviewRenderer preview={page.data.preview} />}
        <Mdx
          components={getMDXComponents({
            // --- Twoslash type annotations ---
            // Spread all Twoslash UI components (TwoslashPopup, etc.)
            // into the MDX component map for inline type hovers.
            ...Twoslash,

            // --- Cross-reference HoverCards ---
            // Internal links show a preview card with the target page's
            // title and description on hover. External links fall through
            // to a standard `<Link>` without a hover card.
            a({ href, ...props }) {
              const found = source.getPageByHref(href ?? '', {
                dir: PathUtils.dirname(page.path),
              });

              if (!found) return <Link href={href} {...props} />;

              return (
                <HoverCard>
                  <HoverCardTrigger
                    href={found.hash ? `${found.page.url}#${found.hash}` : found.page.url}
                    {...props}
                  >
                    {props.children}
                  </HoverCardTrigger>
                  <HoverCardContent className="text-sm">
                    <p className="font-medium">{found.page.data.title}</p>
                    <p className="text-fd-muted-foreground">{found.page.data.description}</p>
                  </HoverCardContent>
                </HoverCard>
              );
            },

            // --- Inline Feedback Blocks ---
            // Wires the generic `FeedbackBlock` component to the
            // GitHub Discussions server action for per-block feedback.
            FeedbackBlock: ({ children, ...props }) => (
              <FeedbackBlock {...props} onSendAction={onBlockFeedbackAction}>
                {children}
              </FeedbackBlock>
            ),

            // --- Core UI Components ---
            Banner,
            Mermaid: (props: ComponentProps<typeof Mermaid>) => <Mermaid {...props} />,
            TypeTable,
            Step,
            Steps,

            // --- Preview System (retained for Enterstellar Compiler demos) ---
            Wrapper,
            Installation,
            Customisation,

            // --- Callout override ---
            // Maps <blockquote> to Core Callout for styled
            // info/warning/error blocks in MDX content.
            blockquote: Callout as unknown as FC<ComponentProps<'blockquote'>>,

            // --- Category Navigation ---
            // Inline `<DocsCategory />` in MDX renders sibling pages
            // as cards. Falls back to current page URL if none provided.
            DocsCategory: ({ url }: { url?: string }) => {
              return <DocsCategory url={url ?? page.url} />;
            },
          })}
        />

        {/* Auto-append sibling cards on index pages */}
        {page.data.index ? <DocsCategory url={page.url} /> : null}
      </div>

      {/* --- Page-level Feedback (GitHub Discussions) --- */}
      <Feedback onSendAction={onPageFeedbackAction} />

      {/* --- Git Last Modified Timestamp --- */}
      {lastModified && <PageLastUpdate date={lastModified} />}
    </DocsPage>
  );
}

// ---------------------------------------------------------------------------
// Metadata & Static Params
// ---------------------------------------------------------------------------

/**
 * Generate per-page metadata for SEO and social sharing.
 *
 * Produces an Enterstellar-branded {@link Metadata} object with the page's title,
 * description, and a dynamically generated OG image URL (produced by
 * the `og/[[...slug]]` route handler).
 *
 * **OG image dimensions:** 1200×630px (standard social card ratio).
 *
 * @param props - Next.js page props containing route `params`.
 * @returns A `Metadata` object for the current page, or a minimal
 *   "Not Found" metadata if the slug doesn't match any page.
 */
export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug = [] } = await props.params;
  const page = source.getPage(slug);

  // --- 404: Return minimal metadata for not-found pages ---
  if (!page)
    return createMetadata({
      title: 'Not Found',
    });

  const description = page.data.description ?? 'Enterstellar engine documentation';

  // --- Build OG image reference from the static OG route ---
  const image = {
    url: getPageImage(page).url,
    width: 1200,
    height: 630,
  };

  return createMetadata({
    title: page.data.title,
    description,
    openGraph: {
      url: `/${page.slugs.join('/')}`,
      images: [image],
    },
    twitter: {
      images: [image],
    },
  });
}

/**
 * Pre-render all documentation pages as static routes at build time.
 *
 * Delegates to the core source API which generates slug arrays
 * for every page in the content tree.
 *
 * @returns Array of static params covering all doc pages.
 */
export function generateStaticParams(): ReturnType<typeof source.generateParams> {
  return source.generateParams();
}
