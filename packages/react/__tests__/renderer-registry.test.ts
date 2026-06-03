/**
 * @module @enterstellar-ai/react/__tests__/renderer-registry.test
 * @description Unit tests for the module-level singleton `RendererRegistry`.
 *
 * Covers:
 * - `register()`: adds renderer, overwrites existing.
 * - `get()`: retrieves renderer, returns `undefined` for unknown.
 * - `has()`: boolean lookup.
 * - `unregister()`: removes renderer, returns false for unknown.
 * - `size`: returns correct count.
 * - `clear()`: removes all renderers.
 * - `createRendererRegistry()`: factory creates independent instances.
 * - `registerRenderer()`: convenience function delegates to singleton.
 * - Empty name throws.
 *
 * @see Design Choice R6, RE13, L15
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
    createRendererRegistry,
    rendererRegistry,
    registerRenderer,
} from '../src/renderer-registry.js';
import type { RendererRegistry } from '../src/renderer-registry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock React component. */
const MockComponentA = (_props: Record<string, unknown>): null => null;
const MockComponentB = (_props: Record<string, unknown>): null => null;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRendererRegistry()', () => {
    let registry: RendererRegistry;

    beforeEach(() => {
        registry = createRendererRegistry();
    });

    // -----------------------------------------------------------------------
    // register()
    // -----------------------------------------------------------------------

    describe('register()', () => {
        it('registers a renderer by name', () => {
            registry.register('PatientVitals', MockComponentA);

            expect(registry.has('PatientVitals')).toBe(true);
            expect(registry.get('PatientVitals')).toBe(MockComponentA);
        });

        it('overwrites an existing renderer with the same name', () => {
            registry.register('PatientVitals', MockComponentA);
            registry.register('PatientVitals', MockComponentB);

            expect(registry.get('PatientVitals')).toBe(MockComponentB);
            expect(registry.size).toBe(1);
        });

        it('throws on empty name', () => {
            expect(() => { registry.register('', MockComponentA); }).toThrow(
                'Renderer name must be a non-empty string.',
            );
        });

        it('accepts multiple distinct components', () => {
            registry.register('CompA', MockComponentA);
            registry.register('CompB', MockComponentB);

            expect(registry.size).toBe(2);
            expect(registry.get('CompA')).toBe(MockComponentA);
            expect(registry.get('CompB')).toBe(MockComponentB);
        });
    });

    // -----------------------------------------------------------------------
    // get()
    // -----------------------------------------------------------------------

    describe('get()', () => {
        it('returns undefined for an unregistered name', () => {
            expect(registry.get('NonExistent')).toBeUndefined();
        });

        it('returns the correct component after registration', () => {
            registry.register('AlertBanner', MockComponentA);
            expect(registry.get('AlertBanner')).toBe(MockComponentA);
        });
    });

    // -----------------------------------------------------------------------
    // has()
    // -----------------------------------------------------------------------

    describe('has()', () => {
        it('returns false for an unregistered name', () => {
            expect(registry.has('NonExistent')).toBe(false);
        });

        it('returns true after registration', () => {
            registry.register('AlertBanner', MockComponentA);
            expect(registry.has('AlertBanner')).toBe(true);
        });

        it('returns false after unregister', () => {
            registry.register('AlertBanner', MockComponentA);
            registry.unregister('AlertBanner');
            expect(registry.has('AlertBanner')).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // unregister()
    // -----------------------------------------------------------------------

    describe('unregister()', () => {
        it('removes a registered renderer and returns true', () => {
            registry.register('AlertBanner', MockComponentA);

            const result = registry.unregister('AlertBanner');

            expect(result).toBe(true);
            expect(registry.has('AlertBanner')).toBe(false);
            expect(registry.size).toBe(0);
        });

        it('returns false for non-existent renderer', () => {
            expect(registry.unregister('NonExistent')).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // size
    // -----------------------------------------------------------------------

    describe('size', () => {
        it('returns 0 for empty registry', () => {
            expect(registry.size).toBe(0);
        });

        it('reflects the number of registered renderers', () => {
            registry.register('A', MockComponentA);
            registry.register('B', MockComponentB);

            expect(registry.size).toBe(2);
        });

        it('decrements after unregister', () => {
            registry.register('A', MockComponentA);
            registry.register('B', MockComponentB);
            registry.unregister('A');

            expect(registry.size).toBe(1);
        });
    });

    // -----------------------------------------------------------------------
    // clear()
    // -----------------------------------------------------------------------

    describe('clear()', () => {
        it('removes all renderers', () => {
            registry.register('A', MockComponentA);
            registry.register('B', MockComponentB);

            registry.clear();

            expect(registry.size).toBe(0);
            expect(registry.has('A')).toBe(false);
            expect(registry.has('B')).toBe(false);
        });

        it('is idempotent on empty registry', () => {
            registry.clear();
            expect(registry.size).toBe(0);
        });
    });
});

// ---------------------------------------------------------------------------
// Factory Independence
// ---------------------------------------------------------------------------

describe('createRendererRegistry() factory independence', () => {
    it('creates independent instances', () => {
        const reg1 = createRendererRegistry();
        const reg2 = createRendererRegistry();

        reg1.register('A', MockComponentA);

        expect(reg1.has('A')).toBe(true);
        expect(reg2.has('A')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Module-Level Singleton
// ---------------------------------------------------------------------------

describe('rendererRegistry (module-level singleton)', () => {
    beforeEach(() => {
        rendererRegistry.clear();
    });

    it('is a RendererRegistry instance', () => {
        expect(rendererRegistry).toBeDefined();
        expect(typeof rendererRegistry.register).toBe('function');
        expect(typeof rendererRegistry.get).toBe('function');
        expect(typeof rendererRegistry.has).toBe('function');
    });

    it('persists state across accesses', () => {
        rendererRegistry.register('Singleton', MockComponentA);
        expect(rendererRegistry.has('Singleton')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// registerRenderer() Convenience Function
// ---------------------------------------------------------------------------

describe('registerRenderer()', () => {
    beforeEach(() => {
        rendererRegistry.clear();
    });

    it('delegates to the module-level singleton', () => {
        registerRenderer('Convenience', MockComponentB);

        expect(rendererRegistry.has('Convenience')).toBe(true);
        expect(rendererRegistry.get('Convenience')).toBe(MockComponentB);
    });

    it('throws on empty name (delegates error handling)', () => {
        expect(() => { registerRenderer('', MockComponentA); }).toThrow(
            'Renderer name must be a non-empty string.',
        );
    });
});
