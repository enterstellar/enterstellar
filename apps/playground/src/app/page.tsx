/**
 * Enterstellar Playground — Playground Page
 *
 * Renders the `PlaygroundShell` which orchestrates the controls bar,
 * prompt bar, and scene grid.
 *
 * This is a **server component** — it simply renders the client-side
 * `PlaygroundShell`. All state management lives in the shell.
 * The Enterstellar engine context (registry, connection, renderers) is
 * provided by `PlaygroundProviders` in the parent layout.
 *
 * **Route architecture:**
 * - `/playground` is the ONLY playground route (no `/playground/demo/X`)
 * - Quick demos = 1-zone scenes selected via ⚡ chips
 * - Domain dashboards = 4-zone scenes selected via 💡 chips
 * - Freestyle = user types anything → LLM selects component for 1 zone
 *
 * @see implementation_plan.md §4.7 — Unified playground page
 * @see PlaygroundShell — the client-side state orchestrator
 */

import { PlaygroundShell } from '@/components/playground/playground-shell';

/**
 * Opt out of static prerendering.
 *
 * The playground tree calls `useEnterstellar()` (ENS-3001 guard) which
 * requires a live `<Provider>` in the React tree. Next.js SSG attempts
 * to execute the full component tree server-side at build time, but no
 * `EnterstellarContext` can exist outside the client lifecycle.
 *
 * `force-dynamic` tells Next.js to render this route on-demand per
 * request (dynamic rendering) instead of statically at build time.
 * This is correct for an interactive AI playground — there is no
 * meaningful static shell to prerender here.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic
 */
export const dynamic = 'force-dynamic';

/**
 * `/playground` page component.
 *
 * Renders the full playground experience: controls bar (sticky),
 * prompt bar (intent input + scene chips), and scene grid
 * (90%+ of viewport).
 */
export default function PlaygroundPage(): React.JSX.Element {
  return <PlaygroundShell />;
}
