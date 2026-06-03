/**
 * @module @enterstellar-ai/cloud/__tests__/anonymous-mode.test
 * @description Focused tests for anonymous mode (`pk_anon_*` API keys).
 *
 * Covers:
 * - `submitSignal()` is the ONLY method available in anonymous mode (SD1, SD4).
 * - All 12 other methods throw `CloudError` `ENS-5004` (non-recoverable).
 * - `forge.stream()` also throws `ENS-5004`.
 * - `dispose()` never throws — always allowed in anonymous mode.
 * - Error message includes the method name that was called.
 *
 * @see Design Choice SD1 — anonymous mode: `pk_anon_` prefix auto-detection.
 * @see Design Choice SD4 — `@enterstellar-ai/telemetry` uses SDK with `pk_anon_*`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEnterstellarCloudClient } from '../src/create-cloud-client.js';
import { CloudError } from '../src/errors.js';
import type { EnterstellarCloudClient } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('@enterstellar-ai/cloud — Anonymous Mode (SD1)', () => {
    let client: EnterstellarCloudClient;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        client = createEnterstellarCloudClient({ apiKey: 'pk_anon_install_abc123' });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // submitSignal() — Allowed (SD1, SD4)
    // -----------------------------------------------------------------------

    describe('submitSignal() — Allowed', () => {
        it('submitSignal() succeeds in anonymous mode', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Headers({
                    'X-IPU-Used': '0',
                    'X-IPU-Remaining': '0',
                    'X-IPU-Cost': '0',
                }),
                json: vi.fn().mockResolvedValue({ accepted: true }),
                text: vi.fn().mockResolvedValue('{"accepted":true}'),
            } as unknown as Response);

            const signal = {
                intentHash: 'sha256_test',
                componentName: 'TestCard',
                resolved: true,
                timestamp: Date.now(),
            } as never;

            // Should NOT throw — submitSignal is the only allowed method.
            const result = await client.submitSignal(signal);
            expect(result.data.accepted).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // All Other Methods — Throw ENS-5004
    // -----------------------------------------------------------------------

    describe('All Other Methods — Throw ENS-5004', () => {
        /**
         * Helper that verifies a method throws CloudError ENS-5004.
         */
        async function expectAUR5004(
            fn: () => Promise<unknown>,
            methodName: string,
        ): Promise<void> {
            try {
                await fn();
                expect.fail(`${methodName} should have thrown CloudError`);
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(CloudError);
                const cloudError = error as CloudError;
                expect(cloudError.code).toBe('ENS-5004');
                expect(cloudError.cloudCode).toBe('ENS-5004');
                expect(cloudError.recoverable).toBe(false);
                expect(cloudError.message).toContain(methodName);
            }
        }

        it('forge() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.forge({ intent: 'show vitals' }),
                'forge',
            );
        });

        it('forge.stream() throws ENS-5004', () => {
            // forge.stream is synchronous — throws immediately.
            expect(() => {
                client.forge.stream({ intent: 'show vitals' });
            }).toThrow(CloudError);

            try {
                client.forge.stream({ intent: 'show vitals' });
            } catch (error: unknown) {
                const cloudError = error as CloudError;
                expect(cloudError.code).toBe('ENS-5004');
            }
        });

        it('search() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.search('patient vitals'),
                'search',
            );
        });

        it('route() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.route('abcdef123456'),
                'route',
            );
        });

        it('routeBatch() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.routeBatch(['hash_a', 'hash_b']),
                'routeBatch',
            );
        });

        it('submitTrace() throws ENS-5004', async () => {
            const trace = {
                consent: { anonymizedAggregation: true },
            } as never;

            await expectAUR5004(
                () => client.submitTrace(trace),
                'submitTrace',
            );
        });

        it('getTraces() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.getTraces(),
                'getTraces',
            );
        });

        it('analytics() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.analytics({ queryType: 'intent_patterns' }),
                'analytics',
            );
        });

        it('businessAnalytics() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.businessAnalytics({ queryType: 'anomalies' }),
                'businessAnalytics',
            );
        });

        it('getUsage() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.getUsage(),
                'getUsage',
            );
        });

        it('getLedger() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.getLedger(),
                'getLedger',
            );
        });

        it('certify() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.certify('comp_01HYX'),
                'certify',
            );
        });

        it('deleteProjectData() throws ENS-5004', async () => {
            await expectAUR5004(
                () => client.deleteProjectData('proj_01'),
                'deleteProjectData',
            );
        });
    });

    // -----------------------------------------------------------------------
    // dispose() — Always Allowed
    // -----------------------------------------------------------------------

    describe('dispose() — Always Allowed', () => {
        it('dispose() does NOT throw in anonymous mode', () => {
            expect(() => { client.dispose(); }).not.toThrow();
        });

        it('dispose() is idempotent in anonymous mode', () => {
            client.dispose();
            expect(() => { client.dispose(); }).not.toThrow();
        });
    });

    // -----------------------------------------------------------------------
    // Fetch Not Called for Blocked Methods
    // -----------------------------------------------------------------------

    describe('No Network Calls for Blocked Methods', () => {
        it('fetch is NOT called when anonymous method throws', async () => {
            try {
                await client.forge({ intent: 'test' });
            } catch {
                // Expected.
            }

            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});
