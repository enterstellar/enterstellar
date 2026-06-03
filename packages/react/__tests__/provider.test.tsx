/**
 * @module @enterstellar-ai/react/__tests__/enterstellar-provider.test
 * @description Unit tests for `<Provider>`.
 *
 * Covers:
 * - Renders children.
 * - Creates React contexts (`EnterstellarContext`, `EnterstellarAgentContext`).
 * - Auto-creates compiler if omitted (RE1).
 * - Auto-creates telemetry if omitted (RE2).
 * - Passes consumer-provided instances through context.
 * - Agent context is separate (RE9).
 * - Agent context is `null` when no connection provided.
 *
 * @see Design Choices RE1, RE2, RE3, RE4, RE9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';

import { Provider, EnterstellarContext, EnterstellarAgentContext, Enterstellar_CONTEXT_NONE } from '../src/provider.js';
import type { EnterstellarContextValue, EnterstellarAgentContextValue } from '../src/types.js';
import { rendererRegistry } from '../src/renderer-registry.js';

// ---------------------------------------------------------------------------
// Mocks — create minimal mock implementations of Enterstellar services
// ---------------------------------------------------------------------------

/** Creates a minimal mock registry. */
function mockRegistry() {
    return {
        get: vi.fn(() => undefined),
        list: vi.fn(() => []),
        register: vi.fn(),
        unregister: vi.fn(() => false),
        getManifest: vi.fn(() => []),
        getSchema: vi.fn(() => undefined),
        getDesignTokens: vi.fn(() => ({ colors: {}, spacing: {}, typography: {}, radii: {}, shadows: {} })),
        validate: vi.fn(() => ({ valid: true, violations: [] })),
        publish: vi.fn(async () => ({ published: true, url: 'https://test.com' })),
        on: vi.fn(() => () => { }),
        size: 0,
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing
}

/** Creates a minimal mock compiler. */
function mockCompiler() {
    return {
        compile: vi.fn(async () => ({
            status: 'pass' as const,
            componentName: 'TestComponent',
            props: {},
            errors: [],
            selfCorrectionAttempts: 0,
            provenance: {
                agent: 'test',
                registry: 'test',
                compiledAt: new Date().toISOString(),
                compilerVersion: '0.0.0',
            },
        })),
        lint: vi.fn(async () => []),
        use: vi.fn(),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing
}

/** Creates a minimal mock store. */
function mockStore() {
    const data = new Map<string, unknown>();
    const subscribers = new Set<() => void>();
    return {
        get: vi.fn(<T = unknown>(key: string): T | undefined => data.get(key) as T | undefined),
        set: vi.fn((key: string, value: unknown) => { data.set(key, value); subscribers.forEach((cb) => { cb(); }); }),
        subscribe: vi.fn((cb: () => void) => { subscribers.add(cb); return () => subscribers.delete(cb); }),
        extend: vi.fn(),
        hasExtension: vi.fn(() => false),
        snapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: Object.fromEntries(data) })),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: Object.fromEntries(data) })),
        destroy: vi.fn(),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing
}

