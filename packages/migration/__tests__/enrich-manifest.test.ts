/**
 * @module @enterstellar-ai/migration/__tests__/enrich-manifest
 * @description Unit tests for the Phase 2 enrichment orchestrator.
 *
 * Tests `enrichManifest()`, `mergeOverlay()`, and `ENRICHABLE_FIELD_KEYS`
 * using mock `EnrichmentProvider` implementations. Validates gating logic
 * (Correction 2), error handling (Correction 3), and `EnrichResult` shape
 * (Audit E1).
 *
 * @see Correction 2 — Binary Source Model: The Gating Logic
 * @see Correction 3 — Enrichment Error Handling
 * @see Audit E1 — EnrichResult return type for diagnostic visibility
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

import {
    enrichManifest,
    mergeOverlay,
    ENRICHABLE_FIELD_KEYS,
} from '../src/enrichment/enrich-manifest.js';
import { EnrichmentError } from '../src/enrichment/types.js';
import type { EnrichmentProvider } from '../src/enrichment/types.js';
import type {
    StructuralManifest,
    SemanticOverlay,
    EnrichableFieldKey,
    EnrichableField,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Fixture Factory
// ---------------------------------------------------------------------------

/**
 * Creates a `StructuralManifest` with configurable source provenance.
 *
 * By default, all enrichable fields are `heuristic-fallback` (candidates
 * for enrichment). Pass `astFields` to make specific fields `ast-determined`.
 */
function createManifest(
    astFields: readonly EnrichableFieldKey[] = [],
): StructuralManifest {
    const makeField = <T>(
        key: EnrichableFieldKey,
        value: T,
    ): EnrichableField<T> => ({
        value,
        source: astFields.includes(key) ? 'ast-determined' : 'heuristic-fallback',
    });

    return {
        name: 'TestComponent',
        props: z.object({ label: z.string() }),
        defaultProps: {},
        generics: [],
        existingZodSchemas: [],
        eventHandlers: [],
        description: makeField('description', 'TODO: Add description'),
        tags: makeField('tags', []),
        category: makeField('category', 'utility'),
        intent: makeField('intent', 'Render TestComponent'),
        ariaAttributes: makeField('ariaAttributes', {}),
        designTokenRefs: makeField('designTokenRefs', []),
        lifecycleStates: makeField('lifecycleStates', []),
    };
}

/**
 * Creates a mock `EnrichmentProvider` that returns a fixed overlay.
 */
function createMockProvider(overlay: SemanticOverlay): EnrichmentProvider {
    return {
        enrich: vi.fn().mockResolvedValue(overlay),
    };
}

/**
 * Creates a mock provider that throws an `EnrichmentError`.
 */
function createFailingProvider(
    code: ConstructorParameters<typeof EnrichmentError>[0],
    message: string,
): EnrichmentProvider {
    return {
        enrich: vi.fn().mockRejectedValue(new EnrichmentError(code, message)),
    };
}

const SAMPLE_SOURCE = 'export function TestComponent() { return <div />; }';

// ---------------------------------------------------------------------------
// ENRICHABLE_FIELD_KEYS
// ---------------------------------------------------------------------------

describe('ENRICHABLE_FIELD_KEYS', () => {
    it('contains exactly 7 enrichable field keys', () => {
        expect(ENRICHABLE_FIELD_KEYS).toHaveLength(7);
    });

    it('contains all expected field keys', () => {
        const expected: readonly EnrichableFieldKey[] = [
            'description', 'tags', 'category', 'intent',
            'ariaAttributes', 'designTokenRefs', 'lifecycleStates',
        ];
        for (const key of expected) {
            expect(ENRICHABLE_FIELD_KEYS).toContain(key);
        }
    });
});

// ---------------------------------------------------------------------------
// enrichManifest — Gating Logic
// ---------------------------------------------------------------------------

