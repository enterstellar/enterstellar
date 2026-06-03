/**
 * @module @enterstellar-ai/registry/merge-registries
 * @description `mergeRegistries()` — utility for combining multiple registries.
 *
 * Enterstellar supports multiple registries (e.g., `clinicalRegistry`, `adminRegistry`)
 * but `Provider` receives ONE merged registry. No nesting, no context
 * shadowing — explicit merge is deterministic and debuggable.
 *
 * @see Design Choice R2 — `mergeRegistries(a, b)` → single registry for provider.
 * @see Design Choice R10 — duplicate names across registries → throw.
 * @see Design Choice R19 — token merge: first-wins + conflict warning.
 *
 * @example
 * ```ts
 * import { createRegistry, mergeRegistries } from '@enterstellar-ai/registry';
 *
 * const clinical = createRegistry({ components: [PatientVitals, LabResults] });
 * const admin = createRegistry({ components: [UserSettings, AuditLog] });
 *
 * const merged = mergeRegistries(clinical, admin);
 * merged.list(); // ['AuditLog', 'LabResults', 'PatientVitals', 'UserSettings']
 * ```
 */

import type { ComponentContract } from '@enterstellar-ai/types';

import type { EnterstellarRegistry } from './types.js';
import { createRegistry } from './create-registry.js';
import { duplicateNameError } from './errors.js';

// ---------------------------------------------------------------------------
// mergeRegistries()
// ---------------------------------------------------------------------------

/**
 * Merges multiple `EnterstellarRegistry` instances into a single registry.
 *
 * All components from all input registries are registered in the merged
 * registry. Throws `EnterstellarError` with code `ENS-1001` if any component name
 * appears in more than one input registry.
 *
 * Design tokens are merged with first-wins policy: the first registry
 * that defines a token key wins. Conflicts produce a `console.warn`.
 *
 * @param registries - Two or more `EnterstellarRegistry` instances to merge.
 * @returns A new `EnterstellarRegistry` containing all components and merged tokens.
 * @throws {EnterstellarError} If duplicate component names exist across registries.
 *
 * @see Design Choice R2 — single merged registry for `Provider`.
 */
export function mergeRegistries(...registries: readonly EnterstellarRegistry[]): EnterstellarRegistry {
    // ----- Collect all contracts and detect cross-registry duplicates -----
    const allContracts: ComponentContract[] = [];
    const seenNames = new Set<string>();

    for (const registry of registries) {
        const names = registry.list();
        for (const name of names) {
            if (seenNames.has(name)) {
                throw duplicateNameError(name);
            }
            seenNames.add(name);

            const contract = registry.get(name);
            if (contract !== undefined) {
                allContracts.push(contract);
            }
        }
    }

    // ----- Merge design tokens (first-wins across registries) -----
    const mergedTokens: Record<string, string> = {};
    for (const registry of registries) {
        const tokens = registry.getDesignTokens();
        for (const [key, value] of Object.entries(tokens)) {
            if (key in mergedTokens) {
                const existingValue = mergedTokens[key];
                if (existingValue !== value) {
                    console.warn(
                        `[Enterstellar Registry] Design token conflict during merge: '${key}' already defined as ` +
                        `'${String(existingValue)}', ignoring '${value}'. First-wins policy applied.`,
                    );
                }
            } else {
                mergedTokens[key] = value;
            }
        }
    }

    // ----- Create merged registry -----
    return createRegistry({
        components: allContracts,
        designTokens: mergedTokens,
    });
}
