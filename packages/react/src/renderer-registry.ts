/**
 * @module @enterstellar-ai/react/renderer-registry
 * @description Module-level singleton registry for React component renderers.
 *
 * **Architecture (R6/RE13/L15):**
 * The `EnterstellarRegistry` from `@enterstellar-ai/registry` stores pure data contracts
 * (`ComponentContract`) with zero framework imports. The `RendererRegistry`
 * here is the React-specific counterpart: it maps component names to their
 * React `ComponentType` implementations.
 *
 * This registry is a **module-level singleton** — NOT stored inside React
 * context. This means:
 * - Renderers can be registered at module scope (import time).
 * - Headless tests (Node.js/Vitest) can register renderers without mounting
 *   a React tree.
 * - `Provider` reads from this registry during the render phase.
 * - The compiler can run in a Web Worker or server where `RendererRegistry`
 *   is empty — validation still works via `EnterstellarRegistry`.
 *
 * @see Design Choice R6 — `render` not on ComponentContract
 * @see Design Choice RE13 — string-based renderer lookup
 * @see Principle L15 — platform-agnostic engine
 *
 * @example
 * ```ts
 * import { rendererRegistry, registerRenderer } from '@enterstellar-ai/react';
 * import { PatientVitals } from './components/patient-vitals';
 *
 * registerRenderer('PatientVitals', PatientVitals);
 *
 * // Or via defineComponent() convenience wrapper:
 * import { defineComponent } from '@enterstellar-ai/react';
 * defineComponent({ contract: vitalsContract, render: PatientVitals });
 * ```
 */

import type { EnterstellarComponentRenderer } from './types.js';
import { EnterstellarError } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// RendererRegistry Interface
// ---------------------------------------------------------------------------

/**
 * A registry mapping component names to their React component implementations.
 *
 * This is the React-specific complement to `EnterstellarRegistry` (which holds
 * pure data contracts). The split ensures `@enterstellar-ai/registry` has zero
 * framework imports (L15).
 *
 * @see Design Choice R6, RE13
 */
export interface RendererRegistry {
    /**
     * Registers a React component renderer for a named component.
     *
     * @param name - PascalCase component name (must match `ComponentContract.name`).
     * @param component - The React component to render for this contract.
     * @throws {EnterstellarError} `ENS-3001` if `name` is empty.
     */
    register(name: string, component: EnterstellarComponentRenderer): void;

    /**
     * Retrieves the React component for a named component.
     *
     * @param name - PascalCase component name.
     * @returns The React component, or `undefined` if not registered.
     */
    get(name: string): EnterstellarComponentRenderer | undefined;

    /**
     * Checks if a renderer is registered for the given name.
     *
     * @param name - PascalCase component name.
     * @returns `true` if a renderer is registered, `false` otherwise.
     */
    has(name: string): boolean;

    /**
     * Removes a registered renderer by name.
     *
     * @param name - PascalCase component name.
     * @returns `true` if the renderer was removed, `false` if not found.
     */
    unregister(name: string): boolean;

    /**
     * Returns the total number of registered renderers.
     */
    readonly size: number;

    /**
     * Removes all registered renderers. Useful for test teardown.
     */
    clear(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a new `RendererRegistry` instance.
 *
 * This is used internally to create the module-level singleton.
 * Consumers typically don't call this directly — use `registerRenderer()`
 * and `rendererRegistry` instead.
 *
 * @returns A new `RendererRegistry` backed by a `Map`.
 */
export function createRendererRegistry(): RendererRegistry {
    const renderers = new Map<string, EnterstellarComponentRenderer>();

    return {
        register(name: string, component: EnterstellarComponentRenderer): void {
            if (!name) {
                throw new EnterstellarError(
                    'ENS-3001',
                    'react',
                    'Renderer name must be a non-empty string.',
                    false,
                );
            }
            renderers.set(name, component);
        },

        get(name: string): EnterstellarComponentRenderer | undefined {
            return renderers.get(name);
        },

        has(name: string): boolean {
            return renderers.has(name);
        },

        unregister(name: string): boolean {
            return renderers.delete(name);
        },

        get size(): number {
            return renderers.size;
        },

        clear(): void {
            renderers.clear();
        },
    };
}

// ---------------------------------------------------------------------------
// Module-Level Singleton
// ---------------------------------------------------------------------------

/**
 * The global renderer registry singleton for `@enterstellar-ai/react`.
 *
 * Components are registered here at module scope and resolved by
 * `Zone` during the render phase. This singleton is the
 * canonical source of truth for React component lookups.
 *
 * @example
 * ```ts
 * import { rendererRegistry } from '@enterstellar-ai/react';
 *
 * console.log(rendererRegistry.size); // 0
 * rendererRegistry.register('PatientVitals', PatientVitalsComponent);
 * console.log(rendererRegistry.has('PatientVitals')); // true
 * ```
 */
export const rendererRegistry: RendererRegistry = createRendererRegistry();

// ---------------------------------------------------------------------------
// Convenience Function
// ---------------------------------------------------------------------------

/**
 * Registers a React component renderer in the global registry.
 *
 * Shorthand for `rendererRegistry.register(name, component)`.
 *
 * @param name - PascalCase component name (must match `ComponentContract.name`).
 * @param component - The React component to render.
 *
 * @example
 * ```ts
 * import { registerRenderer } from '@enterstellar-ai/react';
 * import { PatientVitals } from './components/patient-vitals';
 *
 * registerRenderer('PatientVitals', PatientVitals);
 * ```
 */
export function registerRenderer(
    name: string,
    component: EnterstellarComponentRenderer,
): void {
    rendererRegistry.register(name, component);
}
