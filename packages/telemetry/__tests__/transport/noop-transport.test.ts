/**
 * @module @enterstellar-ai/telemetry/__tests__/transport/noop-transport
 * @description Tests for the no-op transport (enterprise opt-out).
 *
 * Verifies it always succeeds, never includes statusCode or retryAfterMs,
 * and returns a frozen singleton result per TL9.
 */

import { describe, expect, it } from 'vitest';

import type { ForgeSignal } from '@enterstellar-ai/types';

import { createNoopTransport } from '../../src/transport/noop-transport.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createStubSignal(intentHash: string): ForgeSignal {
    return {
        intentHash,
        componentName: 'TestComponent',
        intentCategory: 'clinical',
        compilationStatus: 'pass',
        forgeMode: 'none',
        forgeUsed: false,
        latencyMs: 10,
        selfCorrectionAttempts: 0,
        correctionTokensUsed: 0,
        timestamp: new Date().toISOString(),
        sdkVersion: '0.1.0',
        registrySize: 5,
        platform: 'web',
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createNoopTransport', () => {
    it('returns success for every send call', async () => {
        const transport = createNoopTransport();

        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.success).toBe(true);
    });

    it('returns success for empty batches', async () => {
        const transport = createNoopTransport();

        const result = await transport.send([]);

        expect(result.success).toBe(true);
    });

    it('returns success for large batches', async () => {
        const transport = createNoopTransport();
        const largeBatch = Array.from({ length: 500 }, (_, i) =>
            createStubSignal(`signal-${String(i)}`),
        );

        const result = await transport.send(largeBatch);

        expect(result.success).toBe(true);
    });

    it('does not include statusCode or retryAfterMs', async () => {
        const transport = createNoopTransport();

        const result = await transport.send([createStubSignal('aaa')]);

        expect(result.statusCode).toBeUndefined();
        expect(result.retryAfterMs).toBeUndefined();
    });

    it('returns the same result object (frozen singleton)', async () => {
        const transport = createNoopTransport();

        const result1 = await transport.send([createStubSignal('a')]);
        const result2 = await transport.send([createStubSignal('b')]);

        expect(result1).toBe(result2); // Same reference
        expect(Object.isFrozen(result1)).toBe(true);
    });
});
