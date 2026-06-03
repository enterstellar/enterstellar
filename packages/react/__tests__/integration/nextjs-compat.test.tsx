/**
 * @module @enterstellar-ai/react/__tests__/integration/nextjs-compat
 * @description Next.js App Router compatibility test for `@enterstellar-ai/react`.
 *
 * This test validates the contracts that Next.js App Router depends on:
 *
 * 1. **`'use client'` directives** — All files that use React hooks or
 *    browser APIs must have `'use client'` as the first statement.
 *    Next.js uses this to split server vs client modules.
 *
 * 2. **SSR-safe initial render** — Components must not access `window`,
 *    `document`, or other browser-only globals during the initial
 *    synchronous render pass. They may access them inside `useEffect`.
 *
 * 3. **No Node.js-only imports** — Client-side modules must not import
 *    `node:fs`, `node:path`, or other server-only Node.js APIs.
 *
 * 4. **Full render pipeline** — `<Provider>` + `<Zone>` must
 *    render correctly in a client-only context, which is the runtime
 *    environment after Next.js hydration.
 *
 * @see Design Choice RE4 — `'use client'` on all renderer-side files
 * @see P1 Gate — `<Zone>` renders in existing Next.js app
 *
 * @internal
 */

/// <reference types="node" />

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Provider } from '../../src/provider.js';
import { Zone } from '../../src/zone.js';
import { rendererRegistry } from '../../src/renderer-registry.js';
import type { ComponentIntent, CompilationResult } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Root source directory of `@enterstellar-ai/react`.
 * Uses `import.meta.url` for ESM compatibility (no `__dirname` in ESM).
 */
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(CURRENT_DIR, '../../src');

/**
 * Files that MUST have `'use client'` — any file using React hooks,
 * `useState`, `useEffect`, `useContext`, `useRef`, `useSyncExternalStore`,
 * or rendering JSX with event handlers.
 *
 * Files that are pure logic/types (no React runtime) are excluded.
 */
const CLIENT_DIRECTIVE_REQUIRED_FILES: readonly string[] = [
    'index.ts',
    'enterstellar-provider.tsx',
    'enterstellar-zone.tsx',
    'provenance-badge.tsx',
    'zone-error-boundary.tsx',
    'lifecycle-wrapper.tsx',
    'defaults/enterstellar-skeleton.tsx',
    'defaults/enterstellar-error-card.tsx',
    'defaults/enterstellar-empty-state.tsx',
    'hooks/use-enterstellar-context.ts',
    'hooks/use-enterstellar-agent.ts',
    'hooks/use-enterstellar-store.ts',
    'hooks/use-enterstellar-trace.ts',
    'hooks/use-spatial-context.ts',
    'hooks/use-enterstellar-adapters.ts',
];

/**
 * Files that must NOT have `'use client'` — pure logic modules
 * that should remain importable in server contexts.
 */
const SERVER_COMPATIBLE_FILES: readonly string[] = [
    'types.ts',
    'define-enterstellar-component.ts',
    'renderer-registry.ts',
];

/**
 * Node.js-only modules that must NEVER appear in client-side imports.
 */
