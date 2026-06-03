/**
 * @module @enterstellar-ai/connection/__tests__/store-sync.test
 * @description Unit tests for `createStoreSyncRuntime()`.
 *
 * Mocks `fetch`, `WebSocket`, and an `EnterstellarStore` to test:
 * - Initial state fetch via REST GET
 * - Store change → debounced outbound POST
 * - Inbound transport message → store.restore()
 * - Feedback loop prevention
 * - Config validation
 * - destroy() cleanup
 *
 * @see Design Choices S9–S12
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { EnterstellarStore, SyncConfig, SerializedState } from '@enterstellar-ai/types';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createStoreSyncRuntime } from '../src/store-sync.js';

// ---------------------------------------------------------------------------
// WebSocket Mock (class-based — constructable via `new`)
// ---------------------------------------------------------------------------

/** Captures the most recently constructed mock socket. */
let mockSocket: InstanceType<typeof MockWebSocket>;

class MockWebSocket {
    static readonly OPEN = 1;
    static readonly CLOSED = 3;
    static readonly CONNECTING = 0;
    static readonly CLOSING = 2;

    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    close = vi.fn();
    send = vi.fn();
    readyState = 0;

    constructor(_url: string | URL, _protocols?: string | string[]) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- intentional capture
        mockSocket = this;
        // Simulate WS connection opening.
        setTimeout(() => {
            this.readyState = 1;
            this.onopen?.();
        }, 0);
    }
}

// ---------------------------------------------------------------------------
// EnterstellarStore Mock
// ---------------------------------------------------------------------------

