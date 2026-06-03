/**
 * @module playground/components/playground/controls-bar
 * @description Sticky controls bar — 5-step pipeline summary + mode selector + latency.
 *
 * Always visible at the **bottom** of the playground viewport (48–56px height).
 * Contains:
 * - Compact inline pipeline summary matching the real Enterstellar compiler pipeline
 *   (Bible §4.2): `Resolve → Parse → Tokens → A11y → Emit`
 * - Mode-specific top border color (green / amber / purple)
 * - Latency badge (from `lastResult.durationMs`)
 * - Mode selector and Behind the Scenes toggle (passed as `children`)
 *
 * **Glassmorphism:** `backdrop-blur-xl` with semi-transparent surface
 * background. The bar floats over content during scroll.
 *
 * **Layout inversion (O6):** The bar is anchored to the bottom of the viewport
 * (`sticky bottom-0`), following modern AI chat UI patterns where controls
 * anchor below the content. The accent border is on the **top** edge,
 * facing the demo content above.
 *
 * @see implementation_plan.md §4.4 — Controls Bar
 * @see 03-enterstellar-implementation-bible.md §4.2 — Compilation Pipeline
 */
'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

import type { PlaygroundMode, SceneIntentResult } from '@/enterstellar/agent-connection';
import type { PipelineState } from './playground-shell';
import { cn, formatLatency, latencyColor } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link ControlsBar} component.
 */
interface ControlsBarProps {
  /** Current pipeline state. */
  readonly pipelineState: PipelineState;
  /** Active playground mode. */
  readonly mode: PlaygroundMode;
  /** Last API call result (null if no call has been made). */
  readonly lastResult: SceneIntentResult | null;
  /** Error message (null if no error). */
  readonly errorMessage: string | null;
  /** Mode selector and other controls (rendered on the right side). */
  readonly children?: ReactNode;
}

// ---------------------------------------------------------------------------
// Mode → Border Color
// ---------------------------------------------------------------------------

/**
 * Maps playground mode to the **top** border color class.
 *
 * The accent border is on the top edge of the bar (facing the content above),
 * since the controls bar is now anchored to the bottom of the viewport.
 *
 * - `'healthy'` → green (trust, correctness)
 * - `'hallucinating'` → amber (warning, danger)
 * - `'cloud'` → purple (premium, cloud)
 *
 * @internal
 */
const modeBorderColor: Record<PlaygroundMode, string> = {
  healthy: 'border-t-success/60',
  hallucinating: 'border-t-warning/60',
  cloud: 'border-t-cloud/60',
};

/**
 * Mode accent dot color for the pipeline steps.
 *
 * @internal
 */
const modeAccentColor: Record<PlaygroundMode, string> = {
  healthy: 'bg-success',
  hallucinating: 'bg-warning',
  cloud: 'bg-cloud',
};

// ---------------------------------------------------------------------------
// Pipeline Step Data
// ---------------------------------------------------------------------------

/**
 * Pipeline step configuration.
 *
 * @internal
 */
interface PipelineStep {
  /** Short label for the step. */
  readonly label: string;
  /** Icon/emoji for the step. */
  readonly icon: string;
}

/**
 * The 5 real Enterstellar compiler pipeline steps.
 *
 * These match the canonical compilation pipeline defined in:
 * - Bible §4.2: Resolve → Parse → Tokens → A11y → Trace (Emit)
 * - `pipeline-visualizer.tsx` L55–61
 *
 * The 4-step abstraction (`Intent → Resolve → Compile → Render`)
 * previously used here has been retired in favor of the real pipeline.
 *
 * @internal
 */
const PIPELINE_STEPS: readonly PipelineStep[] = [
  { label: 'Resolve', icon: '🔍' },
  { label: 'Parse', icon: '📋' },
  { label: 'Tokens', icon: '🎨' },
  { label: 'A11y', icon: '♿' },
  { label: 'Emit', icon: '📤' },
];

// ---------------------------------------------------------------------------
// ControlsBar Component
// ---------------------------------------------------------------------------

