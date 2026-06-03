/**
 * @module playground/components/playground/step-education-data
 * @description Static educational dictionary + dynamic trace analyzers for
 * the 5 real Enterstellar compiler pipeline steps.
 *
 * This is a **data-only** module — no React, no JSX, no side effects.
 * It exports:
 * 1. `PIPELINE_STEP_EDUCATION` — a readonly tuple of 5 `PipelineStepEducation`
 *    entries, one per compiler step (Resolve → Parse → Tokens → A11y → Emit).
 * 2. `STEP_DWELL_TIME_MS` — the 600ms minimum dwell time constant for
 *    auto-advance animation in the educational console.
 * 3. All supporting types: `PipelineStep`, `StepAnalysis`, `PipelineStepEducation`.
 *
 * **Design principle (R6):** Render is decoupled from data. This module
 * defines WHAT to show; `pipeline-step-card.tsx` and `step-detail-pane.tsx`
 * define HOW to render it.
 *
 * **Pipeline truth source:** Bible §4.2 (L777–792) defines the canonical
 * 5-step pipeline: Resolve → Parse → Tokens → A11y → Trace (Emit).
 * The `pipeline-visualizer.tsx` (L55–61) uses the same 5 steps.
 * The 4-step abstraction (`Intent → Resolve → Compile → Render`) previously
 * used in `controls-bar.tsx` has been retired.
 *
 * @see 03-enterstellar-implementation-bible.md §4.2 — Compilation Pipeline
 * @see implementation_plan.md §2.1 — Educational Console
 * @see implementation_plan.md §3.2.1 — Educational Pipeline Steps
 */

import type { ZoneTrace } from '@enterstellar-ai/types';
import type { PlaygroundMode } from '@/enterstellar/agent-connection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum dwell time (milliseconds) per step during auto-advance animation.
 *
 * Even when the Enterstellar compiler runs in <5ms, the educational console holds
 * each step for at least this duration to ensure visual readability. This
 * creates a deliberate, step-by-step progression — a presentation pacing
 * layer over the real-time engine.
 *
 * Value: 600ms — long enough to read the step title and see the status
 * transition, short enough to feel responsive (total pipeline animation
 * = 5 × 600ms = 3 seconds).
 *
 * @see implementation_plan.md §2.1 — "600ms minimum dwell time"
 */
export const STEP_DWELL_TIME_MS = 600;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The 5 real Enterstellar compiler pipeline steps.
 *
 * These are the REAL steps defined in Bible §4.2 (L777–792) — not a
 * simplified abstraction. Each step maps to a specific compiler module:
 *
 * | Step     | Compiler Module            | What It Does                           |
 * |:---------|:---------------------------|:---------------------------------------|
 * | resolve  | `schema-validator.ts`      | Find component in registry by name     |
 * | parse    | `schema-validator.ts`      | Zod safeParse(intent.props) vs schema  |
 * | tokens   | `token-enforcer.ts`        | Design token compliance check          |
 * | a11y     | `accessibility-auditor.ts` | ARIA role/label/announce audit         |
 * | emit     | `create-compiler.ts`       | Emit CompilationResult + trace event   |
 */
export type PipelineStep = 'resolve' | 'parse' | 'tokens' | 'a11y' | 'emit';

/**
 * Analysis result for a single trace against a pipeline step.
 *
 * Produced by `PipelineStepEducation.analyzeTrace()` — the dynamic portion
 * of the educational console's right pane. Each field drives a specific
 * visual element in the `StepDetailPane` component.
 */
export interface StepAnalysis {
  /** Overall step status — drives the status badge color. */
  readonly status: 'success' | 'warning' | 'error' | 'idle';
  /**
   * Dynamic headline (e.g., "MetricCard resolved in 0.3ms").
   * Displayed prominently below the educational text.
   */
  readonly headline: string;
  /**
   * Dynamic detail paragraphs (array of markdown strings).
   * Each entry renders as a separate paragraph in the detail pane.
   */
  readonly details: readonly string[];
  /**
   * Structured data to display (e.g., raw LLM JSON, compiled props, errors).
   * Rendered as a collapsible JSON block in the detail pane when present.
   *
   * Omitted entirely when no structured data is relevant to the step.
   * Per `exactOptionalPropertyTypes`, this field is never set to `undefined`.
   */
  readonly data?: Readonly<Record<string, unknown>>;
  /**
   * Enterstellar error codes triggered in this step (e.g., `['ENS-3004', 'ENS-2001']`).
   * Rendered as inline code badges in the detail pane when present.
   *
   * Omitted entirely when no errors were triggered.
   * Per `exactOptionalPropertyTypes`, this field is never set to `undefined`.
   */
  readonly errorCodes?: readonly string[];
}

