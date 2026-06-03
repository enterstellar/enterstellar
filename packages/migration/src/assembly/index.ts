/**
 * @module @enterstellar-ai/migration/assembly
 * @description Phase 3 — Contract and test file assembly.
 *
 * Re-exports the contract assembler, test scaffold generator, and
 * example props generator. Internal builder helpers (`buildStates`,
 * `buildTokens`, `buildAccessibility`, `serializeZodSchema`, etc.)
 * are internal and not re-exported — consumers call `assembleContract()`
 * which orchestrates all builders.
 *
 * @see Correction 1 — Phase 3 Assembly: Mapping Manifest → ComponentContract
 * @see Correction 1 — Provenance Header: Machine-Readable Migration Metadata
 */

// --- Contract assembly ---
export { assembleContract } from './assemble-contract.js';
export type { ContractAssemblyResult } from './assemble-contract.js';

// --- Test scaffold ---
export { assembleTest } from './assemble-test.js';

// --- Example props generation ---
export { generateExampleProps } from './generate-example-props.js';
