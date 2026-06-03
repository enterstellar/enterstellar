'use client';

/**
 * @module @enterstellar-ai/react/hooks/use-enterstellar-agent
 * @description Hook to access the `EnterstellarAgentConnection` from the nearest `<Provider>`.
 *
 * Returns `EnterstellarAgentConnection | null`. Unlike `useEnterstellar()`, this hook
 * does **not** throw when no connection exists — `null` is a valid state
 * when the app operates without an agent (static zones, testing).
 *
 * Separated from `useEnterstellar()` per RE9 because the agent connection
 * has a fundamentally different lifecycle:
 * - It may not exist at all (static-only mode).
 * - It may connect/disconnect independently of the React tree.
 * - It may be swapped at runtime (reconnect to different agent).
 *
 * @see Design Choice RE3 — consumer manages the connection
 * @see Design Choice RE9 — agent hook is separate from context hook
 *
 * @example
 * ```tsx
 * import { useEnterstellarAgent } from '@enterstellar-ai/react';
 *
 * function AgentStatus() {
 *   const connection = useEnterstellarAgent();
 *
 *   if (connection === null) {
 *     return <span>No agent connected</span>;
 *   }
 *
 *   return <span>{connection.connected ? 'Online' : 'Offline'}</span>;
 * }
 * ```
 */

import { useContext } from 'react';

import type { EnterstellarAgentConnection } from '@enterstellar-ai/types';

import { EnterstellarAgentContext } from '../provider.js';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Accesses the `EnterstellarAgentConnection` from the nearest `<Provider>`.
 *
 * Returns `null` if no connection was passed to `<Provider>`.
 * This is expected behavior — not all apps use a live agent connection.
 *
 * @returns The agent connection instance, or `null` if not provided.
 *
 * @see Design Choice RE3 — consumer manages connection lifecycle
 * @see Design Choice RE9 — separate from core context hook
 */
export function useEnterstellarAgent(): EnterstellarAgentConnection | null {
    const context = useContext(EnterstellarAgentContext);
    return context.connection;
}
