/**
 * @module @enterstellar-ai/test/harness-auto-mock
 * @description Implements the `autoMock()` method for the test harness.
 *
 * Auto-generates mock `ComponentIntent` responses for every component
 * registered in the provided `EnterstellarRegistry`. Uses the contract's `examples`
 * field when available; falls back to a minimal intent with empty props.
 *
 * Existing mock entries are **not overwritten** — user-defined mocks
 * always take precedence over auto-generated ones.
 *
 * @see Implementation Bible §4.5 — `harness.autoMock()` specification.
 * @see Design Choice TE1 — `harness.autoMock(registry)`.
 * @see Design Choice TE2 — auto-generated mock definition mode.
 */

import type { EnterstellarRegistry } from '@enterstellar-ai/registry';
import type { ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// autoMock Implementation
// ---------------------------------------------------------------------------

/**
 * Auto-generates mock responses for all registered components.
 *
 * For each component in the registry:
 * 1. If the component already has a mock entry, **skip it** (preserves
 *    user-defined mocks from `harness.mock()` or `config.mockResponses`).
 * 2. If the contract has `examples` entries, creates a `ComponentIntent`
 *    from the **first** example's `intent` and `props`.
 * 3. If no examples exist, creates a minimal mock keyed by the component
 *    name with empty props (the compiler will report schema errors,
 *    which is the expected behavior for "untested" components).
 *
 * @param registry - The `EnterstellarRegistry` to iterate.
 * @param mockResponses - The mutable mock response map to populate.
 *
 * @internal This function is called by `createTestHarness().autoMock()`.
 */
export function autoMock(
    registry: EnterstellarRegistry,
    mockResponses: Map<string, ComponentIntent>,
): void {
    const componentNames = registry.list();

    for (const name of componentNames) {
        const contract = registry.get(name);

        // Guard: registry.get() returns ComponentContract | undefined.
        // Skip if the contract was removed between list() and get() calls.
        if (contract === undefined) {
            continue;
        }

        // Check if the contract has example data (ComponentExample[]).
        // If examples exist, use the first example's intent string as the
        // mock key and its props as the mock response.
        if (contract.examples.length > 0) {
            const firstExample = contract.examples[0];

            // Guard: noUncheckedIndexedAccess means firstExample could be undefined
            if (firstExample === undefined) {
                continue;
            }

            const intentKey = firstExample.intent;

            // Do NOT overwrite existing mocks — user-defined mocks take precedence.
            if (!mockResponses.has(intentKey)) {
                const intent: ComponentIntent = {
                    component: name,
                    props: { ...firstExample.props },
                    confidence: 1.0, // Mock intents have full confidence
                };
                mockResponses.set(intentKey, intent);
            }
        }

        // Always create a fallback mock keyed by the component name itself.
        // This allows `harness.resolve('PatientVitals')` to work even if
        // no example intents are defined.
        if (!mockResponses.has(name)) {
            const fallbackIntent: ComponentIntent = {
                component: name,
                props: {},
                confidence: 1.0, // Mock intents have full confidence
            };
            mockResponses.set(name, fallbackIntent);
        }
    }
}
