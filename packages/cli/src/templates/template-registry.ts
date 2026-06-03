/**
 * @module @enterstellar-ai/cli/templates/template-registry
 * @description Generates `src/enterstellar/registry.ts` for the scaffolded Enterstellar project.
 *
 * Produces a pre-populated registry file that:
 * - Imports `createRegistry` and `defineComponent` from `@enterstellar-ai/registry`
 * - Imports the example design token set from `./tokens`
 * - Imports all 5 example component contracts
 * - Creates and exports a configured `EnterstellarRegistry`
 *
 * The generated code is valid TypeScript that compiles against Enterstellar's
 * strict type system. Every contract passes `defineComponent()` validation.
 *
 * @see Implementation Bible §4.17 — "Pre-populated with 5 example components"
 * @see Design Choice R1, R4
 */

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates the `src/enterstellar/registry.ts` file content for a scaffolded project.
 *
 * The generated file:
 * 1. Imports Enterstellar's `createRegistry` factory and design tokens.
 * 2. Imports all 5 example component contracts from `./components/`.
 * 3. Calls `createRegistry()` with the token set and component array.
 * 4. Exports the registry as the default and named export.
 *
 * @returns A TypeScript source string for `src/enterstellar/registry.ts`.
 *
 * @example
 * ```ts
 * const content = generateRegistry();
 * await writeFile('my-app/src/enterstellar/registry.ts', content);
 * ```
 */
export function generateRegistry(): string {
    return `/**
 * Enterstellar Component Registry
 *
 * This file creates and exports the Enterstellar component registry
 * pre-populated with example components. Add your own components
 * by calling \`registry.register(contract)\` or by adding them
 * to the \`components\` array below.
 *
 * @see https://enterstellar.dev/docs/registry
 */

import { createRegistry } from '@enterstellar-ai/registry';

import { designTokens } from './tokens.js';
import { ExampleCardContract } from './components/ExampleCard.js';
import { ExampleListContract } from './components/ExampleList.js';
import { ExampleChartContract } from './components/ExampleChart.js';
import { ExampleFormContract } from './components/ExampleForm.js';
import { ExampleDetailContract } from './components/ExampleDetail.js';

/**
 * The application's Enterstellar component registry.
 *
 * Contains all registered component contracts and the shared
 * design token set. Pass this to \`<Provider registry={registry}>\`.
 */
export const registry = createRegistry({
  name: 'app-registry',
  version: '0.1.0',
  designSystem: designTokens,
  components: [
    ExampleCardContract,
    ExampleListContract,
    ExampleChartContract,
    ExampleFormContract,
    ExampleDetailContract,
  ],
});
`;
}
