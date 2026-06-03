/**
 * @module @enterstellar-ai/contracts-shadcn
 * @description Pre-converted Enterstellar ComponentContracts for shadcn/ui.
 *
 * shadcn/ui uses a **code-copy distribution model** — components are
 * copied into the developer's source tree, not installed from npm.
 * This means there is no universal import path for shadcn components
 * that this package can reference directly.
 *
 * Instead, the developer provides their local component imports via
 * the {@link registerShadcnContracts} function:
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
 * ## Current State
 *
 * - **Registration logic:** Production-grade. Validates unknown keys
 *   (Levenshtein fuzzy suggestion), `undefined`/`null` values
 *   (`npx shadcn add` hint), and missing keys (GenericCard fallback).
 * - **Contracts:** Empty. Populated by the CI sync pipeline
 *   (`sync-contracts-shadcn.yml`) after running `enterstellar migrate` against
 *   upstream shadcn/ui source components.
 * - **Once contracts land**, `registerShadcnContracts()` will validate
 *   and pair them with local component implementations via
 *   `defineComponent()`.
 *
 * @see Correction 7 Decision 2 — Code-Copy Libraries
 * @see Correction 7 Decision 3 — CI Sync Pipeline
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Registration API
// ---------------------------------------------------------------------------

export { registerShadcnContracts } from './register.js';
export type { ShadcnComponentMap } from './register.js';

// ---------------------------------------------------------------------------
// Contract Data
// ---------------------------------------------------------------------------

export { SHADCN_CONTRACTS } from './contracts/index.js';
export type { ShadcnContractName } from './contracts/index.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export { levenshteinDistance, findClosestMatch } from './utils/levenshtein.js';
