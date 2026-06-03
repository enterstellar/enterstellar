/**
 * @module @enterstellar-ai/types/forge
 * @description Forge types — runtime component generation and Cold Path pipeline.
 *
 * The Forge generates temporary ComponentContracts when the registry has
 * no match. LocalForge uses templates (free), CloudForge uses LLM (metered).
 *
 * @see Bible §4.10 — Forge
 * @see Design Choices F1–F14
 * @see Appendix D Ruling 7
 */

import { z } from 'zod';

import type { ComponentContract } from './contract.js';
import type { CompilationResult } from './compiler.js';

// ---------------------------------------------------------------------------
// Forge Result Type
// ---------------------------------------------------------------------------

/**
 * The output of a Forge invocation.
 * Contains the generated contract (if successful), compilation status,
 * and which forge mode was used.
 *
 * @see Bible §4.10
 * @see Design Choice F8 (auto-routing)
 */
export type ForgeResult = {
    /** Whether the forge successfully generated a valid contract. */
    readonly success: boolean;
    /**
     * The generated ComponentContract, or `null` on failure.
     * Marked with `_meta.forged = true`.
     * Named with prefix `__forged_{name}_{8-char-hash}` (F13).
     */
    readonly contract: ComponentContract | null;
    /** Compilation result — forged contracts MUST pass the compiler (L3, L13). */
    readonly compilationResult: CompilationResult | null;
    /** Whether the fallback component was used instead. */
    readonly fallbackUsed: boolean;
    /**
     * Which forge mode generated this contract.
     *
     * @see Appendix D Ruling 7
     */
    readonly forgeMode: 'local' | 'cloud';
};

/**
 * Trace record for Cold Path intent clustering.
 * Every forge invocation is logged for clustering analysis.
 *
 * @see Bible §4.10 — Cold Path Rules
 */
export type ForgeTraceRecord = {
    /** Slugified intent name. */
    readonly intentSlug: string;
    /** Raw intent string hash (SHA-256). */
    readonly intentHash: string;
    /** Which forge mode was used. */
    readonly forgeMode: 'local' | 'cloud';
    /** Whether the forge succeeded. */
    readonly success: boolean;
    /** ISO 8601 timestamp. */
    readonly timestamp: string;
    /** Optional context provided during forge invocation. */
    readonly context?: Readonly<Record<string, unknown>>;
};

/**
 * Configuration for the Forge's Cold Path pipeline.
 *
 * @see Design Choices F10–F12
 */
export type ColdPathConfig = {
    /** Whether the Cold Path is enabled. */
    readonly enabled: boolean;
    /** Minimum occurrences of a similar intent before clustering. Default: 5 (F11). */
    readonly clusterThreshold: number;
    /** Whether to auto-queue clustered contracts for HITL review. */
    readonly autoPromote: boolean;
};

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating a `ForgeResult` at runtime.
 *
 * @see Design Choice T7
 */
export const ForgeResultSchema = z.object({
    success: z.boolean(),
    /**
     * `z.unknown().nullable()` instead of `ComponentContractSchema.nullable()`
     * to avoid circular schema references (forge → contract → compiler).
     * TS type is properly typed as `ComponentContract | null`.
     */
    contract: z.unknown().nullable(),
    /**
     * `z.unknown().nullable()` for the same reason — avoids circular
     * schema dependency with `CompilationResultSchema`.
     * TS type is properly typed as `CompilationResult | null`.
     */
    compilationResult: z.unknown().nullable(),
    fallbackUsed: z.boolean(),
    forgeMode: z.enum(['local', 'cloud']),
});

/**
 * Zod schema for validating a `ForgeTraceRecord` at runtime.
 */
export const ForgeTraceRecordSchema = z.object({
    intentSlug: z.string().min(1),
    intentHash: z.string().min(1),
    forgeMode: z.enum(['local', 'cloud']),
    success: z.boolean(),
    timestamp: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional(),
});
