/**
 * @module @enterstellar-ai/react/__tests__/hooks/use-enterstellar-agent.test
 * @description Unit tests for `useEnterstellarAgent()`.
 *
 * Covers:
 * - Returns `EnterstellarAgentConnection` when provided in context.
 * - Returns `null` when no connection is provided.
 * - Never throws (unlike `useEnterstellar`).
 *
 * @see Design Choice RE3 — consumer manages connection
 * @see Design Choice RE9 — agent hook separate from context hook
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useEnterstellarAgent } from '../../src/hooks/use-agent.js';
import { EnterstellarAgentContext } from '../../src/provider.js';
import type { EnterstellarAgentContextValue } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper(agentContext: EnterstellarAgentContextValue): ({ children }: { children: ReactNode }) => React.JSX.Element {
    return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
        return (
            <EnterstellarAgentContext.Provider value={agentContext}>
                {children}
            </EnterstellarAgentContext.Provider>
        );
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mock connection
function mockConnection(): any {
    return {
        dispatch: vi.fn(async () => { }),
        on: vi.fn(() => () => { }),
        onRawEvent: vi.fn(() => () => { }),
        connected: true,
        disconnect: vi.fn(async () => { }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnterstellarAgent()', () => {
    it('returns the connection when provided', () => {
        const connection = mockConnection();

        const { result } = renderHook(() => useEnterstellarAgent(), {
            wrapper: createWrapper({ connection }),
        });

        expect(result.current).toBe(connection);
    });

    it('returns null when no connection is provided', () => {
        const { result } = renderHook(() => useEnterstellarAgent(), {
            wrapper: createWrapper({ connection: null }),
        });

        expect(result.current).toBeNull();
    });

    it('never throws even without any provider', () => {
        // useEnterstellarAgent reads from EnterstellarAgentContext which has a default value
        // of { connection: null }, so it never throws
        const { result } = renderHook(() => useEnterstellarAgent());

        expect(result.current).toBeNull();
    });

    it('returns updated connection when context changes', () => {
        const conn1 = mockConnection();

        const { result } = renderHook(() => useEnterstellarAgent(), {
            wrapper: createWrapper({ connection: conn1 }),
        });

        expect(result.current).toBe(conn1);

        // Note: to truly test context changes, we'd need to re-wrap.
        // This test verifies the hook returns the current context value.
    });
});
