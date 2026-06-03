/**
 * @module @enterstellar-ai/compiler/__tests__/types
 * @description Type-level tests for the compiler's public API surface.
 *
 * These tests verify type assignability and constraint correctness at
 * compile-time. They produce NO runtime output — they either typecheck
 * or fail on `tsc --noEmit`.
 *
 * @see vitest `expectTypeOf` / `assertType` for type-level testing.
 */

import { describe, it, expectTypeOf, assertType } from 'vitest';

import type {
    EnterstellarCompiler,
    CompilerConfig,
    CompilationStep,
    CompilationContext,
    CompilationWarning,
    CompileOptions,
    CorrectionContext,
    CorrectionCallback,
    CorrectionResult,
    ValidationFailureStrategy,
    ValidationFailureConfig,
    PipelineStepName,
    NamedStep,
} from '../src/index.js';
import type { CompilationResult, CompilationError, ComponentIntent } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// EnterstellarCompiler interface
// ---------------------------------------------------------------------------

describe('EnterstellarCompiler type', () => {
    it('has compile() returning Promise<CompilationResult>', () => {
        expectTypeOf<EnterstellarCompiler['compile']>().returns.resolves.toEqualTypeOf<CompilationResult>();
    });

    it('has lint() returning Promise<readonly CompilationError[]>', () => {
        expectTypeOf<EnterstellarCompiler['lint']>().returns.resolves.toEqualTypeOf<readonly CompilationError[]>();
    });

    it('has use() accepting a CompilationStep', () => {
        expectTypeOf<EnterstellarCompiler['use']>().parameter(0).toEqualTypeOf<CompilationStep>();
    });

    it('use() returns void', () => {
        expectTypeOf<EnterstellarCompiler['use']>().returns.toBeVoid();
    });
});

// ---------------------------------------------------------------------------
// CompilerConfig required fields
// ---------------------------------------------------------------------------

describe('CompilerConfig type', () => {
    it('requires registry field', () => {
        expectTypeOf<CompilerConfig>().toHaveProperty('registry');
    });

    it('requires onValidationFailure field', () => {
        expectTypeOf<CompilerConfig>().toHaveProperty('onValidationFailure');
    });

    it('requires strictDesignTokens as boolean', () => {
        expectTypeOf<CompilerConfig['strictDesignTokens']>().toBeBoolean();
    });

    it('requires autoAccessibility as boolean', () => {
        expectTypeOf<CompilerConfig['autoAccessibility']>().toBeBoolean();
    });

    it('requires maxNestingDepth as number', () => {
        expectTypeOf<CompilerConfig['maxNestingDepth']>().toBeNumber();
    });

    it('requires includeDiff as boolean', () => {
        expectTypeOf<CompilerConfig['includeDiff']>().toBeBoolean();
    });

    it('has optional onCorrection callback', () => {
        expectTypeOf<CompilerConfig>().toHaveProperty('onCorrection');
    });
});

// ---------------------------------------------------------------------------
// CompilationStep signature
// ---------------------------------------------------------------------------

describe('CompilationStep signature', () => {
    it('is a function taking (context, next) and returning Promise<CompilationContext>', () => {
        expectTypeOf<CompilationStep>().toBeFunction();
        expectTypeOf<CompilationStep>().parameters.toEqualTypeOf<[CompilationContext, () => Promise<CompilationContext>]>();
        expectTypeOf<CompilationStep>().returns.resolves.toEqualTypeOf<CompilationContext>();
    });
});

// ---------------------------------------------------------------------------
// CompilationContext mutable fields
// ---------------------------------------------------------------------------

describe('CompilationContext type', () => {
    it('has mutable props field', () => {
        expectTypeOf<CompilationContext['props']>().toEqualTypeOf<Record<string, unknown>>();
    });

    it('has mutable errors array', () => {
        expectTypeOf<CompilationContext['errors']>().toEqualTypeOf<CompilationError[]>();
    });

    it('has mutable warnings array', () => {
        expectTypeOf<CompilationContext['warnings']>().toEqualTypeOf<CompilationWarning[]>();
    });
});

// ---------------------------------------------------------------------------
// CorrectionContext (C5)
// ---------------------------------------------------------------------------

describe('CorrectionContext type', () => {
    it('has readonly intent', () => {
        expectTypeOf<CorrectionContext>().toHaveProperty('intent');
    });

    it('has readonly schema', () => {
        expectTypeOf<CorrectionContext>().toHaveProperty('schema');
    });

    it('has readonly errors', () => {
        expectTypeOf<CorrectionContext>().toHaveProperty('errors');
    });
});

// ---------------------------------------------------------------------------
// ValidationFailureStrategy
// ---------------------------------------------------------------------------

describe('ValidationFailureStrategy type', () => {
    it('is a union of three string literals', () => {
        assertType<ValidationFailureStrategy>('self-correct');
        assertType<ValidationFailureStrategy>('fallback');
        assertType<ValidationFailureStrategy>('reject');
    });
});

// ---------------------------------------------------------------------------
// PipelineStepName
// ---------------------------------------------------------------------------

describe('PipelineStepName type', () => {
    it('includes all built-in step names', () => {
        assertType<PipelineStepName>('resolve');
        assertType<PipelineStepName>('parse');
        assertType<PipelineStepName>('token');
        assertType<PipelineStepName>('accessibility');
        assertType<PipelineStepName>('trace');
        assertType<PipelineStepName>('custom');
    });
});

// ---------------------------------------------------------------------------
// NamedStep
// ---------------------------------------------------------------------------

describe('NamedStep type', () => {
    it('has name and execute fields', () => {
        expectTypeOf<NamedStep>().toHaveProperty('name');
        expectTypeOf<NamedStep>().toHaveProperty('execute');
        expectTypeOf<NamedStep['execute']>().toEqualTypeOf<CompilationStep>();
    });
});