/** Creates a minimal mock `EnterstellarStore` for testing. */
function createMockStore(): EnterstellarStore & {
    _triggerSubscribers: () => void;
    _subscribeCallbacks: Array<() => void>;
} {
    const subscribeCallbacks: Array<() => void> = [];

    const mockSnapshot: SerializedState = {
        schemaVersion: '1.0.0',
        zones: {},
        traceIds: [],
        session: { id: 'test-session', startedAt: new Date().toISOString() },
        extensions: {},
    };

    return {
        _subscribeCallbacks: subscribeCallbacks,
        _triggerSubscribers: () => {
            for (const cb of subscribeCallbacks) {
                cb();
            }
        },

        get: vi.fn(() => undefined),
        set: vi.fn(),
        subscribe: vi.fn((callback: () => void) => {
            subscribeCallbacks.push(callback);
            return () => {
                const idx = subscribeCallbacks.indexOf(callback);
                if (idx !== -1) {
                    subscribeCallbacks.splice(idx, 1);
                }
            };
        }),
        extend: vi.fn(),
        snapshot: vi.fn(() => mockSnapshot),
        restore: vi.fn(),
        registerMigration: vi.fn(),
        getSnapshot: vi.fn(() => mockSnapshot),
        destroy: vi.fn(),
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_SYNC_CONFIG: SyncConfig = {
    enabled: true,
    endpoint: 'https://sync.example.com/state',
    debounceMs: 100,
};

const VALID_REMOTE_STATE: SerializedState = {
    schemaVersion: '1.0.0',
    zones: { 'test-zone': { name: 'test-zone', lifecycleState: 'ready', determinism: 1.0, lastUpdated: new Date().toISOString() } },
    traceIds: ['trace-1'],
    session: { id: 'remote-session', startedAt: new Date().toISOString() },
    extensions: {},
};

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: () => Promise.resolve(body),
        headers: new Headers(),
        redirected: false,
        statusText: ok ? 'OK' : 'Error',
        type: 'basic',
        url: '',
        clone: () => mockFetchResponse(body, ok, status),
        body: null,
        bodyUsed: false,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve(JSON.stringify(body)),
        bytes: () => Promise.resolve(new Uint8Array()),
    } as Response;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(VALID_REMOTE_STATE)));
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createStoreSyncRuntime', () => {
    describe('config validation', () => {
        it('should throw ENS-3001 if sync is not enabled', async () => {
            const store = createMockStore();

            await expect(
                createStoreSyncRuntime(store, { ...DEFAULT_SYNC_CONFIG, enabled: false }),
            ).rejects.toThrow(EnterstellarError);
        });

        it('should throw ENS-3001 if endpoint is empty', async () => {
            const store = createMockStore();

            await expect(
                createStoreSyncRuntime(store, { ...DEFAULT_SYNC_CONFIG, endpoint: '' }),
            ).rejects.toThrow(EnterstellarError);
        });
    });

    describe('initial state fetch', () => {
        it('should fetch initial state via REST GET and restore', async () => {
            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            expect(fetch).toHaveBeenCalledWith('https://sync.example.com/state');
            expect(store.restore).toHaveBeenCalledWith(VALID_REMOTE_STATE);

            runtime.destroy();
        });

        it('should NOT throw if initial fetch fails (non-fatal)', async () => {
            vi.stubGlobal('fetch', vi.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValue(mockFetchResponse([])),
            );
            // Re-stub WebSocket since we unstubbed everything.
            vi.stubGlobal('WebSocket', MockWebSocket);

            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);

            // Should not throw — initial fetch failure is non-fatal.
            await expect(connectPromise).resolves.toBeDefined();
            expect(store.restore).not.toHaveBeenCalled();

            const runtime = await connectPromise;
            runtime.destroy();
        });

        it('should NOT restore if response lacks schemaVersion', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
                mockFetchResponse({ notAState: true }),
            ));
            vi.stubGlobal('WebSocket', MockWebSocket);

            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            expect(store.restore).not.toHaveBeenCalled();

            runtime.destroy();
        });
    });

    describe('outbound push (store change → POST)', () => {
        it('should POST store snapshot on change after debounce', async () => {
            const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(VALID_REMOTE_STATE));
            vi.stubGlobal('fetch', fetchMock);
            vi.stubGlobal('WebSocket', MockWebSocket);

            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            // Reset fetch calls from initial connect.
            fetchMock.mockClear();
            fetchMock.mockResolvedValue(mockFetchResponse({ ok: true }));

            // Trigger a store change.
            store._triggerSubscribers();

            // Before debounce expires — no POST yet.
            expect(fetchMock).not.toHaveBeenCalled();

            // Advance past debounce (100ms).
            await vi.advanceTimersByTimeAsync(150);

            expect(fetchMock).toHaveBeenCalledWith(
                'https://sync.example.com/state',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }),
            );

            runtime.destroy();
        });

        it('should debounce rapid changes into a single POST', async () => {
            const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(VALID_REMOTE_STATE));
            vi.stubGlobal('fetch', fetchMock);
            vi.stubGlobal('WebSocket', MockWebSocket);

            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            fetchMock.mockClear();
            fetchMock.mockResolvedValue(mockFetchResponse({ ok: true }));

            // Rapid-fire 5 changes within the debounce window.
            store._triggerSubscribers();
            await vi.advanceTimersByTimeAsync(20);
            store._triggerSubscribers();
            await vi.advanceTimersByTimeAsync(20);
            store._triggerSubscribers();
            await vi.advanceTimersByTimeAsync(20);
            store._triggerSubscribers();
            await vi.advanceTimersByTimeAsync(20);
            store._triggerSubscribers();

            // Advance past the last debounce.
            await vi.advanceTimersByTimeAsync(150);

            // Should only POST once — the last debounced call.
            expect(fetchMock).toHaveBeenCalledTimes(1);

            runtime.destroy();
        });
    });

    describe('inbound pull (transport message → restore)', () => {
        it('should restore store when transport receives a valid state', async () => {
            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            // Reset the restore call from initial fetch.
            (store.restore as ReturnType<typeof vi.fn>).mockClear();

            // Simulate inbound state via WebSocket.
            const inboundState: SerializedState = {
                ...VALID_REMOTE_STATE,
                traceIds: ['trace-inbound-1'],
            };

            mockSocket.onmessage?.({
                data: JSON.stringify(inboundState),
            });

            expect(store.restore).toHaveBeenCalledWith(inboundState);

            runtime.destroy();
        });

        it('should NOT restore if inbound message lacks schemaVersion', async () => {
            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            (store.restore as ReturnType<typeof vi.fn>).mockClear();

            // Simulate non-state message.
            mockSocket.onmessage?.({
                data: JSON.stringify({ type: 'ping' }),
            });

            expect(store.restore).not.toHaveBeenCalled();

            runtime.destroy();
        });
    });

    describe('feedback loop prevention', () => {
        it('should NOT push state back to server after an inbound restore', async () => {
            const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse(VALID_REMOTE_STATE));
            vi.stubGlobal('fetch', fetchMock);
            vi.stubGlobal('WebSocket', MockWebSocket);

            const store = createMockStore();

            // Make restore() trigger subscribers (as a real store would).
            (store.restore as ReturnType<typeof vi.fn>).mockImplementation(() => {
                store._triggerSubscribers();
            });

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            fetchMock.mockClear();
            fetchMock.mockResolvedValue(mockFetchResponse({ ok: true }));

            // Simulate inbound state — this triggers store.restore() which
            // triggers store.subscribe() callback. The feedback loop guard
            // should suppress the outbound push.
            mockSocket.onmessage?.({
                data: JSON.stringify(VALID_REMOTE_STATE),
            });

            // Advance past debounce.
            await vi.advanceTimersByTimeAsync(200);

            // No outbound POST should have been made (feedback loop prevented).
            expect(fetchMock).not.toHaveBeenCalled();

            runtime.destroy();
        });
    });

    describe('destroy()', () => {
        it('should unsubscribe from store, clear timers, and disconnect transport', async () => {
            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            expect(runtime.connected).toBe(true);

            runtime.destroy();

            expect(runtime.connected).toBe(false);
            // Verify unsubscribe was effective — store callbacks should be empty.
            expect(store._subscribeCallbacks).toHaveLength(0);
        });

        it('should be safe to call multiple times', async () => {
            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            runtime.destroy();
            expect(() => runtime.destroy()).not.toThrow();
        });
    });

    describe('connected property', () => {
        it('should reflect transport connection state', async () => {
            const store = createMockStore();

            const connectPromise = createStoreSyncRuntime(store, DEFAULT_SYNC_CONFIG);
            await vi.advanceTimersByTimeAsync(10);
            const runtime = await connectPromise;

            expect(runtime.connected).toBe(true);

            runtime.destroy();

            expect(runtime.connected).toBe(false);
        });
    });
});
