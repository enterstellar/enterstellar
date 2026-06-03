/**
 * @module @enterstellar-ai/connection/__tests__/websocket-transport.test
 * @description Unit tests for `createWebSocketTransport()`.
 *
 * Uses class-based mock for the global `WebSocket` API to test connect,
 * send, receive, disconnect, timeout, and error handling.
 *
 * @see Design Choice S11 — WebSocket with 1s timeout for auto mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import { createWebSocketTransport } from '../src/transports/websocket-transport.js';

// ---------------------------------------------------------------------------
// WebSocket Mock (class-based — constructable via `new`)
// ---------------------------------------------------------------------------

/** Captures the most recently constructed mock socket for test assertions. */
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
    readyState = 0; // CONNECTING

    constructor(_url: string | URL, _protocols?: string | string[]) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- intentional capture for test assertions
        mockSocket = this;
    }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createWebSocketTransport', () => {
    it('should create a transport object', () => {
        const ws = createWebSocketTransport('wss://test.example.com');

        expect(ws).toBeDefined();
        expect(typeof ws.connect).toBe('function');
        expect(typeof ws.send).toBe('function');
        expect(typeof ws.disconnect).toBe('function');
        expect(ws.connected).toBe(false);
    });

    describe('connect()', () => {
        it('should resolve when WebSocket opens', async () => {
            const ws = createWebSocketTransport('wss://test.example.com');
            const connectPromise = ws.connect();

            // Simulate open.
            mockSocket.readyState = 1;
            mockSocket.onopen?.();

            await expect(connectPromise).resolves.toBeUndefined();
            expect(ws.connected).toBe(true);
        });

        it('should reject on timeout', async () => {
            const ws = createWebSocketTransport('wss://test.example.com', 1_000);
            const connectPromise = ws.connect();

            // Advance past the timeout without firing onopen.
            vi.advanceTimersByTime(1_100);

            await expect(connectPromise).rejects.toThrow(EnterstellarError);
            await expect(connectPromise).rejects.toThrow('timed out');
        });

        it('should reject if WebSocket constructor throws', async () => {
            // Override mock to throw.
            vi.stubGlobal(
                'WebSocket',
                class FailingWebSocket {
                    static readonly OPEN = 1;
                    constructor() {
                        throw new Error('Connection refused');
                    }
                },
            );

            const ws = createWebSocketTransport('wss://test.example.com');
            await expect(ws.connect()).rejects.toThrow(EnterstellarError);
        });
    });

    describe('send()', () => {
        it('should send data through the WebSocket', async () => {
            const ws = createWebSocketTransport('wss://test.example.com');
            const connectPromise = ws.connect();
            mockSocket.readyState = 1;
            mockSocket.onopen?.();
            await connectPromise;

            ws.send('{"type":"test"}');
            expect(mockSocket.send).toHaveBeenCalledWith('{"type":"test"}');
        });

        it('should throw ENS-3004 when not connected', () => {
            const ws = createWebSocketTransport('wss://test.example.com');

            expect(() => ws.send('data')).toThrow(EnterstellarError);
            expect(() => ws.send('data')).toThrow('not connected');
        });
    });

    describe('onMessage()', () => {
        it('should invoke handler with parsed JSON', async () => {
            const ws = createWebSocketTransport('wss://test.example.com');
            const handler = vi.fn();
            ws.onMessage(handler);

            const connectPromise = ws.connect();
            mockSocket.readyState = 1;
            mockSocket.onopen?.();
            await connectPromise;

            // Simulate inbound message.
            mockSocket.onmessage?.({ data: '{"type":"intent","payload":{}}' });

            expect(handler).toHaveBeenCalledWith({ type: 'intent', payload: {} });
        });

        it('should route JSON parse errors to error handlers', async () => {
            const ws = createWebSocketTransport('wss://test.example.com');
            const errorHandler = vi.fn();
            ws.onError(errorHandler);

            const connectPromise = ws.connect();
            mockSocket.readyState = 1;
            mockSocket.onopen?.();
            await connectPromise;

            // Simulate malformed JSON.
            mockSocket.onmessage?.({ data: 'not json' });

            expect(errorHandler).toHaveBeenCalledOnce();
            const err = errorHandler.mock.calls[0]?.[0] as EnterstellarError;
            expect(err).toBeInstanceOf(EnterstellarError);
            expect(err.code).toBe('ENS-3005');
        });
    });

    describe('onClose()', () => {
        it('should invoke close handlers on unexpected close', async () => {
            const ws = createWebSocketTransport('wss://test.example.com');
            const closeHandler = vi.fn();
            ws.onClose(closeHandler);

            const connectPromise = ws.connect();
            mockSocket.readyState = 1;
            mockSocket.onopen?.();
            await connectPromise;

            // Simulate unexpected close.
            mockSocket.onclose?.();

            expect(closeHandler).toHaveBeenCalledOnce();
            expect(ws.connected).toBe(false);
        });

        it('should NOT invoke close handlers on intentional disconnect', async () => {
            const ws = createWebSocketTransport('wss://test.example.com');
            const closeHandler = vi.fn();
            ws.onClose(closeHandler);

            const connectPromise = ws.connect();
            mockSocket.readyState = 1;
            mockSocket.onopen?.();
            await connectPromise;

            ws.disconnect();

            // The onclose triggered by disconnect should NOT fire our handlers.
            mockSocket.onclose?.();

            expect(closeHandler).not.toHaveBeenCalled();
        });
    });

    describe('disconnect()', () => {
        it('should close the WebSocket with code 1000', async () => {
            const ws = createWebSocketTransport('wss://test.example.com');

            const connectPromise = ws.connect();
            mockSocket.readyState = 1;
            mockSocket.onopen?.();
            await connectPromise;

            ws.disconnect();

            expect(mockSocket.close).toHaveBeenCalledWith(1000, 'Enterstellar disconnect');
            expect(ws.connected).toBe(false);
        });

        it('should be safe to call when not connected', () => {
            const ws = createWebSocketTransport('wss://test.example.com');

            expect(() => ws.disconnect()).not.toThrow();
        });
    });
});
