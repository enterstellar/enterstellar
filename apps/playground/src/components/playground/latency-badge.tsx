/**
 * @module playground/components/playground/latency-badge
 * @description Latency badge with breakdown tooltip.
 *
 * Displays the total request duration with color coding:
 * - Green: <100ms (fast)
 * - Yellow: 100–500ms (moderate)
 * - Red: >500ms (slow)
 *
 * Hover reveals a breakdown tooltip: `LLM: Xms | Compile: Yms`
 *
 * The compile time is the punchline of the Enterstellar value proposition:
 * "Enterstellar adds Xms of type safety" — when compile < 5ms, this proves
 * that deterministic validation is essentially free.
 *
 * @see implementation_plan.md §4.14 — Latency Badge
 */
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Optional latency breakdown for the tooltip.
 */
export interface LatencyBreakdown {
  /** LLM inference time in milliseconds. */
  readonly llmMs?: number;
  /** Enterstellar compilation time in milliseconds. */
  readonly compileMs?: number;
  /** React render time in milliseconds (estimated). */
  readonly renderMs?: number;
}

/**
 * Props for the {@link LatencyBadge} component.
 */
interface LatencyBadgeProps {
  /** Total request duration in milliseconds. */
  readonly durationMs: number;
  /** Optional timing breakdown for tooltip. */
  readonly breakdown?: LatencyBreakdown;
  /** Optional CSS class name override. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a millisecond duration for display.
 *
 * @internal
 */
function formatMs(ms: number): string {
  if (ms < 1000) return `${String(Math.round(ms))}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Returns the color class based on latency.
 *
 * @internal
 */
function getColorClass(ms: number): { text: string; bg: string; dot: string } {
  if (ms < 100) return { text: 'text-success', bg: 'bg-success/10', dot: 'bg-success' };
  if (ms < 500) return { text: 'text-warning', bg: 'bg-warning/10', dot: 'bg-warning' };
  return { text: 'text-error', bg: 'bg-error/10', dot: 'bg-error' };
}

// ---------------------------------------------------------------------------
// LatencyBadge Component
// ---------------------------------------------------------------------------

/**
 * Latency badge with hover breakdown tooltip.
 *
 * Shows total duration with color coding. Hover reveals
 * a detailed breakdown and the compile-time punchline.
 */
export function LatencyBadge({
  durationMs,
  breakdown,
  className,
}: LatencyBadgeProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);
  const colors = getColorClass(durationMs);

  const compileMs = breakdown?.compileMs;
  const showPunchline = compileMs !== undefined && compileMs < 5;

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => { setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); }}
    >
      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-default',
          'border border-playground-border/50',
          colors.bg,
        )}
      >
        <span className={cn('size-1.5 rounded-full', colors.dot)} />
        <span className={colors.text}>{formatMs(durationMs)}</span>
      </motion.div>

      {/* Tooltip */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 rounded-lg bg-playground-surface border border-playground-border/50 shadow-xl z-30 whitespace-nowrap"
          >
            {/* Breakdown rows */}
            <div className="space-y-1">
              {breakdown?.llmMs !== undefined && (
                <div className="flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-playground-muted">LLM Inference</span>
                  <span className="font-mono text-neutral-200">
                    {formatMs(breakdown.llmMs)}
                  </span>
                </div>
              )}
              {compileMs !== undefined && (
                <div className="flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-playground-muted">Enterstellar Compile</span>
                  <span className={cn('font-mono', showPunchline ? 'text-success font-bold' : 'text-neutral-200')}>
                    {formatMs(compileMs)}
                  </span>
                </div>
              )}
              {breakdown?.renderMs !== undefined && (
                <div className="flex items-center justify-between gap-4 text-[10px]">
                  <span className="text-playground-muted">React Render</span>
                  <span className="font-mono text-neutral-200">
                    {formatMs(breakdown.renderMs)}
                  </span>
                </div>
              )}

              {/* Total */}
              <div className="flex items-center justify-between gap-4 text-[10px] border-t border-playground-border/30 pt-1 mt-1">
                <span className="text-playground-muted font-semibold">Total</span>
                <span className={cn('font-mono font-bold', colors.text)}>
                  {formatMs(durationMs)}
                </span>
              </div>
            </div>

            {/* Punchline */}
            {showPunchline && (
              <p className="mt-2 pt-1.5 border-t border-playground-border/20 text-[9px] text-success/80 font-medium">
                ✨ Enterstellar adds {formatMs(compileMs)} of type safety
              </p>
            )}

            {/* Tooltip arrow */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 size-0 border-x-4 border-x-transparent border-b-4 border-b-playground-border/50" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
