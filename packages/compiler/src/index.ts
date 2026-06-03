/**
 * @module @enterstellar-ai/compiler
 * @description Enterstellar UI Compiler — schema validation, design token enforcement,
 * accessibility auditing, and self-correction.
 *
 * The compiler is the **M1 moat** — the only UI type-checker for AI-generated
 * interfaces in existence. Every `ComponentIntent` from any protocol passes
 * through the compiler before rendering. No bypass, no escape hatch (L3).
 *
 * ## Quick Start
 *
 * ```ts
 * import { createCompiler } from '@enterstellar-ai/compiler';
 * import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
 *
 * const registry = createRegistry({ components: [...] });
 * const compiler = createCompiler({ registry });
 *
 * const result = await compiler.compile(intent, { agent: 'gpt-4o' });
 * // result.status === 'pass' | 'corrected' | 'fail'
 *
 * const { errors, warnings } = await compiler.lint(intent);
 * // errors: CompilationError[], warnings: CompilationWarning[]
 *
 * compiler.use(myCustomStep); // HIPAA checks, custom tokens, etc.
 * ```
 *
 * @see Implementation Bible §4.2
 * @see Design Choices C1–C20
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export { createCompiler } from './create-compiler.js';
export type { CompilerConfigInput } from './create-compiler.js';

// ---------------------------------------------------------------------------
// Types (public API surface)
// ---------------------------------------------------------------------------
export type {
    EnterstellarCompiler,
    CompilerConfig,
    CompilationStep,
    CompilationContext,
    CompilationWarning,
    CompileOptions,
    CorrectionContext,
    CorrectionCallback,
    CorrectionResult,
    LintResult,
    ValidationFailureStrategy,
    ValidationFailureConfig,
    TelemetryRecordInput,
    TelemetryRecorder,
    // Self-correction types (SC-01, SC-04, SC-08, SC-11)
    CorrectionStrategy,
    CorrectionTraceEntry,
    DeterministicCorrectionResult,
    SelfCorrectionConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Pipeline Types (for custom step authors)
// ---------------------------------------------------------------------------
export type {
    PipelineStepName,
    NamedStep,
} from './pipeline/types.js';

// ---------------------------------------------------------------------------
// Error Factories (for custom step authors and testing)
// ---------------------------------------------------------------------------
export {
    schemaParseError,
    invalidTokenError,
    missingAccessibilityError,
    unknownComponentError,
    selfCorrectionExhaustedError,
    fallbackRenderedError,
    tokenCoercionWarning,
    propsStrippedWarning,
    correctionCallbackError,
    maxNestingDepthError,
    // Self-correction info diagnostics (SC-17)
    deterministicCorrectionInfo,
    templateCorrectionInfo,
} from './errors.js';

// ---------------------------------------------------------------------------
// Utilities (for testing and advanced usage)
// ---------------------------------------------------------------------------
export { validateNestingDepth } from './nesting.js';
export type { NestingValidationResult } from './nesting.js';
export { COMPILER_VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Deterministic Correction (SC-01, public for advanced consumers)
// ---------------------------------------------------------------------------
export { attemptDeterministicCorrection } from './deterministic-correction.js';
