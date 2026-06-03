/**
 * @module @enterstellar-ai/agent-sdk/tools/validate-spec
 * @description Implements the `enterstellar_validate_spec` MCP tool.
 *
 * Validates a `UISpec` by running each zone through the Enterstellar compiler.
 * This is where **L3 (Compiler Never Bypassed)** is enforced at the SDK
 * level — every component the agent outputs passes through compilation.
 *
 * **Multi-zone strategy (v1):**
 * Since `compileLayout()` does not exist at v1 (C20), each zone is
 * compiled independently. The aggregated result follows:
 * - ALL zones pass → `'pass'`
 * - ANY zone fails → `'fail'`
 * - Some corrected, none failed → `'corrected'`
 *
 * **Edge cases:**
 * - Empty `UISpec.zones` → synthetic `'pass'` result (nothing to validate).
 * - Compiler throws → propagated as-is (already `EnterstellarError`).
 *
 * @see Bible §4.16 — `enterstellar_validate_spec` tool definition.
 * @see Principle L3 — compiler never bypassed.
 * @see Design Choice C20 — no layout compilation at v1.
 * @see Design Choice C12 — agent parameter passed explicitly.
 */

import type { CompilationResult, CompilationError } from '@enterstellar-ai/types';

import type { UISpec, AgentSDKCompiler } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Agent identifier passed to the compiler for provenance tracking (C12). */
const SDK_AGENT_IDENTIFIER = 'agent-sdk';

// ---------------------------------------------------------------------------
// Tool Implementation
// ---------------------------------------------------------------------------

/**
 * Executes the `enterstellar_validate_spec` tool.
 *
 * Compiles each zone in the `UISpec` through the Enterstellar compiler (L3).
 * Returns an aggregated `CompilationResult` reflecting the worst-case
 * outcome across all zones.
 *
 * @param compiler - The Enterstellar compiler instance.
 * @param spec - The UI specification to validate.
 * @returns Aggregated compilation result across all zones.
 *
 * @example
 * ```ts
 * const result = await executeValidateSpec(compiler, {
 *   zones: [
 *     { name: 'main', component: 'PatientVitals', props: { patientId: '123' }, determinism: 0.5 },
 *   ],
 * });
 * // result.status === 'pass' | 'corrected' | 'fail'
 * ```
 */
export async function executeValidateSpec(
    compiler: AgentSDKCompiler,
    spec: UISpec,
): Promise<CompilationResult> {
    // Empty spec → synthetic pass (nothing to validate)
    if (spec.zones.length === 0) {
        return createEmptyPassResult();
    }

    // -----------------------------------------------------------------------
    // Compile each zone independently (C20 — no layout compilation at v1)
    // -----------------------------------------------------------------------

    const results: CompilationResult[] = [];

    for (const zone of spec.zones) {
        const intent = {
            component: zone.component,
            props: zone.props,
            confidence: 1.0,
        };

        const result = await compiler.compile(intent, { agent: SDK_AGENT_IDENTIFIER });
        results.push(result);
    }

    // -----------------------------------------------------------------------
    // Aggregate results across zones
    // -----------------------------------------------------------------------

    return aggregateResults(results, spec);
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Creates a synthetic "pass" `CompilationResult` for empty specs.
 *
 * Used when `UISpec.zones` is empty — nothing to validate, so the
 * result is trivially valid.
 */
function createEmptyPassResult(): CompilationResult {
    return {
        componentName: '',
        props: {},
        status: 'pass',
        provenance: {
            agent: SDK_AGENT_IDENTIFIER,
            registry: 'default',
            compiledAt: new Date().toISOString(),
            compilerVersion: '0.0.0',
        },
        errors: [],
        selfCorrectionAttempts: 0,
    };
}

/**
 * Aggregates multiple `CompilationResult`s into a single result.
 *
 * Status aggregation logic:
 * - ALL pass → `'pass'`
 * - ANY fail → `'fail'`
 * - Some corrected, none failed → `'corrected'`
 *
 * The aggregated result uses the first zone's component name and props
 * as the representative entry. Errors from all zones are merged.
 *
 * @param results - Array of per-zone compilation results.
 * @param spec - The original UI specification (for metadata).
 * @returns A single aggregated `CompilationResult`.
 */
function aggregateResults(
    results: readonly CompilationResult[],
    spec: UISpec,
): CompilationResult {
    // Guaranteed: results.length > 0 (caller checks empty spec)
    // Safe to access index 0 — caller ensures non-empty
    const firstResult = results[0];

    // Collect all errors across zones
    const allErrors: CompilationError[] = [];
    let totalSelfCorrectionAttempts = 0;
    let hasFail = false;
    let hasCorrected = false;

    for (const result of results) {
        allErrors.push(...result.errors);
        totalSelfCorrectionAttempts += result.selfCorrectionAttempts;

        if (result.status === 'fail') {
            hasFail = true;
        } else if (result.status === 'corrected') {
            hasCorrected = true;
        }
    }

    // Determine aggregate status
    let aggregateStatus: 'pass' | 'fail' | 'corrected';
    if (hasFail) {
        aggregateStatus = 'fail';
    } else if (hasCorrected) {
        aggregateStatus = 'corrected';
    } else {
        aggregateStatus = 'pass';
    }

    // Use first zone as representative (safe — results guaranteed non-empty)
    const firstZone = spec.zones[0];

    return {
        componentName: firstResult?.componentName ?? firstZone?.name ?? '',
        props: firstResult?.props ?? {},
        status: aggregateStatus,
        provenance: firstResult?.provenance ?? {
            agent: SDK_AGENT_IDENTIFIER,
            registry: 'default',
            compiledAt: new Date().toISOString(),
            compilerVersion: '0.0.0',
        },
        errors: allErrors,
        selfCorrectionAttempts: totalSelfCorrectionAttempts,
    };
}
