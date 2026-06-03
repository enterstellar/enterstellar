/**
 * @module @enterstellar-ai/normalizer/__tests__/create-normalizer
 * @description Unit tests for `createNormalizer()` — the core factory.
 *
 * Tests the 5-step dispatch pipeline:
 * 1. Find matching adapter (first `canHandle()` → `true`)
 * 2. Call `normalize()` on matched adapter
 * 3. Propagate `null` return (no UI intent)
 * 4. Validate via `ComponentIntentSchema.safeParse()`
 * 5. Return validated `ComponentIntent`
 *
 * Error conditions:
 * - `ENS-6001` — No adapter matches
 * - `ENS-6002` — Adapter's `normalize()` throws
 * - `ENS-6003` — Assembled intent fails Zod validation
 *
 * @see Bible §4.9
 * @see Design Choice N3 — explicit factory
 */

import { describe, it, expect, vi } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';
import type { ComponentIntent } from '@enterstellar-ai/types';

import { createNormalizer } from '../src/create-normalizer.js';
import type { ProtocolNormalizer } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a minimal valid ComponentIntent. */
function createValidIntent(overrides?: Partial<ComponentIntent>): ComponentIntent {
    return {
        component: 'TestComponent',
        props: { key: 'value' },
        confidence: 0.9,
        ...overrides,
    };
}

/** Creates a mock adapter that handles everything and returns a fixed intent. */
function createMockAdapter(
    protocol: string,
    canHandle: boolean,
    result: ComponentIntent | null,
): ProtocolNormalizer {
    return {
        protocol: protocol as ProtocolNormalizer['protocol'],
        canHandle: vi.fn().mockReturnValue(canHandle),
        normalize: vi.fn().mockReturnValue(result),
    };
}

/** Creates a mock adapter whose normalize() throws. */
function createThrowingAdapter(protocol: string, error: Error): ProtocolNormalizer {
    return {
        protocol: protocol as ProtocolNormalizer['protocol'],
        canHandle: vi.fn().mockReturnValue(true),
        normalize: vi.fn().mockImplementation(() => {
            throw error;
        }),
    };
}

// ---------------------------------------------------------------------------
// Successful Dispatch
// ---------------------------------------------------------------------------

describe('createNormalizer — successful dispatch', () => {
    it('dispatches to the first matching adapter', () => {
        const intent = createValidIntent();
        const adapter1 = createMockAdapter('ag-ui', true, intent);
        const adapter2 = createMockAdapter('custom', true, intent);

        const normalize = createNormalizer({ adapters: [adapter1, adapter2] });
        const result = normalize({ type: 'tool_call_start' });

        expect(adapter1.canHandle).toHaveBeenCalled();
        expect(adapter1.normalize).toHaveBeenCalled();
        // Second adapter should NOT be called since first matched
        expect(adapter2.canHandle).not.toHaveBeenCalled();
        expect(adapter2.normalize).not.toHaveBeenCalled();
        expect(result).not.toBeNull();
        expect(result!.component).toBe('TestComponent');
    });

    it('skips adapters that cannot handle and uses the next match', () => {
        const intent = createValidIntent({ component: 'FromSecond' });
        const adapter1 = createMockAdapter('ag-ui', false, null);
        const adapter2 = createMockAdapter('custom', true, intent);

        const normalize = createNormalizer({ adapters: [adapter1, adapter2] });
        const result = normalize({ type: 'custom_event' });

        expect(adapter1.canHandle).toHaveBeenCalled();
        expect(adapter1.normalize).not.toHaveBeenCalled();
        expect(adapter2.canHandle).toHaveBeenCalled();
        expect(adapter2.normalize).toHaveBeenCalled();
        expect(result!.component).toBe('FromSecond');
    });

    it('returns a valid ComponentIntent with all fields', () => {
        const intent = createValidIntent({
            component: 'PatientVitals',
            props: { patientId: 'P-123' },
            confidence: 0.85,
            layout: 'stack',
            mode: 'detail',
            interaction: 'read-only',
        });
        const adapter = createMockAdapter('ag-ui', true, intent);

        const normalize = createNormalizer({ adapters: [adapter] });
        const result = normalize({});

        expect(result).not.toBeNull();
        expect(result!.component).toBe('PatientVitals');
        expect(result!.props).toEqual({ patientId: 'P-123' });
        expect(result!.confidence).toBe(0.85);
        expect(result!.layout).toBe('stack');
        expect(result!.mode).toBe('detail');
        expect(result!.interaction).toBe('read-only');
    });
});

