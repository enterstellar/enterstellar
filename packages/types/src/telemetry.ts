/**
 * @module @enterstellar-ai/types/telemetry
 * @description ForgeSignal — the mandatory telemetry payload for every compilation.
 *
 * ForgeSignals are the atomic unit of the ForgeSignal Corpus (M2 moat).
 * They contain ZERO PII — only hashed intents, component names, and metrics.
 * Every render emits a ForgeSignal; this is non-negotiable (L12).
 *
 * @see Bible §3.7
 * @see Design Choices TL1–TL12, T12
 * @see Principle L12
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// String Union Types
// ---------------------------------------------------------------------------

/**
 * Classification of the intent that produced this signal.
 * Fixed set — not consumer-extensible. Updated only in `@enterstellar-ai/types` releases.
 *
 * @see Design Choice T12
 */
export type IntentCategory =
    | 'clinical'
    | 'admin'
    | 'navigation'
    | 'data-display'
    | 'form'
    | 'feedback'
    | 'utility';

/**
 * Forge mode that generated the component (if forged).
 * `'none'` indicates the component came from the registry (no forge).
 */
export type ForgeMode = 'none' | 'local' | 'cloud';

/**
 * Platform that produced this signal.
 * Auto-set by the renderer package — never consumer-configured (P9).
 */
export type SignalPlatform = 'web' | 'native' | 'desktop' | 'cli' | 'unknown';

// ---------------------------------------------------------------------------
// ForgeSignal Type
// ---------------------------------------------------------------------------

/**
 * The mandatory telemetry payload emitted after every Enterstellar compilation.
 *
 * ForgeSignals are the training data for the Intent Router (M4) and
 * Forge Model (M5). They power the self-reinforcing data flywheel.
 *
 * **PII policy:** Zero PII. The `intentHash` is a SHA-256 of the raw intent —
 * the raw string never leaves the device.
 *
 * @see Bible §3.7
 * @see Design Choice TL3 — hashing happens in `record()`, not caller.
 */
export type ForgeSignal = {
    /** SHA-256 hash of the raw intent string. No PII. */
    readonly intentHash: string;
    /** PascalCase name of the resolved component. */
    readonly componentName: string;
    /** Classification of the intent. */
    readonly intentCategory: IntentCategory;
    /** Whether compilation passed, failed, or was corrected. */
    readonly compilationStatus: 'pass' | 'fail' | 'corrected';
    /** Whether the Forge was used, and which mode. */
    readonly forgeMode: ForgeMode;
    /** Whether the Forge was invoked at all. */
    readonly forgeUsed: boolean;
    /** Total pipeline latency from intent to rendered output, in milliseconds. */
    readonly latencyMs: number;
    /** Number of self-correction attempts before final result. */
    readonly selfCorrectionAttempts: number;
    /**
     * Token usage for self-correction calls, if any.
     * Tracked for cost observability, not enforced with a hard budget (C7).
     */
    readonly correctionTokensUsed: number;
    /** ISO 8601 timestamp when the signal was recorded. */
    readonly timestamp: string;
    /** Semantic version of the Enterstellar SDK that produced this signal. */
    readonly sdkVersion: string;
    /** Number of components in the registry at the time of this signal. */
    readonly registrySize: number;
    /** Platform that produced this signal. */
    readonly platform: SignalPlatform;
};

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating a `ForgeSignal` at runtime.
 *
 * @see Design Choice T7
 */
export const ForgeSignalSchema = z.object({
    intentHash: z.string().min(1, 'Intent hash is required.'),
    componentName: z.string().min(1, 'Component name is required.'),
    intentCategory: z.enum([
        'clinical',
        'admin',
        'navigation',
        'data-display',
        'form',
        'feedback',
        'utility',
    ]),
    compilationStatus: z.enum(['pass', 'fail', 'corrected']),
    forgeMode: z.enum(['none', 'local', 'cloud']),
    forgeUsed: z.boolean(),
    latencyMs: z.number().min(0),
    selfCorrectionAttempts: z.number().int().min(0),
    correctionTokensUsed: z.number().int().min(0),
    timestamp: z.string().min(1, 'Timestamp is required.'),
    sdkVersion: z.string().min(1, 'SDK version is required.'),
    registrySize: z.number().int().min(0),
    platform: z.enum(['web', 'native', 'desktop', 'cli', 'unknown']),
});
