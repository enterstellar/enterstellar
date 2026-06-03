/**
 * @module playground/components/playground/error-flash
 * @description Animated error flash overlay for zone containers.
 *
 * Three-phase animation dramatizing the Enterstellar compiler catching errors:
 * 1. **Red flash** (0–0.6s) — error detected
 * 2. **Amber hold** (0.6–1.2s) — correction in progress
 * 3. **Green resolve** (1.2–2.0s) — self-correction complete
 *
 * Applied as an absolute overlay on a zone container.
 * `pointer-events: none` ensures the overlay never blocks interaction.
 *
 * @see implementation_plan.md §4.16 — Error Flash
 */
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link ErrorFlash} component.
 */
interface ErrorFlashProps {
  /** Whether to trigger the flash animation. */
  readonly isActive: boolean;
  /** Callback after the full animation completes (~2s). */
  readonly onComplete?: () => void;
  /** Optional CSS class name for the overlay container. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Animation Phases
// ---------------------------------------------------------------------------

/**
 * The three phases of the error flash animation.
 *
 * @internal
 */
type FlashPhase = 'red' | 'amber' | 'green' | 'done';

/**
 * Phase → visual configuration.
 *
 * @internal
 */
const phaseConfig: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  red: {
    bg: 'bg-error/15',
    border: 'border-error/40',
    icon: '🔴',
    label: 'Error Detected',
  },
  amber: {
    bg: 'bg-warning/15',
    border: 'border-warning/40',
    icon: '🔄',
    label: 'Self-Correcting…',
  },
  green: {
    bg: 'bg-success/15',
    border: 'border-success/40',
    icon: '✅',
    label: 'Corrected',
  },
};

/**
 * Phase durations in milliseconds.
 *
 * @internal
 */
const PHASE_DURATION = {
  red: 600,
  amber: 600,
  green: 800,
} as const;

// ---------------------------------------------------------------------------
// ErrorFlash Component
// ---------------------------------------------------------------------------

/**
 * Animated error flash overlay.
 *
 * Three-phase animation: red → amber → green. Auto-dismisses
 * after completion. Renders as an absolute overlay with
 * `pointer-events: none` to avoid blocking interaction.
 */
export function ErrorFlash({
  isActive,
  onComplete,
  className,
}: ErrorFlashProps): React.JSX.Element | null {
  const [phase, setPhase] = useState<FlashPhase>('done');

  // Phase sequence
  useEffect(() => {
    if (!isActive) {
      setPhase('done');
      return;
    }

    setPhase('red');

    const amberTimer = setTimeout(() => {
      setPhase('amber');
    }, PHASE_DURATION.red);

    const greenTimer = setTimeout(() => {
      setPhase('green');
    }, PHASE_DURATION.red + PHASE_DURATION.amber);

    const doneTimer = setTimeout(() => {
      setPhase('done');
      onComplete?.();
    }, PHASE_DURATION.red + PHASE_DURATION.amber + PHASE_DURATION.green);

    return () => {
      clearTimeout(amberTimer);
      clearTimeout(greenTimer);
      clearTimeout(doneTimer);
    };
  }, [isActive, onComplete]);

  if (phase === 'done') return null;

  const config = phaseConfig[phase];
  if (config === undefined) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'absolute inset-0 z-20 pointer-events-none',
          'flex items-center justify-center',
          'rounded-xl border-2',
          config.bg,
          config.border,
          className,
        )}
      >
        {/* Phase indicator */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-playground-surface/90 border border-playground-border/50 shadow-lg"
        >
          <span className="text-sm">{config.icon}</span>
          <span className="text-[11px] font-semibold text-neutral-200">
            {config.label}
          </span>
        </motion.div>

        {/* Pulse ring */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0.5 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={cn(
            'absolute size-16 rounded-full border-2',
            config.border,
          )}
        />
      </motion.div>
    </AnimatePresence>
  );
}
