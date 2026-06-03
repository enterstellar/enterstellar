/**
 * @module @enterstellar-ai/test/harness-compile-raw
 * @description Implements the `compileRaw()` method for the test harness.
 *
 * This is a thin wrapper that constructs a `ComponentIntent` from raw
 * component name + props and passes it through the real `@enterstellar-ai/compiler`.
 * No mock lookup, no trace building — just direct compilation.
 *
 * @see Implementation Bible §4.5 — `harness.compileRaw()` specification.
 */

import type { EnterstellarCompiler } from '@enterstellar-ai/compiler';
import type { CompilationResult, ComponentIntent } from '@enterstellar-ai/types';

import type { CompileRawInput } from './types.js';

// ---------------------------------------------------------------------------
// compileRaw Implementation
// ---------------------------------------------------------------------------

/**
 * Compiles a raw component reference + props through the real compiler.
 *
 * Constructs a minimal `ComponentIntent` from the input and delegates
 * to `compiler.compile()`. The compilation is real — Zod schema validation,
 * design token enforcement, and accessibility auditing all run.
 *
 * @param raw - Component name and props to compile.
 * @param compiler - The real `EnterstellarCompiler` instance created by the harness.
 * @returns The `CompilationResult` from the real compiler.
 *
 * @internal This function is wired into the harness by `createTestHarness()`.
 */
export async function compileRaw(
    raw: CompileRawInput,
    compiler: EnterstellarCompiler,
): Promise<CompilationResult> {
    // Construct a minimal ComponentIntent from the raw input.
    // Only `component` and `props` are required — the compiler handles
    // the rest via its pipeline defaults.
    const intent: ComponentIntent = {
        component: raw.component,
        props: { ...raw.props },
        confidence: 1.0, // Raw compilation uses full confidence
    };

    // Compile through the real pipeline (L3 — compiler is never bypassed).
    const result = await compiler.compile(intent, {
        agent: 'enterstellar-test-harness',
    });

    return result;
}
