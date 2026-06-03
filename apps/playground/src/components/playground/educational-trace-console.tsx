/**
 * @module playground/components/playground/educational-trace-console
 * @description Unified Master-Detail "Behind the Scenes" educational panel.
 *
 * Replaces the previous separate `BehindTheScenes` and `FullTracePanel`
 * components with a single synchronized panel containing:
 *
 * **Left pane (Master):** 5 clickable pipeline step cards matching the
 * Enterstellar compiler pipeline (Bible §4.2): Resolve → Parse → Tokens → A11y → Emit.
 * Each card shows a status indicator and auto-advances during live execution
 * with a minimum 600ms dwell time per step.
 *
 * **Right pane (Detail):** Educational context synchronized to the active
 * step. Contains fixed educational text, dynamic trace analysis, error code
 * badges, collapsible structured data, and a "View Raw Trace" toggle.
 *
 * **Auto-advance behavior:**
 * 1. When `pipelineState` transitions to `'loading'`, auto-advance starts
 *    at step 0 (Resolve) and advances through steps 1–4 with 600ms dwell.
 * 2. When `pipelineState` transitions to `'compiled'` or `'error'`,
 *    auto-advance completes remaining steps rapidly (or stops on error).
 * 3. After auto-advance stops, the user can freely click any step.
 *
 * **State managed here:**
 * - `activePipelineStep` (0–4) — currently selected step in the detail pane
 * - `isAutoAdvancing` (boolean) — whether auto-advance is in progress
 *
 * @see implementation_plan.md §2.1 — Unified Educational Console
 * @see implementation_plan.md §2.2 — Hallucination Mode (THE MOAT)
 * @see step-education-data.ts — pipeline step dictionary
 * @see pipeline-step-card.tsx — left-pane step card component
 * @see step-detail-pane.tsx — right-pane detail component
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { PlaygroundMode, SceneIntentResult } from '@/enterstellar/agent-connection';
import type { PlaygroundScene } from '@/enterstellar/scenes/types';
import type { ZoneTrace, CompilationProvenance, CompilationError } from '@enterstellar-ai/types';
import type { PipelineState } from './playground-shell';
import type { StepStatus } from './pipeline-step-card';

import { PIPELINE_STEP_EDUCATION, STEP_DWELL_TIME_MS } from './step-education-data';
import { PipelineStepCard } from './pipeline-step-card';
import { StepDetailPane } from './step-detail-pane';
import { playgroundContracts } from '@/enterstellar/registry';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Total number of pipeline steps. */
const TOTAL_STEPS = PIPELINE_STEP_EDUCATION.length;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link EducationalTraceConsole} component.
 */
interface EducationalTraceConsoleProps {
  /** Whether the panel is expanded (controlled by PlaygroundShell). */
  readonly isOpen: boolean;
  /** Active playground mode — drives mode-specific messaging in analysis. */
  readonly mode: PlaygroundMode;
  /** Active scene — used for zone name context. */
  readonly scene: PlaygroundScene;
  /** Current pipeline state — triggers auto-advance start/stop. */
  readonly pipelineState: PipelineState;
  /** Last API result — used to construct ZoneTrace for analysis. */
  readonly lastResult: SceneIntentResult | null;
}

// ---------------------------------------------------------------------------
// Trace Construction Helper
// ---------------------------------------------------------------------------

/**
 * Constructs a `ZoneTrace` from a `SceneIntentResult` for a specific
 * zone's intent, with **real Zod schema validation**.
 *
 * **Critical fix:** Previous implementation hardcoded `status: 'pass'`
 * for all healthy intents, causing the Behind the Scenes panel to show
 * "passed" for components that actually failed schema validation and
 * fell back to GenericCard in the render pipeline.
 *
 * This function now runs the same `safeParse` that the real compiler
 * uses in `@enterstellar-ai/compiler/pipeline/parse-step.ts`. The trace status
 * accurately reflects whether the component's props will pass or fail
 * Zod validation.
 *
 * @param result - The API result from `sendSceneIntent()`.
 * @param index - The zone index to construct a trace for.
 * @returns A `ZoneTrace` with accurate compilation status, or `null`.
 *
 * @internal
 */
