/**
 * @module @enterstellar-ai/react/__tests__/hooks/use-enterstellar-context.test
 * @description Unit tests for `useEnterstellar()`.
 *
 * Covers:
 * - Throws when used outside `<Provider>` (RE5).
 * - Returns `{ registry, compiler, store, telemetry, cache, adapters }` (RE9).
 * - Does NOT include agent connection in return value.
 * - Cache defaults to null, adapters defaults to {}.
 *
 * @see Design Choice RE5 — throws outside provider
 * @see Design Choice RE9 — core services only
 * @see Design Choice CA3 — cache in context
 * @see Design Choice AD1 — adapters in context
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useEnterstellar } from '../../src/hooks/use-enterstellar.js';
import { EnterstellarContext, EnterstellarAgentContext } from '../../src/provider.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import type { EnterstellarContextValue } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function mockEnterstellarContext(): EnterstellarContextValue {
    return {
        registry: {
            get: vi.fn(() => undefined),
            list: vi.fn(() => []),
            register: vi.fn(),
            unregister: vi.fn(() => false),
            getManifest: vi.fn(() => []),
            getSchema: vi.fn(() => undefined),
            getDesignTokens: vi.fn(),
            validate: vi.fn(() => ({ valid: true, violations: [] })),
            publish: vi.fn(),
            on: vi.fn(() => () => { }),
            size: 0,
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        compiler: {
            compile: vi.fn(async () => ({ status: 'pass', componentName: 'Test', props: {}, errors: [], selfCorrectionAttempts: 0 })),
            lint: vi.fn(async () => []),
            use: vi.fn(),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        store: {
            get: vi.fn(() => undefined),
            set: vi.fn(),
            subscribe: vi.fn(() => () => { }),
            extend: vi.fn(),
            hasExtension: vi.fn(() => false),
            snapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: {} })),
            restore: vi.fn(),
            registerMigration: vi.fn(),
            getSnapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: {} })),
            destroy: vi.fn(),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        telemetry: {
            record: vi.fn(),
            flush: vi.fn(),
            getStats: vi.fn(),
            dispose: vi.fn(),
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        rendererRegistry,
        cache: null,
        adapters: {},
    };
}

function createWrapper(context: EnterstellarContextValue): ({ children }: { children: ReactNode }) => React.JSX.Element {
    return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
        return (
            <EnterstellarContext.Provider value={context}>
                <EnterstellarAgentContext.Provider value={{ connection: null }}>
                    {children}
                </EnterstellarAgentContext.Provider>
            </EnterstellarContext.Provider>
        );
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEnterstellar()', () => {
    beforeEach(() => {
        rendererRegistry.clear();
    });

    it('throws when used outside Provider', () => {
        // Suppress console.error from React renderHook
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => {
            renderHook(() => useEnterstellar());
        }).toThrow(
            'useEnterstellar() must be used within an <Provider>.',
        );

        spy.mockRestore();
    });

    it('returns registry, compiler, store, and telemetry', () => {
        const ctx = mockEnterstellarContext();

        const { result } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current.registry).toBe(ctx.registry);
        expect(result.current.compiler).toBe(ctx.compiler);
        expect(result.current.store).toBe(ctx.store);
        expect(result.current.telemetry).toBe(ctx.telemetry);
    });

    it('does NOT include rendererRegistry in return value', () => {
        const ctx = mockEnterstellarContext();

        const { result } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        // Return type is UseEnterstellarContextResult — no rendererRegistry
        const keys = Object.keys(result.current);
        expect(keys).toContain('registry');
        expect(keys).toContain('compiler');
        expect(keys).toContain('store');
        expect(keys).toContain('telemetry');
        expect(keys).toContain('cache');
        expect(keys).toContain('adapters');
        expect(keys).not.toContain('rendererRegistry');
    });

    it('does NOT include agent connection in return value (RE9)', () => {
        const ctx = mockEnterstellarContext();

        const { result } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        const keys = Object.keys(result.current);
        expect(keys).not.toContain('connection');
    });

    // -------------------------------------------------------------------
    // Cache Integration (CA3)
    // -------------------------------------------------------------------

    it('returns cache as null when not provided (CA3)', () => {
        const ctx = mockEnterstellarContext();
        // cache is null by default in mockEnterstellarContext

        const { result } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current.cache).toBeNull();
    });

    it('returns cache instance when provided (CA3)', () => {
        const mockCacheInstance = {
            get: vi.fn(),
            set: vi.fn(),
            has: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
            size: 0,
            warmup: vi.fn(),
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const ctx = { ...mockEnterstellarContext(), cache: mockCacheInstance };

        const { result } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current.cache).toBe(mockCacheInstance);
    });

    // -------------------------------------------------------------------
    // Adapters Integration (AD1)
    // -------------------------------------------------------------------

    it('returns empty adapters object by default (AD1)', () => {
        const ctx = mockEnterstellarContext();

        const { result } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current.adapters).toBeDefined();
        expect(typeof result.current.adapters).toBe('object');
    });

    it('returns adapters instance when provided (AD1)', () => {
        const mockAdaptersInstance = {
            error: {
                shouldRetry: vi.fn(),
                sanitize: vi.fn(),
                report: vi.fn(),
            },
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const ctx = { ...mockEnterstellarContext(), adapters: mockAdaptersInstance };

        const { result } = renderHook(() => useEnterstellar(), {
            wrapper: createWrapper(ctx),
        });

        expect(result.current.adapters).toBe(mockAdaptersInstance);
    });
});
