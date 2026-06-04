/**
 * Enterstellar Docs — Client Provider Stack
 *
 * This component resides at the root level of the app and handles context
 * providers that must execute on the client side (`'use client'`).
 *
 * It provides:
 * 1. `RootProvider` from the core UI library — Initializes the global search
 *    dialog. The actual `SearchDialog` interface is dynamically imported
 *    to prevent it from blooming the initial SSR payload.
 * 2. `TooltipProvider` from Radix UI — Required global context for any
 *    Tooltip primitives used throughout the documentation UI.
 *
 * @see app/layout.tsx — The Server Component that consumes this Provider
 * @see components/layouts/search.tsx — The dynamically loaded search dialog
 *
 * @module
 */
'use client';

import { RootProvider } from 'fumadocs-ui/provider/base';
import dynamic from 'next/dynamic';
import type { ReactElement, ReactNode } from 'react';
import { TooltipProvider } from '@radix-ui/react-tooltip';

/**
 * Dynamically imported search dialog.
 * Load is deferred until the user initiates a search action (Cmd+K).
 */
const SearchDialog = dynamic(() => import('@/components/layouts/search'), {
  ssr: false,
});

/**
 * Client-side provider wrapper for the Enterstellar documentation app.
 *
 * @param props - Component props containing React children.
 * @returns The children wrapped in necessary client-side contexts.
 */
export function Provider({ children }: { children: ReactNode }): ReactElement {
  return (
    <RootProvider
      search={{
        SearchDialog,
      }}
    >
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </RootProvider>
  );
}
