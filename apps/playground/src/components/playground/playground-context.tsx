/**
 * @module playground/components/playground/playground-context
 * @description React context for the playground-specific `LiveAgentConnection`.
 *
 * The generic `EnterstellarAgentConnection` (from `@enterstellar-ai/types`) is wired through
 * `Provider` → `EnterstellarAgentContext`. But `PlaygroundShell` needs the
 * concrete `LiveAgentConnection` for `sendSceneIntent()` — a playground-only
 * method not on the generic interface.
 *
 * This context bridges that gap: `PlaygroundProviders` creates the
 * `LiveAgentConnection` and publishes it here; `PlaygroundShell` consumes
 * it via `usePlaygroundConnection()` — same instance as the one wired to
 * `<Provider connection={...}>`, ensuring zones and shell share
 * one connection.
 *
 * @see LiveAgentConnection.sendSceneIntent() — playground-specific dispatch
 * @see PlaygroundProviders — the provider that creates and publishes
 * @see PlaygroundShell — the consumer that calls sendSceneIntent()
 */
'use client';

import { createContext, useContext } from 'react';

import type { LiveAgentConnection } from '@/enterstellar/agent-connection';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * React context for the playground-specific `LiveAgentConnection`.
 *
 * `null` sentinel = the context was consumed outside of `PlaygroundProviders`.
 */
export const PlaygroundConnectionContext =
  createContext<LiveAgentConnection | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Accesses the `LiveAgentConnection` from `PlaygroundProviders`.
 *
 * Unlike `useEnterstellarAgent()` (which returns the generic interface),
 * this hook returns the concrete `LiveAgentConnection` with
 * `sendSceneIntent()` available.
 *
 * @throws {Error} If called outside of `<PlaygroundProviders>`.
 */
export function usePlaygroundConnection(): LiveAgentConnection {
  const connection = useContext(PlaygroundConnectionContext);
  if (connection === null) {
    throw new Error(
      'usePlaygroundConnection() must be used inside <PlaygroundProviders>.',
    );
  }
  return connection;
}