/**
 * Static educational content + dynamic trace analyzer for one pipeline step.
 *
 * Each entry in `PIPELINE_STEP_EDUCATION` implements this interface.
 * The `concept` field provides fixed educational text (always displayed);
 * the `analyzeTrace` function generates dynamic, trace-specific analysis.
 */
export interface PipelineStepEducation {
  /** Pipeline step identifier — matches the `PipelineStep` union. */
  readonly step: PipelineStep;
  /** Human-readable step title (e.g., "Resolve"). */
  readonly title: string;
  /**
   * Step icon — emoji matching `pipeline-visualizer.tsx` and `controls-bar.tsx`.
   * Used in both the left-pane step card and the compact controls bar summary.
   */
  readonly icon: string;
  /**
   * Fixed educational paragraph — always displayed in the right pane.
   * Explains the concept: what is this step? Why does it exist?
   * Written for a developer audience at the "interested engineer" level.
   */
  readonly concept: string;
  /**
   * Extracts step-specific dynamic data from a `ZoneTrace`.
   *
   * @param trace - The latest `ZoneTrace` from the store. `null` if no
   *   compilation has occurred yet (idle state).
   * @param mode - The current playground mode. Drives mode-specific
   *   messaging (e.g., hallucination warnings).
   * @returns A `StepAnalysis` with status, headline, details, and
   *   optional structured data.
   */
  readonly analyzeTrace: (
    trace: ZoneTrace | null,
    mode: PlaygroundMode,
  ) => StepAnalysis;
}

// ---------------------------------------------------------------------------
// Idle State Helper
// ---------------------------------------------------------------------------

/**
 * Returns a neutral "waiting" analysis for steps when no trace is available.
 *
 * Used when `trace` is `null` (no compilation has occurred yet).
 * All 5 steps share the same idle behavior to avoid repetition.
 *
 * @param stepTitle - The step's human-readable title (e.g., "Resolve").
 * @returns A `StepAnalysis` with `'idle'` status and pending messaging.
 *
 * @internal
 */
