/**
 * @module @enterstellar-ai/react/define-enterstellar-component
 * @description Convenience wrapper that pairs a `ComponentContract` with a
 * React component renderer in a single call.
 *
 * This is **syntax sugar** — it calls `defineComponent()` from `@enterstellar-ai/registry`
 * to create and validate the contract, then registers the React renderer in
 * the module-level `RendererRegistry` singleton. The underlying storages
 * are always separate:
 *
 * - **Contract** → `@enterstellar-ai/registry` (pure data, framework-agnostic)
 * - **Renderer** → `@enterstellar-ai/react` `rendererRegistry` (React-specific)
 *
 * This split preserves the isomorphic/universal nature of the system:
 * contracts work everywhere (server, worker, native); renderers are
 * platform-specific.
 *
 * @see Design Choice R6 — `ComponentContract` has NO `render` field in core
 * @see Design Choice RE13 — string-based renderer lookup
 * @see Principle L15 — platform-agnostic engine
 *
 * @example
 * ```tsx
 * import { defineComponent } from '@enterstellar-ai/react';
 * import { z } from 'zod';
 *
 * const PatientVitals = (props: { patientId: string; riskLevel: string }) => (
 *   <div>Vitals for {props.patientId} — Risk: {props.riskLevel}</div>
 * );
 *
 * const { contract } = defineComponent({
 *   contract: {
 *     name: 'PatientVitals',
 *     description: 'Displays real-time patient vital signs with risk assessment.',
 *     category: 'clinical',
 *     tags: ['patient', 'vitals', 'monitoring'],
 *     props: z.object({
 *       patientId: z.string(),
 *       riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
 *     }),
 *     accessibility: { role: 'region', ariaLabel: 'Patient Vitals' },
 *   },
 *   render: PatientVitals,
 * });
 *
 * // `contract` is now a frozen ComponentContract.
 * // `PatientVitals` is registered in the rendererRegistry under 'PatientVitals'.
 * ```
 */

import type { ComponentType } from 'react';

import type { ComponentContract } from '@enterstellar-ai/types';
import * as Registry from '@enterstellar-ai/registry';
import type { ComponentContractInput } from '@enterstellar-ai/registry';

import { rendererRegistry } from './renderer-registry.js';

// ---------------------------------------------------------------------------
// Config Type
// ---------------------------------------------------------------------------

/**
 * Configuration for `defineComponent()`.
 *
 * @typeParam TProps - The props type for the React component renderer.
 */
export type DefineComponentConfig<TProps extends Record<string, unknown>> = {
    /**
     * The component contract input. Validated and frozen by `defineComponent()`.
     * Must not include a `render` field — that's the separate `render` prop.
     */
    readonly contract: ComponentContractInput;
    /**
     * The React component that renders this contract.
     * Registered in the module-level `RendererRegistry`.
     */
    readonly render: ComponentType<TProps>;
};

// ---------------------------------------------------------------------------
// Result Type
// ---------------------------------------------------------------------------

/**
 * Return value from `defineComponent()`.
 *
 * @typeParam TProps - The props type for the React component renderer.
 */
export type DefineComponentResult<TProps extends Record<string, unknown>> = {
    /** The validated, frozen `ComponentContract`. */
    readonly contract: ComponentContract;
    /** The React component renderer (same reference passed in). */
    readonly render: ComponentType<TProps>;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Defines an Enterstellar component: validates the contract AND registers the
 * React renderer in a single call.
 *
 * **What happens internally:**
 * 1. `defineComponent(config.contract)` validates and freezes the contract.
 * 2. `rendererRegistry.register(contract.name, config.render)` maps the
 *    component name to the React component in the module-level singleton.
 *
 * **The contract and renderer are always stored separately:**
 * - Contract → `@enterstellar-ai/registry` (via `createRegistry({ components: [...] })`)
 * - Renderer → `@enterstellar-ai/react` `rendererRegistry` module singleton
 *
 * @param config - The contract input + React component.
 * @returns The frozen contract and the renderer reference.
 * @throws {EnterstellarError} If the contract fails validation (R1–R9).
 *
 * @see Design Choice R4 — returns frozen `ComponentContract`
 * @see Design Choice R5 — validates immediately (fail-fast)
 * @see Design Choice R6 — render not on ComponentContract
 */
export function defineComponent<
    TProps extends Record<string, unknown>,
>(
    config: DefineComponentConfig<TProps>,
): DefineComponentResult<TProps> {
    // Step 1: Validate and freeze the contract (R4, R5)
    const contract = Registry.defineComponent(config.contract);

    // Step 2: Register the renderer in the module-level singleton.
    //
    // Widening cast: ComponentType<TProps> → ComponentType<Record<string, unknown>>.
    // This is structurally safe because:
    // 1. TProps extends Record<string, unknown> (generic constraint).
    // 2. The compiler Zod-validates props against the contract schema before
    //    they reach the renderer — the renderer always receives valid TProps.
    // 3. React's ComponentType is invariant on its props parameter, making
    //    this cast necessary at the type boundary. It is NOT a suppression.
    //
    // @see Design Choice R5 — fail-fast validation before render.
    rendererRegistry.register(
        contract.name,
        config.render as ComponentType<Record<string, unknown>>,
    );

    return {
        contract,
        render: config.render,
    };
}
