/**
 * Enterstellar Docs — Client-Side Layout Logic
 *
 * Client components required by the root layout. This includes the main `Body`
 * wrapper that dynamically applies theme/mode classes, and a utility hook for
 * determining the current documentation mode from the URL.
 *
 * **Exports:**
 * - `Body` — Root `<body>` wrapper with section-based CSS class injection.
 * - `useMode()` — Hook that maps the current URL slug to a section mode.
 *
 * @see app/layout.tsx — Server Component that renders `<Body>`
 * @see lib/source/section.ts — `getSection()` mapping consumed by `useMode()`
 *
 * @module
 */
'use client';

import { useParams } from 'next/navigation';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { getSection } from '@/lib/source/section';

/**
 * Root body wrapper component.
 *
 * Dynamically applies the section mode to the `body` tag's `className` based on
 * the current route (derived from `useMode()`), and sets up base layout styles.
 *
 * @param props - Component props.
 * @param props.children - Child components to render inside the body.
 * @returns The rendered `body` element.
 */
export function Body({ children }: { children: ReactNode }): ReactElement {
  const mode = useMode();

  return <body className={cn(mode, 'relative flex min-h-screen flex-col')}>{children}</body>;
}

/**
 * Hook to determine the current documentation section/mode.
 *
 * Extracts the first segment of the URL slug to identify the active top-level
 * section (e.g., "getting-started", "api-reference") and returns its associated
 * mode if one exists.
 *
 * @returns The mode string if matched, otherwise `undefined`.
 */
export function useMode(): string | undefined {
  const { slug = [] } = useParams();
  if (Array.isArray(slug)) {
    return getSection(slug[0]);
  }
  return undefined;
}

