/**
 * Enterstellar Docs — Documentation Layout
 *
 * Layout component wrapping all documentation pages with the core UI
 * `DocsLayout`. Provides:
 *
 * 1. **Sidebar navigation** — Driven by `source.getPageTree()`, the auto-
 *    generated page tree from the MDX content collection.
 * 2. **Section-aware tab styling** — Each top-level content folder (e.g.,
 *    `ui`, `framework`) receives a unique accent color via CSS custom
 *    properties, driven by `getSection()`.
 * 3. **AI chat launcher** — A floating "Ask AI" button that opens the
 *    `AISearchPanel` for conversational documentation search.
 * 4. **GitHub icon link** — Top-nav icon linking to the Enterstellar repository.
 *
 * The layout also imports `katex/dist/katex.min.css` to enable LaTeX/KaTeX
 * rendering in MDX content.
 *
 * @see components/layouts/shared.tsx — `baseOptions()`, `linkItems`, `logo`
 * @see components/ai/search.tsx — AI chat panel and trigger
 * @see lib/source/index.ts — `source` API and page tree
 * @see lib/source/index.ts — `getSection()` for section-based theming
 *
 * @module
 */
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions, linkItems, logo } from '@/components/layouts/shared';
import { source } from '@/lib/source';
import { AISearch, AISearchPanel, AISearchTrigger } from '@/components/ai/search';
import { getSection } from '@/lib/source';
import { MessageCircleIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { appName } from '@/lib/shared';
import type { ReactElement } from 'react';
import 'katex/dist/katex.min.css';

/**
 * Documentation pages layout.
 *
 * Wraps children in the `DocsLayout` from the core UI with Enterstellar-branded
 * navigation, section-colored tabs, and the AI chat float trigger.
 *
 * @param props - Next.js layout props containing `children`.
 * @param props.children - Page content to render inside the docs layout.
 * @returns The complete documentation layout with sidebar and AI chat.
 */
export default function Layout({ children }: LayoutProps<'/'>): ReactElement {
  // ── Base Layout Options ──────────────────────────────────────────────
  // Factory call — returns nav config with logo and app name
  const base = baseOptions();

  return (
    <DocsLayout
      {...base}
      tree={source.getPageTree()}
      // Only show icon-type links (e.g. GitHub) in the top-nav bar
      links={linkItems.filter((item) => item.type === 'icon')}
      nav={{
        ...base.nav,
        title: (
          <>
            {logo}
            <span className="font-medium max-md:hidden">{appName}</span>
          </>
        ),
      }}
      tabs={{
        // Map each sidebar tab to its section color.
        // Falls back to --color-fd-foreground when no section match.
        transform(option, node) {
          const meta = source.getNodeMeta(node);
          if (!meta || !node.icon) return option;
          const color = `var(--${getSection(meta.path)}-color, var(--color-fd-foreground))`;

          return {
            ...option,
            icon: (
              <div
                className="[&_svg]:size-full rounded-lg size-full text-(--tab-color) max-md:bg-(--tab-color)/10 max-md:border max-md:p-1.5"
                style={
                  {
                    '--tab-color': color,
                  } as object
                }
              >
                {node.icon}
              </div>
            ),
          };
        },
      }}
    >
      {children}

      {/* Floating "Ask AI" chat trigger — opens the AI search panel */}
      <AISearch>
        <AISearchPanel />
        <AISearchTrigger
          position="float"
          className={cn(
            buttonVariants({
              variant: 'secondary',
              className: 'text-fd-muted-foreground rounded-2xl',
            }),
          )}
        >
          <MessageCircleIcon className="size-4.5" />
          Ask AI
        </AISearchTrigger>
      </AISearch>
    </DocsLayout>
  );
}