// ---------------------------------------------------------------------------
// Null Propagation (Step 3)
// ---------------------------------------------------------------------------

describe('createNormalizer — null propagation', () => {
    it('returns null when adapter normalize() returns null', () => {
        const adapter = createMockAdapter('ag-ui', true, null);

        const normalize = createNormalizer({ adapters: [adapter] });
        const result = normalize({ type: 'run_started' });

        expect(adapter.normalize).toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it('does not validate when null is returned (no Zod call)', () => {
        const adapter = createMockAdapter('ag-ui', true, null);

        const normalize = createNormalizer({ adapters: [adapter] });
        const result = normalize({});

        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// ENS-6001: No Adapter Matches
// ---------------------------------------------------------------------------

describe('createNormalizer — ENS-6001 (no adapter matches)', () => {
    it('throws ENS-6001 when no adapter can handle the event', () => {
        const adapter = createMockAdapter('ag-ui', false, null);

        const normalize = createNormalizer({ adapters: [adapter] });

        expect(() => normalize({ type: 'unknown' })).toThrow(EnterstellarError);
        try {
            normalize({ type: 'unknown' });
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6001');
            expect(error.module).toBe('normalizer');
            expect(error.recoverable).toBe(false);
        }
    });

    it('throws ENS-6001 with empty adapter list', () => {
        const normalize = createNormalizer({ adapters: [] });

        expect(() => normalize({ type: 'anything' })).toThrow(EnterstellarError);
        try {
            normalize({ type: 'anything' });
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6001');
        }
    });

    it('throws ENS-6001 when all adapters return canHandle: false', () => {
        const adapter1 = createMockAdapter('ag-ui', false, null);
        const adapter2 = createMockAdapter('custom', false, null);

        const normalize = createNormalizer({ adapters: [adapter1, adapter2] });

        expect(() => normalize({})).toThrow(EnterstellarError);
        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6001');
        }
    });
});

// ---------------------------------------------------------------------------
// ENS-6002: Adapter normalize() Throws
// ---------------------------------------------------------------------------

describe('createNormalizer — ENS-6002 (adapter throws)', () => {
    it('wraps adapter errors in ENS-6002', () => {
        const originalError = new TypeError('missing required field');
        const adapter = createThrowingAdapter('ag-ui', originalError);

        const normalize = createNormalizer({ adapters: [adapter] });

        expect(() => normalize({})).toThrow(EnterstellarError);
        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6002');
            expect(error.module).toBe('normalizer');
            expect(error.recoverable).toBe(true);
            expect(error.cause).toBe(originalError);
        }
    });

    it('includes protocol name in ENS-6002 message', () => {
        const adapter = createThrowingAdapter('custom', new Error('fail'));

        const normalize = createNormalizer({ adapters: [adapter] });

        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('custom');
        }
    });
});

// ---------------------------------------------------------------------------
// ENS-6003: Zod Validation Failure
// ---------------------------------------------------------------------------

describe('createNormalizer — ENS-6003 (invalid intent)', () => {
    it('throws ENS-6003 when intent fails Zod validation (missing component)', () => {
        // An intent missing the required `component` field
        const badIntent = { props: {}, confidence: 0.8 } as unknown as ComponentIntent;
        const adapter = createMockAdapter('custom', true, badIntent);

        const normalize = createNormalizer({ adapters: [adapter] });

        expect(() => normalize({})).toThrow(EnterstellarError);
        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6003');
            expect(error.module).toBe('normalizer');
            expect(error.recoverable).toBe(true);
        }
    });

    it('throws ENS-6003 when confidence is out of range', () => {
        const badIntent = createValidIntent({ confidence: 2.0 });
        const adapter = createMockAdapter('custom', true, badIntent);

        const normalize = createNormalizer({ adapters: [adapter] });

        expect(() => normalize({})).toThrow(EnterstellarError);
        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6003');
        }
    });

    it('throws ENS-6003 when confidence is negative', () => {
        const badIntent = createValidIntent({ confidence: -0.5 });
        const adapter = createMockAdapter('custom', true, badIntent);

        const normalize = createNormalizer({ adapters: [adapter] });

        expect(() => normalize({})).toThrow(EnterstellarError);
        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6003');
        }
    });

    it('includes validation error details in ENS-6003 message', () => {
        const badIntent = { props: {}, confidence: 'not-a-number' } as unknown as ComponentIntent;
        const adapter = createMockAdapter('custom', true, badIntent);

        const normalize = createNormalizer({ adapters: [adapter] });

        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.message).toContain('ComponentIntentSchema');
        }
    });

    it('throws ENS-6003 for invalid layout value', () => {
        const badIntent = createValidIntent({
            layout: 'invalid-layout' as ComponentIntent['layout'],
        });
        const adapter = createMockAdapter('custom', true, badIntent);

        const normalize = createNormalizer({ adapters: [adapter] });

        expect(() => normalize({})).toThrow(EnterstellarError);
        try {
            normalize({});
        } catch (e: unknown) {
            const error = e as EnterstellarError;
            expect(error.code).toBe('ENS-6003');
        }
    });
});

