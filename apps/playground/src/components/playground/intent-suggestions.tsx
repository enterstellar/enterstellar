/**
 * @module playground/components/playground/intent-suggestions
 * @description Scene-aware suggestion chips for the playground.
 *
 * Renders two rows of clickable chips:
 * - 💡 Domain scenes (multi-zone dashboards)
 * - ⚡ Quick demos (single-component inspection)
 *
 * Click selects the scene → triggers auto-send of the first
 * suggested intent. Active scene is highlighted with accent color.
 *
 * This is a reusable extraction of the chip rendering logic
 * from `PromptBar` — can be used in empty states, landing
 * prompts, or sidebar navigation.
 *
 * @see implementation_plan.md §4.17 — Intent Suggestions
 * @see PromptBar — primary consumer
 */
'use client';

import { motion } from 'framer-motion';

import type { PlaygroundScene } from '@/enterstellar/scenes/types';
import { allQuickScenes, allDomainScenes } from '@/enterstellar/scenes';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link IntentSuggestions} component.
 */
interface IntentSuggestionsProps {
  /** Currently active scene (for highlight). */
  readonly activeSceneId: string;
  /** Callback when a scene chip is clicked. */
  readonly onSelectScene: (scene: PlaygroundScene) => void;
  /** Whether to show the compact layout (single row). */
  readonly compact?: boolean;
  /** Optional CSS class name. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Chip Variants
// ---------------------------------------------------------------------------

/**
 * Staggered chip animation.
 *
 * @internal
 */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
};

const chipVariants = {
  hidden: { opacity: 0, y: 4, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

// ---------------------------------------------------------------------------
// IntentSuggestions Component
// ---------------------------------------------------------------------------

/**
 * Two-row scene suggestion chips.
 *
 * Row 1: 💡 Domain scenes (Finance, Medical, Commerce, SaaS, EdTech)
 * Row 2: ⚡ Quick demos (MetricCard, DataTable, etc.)
 *
 * Active scene chip is highlighted with its category accent color.
 */
export function IntentSuggestions({
  activeSceneId,
  onSelectScene,
  compact = false,
  className,
}: IntentSuggestionsProps): React.JSX.Element {
  return (
    <motion.div
      className={cn('flex flex-wrap gap-1.5', className)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Domain scenes */}
      {allDomainScenes.map((scene) => {
        const isActive = scene.id === activeSceneId;

        return (
          <motion.button
            key={scene.id}
            type="button"
            variants={chipVariants}
            onClick={() => { onSelectScene(scene); }}
            title={scene.description}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors duration-200',
              compact ? 'px-2 py-0.5' : 'px-2.5 py-1',
              isActive
                ? 'bg-cloud/20 text-cloud border border-cloud/30'
                : 'bg-playground-panel/60 text-playground-muted border border-playground-border/40 hover:bg-playground-panel hover:text-neutral-200 hover:border-playground-border',
            )}
          >
            <span>💡</span>
            <span>{scene.name}</span>
          </motion.button>
        );
      })}

      {/* Separator */}
      {!compact && (
        <span className="self-center text-playground-border/50 mx-0.5 text-xs">│</span>
      )}

      {/* Quick scenes */}
      {allQuickScenes.map((scene) => {
        const isActive = scene.id === activeSceneId;

        return (
          <motion.button
            key={scene.id}
            type="button"
            variants={chipVariants}
            onClick={() => { onSelectScene(scene); }}
            title={scene.description}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full text-[11px] font-medium cursor-pointer transition-colors duration-200',
              compact ? 'px-2 py-0.5' : 'px-2.5 py-1',
              isActive
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'bg-playground-panel/60 text-playground-muted border border-playground-border/40 hover:bg-playground-panel hover:text-neutral-200 hover:border-playground-border',
            )}
          >
            <span>⚡</span>
            <span>{scene.name}</span>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