function buildTraceFromResult(result: SceneIntentResult, index: number = 0): ZoneTrace | null {
  const intent = result.intents[index];
  if (intent === undefined) return null;

  const provenance: CompilationProvenance = {
    agent: 'GPT OSS 120B',
    registry: 'playground',
    compilerVersion: '0.1.0',
    compiledAt: new Date().toISOString(),
  };

  // ── Real Schema Pre-Validation ────────────────────────────────────
  // Run the same Zod safeParse the compiler uses in parse-step.ts.
  // This produces accurate trace data for the educational console.
  const contract = playgroundContracts.find(
    (c) => c.name === intent.component,
  );

  let compilationStatus: 'pass' | 'fail' = 'pass';
  let compilationErrors: CompilationError[] = [];

  if (contract === undefined) {
    // Component name doesn't exist in registry → ENS-3004
    compilationStatus = 'fail';
    compilationErrors = [{
      code: 'ENS-3004',
      message: `Component "${intent.component}" not found in registry`,
      path: 'component',
    }];
  } else {
    // Run the real Zod schema validation
    const parseResult = contract.props.safeParse(intent.props);
    if (!parseResult.success) {
      compilationStatus = 'fail';
      compilationErrors = parseResult.error.issues.map((issue) => ({
        code: 'ENS-2001',
        message: `Schema validation failed at '${issue.path.length > 0 ? `props.${issue.path.join('.')}` : 'props'}': ${issue.message}`,
        path: issue.path.length > 0 ? `props.${issue.path.join('.')}` : 'props',
      }));
    }
  }

  return {
    id: `trace-${String(Date.now())}`,
    intent: {
      component: intent.component,
      props: intent.props,
      confidence: intent.confidence,
      _source: {
        protocol: 'custom' as const,
        rawEventId: 'educational-console',
      },
    },
    compilation: {
      status: compilationStatus,
      errors: compilationErrors,
      selfCorrectionAttempts: 0,
    },
    provenance,
    metrics: {
      totalMs: result.durationMs,
      retryAttempt: 0,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Constructs a synthetic **failed** `ZoneTrace` from the hallucinated
 * intents in a `SceneIntentResult`.
 *
 * These traces represent what an unprotected system would produce —
 * invented component names, wrong prop types, missing a11y. The compiler
 * catches these and falls back to GenericCard.
 *
 * @param result - The API result containing `hallucinatedIntents`.
 * @returns A `ZoneTrace` with `status: 'fail'`, or `null` if no hallucinated intents.
 *
 * @internal
 */
function buildHallucinatedTraceFromResult(result: SceneIntentResult, index: number = 0): ZoneTrace | null {
  const hallucinated = result.hallucinatedIntents;
  if (hallucinated === undefined || hallucinated.length === 0) return null;

  const intent = hallucinated[index];
  if (intent === undefined) return null;

  return {
    id: `hallucinated-trace-${String(Date.now())}`,
    intent: {
      component: intent.component,
      props: intent.props,
      confidence: intent.confidence,
      _source: {
        protocol: 'custom' as const,
        rawEventId: 'educational-console-hallucinated',
      },
    },
    compilation: {
      status: 'fail',
      errors: [
        {
          code: 'ENS-3004',
          message: `Hallucinated component "${intent.component}" — no registry match`,
          path: 'component',
        },
      ],
      selfCorrectionAttempts: 0,
    },
    provenance: {
      agent: 'GPT OSS 120B (sabotaged)',
      registry: 'playground',
      compilerVersion: '0.1.0',
      compiledAt: new Date().toISOString(),
    },
    metrics: {
      totalMs: result.durationMs,
      retryAttempt: 0,
    },
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Step Status Logic
// ---------------------------------------------------------------------------

/**
 * Determines the visual status of each pipeline step based on the current
 * pipeline state, auto-advance progress, and real trace analysis.
 *
 * **Critical fix:** When auto-advance is complete (`pipelineState === 'compiled'`
 * and `!isAutoAdvancing`), the status is now derived from the real
 * `analyzeTrace()` result instead of hardcoding `'success'`. This keeps
 * the left-pane step cards in sync with the right-pane detail analysis.
 *
 * @param stepIndex - The step's index (0–4).
 * @param pipelineState - Current pipeline state from the shell.
 * @param activeStep - Currently active step during auto-advance.
 * @param isAutoAdvancing - Whether auto-advance is in progress.
 * @param stepAnalysisStatus - The real analysis status for this step
 *   from `analyzeTrace()`. Only used when auto-advance is complete.
 * @returns The visual status for the step card.
 *
 * @internal
 */
function getStepStatus(
  stepIndex: number,
  pipelineState: PipelineState,
  activeStep: number,
  isAutoAdvancing: boolean,
  stepAnalysisStatus: 'success' | 'warning' | 'error' | 'idle' | null,
): StepStatus {
  if (pipelineState === 'idle') {
    return 'idle';
  }

  if (pipelineState === 'error') {
    // On error, step 1 (Parse) shows error; steps before it show success;
    // steps after show pending.
    if (stepIndex < 1) return 'success';
    if (stepIndex === 1) return 'error';
    return 'pending';
  }

  if (pipelineState === 'compiled') {
    if (isAutoAdvancing) {
      // Still auto-advancing after compilation completed
      if (stepIndex < activeStep) return 'success';
      if (stepIndex === activeStep) return 'active';
      return 'pending';
    }
    // Auto-advance complete — use real trace analysis status.
    // Map StepAnalysis status → StepStatus for the left-pane card.
    if (stepAnalysisStatus === 'error') return 'error';
    if (stepAnalysisStatus === 'warning') return 'warning';
    return 'success';
  }

  // pipelineState === 'loading'
  if (isAutoAdvancing) {
    if (stepIndex < activeStep) return 'success';
    if (stepIndex === activeStep) return 'active';
    return 'pending';
  }

  return 'pending';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Unified Master-Detail educational panel for the Enterstellar compiler pipeline.
 *
 * **Layout:**
 * ```
 * ┌──────────────┬──────────────────────────────┐
 * │ Step Cards   │  Educational Content          │
 * │              │                               │
 * │ 🔍 Resolve  │  📖 Fixed concept text        │
 * │ 📋 Parse    │  [PASS] Dynamic headline      │
 * │ 🎨 Tokens   │  Detail paragraphs...         │
 * │ ♿ A11y     │  [ENS-2001] error codes       │
 * │ 📤 Emit     │  ▸ View Raw Trace             │
 * │              │                               │
 * └──────────────┴──────────────────────────────┘
 * ```
 *
 * The panel is positioned between the SceneGrid and PromptBar in the
 * inverted layout (O6). It expands upward from the prompt bar area
 * when toggled via the "Behind the Scenes" button in the ControlsBar.
 */
export function EducationalTraceConsole({
  isOpen,
  mode,
  scene: _scene,
  pipelineState,
  lastResult,
}: EducationalTraceConsoleProps): React.JSX.Element {
  // ── State ─────────────────────────────────────────────────────────────
  const [activePipelineStep, setActivePipelineStep] = useState(0);
  const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);
  const [activeTraceIndex, setActiveTraceIndex] = useState(0);

  /**
   * Ref tracking the previous pipeline state. Used to detect transitions
   * (e.g., `idle → loading` triggers auto-advance start).
   */
  const prevPipelineStateRef = useRef<PipelineState>(pipelineState);

  // ── Auto-Advance Logic ────────────────────────────────────────────────

  /**
   * Effect: Start auto-advance when pipeline transitions to `loading`.
   *
   * Resets to step 0 and enables auto-advancing. The interval timer
   * (below) handles the step-by-step progression.
   */
  useEffect(() => {
    const prevState = prevPipelineStateRef.current;
    prevPipelineStateRef.current = pipelineState;

    // Start auto-advance when transitioning TO loading
    if (pipelineState === 'loading' && prevState !== 'loading') {
      setActivePipelineStep(0);
      setIsAutoAdvancing(true);
      setActiveTraceIndex(0);
    }

    // Stop auto-advance on error
    if (pipelineState === 'error') {
      setIsAutoAdvancing(false);
      // Set active step to the error step (Parse = index 1)
      setActivePipelineStep(1);
    }
  }, [pipelineState]);

  /**
   * Effect: Auto-advance timer — advances through steps 0→4 with
   * STEP_DWELL_TIME_MS (600ms) dwell per step.
   *
   * Runs only when `isAutoAdvancing` is true. Stops after reaching
   * the final step (Emit, index 4). Timer is cleaned up on unmount
   * or when auto-advance stops.
   */
  useEffect(() => {
    if (!isAutoAdvancing) return;

    const timer = setInterval(() => {
      setActivePipelineStep((current) => {
        const next = current + 1;
        if (next >= TOTAL_STEPS) {
          // Reached the final step — stop auto-advance
          setIsAutoAdvancing(false);
          return current;
        }
        return next;
      });
    }, STEP_DWELL_TIME_MS);

    return () => {
      clearInterval(timer);
    };
  }, [isAutoAdvancing]);

  // ── Handlers ──────────────────────────────────────────────────────────

  /**
   * Handles user clicking a specific step card.
   * Interrupts auto-advance if active.
   */
  const handleStepClick = useCallback((stepIndex: number) => {
    setActivePipelineStep(stepIndex);
    // Don't stop auto-advance on click — let the user peek at a step
    // while auto-advance continues. If they want to stop auto-advance,
    // the pipeline will naturally complete.
  }, []);

  // ── Derived Data ──────────────────────────────────────────────────────

  const activeEducation = PIPELINE_STEP_EDUCATION[activePipelineStep];

  // Guard against invalid index (should never happen, but satisfies noUncheckedIndexedAccess)
  if (activeEducation === undefined) {
    return <div />;
  }

  // Construct traces from latest result
  const trace: ZoneTrace | null =
    lastResult !== null ? buildTraceFromResult(lastResult, activeTraceIndex) : null;

  // Hallucination mode: also construct a failed trace from hallucinated intents
  const hallucinatedTrace: ZoneTrace | null =
    lastResult !== null ? buildHallucinatedTraceFromResult(lastResult, activeTraceIndex) : null;

  // Generate analysis for the active step (healthy trace)
  const analysis = activeEducation.analyzeTrace(trace, mode);

  // Generate analysis for the active step (hallucinated trace) — only in hallucinating mode
  const hallucinatedAnalysis = mode === 'hallucinating' && hallucinatedTrace !== null
    ? activeEducation.analyzeTrace(hallucinatedTrace, mode)
    : null;

  const isHallucinating = mode === 'hallucinating' && hallucinatedAnalysis !== null;

  // Compute per-step analysis status for left-pane step cards.
  // Each step needs its own analyzeTrace() result so the left-pane
  // badge color matches what the right-pane shows when selected.
  const perStepAnalysisStatus: Array<'success' | 'warning' | 'error' | 'idle' | null> =
    PIPELINE_STEP_EDUCATION.map((stepEd) => {
      if (trace === null) return null;
      return stepEd.analyzeTrace(trace, mode).status;
    });

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="overflow-hidden border-b border-playground-border/30"
        >
          <div
            className={cn(
              'grid grid-cols-[200px_1fr]',
              'bg-playground-surface/60 backdrop-blur-sm',
              'h-[400px]',
            )}
          >
            {/* ── Left Pane: Pipeline Step Cards ── */}
            <div className="border-r border-playground-border/30 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
              <div className="text-[9px] uppercase tracking-widest text-playground-muted font-semibold px-3 mb-2">
                Compiler Pipeline
              </div>
              {PIPELINE_STEP_EDUCATION.map((stepEd, i) => (
                <PipelineStepCard
                  key={stepEd.step}
                  icon={stepEd.icon}
                  title={stepEd.title}
                  index={i}
                  status={getStepStatus(i, pipelineState, activePipelineStep, isAutoAdvancing, perStepAnalysisStatus[i] ?? null)}
                  isSelected={i === activePipelineStep}
                  isAutoAdvancing={isAutoAdvancing}
                  onClick={() => { handleStepClick(i); }}
                />
              ))}
            </div>

            {/* ── Right Pane: Educational Content + Trace Analysis ── */}
            <div className="overflow-hidden">
              {isHallucinating ? (
                <div className="flex flex-col h-full overflow-y-auto relative">
                  {/* Green: Healthy trace analysis */}
                  <div className="border-b border-playground-border/20 flex flex-col shrink-0">
                    <div className="flex flex-col px-4 pt-3 pb-1 border-b border-playground-border/10 bg-success/5">
                      <div className="flex items-center gap-2">
                        <span className="text-success text-xs">✅</span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-success">
                          Enterstellar Protected
                        </span>
                      </div>
                      {trace && lastResult && (
                        <div className="flex items-center justify-between mt-1 pt-1 border-t border-success/10">
                          <div className="text-[9px] text-success/70">
                            Spotlight parsing zone: <span className="font-mono bg-success/10 px-1 py-0.5 rounded text-success/90">{trace.intent.component}</span> (Zone {activeTraceIndex + 1} of {lastResult.intents.length})
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={activeTraceIndex === 0}
                              onClick={() => { setActiveTraceIndex((i) => Math.max(0, i - 1)); }}
                              className="w-5 h-5 flex items-center justify-center rounded bg-success/10 text-success hover:bg-success/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              disabled={activeTraceIndex >= lastResult.intents.length - 1}
                              onClick={() => { setActiveTraceIndex((i) => Math.min(lastResult.intents.length - 1, i + 1)); }}
                              className="w-5 h-5 flex items-center justify-center rounded bg-success/10 text-success hover:bg-success/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              ›
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <StepDetailPane
                      stepEducation={activeEducation}
                      analysis={analysis}
                      trace={trace}
                      isResolveStep={activePipelineStep === 0}
                    />
                  </div>

                  {/* Red: Hallucinated trace analysis */}
                  <div className="bg-error/[0.03] flex flex-col shrink-0 border-b border-playground-border/10">
                    <div className="flex items-center gap-2 px-4 pt-3 pb-1 border-b border-error/10 bg-error/5">
                      <span className="text-error text-xs">⚠</span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-error/80">
                        Without Enterstellar
                      </span>
                    </div>
                    <StepDetailPane
                      stepEducation={activeEducation}
                      analysis={hallucinatedAnalysis}
                      trace={hallucinatedTrace}
                      isResolveStep={activePipelineStep === 0}
                    />
                  </div>
                </div>
              ) : (
                // ── Standard View (Healthy/Cloud Mode) ──
                <div className="flex flex-col h-full">
                  {trace && lastResult && (
                    <div className="flex items-center justify-between px-4 py-2 border-b border-playground-border/20 bg-playground-panel/30 shrink-0">
                      <span className="text-[10px] text-playground-muted uppercase tracking-wider">
                        Spotlight Analysis: <span className="font-mono text-primary-400">"{trace.intent.component}"</span> (Zone {activeTraceIndex + 1} of {lastResult.intents.length})
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={activeTraceIndex === 0}
                          onClick={() => { setActiveTraceIndex((i) => Math.max(0, i - 1)); }}
                          className="w-5 h-5 flex items-center justify-center rounded border border-playground-border/50 text-playground-muted hover:text-neutral-200 hover:bg-playground-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          disabled={activeTraceIndex >= lastResult.intents.length - 1}
                          onClick={() => { setActiveTraceIndex((i) => Math.min(lastResult.intents.length - 1, i + 1)); }}
                          className="w-5 h-5 flex items-center justify-center rounded border border-playground-border/50 text-playground-muted hover:text-neutral-200 hover:bg-playground-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto">
                    <StepDetailPane
                      stepEducation={activeEducation}
                      analysis={analysis}
                      trace={trace}
                      isResolveStep={activePipelineStep === 0}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
