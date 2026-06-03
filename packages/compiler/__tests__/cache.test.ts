/**
 * @module @enterstellar-ai/compiler/__tests__/cache
 * @description Unit tests for the compiler's internal LRU parse result cache.
 *
 * Verifies cache hit/miss, LRU eviction, deterministic key generation,
 * registry event invalidation, and disposal.
 */

import { describe, it, expect, vi } from 'vitest';

import { createCompilationCache } from '../src/cache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleProps = Object.freeze({ riskLevel: 3, patientId: 'p-123' });
const validatedProps = Object.freeze({ riskLevel: 3, patientId: 'p-123', role: 'region' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createCompilationCache', () => {
    describe('get / set', () => {
        it('returns undefined on cache miss', () => {
            const cache = createCompilationCache(100);
            expect(cache.get('PatientVitals', sampleProps)).toBeUndefined();
        });

        it('returns cached value on cache hit', () => {
            const cache = createCompilationCache(100);
            cache.set('PatientVitals', sampleProps, validatedProps);
            const result = cache.get('PatientVitals', sampleProps);
            expect(result).toEqual(validatedProps);
        });

        it('misses for different component names with same props', () => {
            const cache = createCompilationCache(100);
            cache.set('PatientVitals', sampleProps, validatedProps);
            expect(cache.get('PatientChart', sampleProps)).toBeUndefined();
        });

        it('misses for same component with different props', () => {
            const cache = createCompilationCache(100);
            cache.set('PatientVitals', sampleProps, validatedProps);
            expect(cache.get('PatientVitals', { riskLevel: 5 })).toBeUndefined();
        });
    });

    describe('deterministic key generation', () => {
        it('treats { a: 1, b: 2 } and { b: 2, a: 1 } as same key', () => {
            const cache = createCompilationCache(100);
            cache.set('Comp', { a: 1, b: 2 }, validatedProps);
            const result = cache.get('Comp', { b: 2, a: 1 });
            expect(result).toEqual(validatedProps);
        });
    });

    describe('LRU eviction', () => {
        it('evicts least recently accessed entry when maxSize exceeded', () => {
            const cache = createCompilationCache(2);

            cache.set('A', { id: 1 }, { id: 1 });
            cache.set('B', { id: 2 }, { id: 2 });

            // Access A to make it recently used
            cache.get('A', { id: 1 });

            // Add C — should evict B (least recently accessed)
            cache.set('C', { id: 3 }, { id: 3 });

            expect(cache.get('A', { id: 1 })).toEqual({ id: 1 });
            expect(cache.get('B', { id: 2 })).toBeUndefined();
            expect(cache.get('C', { id: 3 })).toEqual({ id: 3 });
        });
    });

    describe('size', () => {
        it('tracks entry count', () => {
            const cache = createCompilationCache(100);
            expect(cache.size).toBe(0);
            cache.set('A', { id: 1 }, { id: 1 });
            expect(cache.size).toBe(1);
            cache.set('B', { id: 2 }, { id: 2 });
            expect(cache.size).toBe(2);
        });
    });

    describe('clear', () => {
        it('removes all entries', () => {
            const cache = createCompilationCache(100);
            cache.set('A', { id: 1 }, { id: 1 });
            cache.set('B', { id: 2 }, { id: 2 });
            expect(cache.size).toBe(2);

            cache.clear();
            expect(cache.size).toBe(0);
            expect(cache.get('A', { id: 1 })).toBeUndefined();
        });
    });

    describe('registry event auto-invalidation', () => {
        it('clears cache on registry register event', () => {
            const handlers: Array<() => void> = [];
            const subscribe = vi.fn((_event: string, handler: () => void) => {
                handlers.push(handler);
                return () => { /* unsubscribe */ };
            });

            const cache = createCompilationCache(100, subscribe);
            cache.set('A', { id: 1 }, { id: 1 });
            expect(cache.size).toBe(1);

            // Simulate registry event
            for (const handler of handlers) {
                handler();
            }

            expect(cache.size).toBe(0);
        });

        it('subscribes to register, unregister, and update events', () => {
            const subscribe = vi.fn((_event: string, _handler: () => void) => {
                return () => { /* unsubscribe */ };
            });

            createCompilationCache(100, subscribe);

            expect(subscribe).toHaveBeenCalledTimes(3);
            expect(subscribe).toHaveBeenCalledWith('register', expect.any(Function));
            expect(subscribe).toHaveBeenCalledWith('unregister', expect.any(Function));
            expect(subscribe).toHaveBeenCalledWith('update', expect.any(Function));
        });
    });

    describe('dispose', () => {
        it('clears cache and unsubscribes from events', () => {
            const unsubscribe = vi.fn();
            const subscribe = vi.fn(() => unsubscribe);

            const cache = createCompilationCache(100, subscribe);
            cache.set('A', { id: 1 }, { id: 1 });

            cache.dispose();
            expect(cache.size).toBe(0);
            expect(unsubscribe).toHaveBeenCalledTimes(3);
        });
    });
});