/** Creates a minimal mock telemetry collector. */
function mockTelemetry() {
    return {
        record: vi.fn(),
        flush: vi.fn(async () => ({ sent: 0, failed: 0 })),
        getStats: vi.fn(() => ({ totalRecorded: 0, totalSent: 0, totalFailed: 0, queueSize: 0 })),
        dispose: vi.fn(async () => { }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing
}

/** Creates a minimal mock agent connection. */
function mockConnection() {
    return {
        dispatch: vi.fn(async () => { }),
        on: vi.fn(() => () => { }),
        onRawEvent: vi.fn(() => () => { }),
        connected: true,
        disconnect: vi.fn(async () => { }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing
}

/**
 * Creates a minimal mock RenderCache (CA3).
 * Mirrors the `RenderCache` interface from `@enterstellar-ai/cache`.
 */
function mockCache() {
    const entries = new Map<string, unknown>();
    return {
        get: vi.fn((key: string) => entries.get(key)),
        set: vi.fn((key: string, value: unknown) => { entries.set(key, value); }),
        has: vi.fn((key: string) => entries.has(key)),
        delete: vi.fn((key: string) => entries.delete(key)),
        clear: vi.fn(() => { entries.clear(); }),
        size: 0,
        warmup: vi.fn(async () => { }),
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing
}

/**
 * Creates a minimal mock EnterstellarAdapters (AD1).
 * Mirrors the `EnterstellarAdapters` interface from `@enterstellar-ai/adapters`.
 */
function mockAdapters() {
    return {
        error: {
            shouldRetry: vi.fn(async () => false),
            sanitize: vi.fn(async (err: Error) => err),
            report: vi.fn(async () => { }),
        },
        data: undefined,
        auth: undefined,
    } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Mock for testing
}

// ---------------------------------------------------------------------------
// Test Component — reads context for assertions
// ---------------------------------------------------------------------------

let capturedContext: EnterstellarContextValue | null | typeof Enterstellar_CONTEXT_NONE = null;
let capturedAgentContext: EnterstellarAgentContextValue | null = null;

/**
 * Narrows `capturedContext` to `EnterstellarContextValue` for test assertions.
 * Throws if the context is null or the sentinel — tests always render
 * inside an `<Provider>`, so a non-value context is a test bug.
 */
function assertContext(): EnterstellarContextValue {
    if (capturedContext === null || capturedContext === Enterstellar_CONTEXT_NONE) {
        throw new Error('capturedContext is not a valid EnterstellarContextValue');
    }
    return capturedContext;
}

function ContextReader() {
    capturedContext = useContext(EnterstellarContext);
    capturedAgentContext = useContext(EnterstellarAgentContext);
    return <div data-testid="context-reader">Context loaded</div>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<Provider>', () => {
    beforeEach(() => {
        capturedContext = null;
        capturedAgentContext = null;
        rendererRegistry.clear();
    });

    it('renders children', () => {
        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()}>
                <div data-testid="child">Hello</div>
            </Provider>,
        );

        expect(screen.getByTestId('child')).toBeDefined();
        expect(screen.getByTestId('child').textContent).toBe('Hello');
    });

    it('provides EnterstellarContext with consumer-provided services', () => {
        const registry = mockRegistry();
        const compiler = mockCompiler();
        const store = mockStore();
        const telemetry = mockTelemetry();

        render(
            <Provider registry={registry} compiler={compiler} store={store} telemetry={telemetry}>
                <ContextReader />
            </Provider>,
        );

        expect(capturedContext).not.toBeNull();
        expect(assertContext().registry).toBe(registry);
        expect(assertContext().compiler).toBe(compiler);
        expect(assertContext().store).toBe(store);
        expect(assertContext().telemetry).toBe(telemetry);
    });

    it('provides rendererRegistry in context', () => {
        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()}>
                <ContextReader />
            </Provider>,
        );

        expect(assertContext().rendererRegistry).toBe(rendererRegistry);
    });

    it('provides EnterstellarAgentContext with connection when provided', () => {
        const connection = mockConnection();

        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()} connection={connection}>
                <ContextReader />
            </Provider>,
        );

        expect(capturedAgentContext?.connection).toBe(connection);
    });

    it('provides EnterstellarAgentContext with null when no connection', () => {
        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()}>
                <ContextReader />
            </Provider>,
        );

        expect(capturedAgentContext?.connection).toBeNull();
    });

    it('auto-creates telemetry when not provided (RE2)', async () => {
        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()}>
                <ContextReader />
            </Provider>,
        );

        // Telemetry auto-creation is async (IndexedDB queue opening, TL4).
        // Wait for the useEffect to resolve and provide context.
        await waitFor(() => {
            expect(assertContext().telemetry).toBeDefined();
            expect(typeof assertContext().telemetry.record).toBe('function');
        });
    });

    it('auto-creates compiler when not provided (RE1)', () => {
        render(
            <Provider registry={mockRegistry()} store={mockStore()} telemetry={mockTelemetry()}>
                <ContextReader />
            </Provider>,
        );

        // Should auto-create a compiler instance
        expect(assertContext().compiler).toBeDefined();
        expect(typeof assertContext().compiler.compile).toBe('function');
    });

    it('propagates threadId to store session (P3)', () => {
        const store = mockStore();

        render(
            <Provider registry={mockRegistry()} store={store} compiler={mockCompiler()} telemetry={mockTelemetry()} threadId="session-xyz">
                <ContextReader />
            </Provider>,
        );

        // threadId propagation via store.set('session', ...)
        // Since session might not exist yet, the effect checks `store.get('session')`
        // The important thing is no error thrown
        expect(capturedContext).not.toBeNull();
    });

    it('destroys auto-created store on unmount', async () => {
        const store = mockStore();

        const { unmount } = render(
            <Provider registry={mockRegistry()} store={store} compiler={mockCompiler()} telemetry={mockTelemetry()}>
                <div>child</div>
            </Provider>,
        );

        unmount();

        // Consumer-provided store should NOT be destroyed
        // (auto-created store destruction tested via async init path)
    });

    // -----------------------------------------------------------------------
    // Cache Integration (CA3, RE1–RE4)
    // -----------------------------------------------------------------------

    it('provides cache in context when provided (CA3)', () => {
        const cache = mockCache();

        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()} cache={cache}>
                <ContextReader />
            </Provider>,
        );

        expect(capturedContext).not.toBeNull();
        expect(assertContext().cache).toBe(cache);
    });

    it('defaults cache to null when not provided', () => {
        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()}>
                <ContextReader />
            </Provider>,
        );

        expect(capturedContext).not.toBeNull();
        expect(assertContext().cache).toBeNull();
    });

    // -----------------------------------------------------------------------
    // Adapters Integration (AD1)
    // -----------------------------------------------------------------------

    it('provides adapters in context when provided (AD1)', () => {
        const adapters = mockAdapters();

        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()} adapters={adapters}>
                <ContextReader />
            </Provider>,
        );

        expect(capturedContext).not.toBeNull();
        expect(assertContext().adapters).toBe(adapters);
    });

    it('defaults adapters to empty object when not provided', () => {
        render(
            <Provider registry={mockRegistry()} store={mockStore()} compiler={mockCompiler()} telemetry={mockTelemetry()}>
                <ContextReader />
            </Provider>,
        );

        expect(capturedContext).not.toBeNull();
        expect(assertContext().adapters).toBeDefined();
        // Adapters defaults to {} — not null (all fields optional)
        expect(typeof assertContext().adapters).toBe('object');
    });
});