// ---------------------------------------------------------------------------
// Integration: Real Adapters
// ---------------------------------------------------------------------------

describe('createNormalizer — integration with real adapters', () => {
    it('works with createAGUIAdapter for tool_call_start', async () => {
        const { createAGUIAdapter } = await import('../src/adapters/ag-ui-adapter.js');

        const normalize = createNormalizer({
            adapters: [createAGUIAdapter()],
        });

        const result = normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'PatientVitals',
            args: { patientId: 'P-123' },
            runId: 'run-abc',
        });

        expect(result).not.toBeNull();
        expect(result!.component).toBe('PatientVitals');
        expect(result!.props).toEqual({ patientId: 'P-123' });
        expect(result!._source!.protocol).toBe('ag-ui');
        expect(result!._source!.correlationId).toBe('run-abc');
    });

    it('works with createCustomAdapter as fallback', async () => {
        const { createAGUIAdapter } = await import('../src/adapters/ag-ui-adapter.js');
        const { createCustomAdapter } = await import('../src/adapters/custom-adapter.js');

        const normalize = createNormalizer({
            adapters: [
                createAGUIAdapter(),
                createCustomAdapter({
                    normalize: () => createValidIntent({ component: 'CustomFallback' }),
                }),
            ],
        });

        // AG-UI event → handled by AG-UI adapter
        const agResult = normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'AGUIComponent',
            args: {},
        });
        expect(agResult!.component).toBe('AGUIComponent');

        // Unknown event → falls through to custom adapter (catch-all)
        const customResult = normalize({ type: 'proprietary_event' });
        expect(customResult!.component).toBe('CustomFallback');
    });

    it('returns null for AG-UI lifecycle events (no UI intent)', async () => {
        const { createAGUIAdapter } = await import('../src/adapters/ag-ui-adapter.js');

        const normalize = createNormalizer({
            adapters: [createAGUIAdapter()],
        });

        expect(normalize({ type: 'run_started', runId: 'r-1' })).toBeNull();
        expect(normalize({ type: 'run_finished', runId: 'r-1' })).toBeNull();
    });
});
