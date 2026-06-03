/**
 * @file Compiler telemetry integration tests.
 * @description Verifies that the compiler emits telemetry signals after every
 * `compile()` invocation when `onTelemetry` is configured (TL1).
 *
 * @see Design Choice TL1 — compiler records compilation signals automatically.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import { compile } from '../src/compile.js';
import type { CompilerConfig, TelemetryRecordInput } from '../src/types.js';
import type { ComponentContract, ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helpers (mirrors compile.test.ts patterns)
// ---------------------------------------------------------------------------

function createMockConfig(
    componentMap: Record<string, ComponentContract | undefined> = {},
    overrides: Partial<CompilerConfig> = {},
): CompilerConfig {
    return {
        registry: {
            get: vi.fn((name: string) => componentMap[name]),
            getDesignTokens: () => ({}),
            on: vi.fn(() => () => { }),
        } as unknown as CompilerConfig['registry'],
        strictDesignTokens: true,
        autoAccessibility: true,
        maxNestingDepth: 10,
        includeDiff: true,
        onValidationFailure: {
            strategy: 'reject',
            maxRetries: 0,
            fallbackComponent: 'GenericCard',
        },
        ...overrides,
    };
}

function createMockContract(name: string): ComponentContract {
    return {
        name,
        props: z.object({ title: z.string() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        category: 'utility',
        description: 'Test component',
        _meta: { forged: false },
    } as unknown as ComponentContract;
}

function createIntent(component: string, props: Record<string, unknown>): ComponentIntent {
    return {
        component,
        props,
        confidence: 1.0,
    } as ComponentIntent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Compiler Telemetry Integration (TL1)', () => {
    it('emits a telemetry signal after a successful compile()', async () => {
        const recorder = vi.fn();
        const contract = createMockContract('TestCard');
        const config = createMockConfig({ TestCard: contract }, { onTelemetry: recorder });
        const intent = createIntent('TestCard', { title: 'hello' });

        await compile(intent, config, [], undefined, {
            agent: 'gpt-4o',
            rawIntent: 'show test card',
            intentCategory: 'data-display',
        });

        expect(recorder).toHaveBeenCalledOnce();

        const signal = recorder.mock.calls[0]![0] as TelemetryRecordInput;
        expect(signal.rawIntent).toBe('show test card');
        expect(signal.componentName).toBe('TestCard');
        expect(signal.intentCategory).toBe('data-display');
        expect(signal.compilationStatus).toBe('pass');
        expect(signal.forgeMode).toBe('none');
        expect(signal.forgeUsed).toBe(false);
        expect(signal.selfCorrectionAttempts).toBe(0);
        expect(signal.correctionTokensUsed).toBe(0);
        expect(typeof signal.latencyMs).toBe('number');
        expect(signal.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('emits a telemetry signal after a failed compile() (unknown component)', async () => {
        const recorder = vi.fn();
        const config = createMockConfig({}, { onTelemetry: recorder });
        const intent = createIntent('NonExistent', {});

        await compile(intent, config, [], undefined, {
            agent: 'gpt-4o',
            rawIntent: 'show missing',
        });

        expect(recorder).toHaveBeenCalledOnce();

        const signal = recorder.mock.calls[0]![0] as TelemetryRecordInput;
        expect(signal.rawIntent).toBe('show missing');
        expect(signal.compilationStatus).toBe('fail');
        // Falls back to intent category default 'utility' when not provided.
        expect(signal.intentCategory).toBe('utility');
    });

    it('defaults rawIntent to intent.component when not provided in options', async () => {
        const recorder = vi.fn();
        const contract = createMockContract('TestCard');
        const config = createMockConfig({ TestCard: contract }, { onTelemetry: recorder });
        const intent = createIntent('TestCard', { title: 'x' });

        await compile(intent, config, [], undefined);

        expect(recorder).toHaveBeenCalledOnce();

        const signal = recorder.mock.calls[0]![0] as TelemetryRecordInput;
        // No rawIntent in options → falls back to intent.component.
        expect(signal.rawIntent).toBe('TestCard');
        expect(signal.intentCategory).toBe('utility');
    });

    it('does NOT emit telemetry when onTelemetry is not configured', async () => {
        // No onTelemetry — should not throw or break.
        const config = createMockConfig();
        const intent = createIntent('NonExistent', {});

        const result = await compile(intent, config, [], undefined);

        expect(result.status).toBe('fail');
        // No assertion on recorder — it was never created.
    });

    it('measures latency as a non-negative integer', async () => {
        const recorder = vi.fn();
        const contract = createMockContract('TestCard');
        const config = createMockConfig({ TestCard: contract }, { onTelemetry: recorder });
        const intent = createIntent('TestCard', { title: 'x' });

        await compile(intent, config, [], undefined);

        const signal = recorder.mock.calls[0]![0] as TelemetryRecordInput;
        expect(Number.isInteger(signal.latencyMs)).toBe(true);
        expect(signal.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('emits telemetry for nesting depth failure', async () => {
        const recorder = vi.fn();
        const contract = createMockContract('Container');
        const config = createMockConfig(
            { Container: contract },
            { maxNestingDepth: 3, onTelemetry: recorder },
        );

        // Build deeply nested props to exceed depth 3.
        const deepProps: Record<string, unknown> = {};
        let current = deepProps;
        for (let i = 0; i < 5; i++) {
            const child = {
                component: `Level${String(i)}`,
                props: {} as Record<string, unknown>,
            };
            current['child'] = child;
            current = child.props;
        }

        const intent = createIntent('Container', deepProps);
        await compile(intent, config, [], undefined);

        expect(recorder).toHaveBeenCalledOnce();

        const signal = recorder.mock.calls[0]![0] as TelemetryRecordInput;
        expect(signal.compilationStatus).toBe('fail');
        expect(signal.componentName).toBe('Container');
    });
});
