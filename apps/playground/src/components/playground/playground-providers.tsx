/**
 * @module playground/components/playground/playground-providers
 * @description Client-side Enterstellar context wrapper for the playground.
 *
 * Wraps children in `<Provider>` with:
 * - `playgroundRegistry` — 8 production demo components
 * - `LiveAgentConnection` — stable instance for API communication
 * - `registerPlaygroundRenderers()` — called before first render
 * - `RenderCache` — opt-in cache for DevTools Cache Dashboard demo
 *
 * Store and telemetry are NOT provided — `Provider` auto-creates
 * them with sensible defaults (RE1, RE2): IndexedDB persistence for
 * store, IndexedDB queue for telemetry. During async initialization,
 * zones render their `fallback` prop gracefully.
 *
 * This is separated from `layout.tsx` because:
 * - `layout.tsx` is a server component (exports `metadata`)
 * - `Provider` requires `'use client'` (RE4)
 * - Classic Next.js split: server layout for SEO + client wrapper for context
 *
 * **Renderer registration:** Called at module scope (outside the component)
 * for two reasons:
 * 1. `registerRenderer()` writes to the module-level singleton in `@enterstellar-ai/react`
 * 2. `registerPlaygroundRenderers()` is idempotent — safe to call multiple times
 * 3. Renderers must be registered BEFORE any `<Zone>` mounts
 *
 * @see Provider from @enterstellar-ai/react — the engine context provider
 * @see Design Choice RE4 — client-side only
 * @see Design Choice RE3 — consumer manages connection
 */
'use client';

import { useRef, useState, type ReactNode } from 'react';

import { Provider } from '@enterstellar-ai/react';
import { EnterstellarDevTools } from '@enterstellar-ai/devtools';
import { createRenderCache } from '@enterstellar-ai/cache';

import { playgroundRegistry } from '@/enterstellar/registry';
import { registerPlaygroundRenderers } from '@/enterstellar/renderers';
import { LiveAgentConnection } from '@/enterstellar/agent-connection';
import { PlaygroundConnectionContext } from './playground-context';

// ---------------------------------------------------------------------------
// Module-scope renderer registration (idempotent)
// ---------------------------------------------------------------------------

/**
 * Register all 8 playground renderers BEFORE any component mounts.
 *
 * This runs once at module load time. The renderer registry is a
 * module-level singleton in `@enterstellar-ai/react` — it persists across
 * React re-renders and is available to all `<Zone>` instances.
 */
registerPlaygroundRenderers();

// ---------------------------------------------------------------------------
// PlaygroundProviders Component
// ---------------------------------------------------------------------------

/**
 * Client-side Enterstellar context wrapper for the playground route.
 *
 * Creates a stable `LiveAgentConnection` and `RenderCache`. Store,
 * compiler, and telemetry are auto-created by `Provider` with
 * sensible defaults (RE1, RE2).
 *
 * @example
 * ```tsx
 * // In layout.tsx (server component):
 * import { PlaygroundProviders } from '@/components/playground/playground-providers';
 *
 * export default function PlaygroundLayout({ children }) {
 *   return <PlaygroundProviders>{children}</PlaygroundProviders>;
 * }
 * ```
 */
export function PlaygroundProviders({
  children,
}: Readonly<{
  children: ReactNode;
}>): React.JSX.Element {
  /**
   * Stable LiveAgentConnection instance.
   *
   * Created once on first render via `useRef` lazy initialization.
   * The connection persists across React re-renders and is passed
   * to `Provider` which places it in `EnterstellarAgentContext`.
   *
   * @see Design Choice RE3 — consumer manages connection lifecycle
   */
  const connectionRef = useRef<LiveAgentConnection | null>(null);
  connectionRef.current ??= new LiveAgentConnection();

  /**
   * RenderCache instance for CompilationResult memoization.
   *
   * Provider does NOT auto-create a cache — it is opt-in.
   * We provide one here to power the DevTools Cache Dashboard panel
   * and enable cross-zone compilation caching in the demo.
   *
   * @see Design Choice CA3 — global cache, shared across zones.
   */
  const [cache] = useState(() => createRenderCache({ maxEntries: 100 }));

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Provider
      registry={playgroundRegistry}
      connection={connectionRef.current}
      cache={cache}
    >
      <PlaygroundConnectionContext.Provider value={connectionRef.current}>
        {children}
      </PlaygroundConnectionContext.Provider>
      {/* DevTools — hidden by default, toggled via Ctrl+Shift+A (DT2) */}
      {/* Production guard returns null (DT3) — zero prod bytes */}
      {/* Position: top-right avoids collision with inverted bottom PromptBar */}
      <EnterstellarDevTools cache={cache} config={{ position: 'top-right' }} />
    </Provider>
  );
}
