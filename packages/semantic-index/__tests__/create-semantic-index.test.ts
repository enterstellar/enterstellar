/**
 * @module @enterstellar-ai/semantic-index/__tests__/create-semantic-index
 * @description Integration tests for `createSemanticIndex()` — the main factory.
 *
 * Uses a deterministic mock `EmbeddingProvider` that maps text to known vectors,
 * enabling fully reproducible tests without a real ML model.
 *
 * Tests the full pipeline:
 * - `build()` indexes all registry components
 * - `search()` returns ranked results with similarity scores
 * - `getCompactManifest()` enriches entries with `score` (SI8)
 * - `warmup()` pre-populates cache (SI11)
 * - Registry event subscription for incremental updates (SI3)
 * - Error handling (ENS-5021, ENS-5022)
 *
 * @see Implementation Bible §4.7
 * @see Design Choices SI1–SI12
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { EnterstellarError, createComponentId } from '@enterstellar-ai/types';
import type {
    ComponentContract,
    ComponentCategory,
} from '@enterstellar-ai/types';
import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

import { createSemanticIndex } from '../src/create-semantic-index.js';
import type { EmbeddingProvider } from '../src/types.js';

// ---------------------------------------------------------------------------
// Mock Registry
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock `EnterstellarRegistry` for testing.
 *
 * Uses a `Map` internally. Supports `get`, `list`, `on`, and `size`.
 * Registry events (`register`, `update`, `unregister`) are emitted
 * manually via the returned `emit` helper.
 */
function createMockRegistry(contracts: ComponentContract[]): {
    registry: EnterstellarRegistry;
    emit: (event: 'register' | 'update' | 'unregister', contract: ComponentContract) => void;
    addContract: (contract: ComponentContract) => void;
    removeContract: (name: string) => void;
} {
    const store = new Map<string, ComponentContract>();
    for (const c of contracts) {
        store.set(c.name, c);
    }

    /** Event handlers keyed by event name. */
    const handlers = new Map<string, Array<(contract: ComponentContract) => void>>();

    const registry: EnterstellarRegistry = {
        get(name: string) {
            return store.get(name);
        },
        list() {
            return [...store.keys()].sort();
        },
        register: vi.fn(),
        unregister: vi.fn(),
        getManifest: vi.fn().mockReturnValue([]),
        getSchema: vi.fn(),
        getDesignTokens: vi.fn().mockReturnValue({}),
        validate: vi.fn().mockReturnValue({ valid: true, violations: [] }),
        publish: vi.fn(),
        on(event: string, handler: (contract: ComponentContract) => void) {
            const existing = handlers.get(event);
            if (existing !== undefined) {
                existing.push(handler);
            } else {
                handlers.set(event, [handler]);
            }
            return () => {
                const arr = handlers.get(event);
                if (arr !== undefined) {
                    const idx = arr.indexOf(handler);
                    if (idx !== -1) {
                        arr.splice(idx, 1);
                    }
                }
            };
        },
        get size() {
            return store.size;
        },
    };

    function emit(event: 'register' | 'update' | 'unregister', contract: ComponentContract): void {
        const eventHandlers = handlers.get(event);
        if (eventHandlers !== undefined) {
            for (const handler of eventHandlers) {
                handler(contract);
            }
        }
    }

    function addContract(contract: ComponentContract): void {
        store.set(contract.name, contract);
        emit('register', contract);
    }

    function removeContract(name: string): void {
        const contract = store.get(name);
        if (contract !== undefined) {
            store.delete(name);
            emit('unregister', contract);
        }
    }

    return { registry, emit, addContract, removeContract };
}

// ---------------------------------------------------------------------------
// Mock Embedding Provider
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic mock `EmbeddingProvider`.
 *
 * Maps each input text to a unique vector based on a simple hash.
 * This ensures reproducible similarity scores without a real model.
 *
 * The vectors are 3-dimensional for test simplicity. Two texts with
 * similar content produce similar vectors.
 */
function createMockEmbeddingProvider(): EmbeddingProvider {
    function textToVector(text: string): Float64Array {
        // Simple deterministic hash-to-vector:
        // Sum of char codes at different offsets creates a unique direction
        let x = 0;
        let y = 0;
        let z = 0;
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            x += code * (i + 1);
            y += code * (i + 2);
            z += code * (i + 3);
        }
        // Normalize to unit vector
        const mag = Math.sqrt(x * x + y * y + z * z);
        if (mag === 0) return new Float64Array([0, 0, 0]);
        return new Float64Array([x / mag, y / mag, z / mag]);
    }

    return {
        dimensions: 3,
        async embed(texts: readonly string[]): Promise<readonly Float64Array[]> {
            return texts.map(textToVector);
        },
    };
}

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createTestContract(
    name: string,
    category: string,
    tags: string[],
): ComponentContract {
    return {
        id: createComponentId(name),
        name,
        description: `${name} component for testing.`,
        category: category as ComponentCategory,
        tags,
        props: z.object({ testProp: z.string() }),
        tokens: {},
        accessibility: { role: 'region', ariaLabel: name, announceOnUpdate: false },
        states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: name },
        examples: [{ intent: `Show ${name}`, props: { testProp: 'value' } }],
        _meta: { forged: false, version: '1.0.0', createdAt: new Date().toISOString() },
    };
}

