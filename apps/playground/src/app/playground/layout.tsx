/**
 * Enterstellar Playground — Playground Layout
 *
 * Server-side layout for the `/playground` route. Provides:
 * - SEO metadata (title, description, robots)
 * - Full-dark-mode background wrapper
 * - Client-side `PlaygroundProviders` (Provider + LiveAgentConnection)
 *
 * This is a **server component** (no `'use client'`) so that Next.js
 * can statically extract `metadata`. The actual client-side Enterstellar context
 * is provided by `PlaygroundProviders` — the classic Next.js split pattern.
 *
 * @see implementation_plan.md §4.1 — Playground layout
 * @see PlaygroundProviders — client-side Enterstellar context wrapper
 */
import type { Metadata } from 'next';

import { PlaygroundProviders } from '@/components/playground/playground-providers';

/**
 * SEO metadata for the `/playground` page.
 *
 * Uses Next.js's metadata merge system — these values layer on top
 * of the root layout's `title.template` (`%s | Enterstellar Playground`).
 */
export const metadata: Metadata = {
  title: 'Playground',
  description:
    'Interactive Enterstellar Compiler playground. Try type-safe GenUI with live AI demos — MetricCards, DataTables, multi-zone dashboards, and more.',
  robots: {
    index: true,
    follow: true,
  },
};

/**
 * Playground layout component.
 *
 * Full-height, dark background. Children are the playground page content,
 * wrapped in the Enterstellar engine context (registry, connection, renderers).
 */
export default function PlaygroundLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <div className="min-h-dvh bg-playground-bg text-neutral-100 flex flex-col">
      <PlaygroundProviders>{children}</PlaygroundProviders>
    </div>
  );
}