function idleAnalysis(stepTitle: string): StepAnalysis {
  return {
    status: 'idle',
    headline: `${stepTitle} — Awaiting compilation`,
    details: [
      'Submit a prompt to see this step in action. The educational content above describes what this step does; the dynamic analysis below will show what actually happened for your specific prompt.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 1: Resolve
// ---------------------------------------------------------------------------

/**
 * Extracts Resolve-step analysis from a `ZoneTrace`.
 *
 * The Resolve step checks if the component name the LLM requested
 * actually exists in the production Registry. If not, it falls back
 * to `GenericCard` or triggers self-correction.
 *
 * @param trace - The latest zone trace, or `null` if idle.
 * @param mode - Current playground mode.
 * @returns Step analysis with resolution status and component name.
 *
 * @internal
 */
function analyzeResolve(trace: ZoneTrace | null, mode: PlaygroundMode): StepAnalysis {
  if (trace === null) {
    return idleAnalysis('Resolve');
  }

  const componentName = trace.intent.component;
  const hasResolutionError = trace.compilation.errors.some(
    (e) => e.code === 'ENS-3004' || e.code === 'ENS-3001',
  );

  if (hasResolutionError) {
    const errorDetails = trace.compilation.errors
      .filter((e) => e.code === 'ENS-3004' || e.code === 'ENS-3001')
      .map((e) => `**${e.code}**: ${e.message}`);

    return {
      status: 'error',
      headline: `"${componentName}" — not found in Registry`,
      details: [
        mode === 'hallucinating'
          ? 'The LLM hallucinated a component name that does not exist in the Registry. This is exactly the kind of failure Enterstellar intercepts — no broken UI reaches the user.'
          : 'The requested component was not found. The compiler will attempt self-correction or fall back to GenericCard.',
        ...errorDetails,
      ],
      errorCodes: trace.compilation.errors
        .filter((e) => e.code === 'ENS-3004' || e.code === 'ENS-3001')
        .map((e) => e.code),
    };
  }

  return {
    status: 'success',
    headline: `"${componentName}" — resolved ✓`,
    details: [
      `The component **${componentName}** was found in the Registry. Its Zod schema, design tokens, and accessibility contract are now loaded for validation.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 2: Parse
// ---------------------------------------------------------------------------

/**
 * Extracts Parse-step analysis from a `ZoneTrace`.
 *
 * The Parse step runs the LLM's props through the component's Zod schema.
 * Every field is type-checked. Hallucinated properties are stripped via
 * `z.object().strip()` (Design Choice P10).
 *
 * @param trace - The latest zone trace, or `null` if idle.
 * @param mode - Current playground mode.
 * @returns Step analysis with schema validation status and error details.
 *
 * @internal
 */
function analyzeParse(trace: ZoneTrace | null, mode: PlaygroundMode): StepAnalysis {
  if (trace === null) {
    return idleAnalysis('Parse');
  }

  // Filter for schema/prop errors (ENS-2xxx codes = compiler validation errors)
  const schemaErrors = trace.compilation.errors.filter(
    (e) => e.code.startsWith('ENS-2'),
  );
  const wasCorreted = trace.compilation.status === 'corrected';
  const hasFailed = trace.compilation.status === 'fail';

  if (schemaErrors.length > 0) {
    const errorDetails = schemaErrors.map(
      (e) => `**${e.code}** at \`${e.path}\`: ${e.message}`,
    );

    return {
      status: hasFailed ? 'error' : 'warning',
      headline: wasCorreted
        ? `Schema validation failed → self-corrected (${String(trace.compilation.selfCorrectionAttempts)} attempt${trace.compilation.selfCorrectionAttempts === 1 ? '' : 's'})`
        : `Schema validation failed — ${String(schemaErrors.length)} error${schemaErrors.length === 1 ? '' : 's'}`,
      details: [
        mode === 'hallucinating'
          ? 'The LLM generated props that violate the Zod schema. Without Enterstellar, these invalid props would crash or corrupt the rendered component.'
          : wasCorreted
            ? 'The compiler detected schema violations and sent the errors back to the LLM for self-correction. The LLM revised its output successfully.'
            : 'The compiler detected schema violations. After exhausting self-correction attempts, it fell back to GenericCard.',
        ...errorDetails,
      ],
      errorCodes: schemaErrors.map((e) => e.code),
    };
  }

  return {
    status: 'success',
    headline: `Schema validation passed — ${String(trace.metrics.totalMs)}ms`,
    details: [
      'All props match the component\'s Zod schema. Types are correct, required fields are present, and hallucinated properties have been stripped.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 3: Tokens
// ---------------------------------------------------------------------------

/**
 * Extracts Tokens-step analysis from a `ZoneTrace`.
 *
 * The Tokens step enforces design token compliance. If the LLM outputs
 * raw CSS values (e.g., `#ff0000`) instead of token references
 * (e.g., `token:danger`), the compiler intercepts and corrects them.
 *
 * @param trace - The latest zone trace, or `null` if idle.
 * @param _mode - Current playground mode (reserved for future mode-specific messaging).
 * @returns Step analysis with token compliance status.
 *
 * @internal
 */
function analyzeTokens(trace: ZoneTrace | null, _mode: PlaygroundMode): StepAnalysis {
  if (trace === null) {
    return idleAnalysis('Tokens');
  }

  // Token errors use ENS-4xxx codes
  const tokenErrors = trace.compilation.errors.filter(
    (e) => e.code.startsWith('ENS-4'),
  );

  if (tokenErrors.length > 0) {
    const errorDetails = tokenErrors.map(
      (e) => `**${e.code}** at \`${e.path}\`: ${e.message}`,
    );

    return {
      status: 'warning',
      headline: `Design token violations detected — ${String(tokenErrors.length)} coerced`,
      details: [
        'The LLM used hardcoded CSS values instead of design tokens. The compiler coerced them to the nearest valid token, ensuring visual consistency with the design system.',
        ...errorDetails,
      ],
      errorCodes: tokenErrors.map((e) => e.code),
    };
  }

  return {
    status: 'success',
    headline: 'Design tokens validated ✓',
    details: [
      'All visual values resolve to valid design tokens. Colors, spacing, typography, and shadows all comply with the design system.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 4: A11y
// ---------------------------------------------------------------------------

/**
 * Extracts A11y-step analysis from a `ZoneTrace`.
 *
 * The A11y step audits ARIA roles, labels, and announcements against
 * the component's accessibility contract. Missing attributes are
 * auto-injected when `autoAccessibility` is enabled.
 *
 * @param trace - The latest zone trace, or `null` if idle.
 * @param _mode - Current playground mode (reserved for future mode-specific messaging).
 * @returns Step analysis with accessibility audit status.
 *
 * @internal
 */
function analyzeA11y(trace: ZoneTrace | null, _mode: PlaygroundMode): StepAnalysis {
  if (trace === null) {
    return idleAnalysis('A11y');
  }

  // A11y errors use ENS-5xxx codes
  const a11yErrors = trace.compilation.errors.filter(
    (e) => e.code.startsWith('ENS-5'),
  );

  if (a11yErrors.length > 0) {
    const errorDetails = a11yErrors.map(
      (e) => `**${e.code}** at \`${e.path}\`: ${e.message}`,
    );

    return {
      status: 'warning',
      headline: `Accessibility gaps detected — ${String(a11yErrors.length)} auto-injected`,
      details: [
        'The compiler detected missing ARIA attributes and auto-injected them based on the component\'s accessibility contract. The rendered component is now screen-reader accessible.',
        ...errorDetails,
      ],
      errorCodes: a11yErrors.map((e) => e.code),
    };
  }

  return {
    status: 'success',
    headline: 'Accessibility audit passed ✓',
    details: [
      'ARIA roles, labels, and announcements all comply with the component\'s accessibility contract. The output is screen-reader ready.',
    ],
  };
}

// ---------------------------------------------------------------------------
// Step 5: Emit
// ---------------------------------------------------------------------------

/**
 * Extracts Emit-step analysis from a `ZoneTrace`.
 *
 * The Emit step is the final stage — the compiler emits the validated
 * `CompilationResult` and `AgentTrace`. The component is now safe
 * for the React renderer.
 *
 * @param trace - The latest zone trace, or `null` if idle.
 * @param mode - Current playground mode.
 * @returns Step analysis with final compilation summary and latency.
 *
 * @internal
 */
function analyzeEmit(trace: ZoneTrace | null, mode: PlaygroundMode): StepAnalysis {
  if (trace === null) {
    return idleAnalysis('Emit');
  }

  const { status } = trace.compilation;
  const totalMs = trace.metrics.totalMs;
  const retries = trace.compilation.selfCorrectionAttempts;
  const errorCount = trace.compilation.errors.length;

  if (status === 'fail') {
    return {
      status: 'error',
      headline: `Compilation FAILED — fallback to GenericCard (${String(totalMs)}ms)`,
      details: [
        mode === 'hallucinating'
          ? `Without Enterstellar, this hallucinated output would crash the UI. With Enterstellar, the compiler caught ${String(errorCount)} error${errorCount === 1 ? '' : 's'} and rendered a safe GenericCard fallback instead.`
          : `The compiler detected ${String(errorCount)} validation error${errorCount === 1 ? '' : 's'} that could not be self-corrected. A GenericCard fallback was rendered to prevent UI corruption.`,
      ],
      data: {
        status,
        errorCount,
        selfCorrectionAttempts: retries,
        totalMs,
      },
    };
  }

  if (status === 'corrected') {
    return {
      status: 'warning',
      headline: `Compilation CORRECTED — ${String(retries)} retry${retries === 1 ? '' : 's'} (${String(totalMs)}ms)`,
      details: [
        `The LLM's initial output had errors, but the compiler's self-correction loop fixed them in ${String(retries)} attempt${retries === 1 ? '' : 's'}. The final output is safe and validated.`,
      ],
      data: {
        status,
        selfCorrectionAttempts: retries,
        totalMs,
      },
    };
  }

  // status === 'pass'
  return {
    status: 'success',
    headline: `Compilation PASSED — clean in ${String(totalMs)}ms`,
    details: [
      'The LLM\'s output passed all 5 validation stages on the first attempt. The compiled component is type-safe, design-token-compliant, and accessible.',
      `**Agent:** ${trace.provenance.agent}`,
      `**Compiler:** v${trace.provenance.compilerVersion}`,
    ],
    data: {
      status,
      totalMs,
      agent: trace.provenance.agent,
      compilerVersion: trace.provenance.compilerVersion,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * The 5 educational step definitions for the Enterstellar compiler pipeline.
 *
 * Each entry provides:
 * - Fixed educational text (`concept`) — explains the concept
 * - Dynamic trace analyzer (`analyzeTrace`) — extracts step-specific data
 *
 * **Step 1 (Resolve):** Context header includes raw LLM intent as input.
 * **Step 5 (Emit):** Context footer includes final latency metrics.
 * **All steps:** Educational text + dynamic trace data.
 *
 * This array is ordered to match the pipeline execution order:
 * `Resolve → Parse → Tokens → A11y → Emit` (Bible §4.2).
 *
 * @example
 * ```ts
 * const step = PIPELINE_STEP_EDUCATION[0]; // Resolve
 * const analysis = step.analyzeTrace(trace, 'healthy');
 * // analysis.status === 'success'
 * // analysis.headline === '"MetricCard" — resolved ✓'
 * ```
 */
export const PIPELINE_STEP_EDUCATION: readonly PipelineStepEducation[] = [
  // ── Step 1: Resolve ─────────────────────────────────────────────────────
  {
    step: 'resolve',
    title: 'Resolve',
    icon: '🔍',
    concept:
      'LLMs hallucinate names. Before touching React, Enterstellar checks if the component the LLM requested actually exists in your production Registry. If the name is wrong, Enterstellar can self-correct (re-ask the LLM) or fall back to a safe GenericCard — no broken UI reaches the user.',
    analyzeTrace: analyzeResolve,
  },

  // ── Step 2: Parse ───────────────────────────────────────────────────────
  {
    step: 'parse',
    title: 'Parse',
    icon: '📋',
    concept:
      'The Enterstellar Compiler runs the LLM\'s props through a strict Zod schema. Every field is type-checked, every nested object validated. Hallucinated properties are silently stripped (`z.object().strip()` — Design Choice P10). If critical props are missing or wrong, self-correction kicks in.',
    analyzeTrace: analyzeParse,
  },

  // ── Step 3: Tokens ──────────────────────────────────────────────────────
  {
    step: 'tokens',
    title: 'Tokens',
    icon: '🎨',
    concept:
      'Design tokens enforce visual consistency. If the LLM outputs raw CSS values (e.g., `#ff0000`) instead of token references (e.g., `token:danger`), the compiler intercepts and coerces them to the nearest valid token. Your design system stays intact, regardless of LLM creativity.',
    analyzeTrace: analyzeTokens,
  },

  // ── Step 4: A11y ────────────────────────────────────────────────────────
  {
    step: 'a11y',
    title: 'A11y',
    icon: '♿',
    concept:
      'Accessibility is not optional. The compiler audits ARIA roles, labels, and announcements against the component\'s accessibility contract. Missing `role`, `aria-label`, or `announceOnUpdate` attributes are auto-injected — every component rendered by Enterstellar is screen-reader ready by default.',
    analyzeTrace: analyzeA11y,
  },

  // ── Step 5: Emit ────────────────────────────────────────────────────────
  {
    step: 'emit',
    title: 'Emit',
    icon: '📤',
    concept:
      'With all validation passed and corrections applied, the compiler emits the final `CompilationResult` and `AgentTrace`. The safe, validated component is now ready for the React renderer. The trace is written to `EnterstellarStore` for DevTools consumption and observability.',
    analyzeTrace: analyzeEmit,
  },
] as const;
