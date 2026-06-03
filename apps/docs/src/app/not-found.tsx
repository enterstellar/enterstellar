/**
 * Enterstellar Docs — Global 404 Not Found Page
 *
 * Catches all unmatched routes that fall outside the `(docs)/[[...slug]]`
 * catch-all. Without this file, Next.js renders a bare unstyled 404 page
 * for routes like `/completely-random-path`.
 *
 * Reuses the `NotFound` component from `components/layouts/not-found.tsx`
 * for visual consistency with the docs-specific 404. At the global level,
 * no slug context is available for suggestions, so an empty array is
 * returned — the component gracefully renders "No Alternative Found"
 * with a "Return to Home" link.
 *
 * @see components/layouts/not-found.tsx — The reusable 404 UI primitive
 * @see app/(docs)/[[...slug]]/page.tsx — Docs-level 404 with suggestions
 *
 * @module
 */
import type { ReactElement } from 'react';
import { NotFound } from '@/components/layouts/not-found';


/**
 * Global 404 page component.
 *
 * Rendered by Next.js for any request that doesn't match a defined route.
 * Delegates rendering to the shared `NotFound` component with an empty
 * suggestion list (no slug context available at the global level).
 *
 * @returns The global 404 error page.
 */
export default function GlobalNotFound(): ReactElement {
  // No slug context at the global level — return empty suggestions.
  // The NotFound component handles this gracefully with a "Return to Home" link.
  return <NotFound getSuggestions={() => Promise.resolve([])} />;
}
