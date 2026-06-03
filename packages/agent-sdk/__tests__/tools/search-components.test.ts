/**
 * @module @enterstellar-ai/agent-sdk/__tests__/tools/search-components
 * @description Unit tests for `executeSearchComponents()`.
 *
 * Verifies the `enterstellar_search_components` MCP tool:
 * - Delegation to `SemanticIndex.search()`.
 * - Edge cases: empty query, topK clamping, default topK.
 * - Error wrapping: semantic index failures → `ENS-8002`.
 *
 * Uses a mock `AgentSDKSemanticIndex` injected as a parameter.
 *
 * @see Design Choice SI5 — topK: default 5, max 20.
 * @see Error ENS-8002 — search failures.
 */

import { describe, it, expect, vi } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import type { SemanticSearchResult, ComponentContract } from '@enterstellar-ai/types';

import type { AgentSDKSemanticIndex } from '../../src/types.js';
import { executeSearchComponents } from '../../src/tools/search-components.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock `AgentSDKSemanticIndex` with configurable search results.
 */
function createMockIndex(
    results: readonly SemanticSearchResult[] = [],
): AgentSDKSemanticIndex {
    return {
        search: vi.fn().mockResolvedValue(results),
    };
}

/**
 * Creates a mock `SemanticSearchResult`.
 */
function createSearchResult(name: string, similarity: number): SemanticSearchResult {
    return {
        componentName: name,
        similarity,
        contract: {
            name,
            category: 'data-display',
            description: `Test component ${name}`,
            tags: ['test'],
            props: {},
            examples: [],
            tokens: {},
            states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'Ready' },
            accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
            id: name,
            _meta: { forged: false, version: '0.0.0', createdAt: new Date().toISOString() },
        } as unknown as ComponentContract,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeSearchComponents', () => {
    // -----------------------------------------------------------------------
    // Successful search
    // -----------------------------------------------------------------------

    describe('successful search', () => {
        it('returns results from the semantic index', async () => {
            const mockResults = [
                createSearchResult('PatientVitals', 0.92),
                createSearchResult('MedicationList', 0.78),
            ];
            const index = createMockIndex(mockResults);

            const results = await executeSearchComponents(index, 'show patient data');

            expect(results).toEqual(mockResults);
        });

        it('delegates to semanticIndex.search() with correct arguments', async () => {
            const index = createMockIndex();

            await executeSearchComponents(index, 'patient vitals', 10);

            expect(index.search).toHaveBeenCalledOnce();
            expect(index.search).toHaveBeenCalledWith('patient vitals', { topK: 10 });
        });
    });

    // -----------------------------------------------------------------------
    // Empty query edge case
    // -----------------------------------------------------------------------

    describe('empty query', () => {
        it('returns empty array for empty string', async () => {
            const index = createMockIndex();

            const results = await executeSearchComponents(index, '');

            expect(results).toEqual([]);
            expect(index.search).not.toHaveBeenCalled();
        });

        it('returns empty array for whitespace-only string', async () => {
            const index = createMockIndex();

            const results = await executeSearchComponents(index, '   ');

            expect(results).toEqual([]);
            expect(index.search).not.toHaveBeenCalled();
        });
    });

    // -----------------------------------------------------------------------
    // topK clamping (SI5)
    // -----------------------------------------------------------------------

    describe('topK clamping', () => {
        it('defaults to topK: 5 when not specified', async () => {
            const index = createMockIndex();

            await executeSearchComponents(index, 'test query');

            expect(index.search).toHaveBeenCalledWith('test query', { topK: 5 });
        });

        it('clamps topK below 1 to 1', async () => {
            const index = createMockIndex();

            await executeSearchComponents(index, 'test query', -5);

            expect(index.search).toHaveBeenCalledWith('test query', { topK: 1 });
        });

        it('clamps topK of 0 to 1', async () => {
            const index = createMockIndex();

            await executeSearchComponents(index, 'test query', 0);

            expect(index.search).toHaveBeenCalledWith('test query', { topK: 1 });
        });

        it('clamps topK above 20 to 20', async () => {
            const index = createMockIndex();

            await executeSearchComponents(index, 'test query', 100);

            expect(index.search).toHaveBeenCalledWith('test query', { topK: 20 });
        });

        it('preserves valid topK within range', async () => {
            const index = createMockIndex();

            await executeSearchComponents(index, 'test query', 15);

            expect(index.search).toHaveBeenCalledWith('test query', { topK: 15 });
        });
    });

    // -----------------------------------------------------------------------
    // Error wrapping (ENS-8002)
    // -----------------------------------------------------------------------

    describe('error wrapping', () => {
        it('wraps semantic index errors in ENS-8002', async () => {
            const index: AgentSDKSemanticIndex = {
                search: vi.fn().mockRejectedValue(new Error('Embedding model failed')),
            };

            await expect(
                executeSearchComponents(index, 'test query'),
            ).rejects.toThrow(EnterstellarError);

            try {
                await executeSearchComponents(index, 'test query');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8002');
                expect(enterstellarError.module).toBe('agent-sdk');
                expect(enterstellarError.recoverable).toBe(true);
                expect(enterstellarError.message).toContain('test query');
                expect(enterstellarError.message).toContain('Embedding model failed');
            }
        });

        it('wraps non-Error throws in ENS-8002', async () => {
            const index: AgentSDKSemanticIndex = {
                search: vi.fn().mockRejectedValue('string error'),
            };

            try {
                await executeSearchComponents(index, 'test query');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarError = error as EnterstellarError;
                expect(enterstellarError.code).toBe('ENS-8002');
                expect(enterstellarError.message).toContain('string error');
            }
        });
    });
});
