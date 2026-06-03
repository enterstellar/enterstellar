/**
 * @module @enterstellar-ai/contracts-shadcn/register
 * @description Registration API for pairing shadcn/ui components with
 * Enterstellar ComponentContracts.
 *
 * shadcn/ui uses a **code-copy distribution model** — components are copied
 * into the developer's source tree (e.g., `@/components/ui/button`), not
 * installed from npm. This means there is no universal import path for
 * shadcn components that this package can reference directly.
 *
 * Instead, the developer provides their local component imports via
 * {@link registerShadcnContracts}:
 *
 * @example
 * ```ts
 * import { registerShadcnContracts } from '@enterstellar-ai/contracts-shadcn';
 * import { Button } from '@/components/ui/button';
 * import { Card } from '@/components/ui/card';
 *
 * const contracts = registerShadcnContracts({ Button, Card });
 * const registry = createRegistry({ components: [...myContracts, ...contracts] });
 * ```
 *
 * ## Validation Rules
 *
 * 1. **Unknown keys** → throw with Levenshtein fuzzy suggestion.
 * 2. **`undefined`/`null` values** → throw with `npx shadcn add` hint.
 * 3. **Missing keys** → `console.warn` with GenericCard fallback message.
 * 4. **Valid components** → `defineComponent()` pairing.
 *
 * @see Correction 7 Decision 2 — Code-Copy Libraries
 * @see Correction 7 Decision 3 — CI Sync Pipeline
 */

import type { ComponentType } from 'react'; // type-only — erased at compile time (Audit N1)

import type { ComponentContract } from '@enterstellar-ai/types';
import * as Registry from '@enterstellar-ai/registry';             // Audit E2: explicit import
import type { ComponentContractInput } from '@enterstellar-ai/registry';   // Audit E1: from @enterstellar-ai/registry, NOT @enterstellar-ai/types
import { defineComponent } from '@enterstellar-ai/react';

import { SHADCN_CONTRACTS } from './contracts/index.js';
import type { ShadcnContractName } from './contracts/index.js';
import { findClosestMatch } from './utils/levenshtein.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Map of component names to React components provided by the developer.
 *
 * Keys must match contract names (PascalCase). Validation rules:
 * - **Unknown keys** throw an `Error` with a Levenshtein-based fuzzy
 *   suggestion (e.g., "Did you mean 'Button'?" when given 'Buttn').
 * - **`undefined`/`null` values** throw an `Error` with a
 *   `npx shadcn@latest add` hint for the missing component.
 * - **Missing keys** log `console.warn` — the contract is registered
 *   without a renderer, which falls back to `GenericCard`.
 *
 * Uses `Record<string, unknown>` to match `defineComponent()`'s
 * `TProps extends Record<string, unknown>` constraint (Audit M7).
 *
 * @see Correction 7 Decision 2 — registerShadcnContracts() pairing pattern
 * @see defineComponent — TProps constraint
 */
export type ShadcnComponentMap = Partial<
    Record<ShadcnContractName, ComponentType<Record<string, unknown>>>
>;

// ---------------------------------------------------------------------------
// Registration API
// ---------------------------------------------------------------------------

/**
 * Registers shadcn/ui contracts and pairs them with the developer's
 * local component implementations.
 *
 * **Validation sequence:**
 * 1. Iterate over all keys in the provided `components` map.
 * 2. For each key NOT in `SHADCN_CONTRACTS`, throw with a Levenshtein
 *    fuzzy suggestion (if one exists within distance ≤ 3).
 * 3. Iterate over all entries in `SHADCN_CONTRACTS`:
 *    - If the key was explicitly passed as `undefined` or `null`,
 *      throw with `npx shadcn@latest add <name>` hint.
 *    - If the key was not provided at all, `console.warn` that
 *      GenericCard fallback will be used, and register the contract
 *      without a renderer via `defineComponent()`.
 *    - If the key was provided with a valid component, pair via
 *      `defineComponent()` and collect the validated contract.
 *
 * @param components - Map of contract names to local React components.
 *   Keys must be PascalCase and match known contract names.
 * @returns Readonly array of validated `ComponentContract` objects for
 *   `createRegistry({ components: [...] })`.
 * @throws {Error} If a key doesn't match any known contract
 *   (with Levenshtein-based fuzzy suggestion).
 * @throws {Error} If a component value is explicitly `undefined` or `null`
 *   (with `npx shadcn@latest add` hint).
 *
 * @example
 * ```ts
 * import { registerShadcnContracts } from '@enterstellar-ai/contracts-shadcn';
 * import { Button } from '@/components/ui/button';
 * import { Card } from '@/components/ui/card';
 * import { Dialog } from '@/components/ui/dialog';
 *
 * const contracts = registerShadcnContracts({ Button, Card, Dialog });
 *
 * const registry = createRegistry({
 *     components: [...myContracts, ...contracts],
 * });
 * ```
 *
 * @see Correction 7 Decision 2 — Code-Copy Libraries
 * @see defineComponent — internal pairing mechanism
 */
export function registerShadcnContracts(
    components: ShadcnComponentMap,
): readonly ComponentContract[] {
    const contracts: ComponentContract[] = [];
    const knownNames = Object.keys(SHADCN_CONTRACTS);

    // -------------------------------------------------------------------------
    // Phase 1: Validate unknown keys (throw with fuzzy suggestion)
    // -------------------------------------------------------------------------
    // Check every key the developer provided against the known contract names.
    // This runs first so the developer gets immediate feedback on typos before
    // any contracts are registered.
    for (const key of Object.keys(components)) {
        if (!(key in SHADCN_CONTRACTS)) {
            const suggestion = findClosestMatch(key, knownNames);
            const hint = suggestion !== undefined
                ? ` Did you mean '${suggestion}'?`
                : '';
            throw new Error(
                `'${key}' is not a known shadcn contract.${hint}`,
            );
        }
    }

    // -------------------------------------------------------------------------
    // Phase 2: Register each known contract
    // -------------------------------------------------------------------------
    for (const [name, contractInput] of Object.entries(SHADCN_CONTRACTS)) {
        const typedInput: ComponentContractInput = contractInput;

        // Check if the developer provided this key at all.
        const isProvided = name in components;
        const component = (components as Record<string, ComponentType<Record<string, unknown>> | undefined>)[name];

        // --- Case: explicitly passed undefined/null ---
        // The developer listed the key but didn't provide a component.
        // This is likely a mistake — they intended to provide it but forgot
        // to install/import it.
        if (isProvided && component == null) {
            throw new Error(
                `Component '${name}' was not provided (received ${String(component)}). ` +
                `Run 'npx shadcn@latest add ${name.toLowerCase()}' to add it.`,
            );
        }

        // --- Case: not provided at all ---
        // The developer didn't list this key in the map. This is intentional —
        // they don't have this component installed. Register the contract
        // without a renderer so GenericCard can fall back.
        if (component === undefined) {
            console.warn(
                `Shadcn${name}: contract registered without renderer. ` +
                `<Zone> will use GenericCard fallback. ` +
                `Pass ${name} to registerShadcnContracts() to enable full rendering.`,
            );
            contracts.push(Registry.defineComponent(typedInput));
            continue;
        }

        // --- Case: provided with a valid component ---
        // Pair the contract with the developer's local component implementation
        // via defineComponent(). This validates the contract, freezes it,
        // and registers the renderer in the module-level RendererRegistry.
        const { contract } = defineComponent({
            contract: typedInput,
            render: component,
        });
        contracts.push(contract);
    }

    return contracts;
}
