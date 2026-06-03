/**
 * @module @enterstellar-ai/registry/types
 * @description Registry-local type definitions.
 *
 * This file declares the `EnterstellarRegistry` interface (the public API surface),
 * `RegistryConfig` (factory configuration), `ValidationResult` (rule check
 * output), and event-related types for the EventEmitter pattern.
 *
 * **Naming:** Interfaces for objects with methods (`EnterstellarRegistry`), types for
 * data shapes (`RegistryConfig`, `ValidationResult`) — per Design Choice T1.
 *
 * **L15 compliance:** Zero framework imports. This module is platform-agnostic.
 *
 * @see Implementation Bible §4.1
 * @see Design Choices R1–R20
 */

import type { z } from 'zod';

import type {
    ComponentContract,
    CompactManifestEntry,
    DesignTokenSet,
} from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Input Type (what the developer passes to defineComponent)
// ---------------------------------------------------------------------------

/**
 * Input shape for `defineComponent()`.
 *
 * Omits auto-generated fields (`id`, `_meta`) that are populated internally
 * by the factory. The developer provides the contract's domain-relevant data.
 *
 * @see Design Choice R4 — `defineComponent()` returns a frozen `ComponentContract`.
 * @see Design Choice R5 — validation happens immediately, not at registration time.
 */
export type ComponentContractInput = Omit<ComponentContract, 'id' | '_meta'>;

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

/**
 * A single validation violation from contract validation.
 * Each violation maps to one of the 10 registration-time rules (R1–R10).
 */
export type ValidationViolation = {
    /** The validation rule that was violated (e.g., `'R1'`, `'R2'`). */
    readonly rule: string;
    /** Human-readable description of the violation. */
    readonly message: string;
    /** The field path that caused the violation (e.g., `'name'`, `'tags'`). */
    readonly field: string;
};

/**
 * Result of running all 10 registration-time validation rules on a contract.
 *
 * If `valid` is `true`, `violations` is an empty array.
 * If `valid` is `false`, `violations` contains one entry per failing rule.
 */
export type ValidationResult = {
    /** Whether the contract passed all validation rules. */
    readonly valid: boolean;
    /** List of violations. Empty when `valid` is `true`. */
    readonly violations: readonly ValidationViolation[];
};

// ---------------------------------------------------------------------------
// Event Types (R18)
// ---------------------------------------------------------------------------

/**
 * Events emitted by the registry.
 *
 * - `register` — a new component was registered.
 * - `unregister` — a component was removed.
 * - `update` — an existing component's contract was replaced.
 *
 * @see Design Choice R18 — EventEmitter pattern for DevTools + telemetry.
 */
export type RegistryEvent = 'register' | 'unregister' | 'update';

/**
 * Handler function for registry events.
 * Receives the `ComponentContract` that was registered, unregistered, or updated.
 */
export type RegistryEventHandler = (contract: ComponentContract) => void;

// ---------------------------------------------------------------------------
// Publish Types (R15)
// ---------------------------------------------------------------------------

/**
 * Target configuration for publishing a contract to a remote registry.
 *
 * @see Design Choice R15 — REST `POST /v1/contracts` with locked JSON schema.
 */
export type PublishTarget = {
    /** URL of the remote registry (e.g., `'https://registry.enterstellar.dev'`). */
    readonly registryUrl: string;
    /** Credentials for authenticating with the remote registry. */
    readonly credentials: {
        /** API key for the remote registry. */
        readonly apiKey: string;
    };
};

/**
 * Result returned from a `publish()` call.
 *
 * @see Design Choice R15 — locked response schema.
 */
export type PublishResult = {
    /** Whether the contract was published successfully. */
    readonly published: boolean;
    /** The URL of the published contract on the remote registry. */
    readonly url: string;
};

// ---------------------------------------------------------------------------
// Registry Config
// ---------------------------------------------------------------------------

/**
 * Remote registry configuration for federation.
 *
 * When provided, `createRegistry()` can pull contracts from external registries.
 *
 * @see Design Choice R3 — hybrid loading with runtime `register()`.
 */
export type RemoteRegistryConfig = {
    /** URL of the external registry to sync from. */
    readonly url: string;
    /** Sync interval in milliseconds. */
    readonly syncInterval: number;
};

/**
 * Configuration for `createRegistry()`.
 *
 * @see Design Choice R1 — plain object with closures (no class).
 * @see Design Choice R3 — hybrid loading + runtime `register()`.
 */
export type RegistryConfig = {
    /** Initial set of components to register eagerly. */
    readonly components: readonly ComponentContract[];
    /** Design tokens shared across all components in this registry. */
    readonly designTokens?: DesignTokenSet;
    /** Optional remote registry configuration for federation. */
    readonly remote?: RemoteRegistryConfig;
};