const NODE_ONLY_MODULES: readonly string[] = [
    'node:fs',
    'node:path',
    'node:crypto',
    'node:http',
    'node:https',
    'node:net',
    'node:os',
    'node:child_process',
    'node:worker_threads',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collects all `.ts` and `.tsx` source files under a directory.
 *
 * @param dir - Directory to scan.
 * @returns Array of absolute file paths.
 */
function collectSourceFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            results.push(...collectSourceFiles(fullPath));
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
            results.push(fullPath);
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Mock Services (same shape as zone-render-pipeline.test.tsx)
// ---------------------------------------------------------------------------

type EventCallback = (data: unknown) => void;
const connectionListeners: Map<string, EventCallback[]> = new Map();

/**
 * Creates mock Enterstellar services for client-only rendering tests.
 */
function createClientMocks() {
    connectionListeners.clear();

    /* eslint-disable @typescript-eslint/no-explicit-any -- test mocks */
    const registry = {
        get: vi.fn((name: string) => {
            if (name === 'NextJsTestCard') {
                return {
                    name: 'NextJsTestCard',
                    description: 'Test component for Next.js compat',
                    category: 'utility',
                    tags: ['test'],
                    props: {},
                    accessibility: { role: 'region', ariaLabel: 'Test Card' },
                };
            }
            return undefined;
        }),
        list: vi.fn(() => ['NextJsTestCard']),
        register: vi.fn(),
        unregister: vi.fn(() => false),
        getManifest: vi.fn(() => []),
        getSchema: vi.fn(() => undefined),
        getDesignTokens: vi.fn(() => ({ colors: {}, spacing: {}, typography: {}, radii: {}, shadows: {} })),
        validate: vi.fn(() => ({ valid: true, violations: [] })),
        publish: vi.fn(async () => ({ published: true, url: '' })),
        on: vi.fn(() => () => { /* noop */ }),
        size: 1,
    } as any;

    const compiler = {
        compile: vi.fn(async (intent: ComponentIntent): Promise<CompilationResult> => ({
            status: 'pass' as const,
            componentName: intent.component,
            props: intent.props ?? {},
            errors: [],
            selfCorrectionAttempts: 0,
            provenance: {
                agent: 'test-agent',
                registry: 'main',
                compiledAt: new Date().toISOString(),
                compilerVersion: '0.1.0',
            },
        })),
        lint: vi.fn(async () => []),
        use: vi.fn(),
    } as any;

    const storeData = new Map<string, unknown>();
    const storeSubscribers = new Set<() => void>();
    const store = {
        get: vi.fn(<T = unknown>(key: string): T | undefined => storeData.get(key) as T | undefined),
        set: vi.fn((key: string, value: unknown) => {
            storeData.set(key, value);
            storeSubscribers.forEach((cb) => { cb(); });
        }),
        subscribe: vi.fn((cb: () => void) => {
            storeSubscribers.add(cb);
            return () => storeSubscribers.delete(cb);
        }),
        extend: vi.fn(),
        hasExtension: vi.fn(() => false),
        snapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: Object.fromEntries(storeData) })),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(() => ({ schemaVersion: '1.0.0', data: Object.fromEntries(storeData) })),
        destroy: vi.fn(),
    } as any;

    const telemetry = {
        record: vi.fn(),
        flush: vi.fn(async () => ({ sent: 0, failed: 0 })),
        getStats: vi.fn(() => ({ totalRecorded: 0, totalSent: 0, totalFailed: 0, queueSize: 0 })),
        dispose: vi.fn(async () => { /* noop */ }),
    } as any;

    const connection = {
        dispatch: vi.fn(async () => { /* noop */ }),
        on: vi.fn((event: string, callback: EventCallback) => {
            const listeners = connectionListeners.get(event) ?? [];
            listeners.push(callback);
            connectionListeners.set(event, listeners);
            return () => {
                const current = connectionListeners.get(event) ?? [];
                connectionListeners.set(event, current.filter((cb) => cb !== callback));
            };
        }),
        onRawEvent: vi.fn(() => () => { /* noop */ }),
        connected: true,
        disconnect: vi.fn(async () => { /* noop */ }),
    } as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return { registry, compiler, store, telemetry, connection };
}

/**
 * Dispatches an intent to a zone through the mock connection.
 */
function dispatchIntent(zone: string, intent: ComponentIntent): void {
    const listeners = connectionListeners.get('intent') ?? [];
    for (const cb of listeners) {
        cb({ zone, intent });
    }
}

// ---------------------------------------------------------------------------
// Test Renderer
// ---------------------------------------------------------------------------

/**
 * A minimal React component for testing Next.js-compatible rendering.
 */
