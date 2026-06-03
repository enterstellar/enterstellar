/**
 * @module playground/components/playground/step-detail-pane
 * @description Right-pane educational content + trace analysis for the
 * educational console.
 *
 * Displays two layers of information for the currently active pipeline step:
 *
 * 1. **Fixed educational text** (`concept`) — explains the concept:
 *    what is this step? Why does it exist? Always displayed at the top.
 *
 * 2. **Dynamic trace analysis** (`StepAnalysis`) — shows what actually
 *    happened for the user's specific prompt:
 *    - Status badge (green/amber/red)
 *    - Dynamic headline (e.g., "MetricCard resolved in 0.3ms")
 *    - Detail paragraphs (markdown-ish text)
 *    - Optional structured data (collapsible JSON block)
 *    - Optional error code badges (inline `ENS-xxxx` code tags)
 *
 * 3. **"View Raw Trace" toggle** — switches the entire pane to a raw
 *    `ZoneTrace` JSON dump with monospace styling.
 *
 * 4. **Raw LLM Intent header** — shown only on the Resolve step (index 0)
 *    as a context header above the educational text, displaying the raw
 *    `ComponentIntent` that was the pipeline's input.
 *
 * @see implementation_plan.md §2.1 — "Right pane (Detail)"
 * @see step-education-data.ts — data source for educational content
 */
'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { ZoneTrace } from '@enterstellar-ai/types';
import type { StepAnalysis, PipelineStepEducation } from './step-education-data';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link StepDetailPane} component.
 */
interface StepDetailPaneProps {
  /** The active step's education entry (contains concept + analyzeTrace). */
  readonly stepEducation: PipelineStepEducation;
  /** The dynamic trace analysis for the active step. `null` if idle. */
  readonly analysis: StepAnalysis;
  /** The latest zone trace (shown in raw mode and as Resolve step context). */
  readonly trace: ZoneTrace | null;
  /** Whether this is the Resolve step (index 0) — shows raw intent header. */
  readonly isResolveStep: boolean;
}

// ---------------------------------------------------------------------------
// Status Badge Mapping
// ---------------------------------------------------------------------------

/**
 * Maps analysis status to visual badge properties.
 *
 * @internal
 */
