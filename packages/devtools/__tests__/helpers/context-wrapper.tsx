/**
 * @module @enterstellar-ai/devtools/__tests__/helpers/enterstellar-context-wrapper
 * @description Shared test wrapper providing `EnterstellarContext.Provider` with a mock store.
 *
 * Since `useDevtoolsTraces` reads from `EnterstellarContext.store.get('traces')`
 * (not `useEnterstellarStore`), all devtools component tests must wrap renders in
 * a provider that supplies a mock store whose `get('traces')` returns the
 * test's controlled `mockStoreTraces` array.
 *
 * Usage:
 * ```tsx
 * const { wrapper } = createEnterstellarContextWrapper(mockStoreTraces);
 *
 * render(<MyComponent />, { wrapper });
 * ```
 *
 * @see Design Choice DT7 — data via EnterstellarStore directly.
 * @internal
 */

import { createElement } from 'react';
import { vi } from 'vitest';
import { EnterstellarContext } from '@enterstellar-ai/react';
import type { ZoneTrace } from '@enterstellar-ai/types';

/**
 * Creates a test wrapper that provides `EnterstellarContext.Provider` with a mock store.
 *
 * The mock store's `get('traces')` dynamically reads from the provided
 * `tracesRef` array, allowing tests to mutate `mockStoreTraces` and have
 * the changes reflected in subsequent renders.
 *
 * @param tracesRef - Mutable array reference that `store.get('traces')` reads from.
 * @returns Object with `wrapper` component and `mockStore` for assertions.
 */
export function createEnterstellarContextWrapper(tracesRef: ZoneTrace[]) {
    const mockStore = {
        get: vi.fn(<T = unknown>(key: string): T | undefined => {
            if (key === 'traces') return tracesRef as unknown as T;
            return undefined;
        }),
        set: vi.fn(),
        subscribe: vi.fn(() => () => { /* no-op unsubscribe */ }),
        extend: vi.fn(),
        hasExtension: vi.fn(() => false),
        snapshot: vi.fn(),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(() => ({
            schemaVersion: '1.0.0' as const,
            zones: {},
            traceIds: [],
            session: { id: 'test', startedAt: new Date().toISOString() },
            extensions: {},
        })),
        destroy: vi.fn(),
    };

    function Wrapper({ children }: { readonly children: React.ReactNode }) {
        return createElement(
            EnterstellarContext.Provider,
            // Partial mock: only `store` is needed for useDevtoolsTraces tests.
            // Cast through `unknown` to satisfy the Provider's value type without
            // importing internal `EnterstellarContextValue` (not exported from @enterstellar-ai/react).
            { value: { store: mockStore } as unknown as React.ComponentProps<typeof EnterstellarContext.Provider>['value'] },
            children,
        );
    }

    return { wrapper: Wrapper, mockStore };
}