function NextJsTestCard(props: Record<string, unknown>): React.JSX.Element {
    return (
        <div data-testid="nextjs-test-card">
            <span data-testid="card-title">{String(props['title'] ?? '')}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Next.js App Router Compatibility', () => {
    afterEach(() => {
        rendererRegistry.clear();
    });

    // -------------------------------------------------------------------
    // 1. 'use client' directive compliance (RE4)
    // -------------------------------------------------------------------

    describe("'use client' directive compliance (RE4)", () => {
        it('all React hook files have \'use client\' as the first statement', () => {
            for (const relativePath of CLIENT_DIRECTIVE_REQUIRED_FILES) {
                const filePath = path.join(SRC_DIR, relativePath);
                const content = fs.readFileSync(filePath, 'utf-8');
                const firstLine = content.split('\n')[0]?.trim();

                expect(
                    firstLine,
                    `${relativePath} must start with 'use client' but starts with: "${firstLine ?? ''}"`,
                ).toBe("'use client';");
            }
        });

        it('pure logic files do NOT have \'use client\' (remain server-importable)', () => {
            for (const relativePath of SERVER_COMPATIBLE_FILES) {
                const filePath = path.join(SRC_DIR, relativePath);
                const content = fs.readFileSync(filePath, 'utf-8');
                const firstLine = content.split('\n')[0]?.trim();

                expect(
                    firstLine,
                    `${relativePath} should NOT start with 'use client' (pure logic module)`,
                ).not.toBe("'use client';");
            }
        });
    });

    // -------------------------------------------------------------------
    // 2. No Node.js-only imports in client modules
    // -------------------------------------------------------------------

    describe('no Node.js-only imports in client modules', () => {
        it('client-side source files do not import Node.js-only modules', () => {
            const allSourceFiles = collectSourceFiles(SRC_DIR);

            for (const filePath of allSourceFiles) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const relativePath = filePath.replace(SRC_DIR + '/', '');

                for (const nodeModule of NODE_ONLY_MODULES) {
                    const hasImport = content.includes(`from '${nodeModule}'`) ||
                        content.includes(`from "${nodeModule}"`) ||
                        content.includes(`require('${nodeModule}')`) ||
                        content.includes(`require("${nodeModule}")`);

                    expect(
                        hasImport,
                        `${relativePath} imports Node.js-only module '${nodeModule}' — ` +
                        `this will fail in Next.js client bundles.`,
                    ).toBe(false);
                }
            }
        });
    });

    // -------------------------------------------------------------------
    // 3. SSR-safe initial render — no browser globals during first paint
    // -------------------------------------------------------------------

    describe('SSR-safe initial render', () => {
        it('Provider renders without accessing browser globals', () => {
            const mocks = createClientMocks();

            const { container } = render(
                <Provider
                    registry={mocks.registry}
                    compiler={mocks.compiler}
                    store={mocks.store}
                    telemetry={mocks.telemetry}
                >
                    <div data-testid="ssr-content">Server-safe content</div>
                </Provider>,
            );

            expect(screen.getByTestId('ssr-content')).toBeDefined();
            expect(container.innerHTML).toContain('Server-safe content');
        });

        it('Zone renders loading state without accessing browser globals', () => {
            const mocks = createClientMocks();

            const { container } = render(
                <Provider
                    registry={mocks.registry}
                    compiler={mocks.compiler}
                    store={mocks.store}
                    telemetry={mocks.telemetry}
                >
                    <Zone
                        name="ssr-zone"
                        fallback={<div data-testid="ssr-fallback">Loading...</div>}
                    />
                </Provider>,
            );

            // LC8: loading state renders EnterstellarSkeleton, not the raw fallback
            const skeleton = container.querySelector('[data-enterstellar-skeleton]');
            const hasSkeleton = skeleton !== null || screen.queryByTestId('ssr-fallback') !== null;
            expect(hasSkeleton).toBe(true);
        });

        it('Zone with determinism=0.0 renders static children (SSR-safe path)', () => {
            const mocks = createClientMocks();

            render(
                <Provider
                    registry={mocks.registry}
                    compiler={mocks.compiler}
                    store={mocks.store}
                    telemetry={mocks.telemetry}
                >
                    <Zone name="static-zone" determinism={0.0}>
                        <div data-testid="static-ssr">Static SSR content</div>
                    </Zone>
                </Provider>,
            );

            expect(screen.getByTestId('static-ssr')).toBeDefined();
            expect(screen.getByTestId('static-ssr').textContent).toBe('Static SSR content');
        });
    });

    // -------------------------------------------------------------------
    // 4. Full client-side render pipeline (post-hydration)
    // -------------------------------------------------------------------

    describe('full client-side render pipeline (post-hydration)', () => {
        it('Zone renders a component via intent → compile → render in client context', async () => {
            const mocks = createClientMocks();
            rendererRegistry.register('NextJsTestCard', NextJsTestCard);

            render(
                <Provider
                    registry={mocks.registry}
                    compiler={mocks.compiler}
                    store={mocks.store}
                    telemetry={mocks.telemetry}
                    connection={mocks.connection}
                >
                    <Zone
                        name="nextjs-zone"
                        determinism={1.0}
                        fallback={<div data-testid="loading">Loading...</div>}
                    />
                </Provider>,
            );

            // LC8: EnterstellarSkeleton renders in loading state
            const skeleton = document.querySelector('[data-enterstellar-skeleton]');
            expect(skeleton).not.toBeNull();

            await act(async () => {
                dispatchIntent('nextjs-zone', {
                    component: 'NextJsTestCard',
                    confidence: 0.95,
                    props: { title: 'Next.js Compatible' },
                });
                await new Promise((r) => { setTimeout(r, 50); });
            });

            await waitFor(() => {
                expect(screen.getByTestId('nextjs-test-card')).toBeDefined();
            });

            expect(screen.getByTestId('card-title').textContent).toBe('Next.js Compatible');

            const zoneDiv = document.querySelector('[data-enterstellar-zone="nextjs-zone"]');
            expect(zoneDiv).not.toBeNull();
        });

        it('zone wrapper has data-enterstellar-zone attribute for CSS targeting (RE8)', () => {
            const mocks = createClientMocks();

            const { container } = render(
                <Provider
                    registry={mocks.registry}
                    compiler={mocks.compiler}
                    store={mocks.store}
                    telemetry={mocks.telemetry}
                >
                    <Zone name="css-target-zone" />
                </Provider>,
            );

            const zoneDiv = container.querySelector('[data-enterstellar-zone="css-target-zone"]');
            expect(zoneDiv).not.toBeNull();
        });
    });

    // -------------------------------------------------------------------
    // 5. Module export structure (Next.js tree-shaking contract)
    // -------------------------------------------------------------------

    describe('module export structure', () => {
        it('barrel file (index.ts) has \'use client\' as first line', () => {
            const indexPath = path.join(SRC_DIR, 'index.ts');
            const content = fs.readFileSync(indexPath, 'utf-8');

            expect(content.startsWith("'use client';")).toBe(true);
        });

        it('all public exports are accessible from the barrel', async () => {
            const mod = await import('../../src/index.js');

            // Components
            expect(mod.Provider).toBeDefined();
            expect(mod.Zone).toBeDefined();
            expect(mod.ProvenanceBadge).toBeDefined();
            expect(mod.ZoneErrorBoundary).toBeDefined();

            // Factories
            expect(mod.defineComponent).toBeDefined();
            expect(mod.rendererRegistry).toBeDefined();
            expect(mod.registerRenderer).toBeDefined();
            expect(mod.createRendererRegistry).toBeDefined();

            // Hooks
            expect(mod.useEnterstellar).toBeDefined();
            expect(mod.useEnterstellarAgent).toBeDefined();
            expect(mod.useEnterstellarStore).toBeDefined();
            expect(mod.useEnterstellarTrace).toBeDefined();
            expect(mod.useSpatialContext).toBeDefined();
            expect(mod.useEnterstellarAdapters).toBeDefined();

            // Lifecycle & Defaults
            expect(mod.LifecycleWrapper).toBeDefined();
            expect(mod.EnterstellarSkeleton).toBeDefined();
            expect(mod.EnterstellarErrorCard).toBeDefined();
            expect(mod.EnterstellarEmptyState).toBeDefined();

            // Context exports (for devtools)
            expect(mod.EnterstellarContext).toBeDefined();
            expect(mod.EnterstellarAgentContext).toBeDefined();
        });
    });
});
