/**
 * @module @enterstellar-ai/compiler/pipeline/types
 * @description Pipeline-specific type definitions.
 *
 * Re-exports the `CompilationStep` type and defines pipeline-internal types
 * for the middleware chain builder. Keeps the `pipeline/` directory
 * self-contained and importable without reaching into the parent module.
 *
 * **L15 compliance:** Zero framework imports.
 *
 * @see Design Choice C1 — middleware pattern with composable steps.
 */

// Re-export the step type from the parent module for pipeline-internal use.
export type { CompilationStep, CompilationContext } from '../types.js';

import type { CompilationStep } from '../types.js';

// ---------------------------------------------------------------------------
// Pipeline Step Metadata
// ---------------------------------------------------------------------------

/**
 * Identifies a built-in pipeline step by name.
 *
 * Used for logging, tracing, and error attribution. Custom steps
 * registered via `compiler.use()` are identified as `'custom'`.
 */
export type PipelineStepName =
    | 'resolve'
    | 'parse'
    | 'token'
    | 'accessibility'
    | 'trace'
    | 'custom';

// ---------------------------------------------------------------------------
// Named Step
// ---------------------------------------------------------------------------

/**
 * A pipeline step paired with its identifier.
 *
 * The name is used in trace output to show which step produced which
 * errors or warnings. Built-in steps have fixed names; custom steps
 * are all labeled `'custom'`.
 */
export type NamedStep = {
    /** Human-readable step identifier for tracing. */
    readonly name: PipelineStepName;
    /** The step function itself. */
    readonly execute: CompilationStep;
};
