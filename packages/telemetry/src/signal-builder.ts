/**
 * @module @enterstellar-ai/telemetry/signal-builder
 * @description Builds a complete `ForgeSignal` from partial input.
 *
 * The signal builder is the central assembly point:
 * 1. Hashes the raw intent string to SHA-256 (TL3).
 * 2. Runs a PII guard on `componentName` (TL8).
 * 3. Auto-fills `timestamp`, `sdkVersion`, `platform`, `registrySize` (TL2).
 *
 * @see Design Choice TL2 — partial input, auto-fill common fields.
 * @see Design Choice TL3 — hashing happens internally.
 * @see Design Choice TL8 — targeted PII check on componentName.
 */

import type { ForgeSignal, SignalPlatform } from '@enterstellar-ai/types';
import { ENTERSTELLAR_TYPES_VERSION } from '@enterstellar-ai/types';

import { hashIntent } from './hash.js';
import { checkComponentNamePii } from './pii-guard.js';
import type { ForgeSignalInput } from './types.js';

// ---------------------------------------------------------------------------
// SignalBuilderConfig — injected at creation time
// ---------------------------------------------------------------------------

/**
 * Configuration injected into the signal builder at creation time.
 * These values do not change per-signal and are set by the collector factory.
 */
export type SignalBuilderConfig = {
    /** Platform identifier. Auto-detected by the renderer package. */
    readonly platform: SignalPlatform;

    /** Number of components in the registry at creation time. */
    readonly registrySize: number;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds a complete {@link ForgeSignal} from a partial {@link ForgeSignalInput}.
 *
 * **Auto-filled fields:**
 * - `intentHash` — SHA-256 of `input.rawIntent` (TL3)
 * - `timestamp` — ISO 8601 at the moment of recording
 * - `sdkVersion` — from `ENTERSTELLAR_TYPES_VERSION`
 * - `platform` — from `config.platform`
 * - `registrySize` — from `config.registrySize`
 *
 * **PII enforcement:**
 * If the PII guard flags `componentName`, the sanitized placeholder is used
 * and a warning is logged to the console.
 *
 * @param input - Caller-provided signal data (raw intent + compilation metrics).
 * @param config - Builder configuration (platform, registrySize).
 * @returns A promise resolving to a fully-formed, immutable `ForgeSignal`.
 *
 * @example
 * ```ts
 * const signal = await buildSignal(
 *   {
 *     rawIntent: 'show patient vitals',
 *     componentName: 'PatientVitals',
 *     intentCategory: 'clinical',
 *     compilationStatus: 'pass',
 *     forgeMode: 'none',
 *     forgeUsed: false,
 *     latencyMs: 12,
 *     selfCorrectionAttempts: 0,
 *     correctionTokensUsed: 0,
 *   },
 *   { platform: 'web', registrySize: 42 },
 * );
 * ```
 *
 * @see Design Choice TL2
 * @see Design Choice TL3
 */
export async function buildSignal(
    input: ForgeSignalInput,
    config: SignalBuilderConfig,
): Promise<ForgeSignal> {
    // TL3: Hash the raw intent — PII never leaves the device.
    const intentHash = await hashIntent(input.rawIntent);

    // TL8: Targeted PII check on componentName.
    const piiResult = checkComponentNamePii(input.componentName);
    if (piiResult.flagged) {
        // Log a warning — do NOT throw. Telemetry must not crash the app.
        console.warn(`[@enterstellar-ai/telemetry] PII guard: ${piiResult.reason ?? 'unknown reason'}`);
    }

    // TL2: Build the full signal, auto-filling common fields.
    const signal: ForgeSignal = {
        intentHash,
        componentName: piiResult.name,
        intentCategory: input.intentCategory,
        compilationStatus: input.compilationStatus,
        forgeMode: input.forgeMode,
        forgeUsed: input.forgeUsed,
        latencyMs: input.latencyMs,
        selfCorrectionAttempts: input.selfCorrectionAttempts,
        correctionTokensUsed: input.correctionTokensUsed,
        timestamp: new Date().toISOString(),
        sdkVersion: ENTERSTELLAR_TYPES_VERSION,
        platform: config.platform,
        registrySize: config.registrySize,
    };

    return signal;
}
