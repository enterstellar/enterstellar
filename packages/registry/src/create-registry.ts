/**
 * @module @enterstellar-ai/registry/create-registry
 * @description `createRegistry()` — factory for creating an `EnterstellarRegistry`.
 *
 * The registry is a runtime container for `ComponentContract` instances.
 * It is the "deck of cards" the LLM is allowed to play. Internally it uses
 * a `Map<string, ComponentContract>` for O(1) lookups by name (R17).
 *
 * **Architecture:** Plain object with closures — no class instance, no
 * prototype chain (Design Choice R1). This makes the registry simpler to
 * test, serialize, and reason about.
 *
 * **Events:** The registry emits `register`, `unregister`, and `update`
 * events (Design Choice R18) for DevTools and telemetry integration.
 *
 * @see Implementation Bible §4.1
 * @see Design Choices R1, R3, R10, R15, R17, R18, R19
 *
 * @example
 * ```ts
 * import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
 * import { z } from 'zod';
 *
 * const PatientVitals = defineComponent({ ... });
 * const registry = createRegistry({
 *   components: [PatientVitals],
 *   designTokens: { danger: 'token:danger', cardBg: 'token:card-bg' },
 * });
 *
 * registry.get('PatientVitals');     // ComponentContract
 * registry.list();                    // ['PatientVitals']
 * registry.getManifest();             // CompactManifestEntry[]
 * ```
 */

import { EnterstellarError } from '@enterstellar-ai/types';
import type { ComponentContract, CompactManifestEntry, DesignTokenSet } from '@enterstellar-ai/types';
import type { z } from 'zod';

import type {
    EnterstellarRegistry,
    RegistryConfig,
    RegistryEvent,
    RegistryEventHandler,
    PublishTarget,
    PublishResult,
    ValidationResult,
} from './types.js';
import { duplicateNameError } from './errors.js';
import { validateContract } from './validators/contract-validator.js';
import { generateManifest } from './manifest-generator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * SDK version string sent with publish requests.
 * Referenced from the package version — update on each release.
 */
const REGISTRY_SDK_VERSION = '0.0.0';

// ---------------------------------------------------------------------------
// Internal Event Emitter
// ---------------------------------------------------------------------------

/**
 * Creates a minimal event emitter for registry events.
 * Lightweight — zero overhead when no listeners are attached (R18).
 */
function createEventEmitter(): {
    on: (event: RegistryEvent, handler: RegistryEventHandler) => () => void;
    emit: (event: RegistryEvent, contract: ComponentContract) => void;
} {
    const listeners = new Map<RegistryEvent, Set<RegistryEventHandler>>();

    return {
        /**
         * Subscribes a handler to a registry event.
         * Returns an unsubscribe function.
         */
        on(event: RegistryEvent, handler: RegistryEventHandler): () => void {
            let eventListeners = listeners.get(event);
            if (eventListeners === undefined) {
                eventListeners = new Set();
                listeners.set(event, eventListeners);
            }
            eventListeners.add(handler);

            // Return unsubscribe function
            return () => {
                eventListeners.delete(handler);
            };
        },

        /**
         * Emits a registry event to all subscribed handlers.
         * No-op if no listeners are attached.
         */
        emit(event: RegistryEvent, contract: ComponentContract): void {
            const eventListeners = listeners.get(event);
            if (eventListeners !== undefined) {
                for (const handler of eventListeners) {
                    handler(contract);
                }
            }
        },
    };
}

// ---------------------------------------------------------------------------
// Design Token Merging (R19)
// ---------------------------------------------------------------------------

/**
 * Merges design tokens from all registered components with the
 * registry-level design tokens. Uses first-wins policy with
 * `console.warn` on conflicts.
 *
 * @param configTokens - Registry-level design tokens (from `RegistryConfig`).
 * @param components - Iterator of registered contracts.
 * @returns The merged `DesignTokenSet`.
 *
 * @see Design Choice R19 — first-wins + conflict warning.
 */
function mergeDesignTokens(
    configTokens: DesignTokenSet | undefined,
    components: Iterable<ComponentContract>,
): DesignTokenSet {
    const merged: Record<string, string> = {};

    // Config-level tokens have highest priority (first-wins)
    if (configTokens !== undefined) {
        for (const [key, value] of Object.entries(configTokens)) {
            merged[key] = value;
        }
    }

    // Component-level tokens: first-wins with conflict warning
    for (const contract of components) {
        for (const [key, value] of Object.entries(contract.tokens)) {
            if (key in merged) {
                const existingValue = merged[key];
                if (existingValue !== value) {
                    console.warn(
                        `[Enterstellar Registry] Design token conflict: '${key}' already defined as '${String(existingValue)}', ` +
                        `ignoring '${value}' from component '${contract.name}'. First-wins policy applied.`,
                    );
                }
            } else {
                merged[key] = value;
            }
        }
    }

    return merged;
}