// ---------------------------------------------------------------------------
// EnterstellarRegistry Interface
// ---------------------------------------------------------------------------

/**
 * The Enterstellar Component Registry — the "deck of cards" the LLM is allowed to play.
 *
 * A registry is the runtime container for `ComponentContract` instances. The
 * compiler resolves intents against it, the semantic index embeds its contents,
 * and DevTools observes it via events.
 *
 * **Factory:** Created via `createRegistry(config)`. Returns a plain object
 * with closures — no class instance, no prototype chain (Design Choice R1).
 *
 * **Storage:** Internal `Map<string, ComponentContract>` — O(1) lookups by
 * name. Semantic/fuzzy search is delegated to `@enterstellar-ai/semantic-index` (R17, R20).
 *
 * @see Implementation Bible §4.1
 * @see Design Choices R1–R20
 *
 * @example
 * ```ts
 * import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
 *
 * const PatientVitals = defineComponent({ ... });
 * const registry = createRegistry({ components: [PatientVitals] });
 *
 * registry.get('PatientVitals');  // ComponentContract | undefined
 * registry.list();                // ['PatientVitals']
 * registry.getManifest();         // CompactManifestEntry[]
 * ```
 */
export interface EnterstellarRegistry {
    /**
     * Retrieves a registered component by exact name.
     *
     * @param name - PascalCase component name.
     * @returns The `ComponentContract`, or `undefined` if not found.
     *
     * @see Design Choice R17 — O(1) Map lookup.
     */
    get(name: string): ComponentContract | undefined;

    /**
     * Lists the names of all registered components.
     *
     * @returns Sorted array of PascalCase component names.
     */
    list(): readonly string[];

    /**
     * Registers a new component at runtime.
     *
     * Runs all 10 validation rules on the contract. Throws `EnterstellarError` with
     * code `ENS-1001` if the name is already registered (R10).
     *
     * @param contract - A frozen `ComponentContract` (from `defineComponent()`).
     * @throws {EnterstellarError} If the contract fails validation or the name is a duplicate.
     *
     * @see Design Choice R10 — duplicate name detection.
     * @see Design Choice R18 — emits `'register'` event.
     */
    register(contract: ComponentContract): void;

    /**
     * Removes a registered component by name.
     *
     * @param name - PascalCase component name.
     * @returns `true` if the component was removed, `false` if not found.
     *
     * @see Design Choice R18 — emits `'unregister'` event.
     */
    unregister(name: string): boolean;

    /**
     * Generates the compact manifest for LLM system prompt injection.
     *
     * Each entry contains: name, description, category, prop summaries.
     * Format per Design Choice R8: custom compact JSON, NOT full JSON Schema.
     *
     * @returns Array of `CompactManifestEntry`.
     *
     * @see Design Choice R8 — compact JSON format for token efficiency.
     */
    getManifest(): readonly CompactManifestEntry[];

    /**
     * Returns the Zod schema for a named component's props.
     *
     * @param name - PascalCase component name.
     * @returns The Zod schema for the component's props, or `undefined` if not found.
     */
    getSchema(name: string): z.ZodType | undefined;

    /**
     * Returns the merged design token set from the registry configuration.
     *
     * Merging uses first-wins policy with `console.warn` on conflicts (R19).
     *
     * @returns The `DesignTokenSet` for this registry.
     *
     * @see Design Choice R19 — merged set, first-wins + conflict warning.
     */
    getDesignTokens(): DesignTokenSet;

    /**
     * Validates a contract against all 10 registration-time rules without
     * registering it. Useful for pre-flight checks and `@enterstellar-ai/test`.
     *
     * @param contract - The `ComponentContract` to validate.
     * @returns A `ValidationResult` with all violations (if any).
     *
     * @see Design Choice R7 — all rules always enforced.
     */
    validate(contract: ComponentContract): ValidationResult;

    /**
     * Publishes a contract to a remote registry target.
     *
     * Validates the contract before publishing. Sends `POST /v1/contracts`
     * with the locked request body schema.
     *
     * @param contract - The `ComponentContract` to publish.
     * @param target - The `PublishTarget` containing remote URL and credentials.
     * @returns A `PublishResult` with the published URL.
     * @throws {EnterstellarError} If validation fails or the publish request fails.
     *
     * @see Design Choice R15 — REST API with locked JSON schema.
     */
    publish(contract: ComponentContract, target: PublishTarget): Promise<PublishResult>;

    /**
     * Subscribes to a registry event.
     *
     * @param event - One of `'register'`, `'unregister'`, `'update'`.
     * @param handler - Callback receiving the affected `ComponentContract`.
     * @returns An unsubscribe function.
     *
     * @see Design Choice R18 — EventEmitter pattern.
     */
    on(event: RegistryEvent, handler: RegistryEventHandler): () => void;

    /**
     * Returns the total number of registered components.
     */
    readonly size: number;
}