const STATUS_BADGE: Record<StepAnalysis['status'], {
  readonly label: string;
  readonly className: string;
}> = {
  idle: {
    label: 'IDLE',
    className: 'bg-neutral-500/15 text-neutral-400 border border-neutral-500/30',
  },
  success: {
    label: 'PASS',
    className: 'bg-success/15 text-success border border-success/30',
  },
  warning: {
    label: 'CORRECTED',
    className: 'bg-warning/15 text-warning border border-warning/30',
  },
  error: {
    label: 'FAIL',
    className: 'bg-error/15 text-error border border-error/30',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Right-pane component displaying educational content and trace analysis
 * for the currently selected pipeline step.
 *
 * **Layout:**
 * ```
 * ┌─────────────────────────────────────────┐
 * │ [Raw LLM Intent] (Resolve step only)   │
 * ├─────────────────────────────────────────┤
 * │ 📖 Educational Text (fixed concept)    │
 * ├─────────────────────────────────────────┤
 * │ [PASS] Dynamic headline                │
 * │ Detail paragraph 1...                  │
 * │ Detail paragraph 2...                  │
 * │ [ENS-2001] [ENS-3004]  (error codes)  │
 * │ ▸ Structured Data (collapsible JSON)   │
 * ├─────────────────────────────────────────┤
 * │ [View Raw Trace] toggle                │
 * └─────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <StepDetailPane
 *   stepEducation={PIPELINE_STEP_EDUCATION[0]}
 *   analysis={analysis}
 *   trace={latestTrace}
 *   isResolveStep={true}
 * />
 * ```
 */
export function StepDetailPane({
  stepEducation,
  analysis,
  trace,
  isResolveStep,
}: StepDetailPaneProps): React.JSX.Element {
  // ── State ─────────────────────────────────────────────────────────────
  const [showRawTrace, setShowRawTrace] = useState(false);
  const [showStructuredData, setShowStructuredData] = useState(false);

  /** Toggles between educational view and raw JSON trace view. */
  const toggleRawTrace = useCallback(() => {
    setShowRawTrace((prev) => !prev);
  }, []);

  /** Toggles the structured data collapsible. */
  const toggleStructuredData = useCallback(() => {
    setShowStructuredData((prev) => !prev);
  }, []);

  const badge = STATUS_BADGE[analysis.status];

  // ── Raw Trace View ────────────────────────────────────────────────────

  if (showRawTrace) {
    return (
      <div className="flex flex-col h-full">
        {/* Header with back button */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-playground-border/30">
          <span className="text-xs font-semibold text-neutral-200">
            Raw Zone Trace
          </span>
          <button
            type="button"
            onClick={toggleRawTrace}
            className={cn(
              'text-[11px] px-2 py-1 rounded cursor-pointer',
              'text-primary-400 hover:bg-primary-500/10',
              'transition-colors duration-150',
            )}
          >
            ← Back to Educational View
          </button>
        </div>

        {/* Raw JSON dump */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-[11px] leading-relaxed font-mono text-playground-muted whitespace-pre-wrap break-all">
            {trace !== null
              ? JSON.stringify(trace, null, 2)
              : '// No trace available yet. Submit a prompt to generate a trace.'}
          </pre>
        </div>
      </div>
    );
  }

  // ── Educational View ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={stepEducation.step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="flex flex-col gap-4 p-4"
        >
          {/* ── Raw LLM Intent Header (Resolve step only) ── */}
          {isResolveStep && trace !== null && (
            <div className="rounded-lg bg-playground-panel/50 border border-playground-border/30 p-3">
              <div className="text-[10px] uppercase tracking-wider text-playground-muted font-semibold mb-2">
                Raw LLM Intent (Pipeline Input)
              </div>
              <div className="text-[11px] font-mono text-neutral-300 leading-relaxed">
                <span className="text-primary-400">component:</span>{' '}
                <span className="text-neutral-100">{trace.intent.component}</span>
              </div>
              <div className="text-[11px] font-mono text-neutral-300 leading-relaxed mt-1">
                <span className="text-primary-400">confidence:</span>{' '}
                <span className="text-neutral-100">{String(trace.intent.confidence)}</span>
              </div>
            </div>
          )}

          {/* ── Fixed Educational Text ── */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-playground-muted font-semibold mb-1.5">
              {stepEducation.icon} What is {stepEducation.title}?
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              {stepEducation.concept}
            </p>
          </div>

          {/* ── Dynamic Analysis ── */}
          <div className="rounded-lg bg-playground-panel/40 border border-playground-border/20 p-3 space-y-3">
            {/* Status Badge + Headline */}
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5',
                  badge.className,
                )}
              >
                {badge.label}
              </span>
              <span className="text-xs font-medium text-neutral-200 leading-snug">
                {analysis.headline}
              </span>
            </div>

            {/* Detail Paragraphs */}
            {analysis.details.map((detail, i) => (
              <p
                key={`detail-${stepEducation.step}-${String(i)}`}
                className="text-[11px] text-playground-muted leading-relaxed"
              >
                {detail}
              </p>
            ))}

            {/* Error Code Badges */}
            {analysis.errorCodes !== undefined && analysis.errorCodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analysis.errorCodes.map((code, codeIdx) => (
                  <span
                    key={`err-${stepEducation.step}-${String(codeIdx)}`}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-error/10 text-error border border-error/20"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}

            {/* Structured Data (Collapsible) */}
            {analysis.data !== undefined && (
              <div>
                <button
                  type="button"
                  onClick={toggleStructuredData}
                  className={cn(
                    'text-[10px] font-medium cursor-pointer',
                    'text-primary-400 hover:text-primary-300',
                    'transition-colors duration-150',
                  )}
                >
                  {showStructuredData ? '▾ Hide Data' : '▸ View Data'}
                </button>
                <AnimatePresence>
                  {showStructuredData && (
                    <motion.pre
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden mt-2 text-[10px] font-mono text-playground-muted leading-relaxed bg-playground-surface/60 rounded p-2 whitespace-pre-wrap break-all"
                    >
                      {JSON.stringify(analysis.data, null, 2)}
                    </motion.pre>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ── View Raw Trace Toggle ── */}
          <div className="pt-1">
            <button
              type="button"
              onClick={toggleRawTrace}
              className={cn(
                'text-[10px] font-medium cursor-pointer',
                'text-playground-muted hover:text-primary-400',
                'transition-colors duration-150',
              )}
            >
              📋 View Raw Trace
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