/**
 * Sticky controls bar at the **bottom** of the playground.
 *
 * Shows:
 * - Left: compact 5-step pipeline summary with step indicators
 * - Center: latency badge with formatted duration
 * - Right: Behind the Scenes toggle + mode selector (passed as children)
 *
 * The top border color changes per mode — green (healthy),
 * amber (hallucinating), purple (cloud) — providing immediate
 * visual feedback about which mode is active.
 */
export function ControlsBar({
  pipelineState,
  mode,
  lastResult,
  errorMessage,
  children,
}: ControlsBarProps): React.JSX.Element {
  const durationMs = lastResult?.durationMs ?? null;

  return (
    <div
      className={cn(
        'sticky bottom-0 z-30',
        'h-14 px-4',
        'flex items-center justify-between gap-4',
        'backdrop-blur-xl bg-playground-surface/80',
        'border-t-2',
        modeBorderColor[mode],
      )}
    >
      {/* ── Left: Pipeline Summary ── */}
      <div className="flex items-center gap-1.5">
        {PIPELINE_STEPS.map((step, i) => {
          /**
           * Step state logic for the 5 real compiler steps:
           *
           * - `loading`: Steps 0 (Resolve) is complete, step 1 (Parse) shows
           *   active spinner. Steps 2–4 are pending.
           * - `compiled`: All 5 steps show green checkmarks.
           * - `error`: Step at index 1 (Parse) shows error X — Parse is the
           *   most common failure point (Zod schema validation).
           * - `idle`: All steps show muted/inactive.
           */
          const isActive =
            pipelineState === 'loading' && i <= 1;
          const isComplete =
            pipelineState === 'compiled' ||
            (pipelineState === 'loading' && i === 0);
          const isError =
            pipelineState === 'error' && i === 1;

          return (
            <div key={step.label} className="flex items-center gap-1.5">
              {/* Step indicator */}
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all duration-300',
                  pipelineState === 'idle' && 'text-playground-muted',
                  isActive && 'text-neutral-100',
                  isComplete && 'text-success',
                  isError && 'text-error',
                )}
              >
                <span className="text-[11px]">{step.icon}</span>
                <span className="hidden sm:inline">{step.label}</span>

                {/* Active spinner */}
                {isActive && i === 1 && (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block text-[10px]"
                  >
                    ⟳
                  </motion.span>
                )}

                {/* Complete check */}
                {isComplete && pipelineState === 'compiled' && (
                  <span className="text-[10px]">✓</span>
                )}

                {/* Error X */}
                {isError && (
                  <span className="text-[10px]">✗</span>
                )}
              </div>

              {/* Arrow separator */}
              {i < PIPELINE_STEPS.length - 1 && (
                <span
                  className={cn(
                    'text-[10px] transition-colors duration-300',
                    pipelineState === 'idle'
                      ? 'text-playground-muted/40'
                      : 'text-playground-muted',
                  )}
                >
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Center: Latency Badge + Error ── */}
      <div className="flex items-center gap-3">
        {/* Latency badge */}
        {durationMs !== null && pipelineState === 'compiled' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
              'bg-playground-panel border border-playground-border',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                modeAccentColor[mode],
              )}
            />
            <span className={latencyColor(durationMs)}>
              {formatLatency(durationMs)}
            </span>
          </motion.div>
        )}

        {/* Error indicator */}
        {pipelineState === 'error' && errorMessage !== null && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-error/10 text-error border border-error/30 max-w-[280px] truncate"
          >
            <span>⚠</span>
            <span className="truncate">{errorMessage}</span>
          </motion.div>
        )}

        {/* Loading indicator */}
        {pipelineState === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-playground-muted"
          >
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="inline-block"
            >
              ⟳
            </motion.span>
            <span>Compiling…</span>
          </motion.div>
        )}
      </div>

      {/* ── Right: Mode Selector + Controls ── */}
      <div className="flex items-center gap-2">
        {children}
      </div>
    </div>
  );
}
