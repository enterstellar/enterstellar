/**
 * Enterstellar Docs — Custom Search Dialog
 *
 * Extends the Core UI `SearchDialog` with Enterstellar-specific features:
 *
 * 1. **Tag-based filtering** — A popover filter allows users to narrow
 *    search results by documentation section (e.g., "UI", "Core", "MDX").
 *    Tags are matched against the search index's `tag` field.
 * 2. **Quick jump** — If the search query matches a page title from the
 *    sidebar tree, a "Jump to {page}" action appears at the top of
 *    results for instant navigation.
 * 3. **Fetch-based search** — Uses the server-side search API endpoint
 *    (`/api/search`) instead of client-side indexing.
 *
 * @see app/api/search/route.ts — Server-side search endpoint
 * @see app/provider.tsx — Where this dialog is dynamically imported
 * @see components/layouts/shared.tsx — Layout configuration
 *
 * @module
 */
'use client';

import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchItemType,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { cn } from '@/lib/cn';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import type { Item, Node } from 'fumadocs-core/page-tree';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

/**
 * Search filter categories.
 *
 * Each entry maps a user-facing label to a search tag value used by
 * the server-side search index. The `value` fields are functional
 * identifiers (NOT branding strings) — they must match the tags
 * emitted by the core search indexer.
 */
const items = [
  {
    name: 'All',
    value: undefined,
  },
  {
    name: 'Getting Started',
    description: 'Onboarding and installation',
    value: '(getting-started)',
  },
  {
    name: 'Concepts',
    description: 'Core system paradigms',
    value: 'concepts',
  },
  {
    name: 'Guides',
    description: 'Advanced settings and workflows',
    value: 'guides',
  },
  {
    name: 'Architecture',
    description: 'System blueprints and design choices',
    value: 'architecture',
  },
  {
    name: 'API Reference',
    description: 'Technical references and SDKs',
    value: 'api',
  },
];

/**
 * Custom search dialog with tag filtering and page tree quick-jump.
 *
 * Renders a full-screen search overlay with an input field, result list,
 * and footer containing a tag filter popover. Supports keyboard
 * navigation via the `SearchDialogList` component.
 *
 * @param props - Shared search dialog props (open state, callbacks).
 * @returns The rendered search dialog.
 */
export default function CustomSearchDialog(props: SharedProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<string | undefined>();
  const { search, setSearch, query } = useDocsSearch({
    type: 'fetch',
    api: '/docs/api/search',
    ...(tag ? { tag } : {}),
  });
  const { full } = useTreeContext();
  const router = useRouter();

  /**
   * Build a case-insensitive lookup map of page names → page items
   * from the sidebar tree. Used for the "quick jump" action.
   */
  const searchMap = useMemo(() => {
    const map = new Map<string, Item>();

    function onNode(node: Node): void {
      if (node.type === 'page' && typeof node.name === 'string') {
        map.set(node.name.toLowerCase(), node);
      } else if (node.type === 'folder') {
        if (node.index) onNode(node.index);
        for (const item of node.children) onNode(item);
      }
    }

    for (const item of full.children) onNode(item);
    return map;
  }, [full]);

  /**
   * Derive a "Jump to {page}" quick action if the current search query
   * prefix-matches a page name from the sidebar tree.
   */
  const pageTreeAction = useMemo<SearchItemType | undefined>(() => {
    if (search.length === 0) return undefined;

    const normalized = search.toLowerCase();
    for (const [k, page] of searchMap) {
      if (!k.startsWith(normalized)) continue;

      return {
        id: 'quick-action',
        type: 'action',
        node: (
          <div className="inline-flex items-center gap-2 text-fd-muted-foreground">
            <ArrowRight className="size-4" />
            <p>
              Jump to <span className="font-medium text-fd-foreground">{page.name}</span>
            </p>
          </div>
        ),
        onSelect: () => {
          router.push(page.url);
        },
      };
    }

    return undefined;
  }, [router, search, searchMap]);

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList
          items={
            query.data !== 'empty' || pageTreeAction
              ? [
                  ...(pageTreeAction ? [pageTreeAction] : []),
                  ...(Array.isArray(query.data) ? query.data : []),
                ]
              : null
          }
        />
        <SearchDialogFooter className="flex flex-row flex-wrap gap-2 items-center">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className={buttonVariants({
                size: 'sm',
                color: 'ghost',
                className: '-m-1.5 me-auto',
              })}
            >
              <span className="text-fd-muted-foreground/80 me-2">Filter</span>
              {items.find((item) => item.value === tag)?.name}
              <ChevronDown className="size-3.5 text-fd-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="flex flex-col p-1 gap-1" align="start">
              {items.map((item, i) => {
                const isSelected = item.value === tag;

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setTag(item.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'rounded-lg text-start px-2 py-1.5',
                      isSelected
                        ? 'text-fd-primary bg-fd-primary/10'
                        : 'hover:text-fd-accent-foreground hover:bg-fd-accent',
                    )}
                  >
                    <p className="font-medium mb-0.5">{item.name}</p>
                    <p className="text-xs opacity-70">{item.description}</p>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}
