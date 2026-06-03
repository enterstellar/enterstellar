/**
 * @module @enterstellar-ai/connection/__tests__/polling-transport.test
 * @description Unit tests for `createPollingTransport()`.
 *
 * Mocks the global `fetch` API to test connect (initial GET verification),
 * periodic polling, send (POST dispatch), disconnect, and error handling.
 *
 * @see Design Choice S11 — Polling as last-resort 3rd tier fallback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import { createPollingTransport } from '../src/transports/polling-transport.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `Response` object for `fetch`.
 */
function mockResponse(options: {
    ok?: boolean;
    status?: number;
    body?: unknown;
}): Response {
    const { ok = true, status = 200, body = [] } = options;
    return {
        ok,
        status,
        json: () => Promise.resolve(body),
        headers: new Headers(),
        redirected: false,
        statusText: ok ? 'OK' : 'Error',
        type: 'basic',
        url: '',
        clone: () => mockResponse(options),
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ ok: true, body: [] })));
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

describe('createPollingTransport', () => {
    it('should create a transport object', () => {
        const poll = createPollingTransport('https://test.example.com/poll');

        expect(poll).toBeDefined();
        expect(typeof poll.connect).toBe('function');
        expect(typeof poll.send).toBe('function');
        expect(typeof poll.disconnect).toBe('function');
        expect(poll.connected).toBe(false);
    });

    describe('connect()', () => {
        it('should resolve when initial GET succeeds', async () => {
            const poll = createPollingTransport('https://test.example.com/poll', 30_000);

            await expect(poll.connect()).resolves.toBeUndefined();
            expect(poll.connected).toBe(true);
            expect(fetch).toHaveBeenCalledWith('https://test.example.com/poll');

            // Cleanup
            poll.disconnect();
        });

        it('should reject when initial GET returns non-OK status', async () => {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 503 })),
            );

            const poll = createPollingTransport('https://test.example.com/poll');

            await expect(poll.connect()).rejects.toThrow(EnterstellarError);
            await expect(
                createPollingTransport('https://test.example.com/poll').connect(),
            ).rejects.toThrow('503');
            expect(poll.connected).toBe(false);
        });

        it('should reject when initial GET throws a network error', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('DNS failure')));

            const poll = createPollingTransport('https://test.example.com/poll');

            await expect(poll.connect()).rejects.toThrow(EnterstellarError);
            await expect(
                createPollingTransport('https://test.example.com/poll').connect(),
            ).rejects.toThrow('unreachable');
            expect(poll.connected).toBe(false);
        });
    });

    describe('polling cycle', () => {
        it('should invoke message handlers with parsed poll results', async () => {
            const messages = [
                { type: 'intent', payload: { component: 'Card' } },
                { type: 'message', payload: 'hello' },
            ];

            // Initial connect returns empty, subsequent polls return messages.
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(mockResponse({ ok: true, body: [] }))
                .mockResolvedValueOnce(mockResponse({ ok: true, body: messages }));
            vi.stubGlobal('fetch', fetchMock);

            const poll = createPollingTransport('https://test.example.com/poll', 5_000);
            const handler = vi.fn();
            poll.onMessage(handler);

            await poll.connect();

            // Advance past one polling interval.
            await vi.advanceTimersByTimeAsync(5_100);

            expect(handler).toHaveBeenCalledTimes(2);
            expect(handler).toHaveBeenCalledWith(messages[0]);
            expect(handler).toHaveBeenCalledWith(messages[1]);

            poll.disconnect();
        });

        it('should handle single-object responses by wrapping in array', async () => {
            const singleMessage = { type: 'data', payload: { value: 42 } };

            const fetchMock = vi.fn()
                .mockResolvedValueOnce(mockResponse({ ok: true, body: [] }))
                .mockResolvedValueOnce(mockResponse({ ok: true, body: singleMessage }));
            vi.stubGlobal('fetch', fetchMock);

            const poll = createPollingTransport('https://test.example.com/poll', 5_000);
            const handler = vi.fn();
            poll.onMessage(handler);

            await poll.connect();
            await vi.advanceTimersByTimeAsync(5_100);

            expect(handler).toHaveBeenCalledOnce();
            expect(handler).toHaveBeenCalledWith(singleMessage);

            poll.disconnect();
        });

        it('should route poll HTTP errors to error handlers without stopping', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(mockResponse({ ok: true, body: [] }))
                .mockResolvedValueOnce(mockResponse({ ok: false, status: 500 }))
                .mockResolvedValueOnce(mockResponse({ ok: true, body: [{ type: 'message', payload: 'recovered' }] }));
            vi.stubGlobal('fetch', fetchMock);

            const poll = createPollingTransport('https://test.example.com/poll', 5_000);
            const errorHandler = vi.fn();
            const messageHandler = vi.fn();
            poll.onError(errorHandler);
            poll.onMessage(messageHandler);

            await poll.connect();

            // First poll fails with 500.
            await vi.advanceTimersByTimeAsync(5_100);
            expect(errorHandler).toHaveBeenCalledOnce();
            const err = errorHandler.mock.calls[0]?.[0] as EnterstellarError;
            expect(err).toBeInstanceOf(EnterstellarError);
            expect(err.code).toBe('ENS-3003');

            // Second poll succeeds — loop continued despite prior failure.
            await vi.advanceTimersByTimeAsync(5_000);
            expect(messageHandler).toHaveBeenCalledOnce();

            poll.disconnect();
        });

        it('should route JSON parse errors to error handlers', async () => {
            const badResponse = {
                ok: true,
                status: 200,
                json: () => Promise.reject(new SyntaxError('Unexpected token')),
                headers: new Headers(),
                redirected: false,
                statusText: 'OK',
                type: 'basic',
                url: '',
                clone: () => badResponse,
                body: null,
                bodyUsed: false,
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
                blob: () => Promise.resolve(new Blob()),
                formData: () => Promise.resolve(new FormData()),
                text: () => Promise.resolve('not-json'),
                bytes: () => Promise.resolve(new Uint8Array()),
            } as Response;

            const fetchMock = vi.fn()
                .mockResolvedValueOnce(mockResponse({ ok: true, body: [] }))
                .mockResolvedValueOnce(badResponse);
            vi.stubGlobal('fetch', fetchMock);

            const poll = createPollingTransport('https://test.example.com/poll', 5_000);
            const errorHandler = vi.fn();
            poll.onError(errorHandler);

            await poll.connect();
            await vi.advanceTimersByTimeAsync(5_100);

            expect(errorHandler).toHaveBeenCalledOnce();
            const err = errorHandler.mock.calls[0]?.[0] as EnterstellarError;
            expect(err).toBeInstanceOf(EnterstellarError);
            expect(err.code).toBe('ENS-3005');

            poll.disconnect();
        });

        it('should route network errors during poll to error handlers', async () => {
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(mockResponse({ ok: true, body: [] }))
                .mockRejectedValueOnce(new Error('Network lost'));
            vi.stubGlobal('fetch', fetchMock);

            const poll = createPollingTransport('https://test.example.com/poll', 5_000);
            const errorHandler = vi.fn();
            poll.onError(errorHandler);

            await poll.connect();
            await vi.advanceTimersByTimeAsync(5_100);

            expect(errorHandler).toHaveBeenCalledOnce();
            const err = errorHandler.mock.calls[0]?.[0] as EnterstellarError;
            expect(err).toBeInstanceOf(EnterstellarError);
            expect(err.code).toBe('ENS-3003');

            poll.disconnect();
        });
    });

    describe('send()', () => {
        it('should POST to the dispatch endpoint', async () => {
            const poll = createPollingTransport('https://test.example.com/poll');
            await poll.connect();

            poll.send('{"signal":"test"}');

            expect(fetch).toHaveBeenCalledWith(
                'https://test.example.com/poll/dispatch',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{"signal":"test"}',
                },
            );

            poll.disconnect();
        });

        it('should throw ENS-3004 when not connected', () => {
            const poll = createPollingTransport('https://test.example.com/poll');

            expect(() => poll.send('data')).toThrow(EnterstellarError);
            expect(() => poll.send('data')).toThrow('not connected');
        });

        it('should route fetch errors on send to error handlers', async () => {
            // Connect succeeds, but subsequent fetch calls fail.
            const fetchMock = vi.fn()
                .mockResolvedValueOnce(mockResponse({ ok: true, body: [] }))
                .mockRejectedValueOnce(new Error('POST failed'));
            vi.stubGlobal('fetch', fetchMock);

            const poll = createPollingTransport('https://test.example.com/poll');
            const errorHandler = vi.fn();
            poll.onError(errorHandler);
            await poll.connect();

            poll.send('data');

            // Allow the rejected promise to settle.
            await vi.advanceTimersByTimeAsync(0);

            expect(errorHandler).toHaveBeenCalledOnce();
            const err = errorHandler.mock.calls[0]?.[0] as EnterstellarError;
            expect(err).toBeInstanceOf(EnterstellarError);
            expect(err.code).toBe('ENS-3004');

            poll.disconnect();
        });
    });

    describe('disconnect()', () => {
        it('should stop the polling interval', async () => {
            const poll = createPollingTransport('https://test.example.com/poll', 5_000);
            await poll.connect();

            poll.disconnect();

            // Verify fetch is only called once (the initial connect GET).
            const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
            await vi.advanceTimersByTimeAsync(10_000);
            const callsAfter = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

            expect(callsAfter).toBe(callsBefore); // No new fetch calls — interval cleared.
            expect(poll.connected).toBe(false);
        });

        it('should be safe to call when not connected', () => {
            const poll = createPollingTransport('https://test.example.com/poll');

            expect(() => poll.disconnect()).not.toThrow();
        });

        it('should be safe to call multiple times', async () => {
            const poll = createPollingTransport('https://test.example.com/poll');
            await poll.connect();

            poll.disconnect();
            expect(() => poll.disconnect()).not.toThrow();
        });
    });
});
