/**
 * @module @enterstellar-ai/registry
 * @description Enterstellar Component Registry — `defineComponent()`, `createRegistry()`,
 * `mergeRegistries()`, and supporting types.
 *
 * This barrel file re-exports the public API surface. Consumers import from
 * `@enterstellar-ai/registry`. Internal modules can import from specific files for
 * faster builds.
 *
 * @see Implementation Bible §4.1
 * @see Design Choices R1–R20
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
export { defineComponent } from './define-component.js';
export { createRegistry } from './create-registry.js';
export { mergeRegistries } from './merge-registries.js';

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
export { generateManifest } from './manifest-generator.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export { validateContract } from './validators/contract-validator.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
    EnterstellarRegistry,
    RegistryConfig,
    RegistryEvent,
    RegistryEventHandler,
    ValidationResult,
    ValidationViolation,
    PublishTarget,
    PublishResult,
    RemoteRegistryConfig,
    ComponentContractInput,
} from './types.js';
