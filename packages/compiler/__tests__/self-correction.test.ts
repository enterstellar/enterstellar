/**
 * @module @enterstellar-ai/compiler/__tests__/self-correction
 * @description Unit tests for the self-correction retry loop.
 *
 * Verifies callback invocation with C5 context, retry counting,
 * callback error handling (ENS-2009), exhaustion (ENS-2005),
 * and no-callback fallback.
 */

import { describe, it, expect, vi } from 'vitest';

import { executeSelfCorrection } from '../src/self-correction.js';
import type { CompilerConfig } from '../src/types.js';
import type { CompilationError, ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfig(
    overrides: Partial<CompilerConfig> = {},
): CompilerConfig {
    return {
        registry: {} as CompilerConfig['registry'],
        strictDesignTokens: true,
        autoAccessibility: true,
        maxNestingDepth: 10,
        includeDiff: true,
        onValidationFailure: {
            strategy: 'self-correct',
            maxRetries: 2,
            fallbackComponent: 'GenericCard',
        },
        ...overrides,
    };
}

const mockIntent: ComponentIntent = {
    component: 'PatientVitals',
    props: { riskLevel: 'high' },
    confidence: 0.9,
};

const mockErrors: readonly CompilationError[] = [
    {
        code: 'ENS-2001',
        path: 'props.riskLevel',
        message: 'Expected number',
        received: 'high',
        expected: 'number',
    },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeSelfCorrection', () => {
    it('returns corrected=false when no callback is provided', async () => {
        const config = createMockConfig(); // no onCorrection
        const result = await executeSelfCorrection(
            mockErrors,
            mockIntent,
            {},
            config,
        );

        expect(result.corrected).toBe(false);
        expect(result.attempts).toBe(0);
        expect(result.errors.some((e: CompilationError) => e.code === 'ENS-2005')).toBe(true);
    });

    it('invokes callback with errors and context (C5)', async () => {
        const onCorrection = vi.fn().mockResolvedValue({
            component: 'PatientVitals',
            props: { riskLevel: 3 },
        });

        const config = createMockConfig({ onCorrection });
        const result = await executeSelfCorrection(
            mockErrors,
            mockIntent,
            {},
            config,
        );

        expect(result.corrected).toBe(true);
        expect(result.attempts).toBe(1);
        expect(onCorrection).toHaveBeenCalledTimes(1);

        // Verify C5: callback receives errors and correction context
        const [callErrors, callContext] = onCorrection.mock.calls[0]!;
        expect(callErrors).toEqual(mockErrors);
        expect(callContext.intent).toBe(mockIntent);
        expect(callContext.errors).toEqual(mockErrors);
    });

    it('returns corrected intent on success', async () => {
        const onCorrection = vi.fn().mockResolvedValue({
            component: 'PatientVitals',
            props: { riskLevel: 3 },
        });

        const config = createMockConfig({ onCorrection });
        const result = await executeSelfCorrection(
            mockErrors,
            mockIntent,
            {},
            config,
        );

        expect(result.correctedIntent?.component).toBe('PatientVitals');
        expect(result.correctedIntent?.props).toEqual({ riskLevel: 3 });
    });

    it('handles callback errors with ENS-2009', async () => {
        const onCorrection = vi.fn()
            .mockRejectedValueOnce(new Error('Network timeout'))
            .mockRejectedValueOnce(new Error('Network timeout'));

        const config = createMockConfig({ onCorrection });
        const result = await executeSelfCorrection(
            mockErrors,
            mockIntent,
            {},
            config,
        );

        expect(result.corrected).toBe(false);
        expect(result.attempts).toBe(2);
        expect(result.errors.some((e: CompilationError) => e.code === 'ENS-2009')).toBe(true);
        expect(result.errors.some((e: CompilationError) => e.code === 'ENS-2005')).toBe(true);
    });

    it('retries up to maxRetries on callback failure', async () => {
        const onCorrection = vi.fn()
            .mockRejectedValue(new Error('fail'));

        const config = createMockConfig({
            onCorrection,
            onValidationFailure: {
                strategy: 'self-correct',
                maxRetries: 3,
                fallbackComponent: 'GenericCard',
            },
        });

        const result = await executeSelfCorrection(
            mockErrors,
            mockIntent,
            {},
            config,
        );

        expect(onCorrection).toHaveBeenCalledTimes(3);
        expect(result.attempts).toBe(3);
        expect(result.corrected).toBe(false);
    });
});
