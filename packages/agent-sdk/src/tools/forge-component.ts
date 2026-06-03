/**
 * @module @enterstellar-ai/agent-sdk/tools/forge-component
 * @description Implements the `enterstellar_forge_component` MCP tool.
 *
 * Delegates to `ComponentForge.forge()` for runtime component generation
 * when the registry has no matching component. The forge internally
 * enforces L3 (compiler validation) and L12 (ForgeSignal telemetry).
 *
 * **Design Choice F9:** The forge never hard-fails. It always returns a
 * `ForgeResult` — either with a generated contract or a fallback marker.
 * The SDK wraps only truly unexpected errors (should be rare given F9).
 *
 * **Constraints mapping:** The optional `constraints` parameter from the
 * MCP tool input is NOT passed to the forge's internal constraints (those
 * are set at forge creation time). Instead, it is included as `context`
 * on the intent for tracing and Cold Path clustering (F10).
 *
 * @see Bible §4.16 — `enterstellar_forge_component` tool definition.
 * @see Design Choice F9 — never hard-fail.
 * @see Principle L3 — compiler validation enforced inside forge.
 * @see Principle L12 — ForgeSignal emitted inside forge.
 */

import type { ForgeResult } from '@enterstellar-ai/types';

import type { AgentSDKForge } from '../types.js';
import { searchFailedError } from '../errors.js';

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar_forge_component` tool.
 *
 * Constructs a `ComponentIntent` from the natural-language intent string
 * and delegates to the forge. The forge handles all internal routing
 * (LocalForge → CloudForge), compiler validation (L3), and telemetry (L12).
 *
 * @param forge - The component forge instance (optional — errors if not provided).
 * @param intent - Natural-language intent string (e.g., `'patient vitals overview'`).
 * @param constraints - Optional constraints to include as trace context.
 * @returns The `ForgeResult` from the forge (success or fallback).
 *
 * @throws {EnterstellarError} Code `ENS-8002` if forge is not configured or throws unexpectedly.
 *
 * @example
 * ```ts
 * const result = await executeForgeComponent(forge, 'patient medication timeline');
 * // result.success === true
 * // result.contract.name === '__forged_patientmedicationtimeline_a1b2c3d4'
 * // result.forgeMode === 'local' | 'cloud'
 * ```
 */
export async function executeForgeComponent(
    forge: AgentSDKForge | undefined,
    intent: string,
    constraints?: Readonly<Record<string, unknown>>,
): Promise<ForgeResult> {
    // -----------------------------------------------------------------------
    // Validate forge dependency
    // -----------------------------------------------------------------------

    if (forge === undefined) {
        throw searchFailedError(
            intent,
            new Error(
                'ComponentForge is not configured. ' +
                'Provide it via createAgentSDK({ forge: ... }).',
            ),
        );
    }

    // -----------------------------------------------------------------------
    // Construct intent for the forge
    // -----------------------------------------------------------------------

    const componentIntent: Readonly<Record<string, unknown>> = {
        component: intent,
        props: constraints ?? {},
        confidence: 0.5,
    };

    // -----------------------------------------------------------------------
    // Delegate to forge (F9 — should never throw)
    // -----------------------------------------------------------------------

    try {
        return await forge.forge(componentIntent);
    } catch (error: unknown) {
        // F9 guarantees no hard-fail, but wrap any unexpected errors
        throw searchFailedError(intent, error);
    }
}
