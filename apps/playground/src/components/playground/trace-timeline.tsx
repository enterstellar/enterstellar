/**
 * @module playground/components/playground/trace-timeline
 * @description Horizontal timeline of past scene traces.
 *
 * Shows a scrollable row of past compilation results as
 * colored pills. Click a pill to view its trace summary.
 *
 * Color coding:
 * - Green: all zones passed
 * - Amber: at least one zone was corrected
 * - Red: at least one zone failed
 * - Purple: cloud/forge mode used
 *
 * @see implementation_plan.md §4.13 — Trace Timeline
 */
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { PlaygroundMode } from '@/enterstellar/agent-connection';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single trace entry in the timeline.
 */
export interface TraceEntry {
  /** Unique trace ID. */
  readonly id: string;
  /** Scene name that was compiled. */
  readonly sceneName: string;
  /** Mode used for compilation. */
  readonly mode: PlaygroundMode;
  /** Number of zones compiled. */
  readonly zoneCount: number;
  /** Overall status of the trace. */
  readonly status: 'pass' | 'fail' | 'corrected';
  /** Timestamp (ISO 8601). */
  readonly timestamp: string;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
}

/**
 * Props for the {@link TraceTimeline} component.
 */
interface TraceTimelineProps {
  /** Array of past trace entries (most recent last). */
  readonly traces: readonly TraceEntry[];
  /** Currently selected trace ID (null if none). */
  readonly selectedId: string | null;
  /** Callback when a trace is clicked. */
  readonly onSelect: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Status → Color Mapping
// ---------------------------------------------------------------------------

/**
 * Maps trace status to dot/pill color.
 *
 * @internal
 */
const statusColor: Record<string, { bg: string; ring: string; text: string }> = {
  pass: { bg: 'bg-success', ring: 'ring-success/40', text: 'text-success' },
  fail: { bg: 'bg-error', ring: 'ring-error/40', text: 'text-error' },
  corrected: { bg: 'bg-warning', ring: 'ring-warning/40', text: 'text-warning' },
};

/**
 * Maps mode to a pill accent for cloud override.
 *
 * @internal
 */
const modeOverride: Record<PlaygroundMode, string | null> = {
  healthy: null,
  hallucinating: null,
  cloud: 'bg-cloud',
};

// ---------------------------------------------------------------------------
// TraceTimeline Component
// ---------------------------------------------------------------------------

/**
 * Horizontal, scrollable timeline of past scene traces.
 *
 * Each trace renders as a small colored pill. The currently
 * selected trace has a ring highlight and expands a tooltip
 * with trace details.
 */
export function TraceTimeline({
  traces,
  selectedId,
  onSelect,
}: TraceTimelineProps): React.JSX.Element {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (traces.length === 0) {
    return (
      <div className="flex items-center justify-center py-3 text-[10px] text-playground-muted">
        No traces yet — run a demo to start
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Horizontal scrollable track */}
      <div className="flex items-center gap-2 overflow-x-auto py-2 px-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-playground-border/30">
        {/* Timeline line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-playground-border/20 -translate-y-1/2 pointer-events-none" />

        {traces.map((trace, i) => {
          const isSelected = trace.id === selectedId;
          const isHovered = trace.id === hoveredId;
          const colors = statusColor[trace.status] ?? statusColor['pass'] ?? { bg: 'bg-success', ring: 'ring-success/40', text: 'text-success' };
          const cloudColor = modeOverride[trace.mode];

          return (
            <div
              key={trace.id}
              className="relative shrink-0"
              onMouseEnter={() => { setHoveredId(trace.id); }}
              onMouseLeave={() => { setHoveredId(null); }}
            >
              {/* Trace dot */}
              <motion.button
                type="button"
                onClick={() => { onSelect(trace.id); }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
                className={cn(
                  'relative z-10 size-4 rounded-full cursor-pointer transition-all duration-200',
                  cloudColor ?? colors.bg,
                  isSelected && `ring-2 ${colors.ring} scale-125`,
                  !isSelected && 'hover:scale-110',
                )}
                title={`${trace.sceneName} — ${trace.status}`}
              />

              {/* Hover tooltip */}
              <AnimatePresence>
                {(isHovered || isSelected) && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-lg bg-playground-surface border border-playground-border/50 shadow-lg whitespace-nowrap z-20"
                  >
                    <p className={cn('text-[10px] font-semibold', colors.text)}>
                      {trace.sceneName}
                    </p>
                    <p className="text-[9px] text-playground-muted mt-0.5">
                      {String(trace.zoneCount)} zone{trace.zoneCount !== 1 ? 's' : ''} · {String(trace.durationMs)}ms · {trace.mode}
                    </p>
                    {/* Tooltip arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 size-0 border-x-4 border-x-transparent border-t-4 border-t-playground-border/50" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
