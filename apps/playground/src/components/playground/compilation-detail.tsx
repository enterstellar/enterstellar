/**
 * @module playground/components/playground/compilation-detail
 * @description Per-zone compilation detail viewer.
 *
 * Renders a card with:
 * - Component name + status badge (pass/fail/corrected)
 * - Confidence bar (visual percentage indicator)
 * - Formatted props JSON (collapsible)
 * - Synthetic provenance metadata (agent, compiler version, timestamp)
 *
 * **Future additions (Phase 5+):**
 * - Error list with `ENS-XXXX` codes and `fix` suggestions
 * - Diff view: raw LLM props vs compiled props (C13)
 * - Self-correction attempt count
 *
 * @see implementation_plan.md §4.11 — Compilation Detail
 * @see CompilationResult from @enterstellar-ai/types — full type (used in future)
 */
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link CompilationDetail} component.
 */
interface CompilationDetailProps {
  /** Zone name. */
  readonly zoneName: string;
  /** Resolved component name (PascalCase). */
  readonly componentName: string;
  /** Component props from the LLM. */
  readonly props: Readonly<Record<string, unknown>>;
  /** LLM confidence score (0.0–1.0). */
  readonly confidence: number;
  /** Compilation status. */
  readonly status: 'pass' | 'fail' | 'corrected';
  /** Visual variant for color coding. */
  readonly variant: 'healthy' | 'hallucinated' | 'cloud';
}

// ---------------------------------------------------------------------------
// Status Configuration
// ---------------------------------------------------------------------------

/**
 * Status badge configuration.
 *
 * @internal
 */
const statusConfig: Record<string, { label: string; icon: string; color: string }> = {
  pass: { label: 'Compiled', icon: '✅', color: 'text-success bg-success/10 border-success/30' },
  fail: { label: 'Failed', icon: '🔴', color: 'text-error bg-error/10 border-error/30' },
  corrected: { label: 'Corrected', icon: '🔄', color: 'text-warning bg-warning/10 border-warning/30' },
};

/**
 * Variant-specific accent for the card border.
 *
 * @internal
 */
const variantBorder: Record<string, string> = {
  healthy: 'border-l-success/40',
  hallucinated: 'border-l-warning/40',
  cloud: 'border-l-cloud/40',
};

// ---------------------------------------------------------------------------
// CompilationDetail Component
// ---------------------------------------------------------------------------

/**
 * Single-zone compilation detail card.
 *
 * Shows component name, status badge, confidence bar, formatted props,
 * and synthetic provenance. Used inside `FullTracePanel`.
 */
export function CompilationDetail({
  zoneName,
  componentName,
  props,
  confidence,
  status,
  variant,
}: CompilationDetailProps): React.JSX.Element {
  const [showProps, setShowProps] = useState(false);

  const badge = statusConfig[status] ?? statusConfig['pass'] ?? { label: 'Compiled', icon: '✅', color: 'text-success bg-success/10 border-success/30' };
  const confidencePercent = Math.round(confidence * 100);
  const propsJson = JSON.stringify(props, null, 2);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-lg border border-playground-border/30 border-l-2 overflow-hidden',
        'bg-playground-panel/30',
        variantBorder[variant],
      )}
    >
      {/* Header row — component name + status badge */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-100">
            {componentName}
          </span>
          <span className="text-[9px] font-mono text-playground-muted">
            → {zoneName}
          </span>
        </div>

        {/* Status badge */}
        <span className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
          badge.color,
        )}>
          <span>{badge.icon}</span>
          <span>{badge.label}</span>
        </span>
      </div>

      {/* Confidence bar */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-playground-muted shrink-0">
            Confidence
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-playground-border/30 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${String(confidencePercent)}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={cn(
                'h-full rounded-full',
                confidencePercent >= 90
                  ? 'bg-success'
                  : confidencePercent >= 70
                    ? 'bg-warning'
                    : 'bg-error',
              )}
            />
          </div>
          <span className={cn(
            'text-[9px] font-mono shrink-0',
            confidencePercent >= 90
              ? 'text-success'
              : confidencePercent >= 70
                ? 'text-warning'
                : 'text-error',
          )}>
            {String(confidencePercent)}%
          </span>
        </div>
      </div>

      {/* Props toggle + formatted JSON */}
      <div className="border-t border-playground-border/20">
        <button
          type="button"
          onClick={() => { setShowProps((v) => !v); }}
          className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-medium text-playground-muted hover:text-neutral-200 transition-colors cursor-pointer"
        >
          <span>Props ({Object.keys(props).length} fields)</span>
          <span>{showProps ? '▲' : '▼'}</span>
        </button>

        {showProps && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            className="overflow-hidden"
          >
            <pre className="px-3 pb-3 text-[10px] font-mono text-playground-muted/80 leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {propsJson}
            </pre>
          </motion.div>
        )}
      </div>

      {/* Provenance (synthetic) */}
      <div className="border-t border-playground-border/20 px-3 py-1.5 flex items-center gap-3 text-[9px] text-playground-muted/60">
        <span>Agent: GPT OSS 120B</span>
        <span>·</span>
        <span>Compiler: v0.1.0</span>
        <span>·</span>
        <span>{new Date().toISOString().slice(0, 19)}</span>
      </div>
    </motion.div>
  );
}