// Pre-built test contracts
const VITALS = createTestContract('PatientVitals', 'clinical', ['patient', 'vitals']);
const MEDS = createTestContract('MedicationList', 'clinical', ['medication', 'list']);
const NAV = createTestContract('NavBar', 'navigation', ['navigation', 'menu']);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSemanticIndex()', () => {
    let embeddingProvider: EmbeddingProvider;

    beforeEach(() => {
        embeddingProvider = createMockEmbeddingProvider();
    });

    // --- build() ---

    describe('build()', () => {
        it('indexes all registry components', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS, NAV]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            await index.build();

            expect(index.size).toBe(3);
        });

        it('handles empty registry (zero components)', async () => {
            const { registry } = createMockRegistry([]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            await index.build();

            expect(index.size).toBe(0);
        });

        it('handles build without embedding provider (cloud-only mode)', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'cloud',
                // No embeddingProvider — cloud-only mode
            });

            // build() should succeed without throwing
            await index.build();
            expect(index.size).toBe(0); // No local embeddings
        });
    });

    // --- search() ---

    describe('search()', () => {
        it('returns results sorted by descending similarity', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS, NAV]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0, // Accept all results for this test
            });

            await index.build();
            const results = await index.search('patient vitals monitoring');

            expect(results.length).toBeGreaterThan(0);

            // Results should be sorted by descending similarity
            for (let i = 1; i < results.length; i++) {
                const prev = results[i - 1];
                const curr = results[i];
                if (prev !== undefined && curr !== undefined) {
                    expect(prev.similarity).toBeGreaterThanOrEqual(curr.similarity);
                }
            }
        });

        it('returns results with correct shape (componentName, similarity, contract)', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            const results = await index.search('patient vitals');

            expect(results).toHaveLength(1);
            const result = results[0];
            expect(result).toBeDefined();
            if (result !== undefined) {
                expect(result.componentName).toBe('PatientVitals');
                expect(typeof result.similarity).toBe('number');
                expect(result.similarity).toBeGreaterThanOrEqual(0);
                expect(result.similarity).toBeLessThanOrEqual(1);
                expect(result.contract.name).toBe('PatientVitals');
            }
        });

        it('respects topK option (SI5)', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS, NAV]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            const results = await index.search('test query', { topK: 2 });

            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('uses default topK of 5 (SI5)', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS, NAV]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            const results = await index.search('test query');

            // With only 3 components, returns all 3 (topK 5 > size 3)
            expect(results.length).toBeLessThanOrEqual(5);
        });

        it('excludes results below noMatchThreshold (SI6)', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS, NAV]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0.99, // Very high threshold — most results excluded
            });

            await index.build();
            const results = await index.search('random unrelated query');

            // Most/all results should be excluded by the high threshold
            for (const result of results) {
                expect(result.similarity).toBeGreaterThanOrEqual(0.99);
            }
        });

        it('applies category filter (SI7)', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS, NAV]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            const results = await index.search('test query', {
                filter: { category: 'clinical' },
            });

            for (const result of results) {
                expect(result.contract.category).toBe('clinical');
            }
        });

        it('applies tags filter (SI7)', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS, NAV]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            const results = await index.search('test query', {
                filter: { tags: ['navigation'] },
            });

            for (const result of results) {
                const hasTag = result.contract.tags.some((t) => t === 'navigation');
                expect(hasTag).toBe(true);
            }
        });
    });

    // --- Error Handling ---

    describe('error handling', () => {
        it('throws ENS-5021 when search() is called before build()', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            try {
                await index.search('test');
                expect.fail('Expected ENS-5021 to be thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarErr = error as EnterstellarError;
                expect(enterstellarErr.code).toBe('ENS-5021');
                expect(enterstellarErr.module).toBe('semantic-index');
                expect(enterstellarErr.recoverable).toBe(false);
            }
        });

        it('throws ENS-5022 when topK is 0', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            await index.build();

            try {
                await index.search('test', { topK: 0 });
                expect.fail('Expected ENS-5022 to be thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarErr = error as EnterstellarError;
                expect(enterstellarErr.code).toBe('ENS-5022');
                expect(enterstellarErr.recoverable).toBe(false);
            }
        });

        it('throws ENS-5022 when topK exceeds 20', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            await index.build();

            try {
                await index.search('test', { topK: 21 });
                expect.fail('Expected ENS-5022 to be thrown');
            } catch (error: unknown) {
                expect(error).toBeInstanceOf(EnterstellarError);
                const enterstellarErr = error as EnterstellarError;
                expect(enterstellarErr.code).toBe('ENS-5022');
            }
        });

        it('throws ENS-5022 when topK is negative', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            await index.build();

            await expect(index.search('test', { topK: -1 })).rejects.toThrow(EnterstellarError);
        });
    });

    // --- getCompactManifest() (SI8) ---

    describe('getCompactManifest()', () => {
        it('includes similarity score in manifest entries (SI8)', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            const results = await index.search('patient vitals');
            const manifest = index.getCompactManifest(results);

            expect(manifest.length).toBe(results.length);
            for (let i = 0; i < manifest.length; i++) {
                const entry = manifest[i];
                const result = results[i];
                if (entry !== undefined && result !== undefined) {
                    expect(entry.name).toBe(result.componentName);
                    expect(entry.score).toBe(result.similarity);
                    expect(typeof entry.description).toBe('string');
                    expect(typeof entry.category).toBe('string');
                    expect(typeof entry.props).toBe('object');
                }
            }
        });

        it('returns empty array for empty results', () => {
            const { registry } = createMockRegistry([]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            const manifest = index.getCompactManifest([]);
            expect(manifest).toEqual([]);
        });
    });

    // --- warmup() (SI11) ---

    describe('warmup()', () => {
        it('pre-populates cache for given intents', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            await index.warmup(['patient vitals', 'medication list']);

            // Second search should hit cache (same result without re-embedding)
            const results = await index.search('patient vitals');
            expect(results.length).toBeGreaterThan(0);
        });

        it('throws ENS-5021 when called before build()', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            await expect(index.warmup(['test'])).rejects.toThrow(EnterstellarError);
        });
    });

    // --- rebuild() ---

    describe('rebuild()', () => {
        it('clears and re-indexes from the current registry state', async () => {
            const { registry, addContract } = createMockRegistry([VITALS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            expect(index.size).toBe(1);

            // Add a new contract to the registry (not via event)
            const newContract = createTestContract('LabResults', 'clinical', ['lab', 'results']);
            addContract(newContract);

            // Wait a tick for async event handler
            await new Promise((resolve) => {
                setTimeout(resolve, 50);
            });

            // Rebuild to re-index
            await index.rebuild();
            expect(index.size).toBe(2);
        });
    });

    // --- Registry Event Subscription (SI3) ---

    describe('registry event subscription (SI3)', () => {
        it('removes component from index on unregister event', async () => {
            const { registry, removeContract } = createMockRegistry([VITALS, MEDS]);
            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();
            expect(index.size).toBe(2);

            // Unregister a component
            removeContract('PatientVitals');

            // The handler removes from vector store synchronously
            expect(index.size).toBe(1);
        });

        it('does not subscribe to events before build()', () => {
            const { registry } = createMockRegistry([VITALS]);
            const onSpy = vi.spyOn(registry, 'on');

            createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            // No events subscribed until build() is called
            expect(onSpy).not.toHaveBeenCalled();
        });

        it('subscribes to register, update, and unregister events after build()', async () => {
            const { registry } = createMockRegistry([VITALS]);
            const onSpy = vi.spyOn(registry, 'on');

            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
            });

            await index.build();

            // Should have subscribed to all three events
            expect(onSpy).toHaveBeenCalledWith('register', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('update', expect.any(Function));
            expect(onSpy).toHaveBeenCalledWith('unregister', expect.any(Function));
        });
    });

    // --- Cache Integration (SI9) ---

    describe('cache integration (SI9)', () => {
        it('returns cached results for identical intent strings', async () => {
            const { registry } = createMockRegistry([VITALS, MEDS]);
            const embedSpy = vi.spyOn(embeddingProvider, 'embed');

            const index = createSemanticIndex({
                registry,
                provider: 'local',
                embeddingProvider,
                noMatchThreshold: 0,
            });

            await index.build();

            // First search — cache miss, calls embed
            const results1 = await index.search('patient vitals');
            const embedCallsAfterFirst = embedSpy.mock.calls.length;

            // Second search — cache hit, should NOT call embed again
            const results2 = await index.search('patient vitals');

            expect(results2).toEqual(results1);
            expect(embedSpy.mock.calls.length).toBe(embedCallsAfterFirst); // No new embed call
        });
    });
});
