/**
 * @module @enterstellar-ai/connection/__tests__/sse-transport.test
 * @description Unit tests for `createSSETransport()`.
 *
 * Uses class-based mock for the global `EventSource` and `fetch` APIs
 * to test connect, receive, send (POST), disconnect, timeout, and error handling.
 *
 * @see Design Choice S11 — SSE as second-tier fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import { createSSETransport } from '../src/transports/sse-transport.js';

// ---------------------------------------------------------------------------
// EventSource Mock (class-based — constructable via `new`)
// ---------------------------------------------------------------------------

/** Captures the most recently constructed mock source for test assertions. */
let mockSource: InstanceType<typeof MockEventSource>;

class MockEventSource {
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    static readonly CONNECTING = 0;

    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    close = vi.fn();
    readyState = 0; // CONNECTING
    url: string;

    constructor(url: string | URL) {
        this.url = String(url);
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- intentional capture for test assertions
        mockSource = this;
    }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
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

describe('createSSETransport', () => {
    it('should create a transport object', () => {
        const sse = createSSETransport('https://test.example.com/events');

        expect(sse).toBeDefined();
        expect(typeof sse.connect).toBe('function');
        expect(typeof sse.send).toBe('function');
        expect(typeof sse.disconnect).toBe('function');
        expect(sse.connected).toBe(false);
    });

    describe('connect()', () => {
        it('should resolve when EventSource opens', async () => {
            const sse = createSSETransport('https://test.example.com/events');
            const connectPromise = sse.connect();

            // Simulate open.
            mockSource.readyState = 1;
            mockSource.onopen?.();

            await expect(connectPromise).resolves.toBeUndefined();
            expect(sse.connected).toBe(true);
        });

        it('should reject on timeout', async () => {
            const sse = createSSETransport('https://test.example.com/events', 1_000);
            const connectPromise = sse.connect();

            vi.advanceTimersByTime(1_100);

            await expect(connectPromise).rejects.toThrow(EnterstellarError);
            await expect(connectPromise).rejects.toThrow('timed out');
        });

        it('should reject if EventSource constructor throws', async () => {
            vi.stubGlobal(
                'EventSource',
                class FailingEventSource {
                    static readonly OPEN = 1;
                    constructor() {
                        throw new Error('SSE not supported');
                    }
                },
            );

            const sse = createSSETransport('https://test.example.com/events');
            await expect(sse.connect()).rejects.toThrow(EnterstellarError);
        });
    });

    describe('receive (onMessage)', () => {
        it('should invoke handler with parsed JSON on message', async () => {
            const sse = createSSETransport('https://test.example.com/events');
            const handler = vi.fn();
            sse.onMessage(handler);

            const connectPromise = sse.connect();
            mockSource.readyState = 1;
            mockSource.onopen?.();
            await connectPromise;

            mockSource.onmessage?.({ data: '{"type":"intent","payload":{}}' });

            expect(handler).toHaveBeenCalledWith({ type: 'intent', payload: {} });
        });

        it('should route JSON parse errors to error handlers', async () => {
            const sse = createSSETransport('https://test.example.com/events');
            const errorHandler = vi.fn();
            sse.onError(errorHandler);

            const connectPromise = sse.connect();
            mockSource.readyState = 1;
            mockSource.onopen?.();
            await connectPromise;

            mockSource.onmessage?.({ data: 'not-json' });

            expect(errorHandler).toHaveBeenCalledOnce();
            const err = errorHandler.mock.calls[0]?.[0] as EnterstellarError;
            expect(err).toBeInstanceOf(EnterstellarError);
            expect(err.code).toBe('ENS-3005');
        });
    });

    describe('send() via POST', () => {
        it('should POST to the dispatch endpoint', async () => {
            const sse = createSSETransport('https://test.example.com/events');

            const connectPromise = sse.connect();
            mockSource.readyState = 1;
            mockSource.onopen?.();
            await connectPromise;

            sse.send('{"signal":"test"}');

            expect(fetch).toHaveBeenCalledWith(
                'https://test.example.com/events/dispatch',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{"signal":"test"}',
                },
            );
        });

        it('should throw ENS-3004 when not connected', () => {
            const sse = createSSETransport('https://test.example.com/events');

            expect(() => sse.send('data')).toThrow(EnterstellarError);
            expect(() => sse.send('data')).toThrow('not connected');
        });

        it('should route fetch errors to error handlers', async () => {
            const fetchError = new Error('Network error');
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(fetchError));

            const sse = createSSETransport('https://test.example.com/events');
            const errorHandler = vi.fn();
            sse.onError(errorHandler);

            const connectPromise = sse.connect();
            mockSource.readyState = 1;
            mockSource.onopen?.();
            await connectPromise;

            sse.send('data');

            // Allow the rejected promise to settle.
            await vi.advanceTimersByTimeAsync(0);

            expect(errorHandler).toHaveBeenCalledOnce();
            const err = errorHandler.mock.calls[0]?.[0] as EnterstellarError;
            expect(err).toBeInstanceOf(EnterstellarError);
            expect(err.code).toBe('ENS-3004');
        });
    });

    describe('onerror (unexpected close)', () => {
        it('should invoke error and close handlers on EventSource error', async () => {
            const sse = createSSETransport('https://test.example.com/events');
            const errorHandler = vi.fn();
            const closeHandler = vi.fn();
            sse.onError(errorHandler);
            sse.onClose(closeHandler);

            const connectPromise = sse.connect();
            mockSource.readyState = 1;
            mockSource.onopen?.();
            await connectPromise;

            // Simulate error (connection loss).
            mockSource.onerror?.();

            expect(errorHandler).toHaveBeenCalledOnce();
            expect(closeHandler).toHaveBeenCalledOnce();
            expect(sse.connected).toBe(false);
        });
    });

    describe('disconnect()', () => {
        it('should close the EventSource', async () => {
            const sse = createSSETransport('https://test.example.com/events');

            const connectPromise = sse.connect();
            mockSource.readyState = 1;
            mockSource.onopen?.();
            await connectPromise;

            sse.disconnect();

            expect(mockSource.close).toHaveBeenCalled();
            expect(sse.connected).toBe(false);
        });

        it('should NOT invoke close handlers on intentional disconnect', async () => {
            const sse = createSSETransport('https://test.example.com/events');
            const closeHandler = vi.fn();
            sse.onClose(closeHandler);

            const connectPromise = sse.connect();
            mockSource.readyState = 1;
            mockSource.onopen?.();
            await connectPromise;

            sse.disconnect();

            // onerror fires after close — but should not trigger handlers.
            mockSource.onerror?.();

            expect(closeHandler).not.toHaveBeenCalled();
        });

        it('should be safe to call when not connected', () => {
            const sse = createSSETransport('https://test.example.com/events');

            expect(() => sse.disconnect()).not.toThrow();
        });
    });
});
