/**
 * @module playground/components/playground/mode-selector
 * @description Three-mode toggle for the Enterstellar Playground.
 *
 * Modes determine the LLM prompting strategy and pipeline visualization:
 * - **Healthy** (green) — correct prompt, full manifest. Demonstrates
 *   clean compilation with 100% pass rate.
 * - **Hallucinating** (amber) — dual concurrent. Sabotaged prompt
 *   produces errors the compiler catches. Side-by-side comparison.
 * - **Cloud** (purple) — correct prompt + Forge addendum. Components
 *   not in registry are handled by CloudForge (runtime generation).
 *
 * The active mode shows a filled background with its accent color.
 * Framer Motion `layoutId` creates a shared animated indicator that
 * smoothly slides between mode buttons.
 *
 * **Context Popover:** On mode change, an animated tooltip appears above
 * the selector with an actionable description of the selected mode.
 * Auto-dismisses after 4 seconds or on user click.
 *
 * @see implementation_plan.md §4.5 — Mode Selector
 */
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { PlaygroundMode } from '@/enterstellar/agent-connection';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link ModeSelector} component.
 */
interface ModeSelectorProps {
  /** Currently active mode. */
  readonly mode: PlaygroundMode;
  /** Callback when the user selects a different mode. */
  readonly onModeChange: (mode: PlaygroundMode) => void;
}

// ---------------------------------------------------------------------------
// Mode Configuration
// ---------------------------------------------------------------------------

/**
 * Visual configuration for each mode.
 *
 * @internal
 */
interface ModeConfig {
  /** Display label. */
  readonly label: string;
  /** Emoji icon. */
  readonly icon: string;
  /** Active background class (filled). */
  readonly activeBg: string;
  /** Active text color class. */
  readonly activeText: string;
  /** Hover class for inactive state. */
  readonly hoverBg: string;
  /** Short tooltip description (native title). */
  readonly tooltip: string;
  /**
   * Popover description — displayed in the animated context popover
   * when this mode is activated. Should be actionable (tells the user
   * what to do next).
   */
  readonly popoverText: string;
  /** Popover border/accent color class. */
  readonly popoverBorder: string;
  /** Popover text color class. */
  readonly popoverTextColor: string;
}

/**
 * Mode configurations — one per playground mode.
 *
 * @internal
 */
const MODES: Record<PlaygroundMode, ModeConfig> = {
  healthy: {
    label: 'Healthy',
    icon: '✅',
    activeBg: 'bg-success/20',
    activeText: 'text-success',
    hoverBg: 'hover:bg-success/10',
    tooltip: 'Full manifest, clean compilation',
    popoverText: 'Standard deterministic pipeline. Send a prompt to see clean compilation with full schema validation.',
    popoverBorder: 'border-success/40',
    popoverTextColor: 'text-success/90',
  },
  hallucinating: {
    label: 'Hallucinating',
    icon: '🔴',
    activeBg: 'bg-warning/20',
    activeText: 'text-warning',
    hoverBg: 'hover:bg-warning/10',
    tooltip: 'Dual concurrent — compare correct vs. sabotaged',
    popoverText: 'Adversarial mode — the compiler will intercept hallucinated schemas in real-time. Send a prompt to see the side-by-side comparison.',
    popoverBorder: 'border-warning/40',
    popoverTextColor: 'text-warning/90',
  },
  cloud: {
    label: 'Cloud',
    icon: '☁️',
    activeBg: 'bg-cloud/20',
    activeText: 'text-cloud',
    hoverBg: 'hover:bg-cloud/10',
    tooltip: 'CloudForge — runtime component generation',
    popoverText: 'Missing components will trigger the CloudForge fallback simulation. Send a prompt to see runtime generation.',
    popoverBorder: 'border-cloud/40',
    popoverTextColor: 'text-cloud/90',
  },
};

/**
 * Ordered mode keys for consistent button layout.
 *
 * @internal
 */
const MODE_ORDER: readonly PlaygroundMode[] = [
  'healthy',
  'hallucinating',
  'cloud',
];

// ---------------------------------------------------------------------------
// ModeSelector Component
// ---------------------------------------------------------------------------

/**
 * Three-mode toggle for the playground.
 *
 * Renders a pill-shaped segmented control with three buttons.
 * The active mode has a filled background with its accent color.
 * Framer Motion `layoutId` animates the background indicator
 * sliding between modes.
 *
 * **Context Popover:** On hover over the selector, an animated
 * context popover appears above the control explaining the active
 * mode and prompting the user to send a prompt. The popover spans
 * the full width of the mode selector for visual alignment.
 *
 * @example
 * ```tsx
 * <ModeSelector
 *   mode={mode}
 *   onModeChange={handleModeChange}
 * />
 * ```
 */
export function ModeSelector({
  mode,
  onModeChange,
}: ModeSelectorProps): React.JSX.Element {
  /** Which mode button is currently hovered (null = none). */
  const [hoveredMode, setHoveredMode] = useState<PlaygroundMode | null>(null);

  /** The config to display in the popover — hovered button takes priority. */
  const popoverConfig = hoveredMode !== null ? MODES[hoveredMode] : null;

  return (
    <div className="relative">
      {/* ── Context Popover (per-button hover, full-width) ── */}
      {popoverConfig !== null && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className={cn(
            'absolute bottom-full mb-2 left-0 w-full',
            'px-3 py-2 rounded-lg',
            'bg-playground-surface/95 backdrop-blur-md',
            'border',
            popoverConfig.popoverBorder,
            'shadow-lg shadow-black/20',
            'pointer-events-none',
          )}
        >
          <p className={cn(
            'text-[11px] leading-relaxed',
            popoverConfig.popoverTextColor,
          )}>
            <span className="font-semibold">{popoverConfig.icon} {popoverConfig.label}:</span>{' '}
            {popoverConfig.popoverText}
          </p>
          {/* Caret arrow pointing down — centered */}
          <div className={cn(
            'absolute top-full left-1/2 -translate-x-1/2 w-0 h-0',
            'border-l-[6px] border-l-transparent',
            'border-r-[6px] border-r-transparent',
            'border-t-[6px] border-t-playground-surface/95',
          )} />
        </motion.div>
      )}

      {/* ── Mode Buttons ── */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-playground-panel/60 border border-playground-border/50">
        {MODE_ORDER.map((modeKey) => {
          const config = MODES[modeKey];
          const isActive = modeKey === mode;

          return (
            <button
              key={modeKey}
              type="button"
              onClick={() => { onModeChange(modeKey); }}
              onMouseEnter={() => { setHoveredMode(modeKey); }}
              onMouseLeave={() => { setHoveredMode(null); }}
              className={cn(
                'relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                isActive ? config.activeText : 'text-playground-muted',
                !isActive && config.hoverBg,
              )}
            >
              {/* Animated background indicator */}
              {isActive && (
                <motion.div
                  layoutId="mode-selector-bg"
                  className={cn(
                    'absolute inset-0 rounded-md',
                    config.activeBg,
                  )}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}

              {/* Content (above the animated bg) */}
              <span className="relative z-10 text-[11px]">{config.icon}</span>
              <span className="relative z-10 hidden sm:inline">{config.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