describe('enrichManifest — gating logic', () => {
    it('skips LLM call when all fields are ast-determined', async () => {
        const manifest = createManifest(ENRICHABLE_FIELD_KEYS);
        const provider = createMockProvider({ fields: [] });

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        // Provider should NOT have been called
        expect(provider.enrich).not.toHaveBeenCalled();
        // Manifest unchanged
        expect(result.manifest).toBe(manifest);
        // No enriched fields
        expect(result.enrichedFields).toEqual([]);
        // All fields skipped
        expect(result.skippedFields).toHaveLength(7);
        // Info diagnostic
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]?.level).toBe('info');
        expect(result.diagnostics[0]?.message).toContain('AST-determined');
    });

    it('calls LLM when all fields are heuristic-fallback', async () => {
        const manifest = createManifest(); // all heuristic
        const overlay: SemanticOverlay = {
            fields: [
                { key: 'description', value: 'A test component' },
                { key: 'tags', value: ['test', 'ui'] },
            ],
        };
        const provider = createMockProvider(overlay);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        // Provider should have been called
        expect(provider.enrich).toHaveBeenCalledOnce();
        expect(provider.enrich).toHaveBeenCalledWith(manifest, SAMPLE_SOURCE);
        // Enriched fields
        expect(result.enrichedFields).toContain('description');
        expect(result.enrichedFields).toContain('tags');
        // No skipped fields
        expect(result.skippedFields).toEqual([]);
    });

    it('enriches only heuristic fields in mixed scenario', async () => {
        // category and ariaAttributes are ast-determined
        const manifest = createManifest(['category', 'ariaAttributes']);
        const overlay: SemanticOverlay = {
            fields: [
                { key: 'description', value: 'Enhanced description' },
            ],
        };
        const provider = createMockProvider(overlay);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(provider.enrich).toHaveBeenCalledOnce();
        expect(result.skippedFields).toContain('category');
        expect(result.skippedFields).toContain('ariaAttributes');
        expect(result.enrichedFields).toContain('description');
        // AST-determined fields should be unchanged
        expect(result.manifest.category.source).toBe('ast-determined');
        expect(result.manifest.ariaAttributes.source).toBe('ast-determined');
    });
});

// ---------------------------------------------------------------------------
// enrichManifest — Successful Enrichment
// ---------------------------------------------------------------------------

describe('enrichManifest — successful enrichment', () => {
    it('promotes enriched fields to source: enrichment', async () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = {
            fields: [
                { key: 'description', value: 'A patient card component' },
                { key: 'category', value: 'clinical' },
            ],
        };
        const provider = createMockProvider(overlay);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(result.manifest.description.source).toBe('enrichment');
        expect(result.manifest.description.value).toBe('A patient card component');
        expect(result.manifest.category.source).toBe('enrichment');
        expect(result.manifest.category.value).toBe('clinical');
    });

    it('preserves un-enriched heuristic fields', async () => {
        const manifest = createManifest();
        // Only enrich description — other heuristic fields stay as-is
        const overlay: SemanticOverlay = {
            fields: [{ key: 'description', value: 'Enriched' }],
        };
        const provider = createMockProvider(overlay);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        // Not-enriched heuristic fields stay heuristic-fallback
        expect(result.manifest.tags.source).toBe('heuristic-fallback');
        expect(result.manifest.intent.source).toBe('heuristic-fallback');
    });

    it('returns empty diagnostics on clean enrichment', async () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = {
            fields: [{ key: 'description', value: 'Clean' }],
        };
        const provider = createMockProvider(overlay);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(result.diagnostics).toEqual([]);
    });

    it('enrichedFields matches fields in overlay', async () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = {
            fields: [
                { key: 'tags', value: ['tag1', 'tag2'] },
                { key: 'intent', value: 'Show a test component' },
                { key: 'lifecycleStates', value: ['loading', 'error'] },
            ],
        };
        const provider = createMockProvider(overlay);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(result.enrichedFields).toHaveLength(3);
        expect(result.enrichedFields).toContain('tags');
        expect(result.enrichedFields).toContain('intent');
        expect(result.enrichedFields).toContain('lifecycleStates');
    });

    it('handles empty overlay fields array', async () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = { fields: [] };
        const provider = createMockProvider(overlay);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        // Manifest should be unchanged (no patches applied)
        expect(result.enrichedFields).toEqual([]);
        expect(result.manifest.description.source).toBe('heuristic-fallback');
    });
});

// ---------------------------------------------------------------------------
// enrichManifest — Error Handling
// ---------------------------------------------------------------------------