// ---------------------------------------------------------------------------
// createRegistry() Factory
// ---------------------------------------------------------------------------

/**
 * Creates an `EnterstellarRegistry` — the runtime container for ComponentContracts.
 *
 * @param config - `RegistryConfig` with initial components and optional
 *   design tokens.
 * @returns A plain-object `EnterstellarRegistry` with all methods.
 * @throws {EnterstellarError} If any initial component fails validation or has a
 *   duplicate name.
 *
 * @see Design Choice R1 — plain object with closures.
 * @see Design Choice R3 — hybrid loading (eager + runtime `register()`).
 * @see Design Choice R17 — internal `Map<string, ComponentContract>`.
 */
export function createRegistry(config: RegistryConfig): EnterstellarRegistry {
    // ----- Internal State -----
    const components = new Map<string, ComponentContract>();
    const emitter = createEventEmitter();

    // ----- Eagerly register initial components -----
    for (const contract of config.components) {
        if (components.has(contract.name)) {
            throw duplicateNameError(contract.name);
        }
        components.set(contract.name, contract);
    }

    // ----- Build the EnterstellarRegistry object -----
    const registry: EnterstellarRegistry = {
        get size() {
            return components.size;
        },

        get(name: string): ComponentContract | undefined {
            return components.get(name);
        },

        list(): readonly string[] {
            return [...components.keys()].sort();
        },

        register(contract: ComponentContract): void {
            // R10: Duplicate name detection
            if (components.has(contract.name)) {
                throw duplicateNameError(contract.name);
            }

            // Validate the contract (all 10 rules)
            const result = validateContract(contract);
            if (!result.valid) {
                const firstViolation = result.violations[0];
                if (firstViolation !== undefined) {
                    throw new EnterstellarError(
                        'ENS-1002',
                        'registry',
                        `Registration failed for '${contract.name}': ${firstViolation.message}`,
                        false,
                    );
                }
            }

            components.set(contract.name, contract);

            // R18: Emit 'register' event
            emitter.emit('register', contract);
        },

        unregister(name: string): boolean {
            const contract = components.get(name);
            if (contract === undefined) {
                return false;
            }

            components.delete(name);

            // R18: Emit 'unregister' event
            emitter.emit('unregister', contract);

            return true;
        },

        getManifest(): readonly CompactManifestEntry[] {
            return generateManifest(components.values());
        },

        getSchema(name: string): z.ZodType | undefined {
            const contract = components.get(name);
            if (contract === undefined) {
                return undefined;
            }
            return contract.props;
        },

        getDesignTokens(): DesignTokenSet {
            return mergeDesignTokens(config.designTokens, components.values());
        },

        validate(contract: ComponentContract): ValidationResult {
            return validateContract(contract);
        },

        async publish(
            contract: ComponentContract,
            target: PublishTarget,
        ): Promise<PublishResult> {
            // Validate before publishing (R15)
            const validationResult = validateContract(contract);
            if (!validationResult.valid) {
                const firstViolation = validationResult.violations[0];
                const message = firstViolation !== undefined
                    ? firstViolation.message
                    : 'Unknown validation error.';
                throw new EnterstellarError(
                    'ENS-1002',
                    'registry',
                    `Cannot publish '${contract.name}': ${message}`,
                    false,
                );
            }

            // R15: REST POST /v1/contracts with locked JSON schema
            const requestBody = {
                contract,
                publisher: contract.origin?.publisher ?? 'unknown',
                sdkVersion: REGISTRY_SDK_VERSION,
            };

            const response = await fetch(`${target.registryUrl}/v1/contracts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${target.credentials.apiKey}`,
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new EnterstellarError(
                    'ENS-5001',
                    'registry',
                    `Publish failed for '${contract.name}': HTTP ${String(response.status)} ${response.statusText}`,
                    true, // recoverable — network issue, can retry
                );
            }

            // Validate response shape at runtime — never trust network data
            const responseBody: unknown = await response.json();
            if (
                responseBody === null ||
                typeof responseBody !== 'object' ||
                !('registryUrl' in responseBody) ||
                typeof (responseBody as Record<string, unknown>)['registryUrl'] !== 'string'
            ) {
                throw new EnterstellarError(
                    'ENS-5001',
                    'registry',
                    `Publish response for '${contract.name}' has unexpected shape.`,
                    true,
                );
            }

            return {
                published: true,
                url: (responseBody as Record<string, unknown>)['registryUrl'] as string,
            };
        },

        on(event: RegistryEvent, handler: RegistryEventHandler): () => void {
            return emitter.on(event, handler);
        },
    };

    return registry;
}
