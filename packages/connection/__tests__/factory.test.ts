/**
 * @module @enterstellar-ai/connection/__tests__/factory.test
 * @description Integration tests for `createAgentConnection()`.
 *
 * Tests the full factory: config validation, transport selection,
 * auto fallback, dispatch with UserSignal validation,
 * on/onRawEvent subscription, and disconnect cleanup.
 *
 * Uses class-based mocks for `WebSocket`, `EventSource`, and `fetch`.
 *
 * @see Bible §4.3b
 * @see Design Choices P1, P5, P7, P11, P12, S11, RE3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';
import type { UserSignal } from '@enterstellar-ai/types';

import { createAgentConnection } from '../src/factory.js';

// ---------------------------------------------------------------------------
// WebSocket Mock (class-based — constructable via `new`)
// ---------------------------------------------------------------------------

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
        // Simulate connection opening in the next microtask.
        setTimeout(() => {
            this.readyState = 1;
            this.onopen?.();
        }, 0);
    }
}

// ---------------------------------------------------------------------------
// EventSource Mock (class-based — constructable via `new`)
// ---------------------------------------------------------------------------

let mockSource: InstanceType<typeof MockEventSource>;

class MockEventSource {
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    static readonly CONNECTING = 0;

    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    close = vi.fn();
    readyState = 0;

    constructor(_url: string | URL) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- intentional capture
        mockSource = this;
        setTimeout(() => {
            this.readyState = 1;
            this.onopen?.();
        }, 0);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a valid UserSignal for testing. */
function makeSignal(overrides?: Partial<UserSignal>): UserSignal {
    return {
        type: 'click',
        zone: 'test-zone',
        component: 'TestComponent',
        payload: {},
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.useFakeTimers();
    // Suppress expected console output in tests.
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

describe('createAgentConnection', () => {
    describe('config validation', () => {
        it('should throw ENS-3001 for missing URL', () => {
            expect(() =>
                createAgentConnection({ url: '' }),
            ).toThrow(EnterstellarError);
        });

        it('should throw ENS-3001 for invalid backpressure config', () => {
            expect(() =>
                createAgentConnection({
                    url: 'wss://test.example.com',
                    backpressure: { maxBuffer: -1 },
                }),
            ).toThrow(EnterstellarError);
        });

        it('should throw ENS-3001 for invalid reconnect config', () => {
            expect(() =>
                createAgentConnection({
                    url: 'wss://test.example.com',
                    reconnect: { maxDelay: 100 }, // below 1000ms minimum
                }),
            ).toThrow(EnterstellarError);
        });

        it('should accept valid config with defaults', () => {
            const conn = createAgentConnection({ url: 'wss://test.example.com' });

            expect(conn).toBeDefined();
            expect(typeof conn.dispatch).toBe('function');
            expect(typeof conn.on).toBe('function');
            expect(typeof conn.onRawEvent).toBe('function');
            expect(typeof conn.disconnect).toBe('function');
        });
    });

    describe('transport selection', () => {
        it('should create a WebSocket transport for transport: "websocket"', async () => {
            createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            // Allow initial connection to establish.
            await vi.advanceTimersByTimeAsync(10);

            // Verify a MockWebSocket was constructed (mockSocket is set).
            expect(mockSocket).toBeDefined();
        });

        it('should create an SSE transport for transport: "sse"', async () => {
            createAgentConnection({
                url: 'https://test.example.com/events',
                transport: 'sse',
            });

            await vi.advanceTimersByTimeAsync(10);

            // Verify a MockEventSource was constructed.
            expect(mockSource).toBeDefined();
        });

        it('should create a polling transport for transport: "polling"', async () => {
            const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
            vi.stubGlobal('fetch', fetchMock);

            createAgentConnection({
                url: 'https://test.example.com/poll',
                transport: 'polling',
            });

            await vi.advanceTimersByTimeAsync(10);

            // Polling transport uses fetch GET on connect — verify it was called.
            expect(fetchMock).toHaveBeenCalledWith('https://test.example.com/poll');
        });

        it('should try WebSocket first for transport: "auto"', async () => {
            createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'auto',
            });

            await vi.advanceTimersByTimeAsync(10);

            // Auto mode should try WebSocket first (3-tier: WS → SSE → polling).
            expect(mockSocket).toBeDefined();
        });
    });

    describe('dispatch()', () => {
        it('should serialize and send a valid UserSignal', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            // Wait for connection to establish.
            await vi.advanceTimersByTimeAsync(10);

            await conn.dispatch(makeSignal());

            expect(mockSocket.send).toHaveBeenCalledOnce();
            const sent = JSON.parse(mockSocket.send.mock.calls[0]?.[0] as string) as Record<string, unknown>;
            expect(sent['type']).toBe('click');
            expect(sent['zone']).toBe('test-zone');
        });

        it('should reject for an invalid UserSignal', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);

            // Missing required fields.
            await expect(
                conn.dispatch({
                    type: 'click',
                    zone: '',
                    component: 'Test',
                    payload: {},
                    timestamp: '',
                }),
            ).rejects.toThrow(EnterstellarError);
        });
    });

    describe('on() event subscription', () => {
        it('should return an unsubscribe function', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);

            const unsub = conn.on('intent', vi.fn());
            expect(typeof unsub).toBe('function');
            unsub();
        });

        it('should invoke handler when matching event is received', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);

            const handler = vi.fn();
            conn.on('message', handler);

            // Simulate inbound message from agent.
            mockSocket.onmessage?.({
                data: JSON.stringify({ type: 'message', payload: 'hello' }),
            });

            expect(handler).toHaveBeenCalledWith('hello');
        });

        it('should not invoke handler for unrelated events', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);

            const intentHandler = vi.fn();
            conn.on('intent', intentHandler);

            // Send a 'message' event, not 'intent'.
            mockSocket.onmessage?.({
                data: JSON.stringify({ type: 'message', payload: 'test' }),
            });

            expect(intentHandler).not.toHaveBeenCalled();
        });
    });

    describe('onRawEvent()', () => {
        it('should receive all raw events regardless of type', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);

            const rawHandler = vi.fn();
            conn.onRawEvent(rawHandler);

            // Send a whitelisted event.
            mockSocket.onmessage?.({
                data: JSON.stringify({ type: 'message', payload: 'hello' }),
            });

            // Send an unknown event (not in whitelist).
            mockSocket.onmessage?.({
                data: JSON.stringify({ type: 'unknown-internal', payload: {} }),
            });

            expect(rawHandler).toHaveBeenCalledTimes(2);
        });
    });

    describe('disconnect()', () => {
        it('should disconnect the transport and mark connected as false', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);
            expect(conn.connected).toBe(true);

            await conn.disconnect();

            expect(conn.connected).toBe(false);
            expect(mockSocket.close).toHaveBeenCalled();
        });

        it('should be safe to call multiple times', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);

            await conn.disconnect();
            await expect(conn.disconnect()).resolves.toBeUndefined();
        });
    });

    describe('connected property', () => {
        it('should be false before connection is established', () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            // Connection is async — not yet established.
            expect(conn.connected).toBe(false);
        });

        it('should be true after connection is established', async () => {
            const conn = createAgentConnection({
                url: 'wss://test.example.com',
                transport: 'websocket',
            });

            await vi.advanceTimersByTimeAsync(10);

            expect(conn.connected).toBe(true);
        });
    });
});
