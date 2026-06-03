/**
 * @module playground/components/playground/pipeline-step-card
 * @description Left-pane clickable step card for the educational console.
 *
 * Renders a single pipeline step with:
 * - Step icon (emoji matching `controls-bar.tsx` and `step-education-data.ts`)
 * - Step title (e.g., "Resolve", "Parse")
 * - Status indicator — green (pass), amber (warning/corrected), red (error), muted (idle/pending)
 * - Active highlight — left border accent when this step is selected in the detail pane
 * - Pulse animation — during auto-advance, the currently advancing step pulses
 *
 * **Interaction model:**
 * - During auto-advance (compilation in progress): steps highlight sequentially
 *   with 600ms dwell time. The user can still click to jump to a specific step.
 * - After render completes: auto-advance stops. The user freely clicks any step.
 *   The active step remains highlighted until the user clicks another.
 *
 * **Accessibility:**
 * - Each card is a `<button>` element with `aria-label` and `aria-current`.
 * - Keyboard-navigable via Tab key.
 * - Focus ring visible on `:focus-visible`.
 *
 * @see implementation_plan.md §2.1 — "5 clickable pipeline step cards"
 * @see step-education-data.ts — data source for icons and titles
 */
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Status of a single pipeline step.
 *
 * - `'idle'` — no compilation has occurred; step is muted/inactive.
 * - `'pending'` — compilation is in progress but hasn't reached this step yet.
 * - `'active'` — this step is currently being processed (during auto-advance).
 * - `'success'` — step completed successfully.
 * - `'warning'` — step completed with corrections (e.g., token coercion, a11y injection).
 * - `'error'` — step failed (e.g., component not found, schema validation failed).
 */
export type StepStatus = 'idle' | 'pending' | 'active' | 'success' | 'warning' | 'error';

/**
 * Props for the {@link PipelineStepCard} component.
 */
interface PipelineStepCardProps {
  /** Step icon — emoji from the PIPELINE_STEP_EDUCATION dictionary. */
  readonly icon: string;
  /** Step title — e.g., "Resolve", "Parse". */
  readonly title: string;
  /** Step index (0–4) within the pipeline. Used for stagger animation delay. */
  readonly index: number;
  /** Current status of this step. Drives the status indicator color and icon. */
  readonly status: StepStatus;
  /** Whether this step is the currently selected/active step in the detail pane. */
  readonly isSelected: boolean;
  /** Whether the pipeline is currently auto-advancing (compilation in progress). */
  readonly isAutoAdvancing: boolean;
  /** Callback when the user clicks this step card. */
  readonly onClick: () => void;
}

// ---------------------------------------------------------------------------
// Status Indicator Mapping
// ---------------------------------------------------------------------------

/**
 * Maps step status to visual indicator properties.
 *
 * @internal
 */
const STATUS_INDICATORS: Record<StepStatus, {
  readonly symbol: string;
  readonly colorClass: string;
  readonly bgClass: string;
}> = {
  idle: {
    symbol: '○',
    colorClass: 'text-playground-muted',
    bgClass: 'bg-playground-panel/40',
  },
  pending: {
    symbol: '○',
    colorClass: 'text-playground-muted/60',
    bgClass: 'bg-playground-panel/30',
  },
  active: {
    symbol: '◉',
    colorClass: 'text-primary-400',
    bgClass: 'bg-primary-500/10',
  },
  success: {
    symbol: '✓',
    colorClass: 'text-success',
    bgClass: 'bg-success/10',
  },
  warning: {
    symbol: '!',
    colorClass: 'text-warning',
    bgClass: 'bg-warning/10',
  },
  error: {
    symbol: '✗',
    colorClass: 'text-error',
    bgClass: 'bg-error/10',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single clickable pipeline step card in the educational console's left pane.
 *
 * **Visual states:**
 * - **Selected:** Left border accent (primary-500), brighter text.
 * - **Active + auto-advancing:** Subtle pulse animation on the status indicator.
 * - **Success/Warning/Error:** Status indicator changes color and symbol.
 * - **Idle/Pending:** Muted appearance.
 *
 * @example
 * ```tsx
 * <PipelineStepCard
 *   icon="🔍"
 *   title="Resolve"
 *   index={0}
 *   status="success"
 *   isSelected={true}
 *   isAutoAdvancing={false}
 *   onClick={() => setActiveStep(0)}
 * />
 * ```
 */
export function PipelineStepCard({
  icon,
  title,
  index,
  status,
  isSelected,
  isAutoAdvancing,
  onClick,
}: PipelineStepCardProps): React.JSX.Element {
  const indicator = STATUS_INDICATORS[status];
  const showPulse = isAutoAdvancing && status === 'active';

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.25,
        delay: index * 0.05,
        ease: 'easeOut',
      }}
      aria-label={`Pipeline step: ${title} — ${status}`}
      aria-current={isSelected ? 'step' : undefined}
      className={cn(
        // Base layout
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
        'text-left cursor-pointer transition-all duration-200',
        // Focus ring for keyboard navigation
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
        // Selected state — left border accent
        isSelected
          ? 'border-l-2 border-l-primary-500 bg-primary-500/5'
          : 'border-l-2 border-l-transparent',
        // Hover state
        !isSelected && 'hover:bg-playground-panel/40',
      )}
    >
      {/* Step Icon */}
      <span className="text-base shrink-0" aria-hidden="true">
        {icon}
      </span>

      {/* Step Title */}
      <span
        className={cn(
          'text-xs font-medium flex-1 truncate',
          isSelected ? 'text-neutral-100' : 'text-playground-muted',
        )}
      >
        {title}
      </span>

      {/* Status Indicator */}
      <span
        className={cn(
          'text-[10px] font-bold size-5 flex items-center justify-center rounded-full shrink-0',
          indicator.bgClass,
          indicator.colorClass,
        )}
      >
        {showPulse ? (
          <motion.span
            animate={{ scale: [1, 1.3, 1] }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            {indicator.symbol}
          </motion.span>
        ) : (
          indicator.symbol
        )}
      </span>
    </motion.button>
  );
}