describe('enrichManifest — error handling', () => {
    it('captures EnrichmentError in diagnostics', async () => {
        const manifest = createManifest();
        const provider = createFailingProvider('AUTH_FAILED', 'Invalid API key');

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(result.manifest).toBe(manifest); // unchanged
        expect(result.enrichedFields).toEqual([]);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]?.level).toBe('error');
        expect(result.diagnostics[0]?.errorCode).toBe('AUTH_FAILED');
        expect(result.diagnostics[0]?.message).toContain('AUTH_FAILED');
    });

    it.each([
        ['AUTH_FAILED', 'error'] as const,
        ['QUOTA_EXHAUSTED', 'error'] as const,
        ['RATE_LIMITED', 'error'] as const,
        ['PROVIDER_ERROR', 'error'] as const,
        ['PARSE_ERROR', 'error'] as const,
    ])('maps %s to diagnostic level: %s', async (code, expectedLevel) => {
        const manifest = createManifest();
        const provider = createFailingProvider(code, `Error: ${code}`);

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(result.diagnostics[0]?.level).toBe(expectedLevel);
        expect(result.diagnostics[0]?.errorCode).toBe(code);
    });

    it('captures unknown error in diagnostics', async () => {
        const manifest = createManifest();
        const provider: EnrichmentProvider = {
            enrich: vi.fn().mockRejectedValue(new TypeError('Network error')),
        };

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(result.manifest).toBe(manifest);
        expect(result.enrichedFields).toEqual([]);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]?.level).toBe('warning');
        expect(result.diagnostics[0]?.message).toContain('Network error');
        // No errorCode for unknown errors
        expect(result.diagnostics[0]?.errorCode).toBeUndefined();
    });

    it('captures non-Error thrown values', async () => {
        const manifest = createManifest();
        const provider: EnrichmentProvider = {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            enrich: vi.fn().mockRejectedValue('string error'),
        };

        const result = await enrichManifest(manifest, SAMPLE_SOURCE, provider);

        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]?.level).toBe('warning');
        expect(result.diagnostics[0]?.message).toContain('unknown error');
    });
});

// ---------------------------------------------------------------------------
// mergeOverlay
// ---------------------------------------------------------------------------

describe('mergeOverlay', () => {
    it('promotes source to enrichment for patched fields', () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = {
            fields: [
                { key: 'description', value: 'Enriched description' },
            ],
        };

        const result = mergeOverlay(manifest, overlay);

        expect(result.manifest.description.source).toBe('enrichment');
        expect(result.manifest.description.value).toBe('Enriched description');
    });

    it('returns correct enrichedFields list', () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = {
            fields: [
                { key: 'description', value: 'Desc' },
                { key: 'tags', value: ['a', 'b'] },
            ],
        };

        const result = mergeOverlay(manifest, overlay);

        expect(result.enrichedFields).toEqual(['description', 'tags']);
    });

    it('ignores overlay patches for ast-determined fields', () => {
        const manifest = createManifest(['description']);
        const overlay: SemanticOverlay = {
            fields: [
                { key: 'description', value: 'Should NOT apply' },
                { key: 'tags', value: ['should', 'apply'] },
            ],
        };

        const result = mergeOverlay(manifest, overlay);

        // description is ast-determined — should NOT be overwritten
        expect(result.manifest.description.source).toBe('ast-determined');
        expect(result.manifest.description.value).toBe('TODO: Add description');
        // tags is heuristic — should be enriched
        expect(result.manifest.tags.source).toBe('enrichment');
        expect(result.manifest.tags.value).toEqual(['should', 'apply']);
        // enrichedFields should only include tags
        expect(result.enrichedFields).toEqual(['tags']);
    });

    it('handles empty overlay fields', () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = { fields: [] };

        const result = mergeOverlay(manifest, overlay);

        expect(result.manifest).toBe(manifest); // same reference — nothing changed
        expect(result.enrichedFields).toEqual([]);
    });

    it('preserves structural fields through merge', () => {
        const manifest = createManifest();
        const overlay: SemanticOverlay = {
            fields: [{ key: 'description', value: 'New' }],
        };

        const result = mergeOverlay(manifest, overlay);

        // Structural fields should be unchanged
        expect(result.manifest.name).toBe('TestComponent');
        expect(result.manifest.eventHandlers).toEqual([]);
        expect(result.manifest.generics).toEqual([]);
    });

    it('does not mutate the original manifest', () => {
        const manifest = createManifest();
        const originalDesc = manifest.description;
        const overlay: SemanticOverlay = {
            fields: [{ key: 'description', value: 'Modified' }],
        };

        mergeOverlay(manifest, overlay);

        // Original manifest should be untouched
        expect(manifest.description).toBe(originalDesc);
        expect(manifest.description.value).toBe('TODO: Add description');
    });
});
