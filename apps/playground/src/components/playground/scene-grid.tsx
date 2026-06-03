/**
 * @module playground/components/playground/scene-grid
 * @description Scene grid — renders zones per scene layout with dual-grid
 * hallucination mode support.
 *
 * Takes a `PlaygroundScene` and renders its zones as a CSS Grid.
 * Each zone is an `<Zone>` from `@enterstellar-ai/react` wrapped in a
 * Framer Motion container with lifecycle-mapped visual variants.
 *
 * **Hallucination Mode (THE MOAT):**
 * When `mode === 'hallucinating'`, the grid splits into a dual-grid layout:
 * - **Left (65% width):** "✅ Enterstellar Protected" — standard zones, full fidelity
 * - **Right (35% width):** "⚠ Without Enterstellar" — hallucinated zones, dimmed,
 *   red-tinted border, `opacity-80`. Uses `GenericCard` fallbacks rendered
 *   through the real `@enterstellar-ai/compiler`.
 *
 * On narrow viewports (<768px), the dual grid stacks vertically.
 *
 * **Layout modes:**
 * - `'single'` — centered, max-width 480px (Quick demos)
 * - `'grid-2col'` — 2-column grid (Domain 4-zone dashboards)
 * - `'grid-3col'` — 3-column grid (dense dashboards)
 * - `'sidebar-left'` — main + sidebar
 * - `'dashboard'` — explicit row/col positioning
 *
 * **Scene theme scoping:** The CSS class `.enterstellar-scene-{theme}` is applied
 * to the grid container. This scopes all `--token-*` custom property
 * overrides to the demo zone only — the controls bar and prompt bar
 * (outside this container) always use Enterstellar Playground blue.
 *
 * **Staggered reveal:** Framer Motion `staggerChildren` with 250ms
 * delay per zone for a visual cascade effect.
 *
 * @see implementation_plan.md §4.3 — SceneGrid
 * @see implementation_plan.md §2.2 — Hallucination Mode (THE MOAT)
 * @see Zone from @enterstellar-ai/react — zone rendering component
 */
'use client';

import { useContext } from 'react';
import { motion } from 'framer-motion';
import { Zone, EnterstellarContext } from '@enterstellar-ai/react';

import type { PlaygroundScene, ZoneDefinition } from '@/enterstellar/scenes/types';
import { getHallucinatedZones } from '@/enterstellar/scenes/types';
import type { PlaygroundMode } from '@/enterstellar/agent-connection';
import type { PipelineState } from './playground-shell';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link SceneGrid} component.
 */
interface SceneGridProps {
  /** The active PlaygroundScene to render. */
  readonly scene: PlaygroundScene;
  /** Current pipeline state — drives zone visual variants. */
  readonly pipelineState: PipelineState;
  /**
   * Active playground mode. When `'hallucinating'`, the grid renders
   * a dual-grid layout (65/35% visual hierarchy).
   * Defaults to `'healthy'` when not provided.
   */
  readonly mode?: PlaygroundMode;
}

// ---------------------------------------------------------------------------
// Layout → CSS Grid class mapping
// ---------------------------------------------------------------------------

/**
 * Maps `SceneLayout` to Tailwind CSS Grid classes.
 *
 * @internal
 */
const layoutClasses: Record<string, string> = {
  'single': 'flex items-center justify-center',
  'grid-2col': 'grid grid-cols-1 md:grid-cols-2 gap-4',
  'grid-3col': 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
  'sidebar-left': 'grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4',
  'dashboard': 'grid grid-cols-1 md:grid-cols-2 gap-4',
};

// ---------------------------------------------------------------------------
// Framer Motion Variants
// ---------------------------------------------------------------------------

/**
 * Container animation — staggers children (zones) by 250ms.
 *
 * @internal
 */
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.25,
      delayChildren: 0.1,
    },
  },
};

/**
 * Individual zone animation — fade-in with upward slide.
 *
 * @internal
 */
const zoneVariants = {
  hidden: {
    opacity: 0,
    y: 16,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
};

// ---------------------------------------------------------------------------
// Zone Renderer (Shared)
// ---------------------------------------------------------------------------

/**
 * Maps `ZoneDefinition.sizeHint` to CSS Grid column span classes.
 *
 * - `compact` — narrow, single column (MetricCard, StatusBadge)
 * - `standard` — default single column
 * - `wide` — spans 2 columns (DataTable, ActivityFeed)
 * - `full` — spans full row (CommandPalette, PipelineBoard)
 *
 * @internal
 */
const sizeHintToGridClass: Record<string, string> = {
  compact: 'md:col-span-1',
  standard: 'md:col-span-1',
  wide: 'md:col-span-2',
  full: 'md:col-span-full',
};

/**
 * Renders a grid of Zone instances for a set of zone definitions.
 *
 * Extracted as a shared helper to avoid duplication between the standard
 * grid and the hallucinated grid. Both render the same structure — the
 * only difference is zone names and CSS styling.
 *
 * @param zones - Zone definitions to render.
 * @param scene - The parent scene (for theme class and layout).
 * @param pipelineState - Current pipeline state for visual feedback.
 * @param isEnterstellarReady - Whether Provider has initialized.
 * @param isSingle - Whether the scene uses single-zone layout.
 * @param gridClass - CSS grid class string for the layout.
 * @param extraContainerClass - Optional extra classes for the container.
 *
 * @internal
 */
function ZoneGrid({
  zones,
  scene,
  pipelineState,
  isEnterstellarReady,
  isSingle,
  gridClass,
  extraContainerClass,
}: {
  readonly zones: readonly ZoneDefinition[];
  readonly scene: PlaygroundScene;
  readonly pipelineState: PipelineState;
  readonly isEnterstellarReady: boolean;
  readonly isSingle: boolean;
  readonly gridClass: string;
  readonly extraContainerClass?: string;
}): React.JSX.Element {
  return (
    <motion.div
      className={cn(
        'h-full rounded-xl playground-grid-bg p-4',
        `enterstellar-scene-${scene.theme}`,
        gridClass,
        extraContainerClass,
      )}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {zones.map((zone) => {
        // Resolve sizeHint → grid class (defaults to 'standard' = col-span-1)
        const sizeClass = !isSingle
          ? sizeHintToGridClass[zone.sizeHint ?? 'standard'] ?? ''
          : '';

        // Legacy position.span takes precedence over sizeHint when both are set
        const spanClass = !isSingle && zone.position.span !== undefined && zone.position.span > 1
          ? `md:col-span-${String(zone.position.span)}`
          : sizeClass;

        return (
          <motion.div
            key={zone.name}
            variants={zoneVariants}
            className={cn(
              'rounded-xl border transition-colors duration-300',
              isSingle && 'w-full max-w-md',
              spanClass,
              // Pipeline state visual mapping
              pipelineState === 'idle' && 'border-dashed border-playground-border/50',
              pipelineState === 'loading' && 'border-playground-border playground-skeleton',
              pipelineState === 'compiled' && 'border-playground-border/30',
              pipelineState === 'error' && 'border-error/40',
            )}
          style={
            !isSingle
              ? {
                gridRow: zone.position.row,
                gridColumn: zone.position.span !== undefined
                  ? `${String(zone.position.col)} / span ${String(zone.position.span)}`
                  : zone.position.col,
              }
              : {}
          }
        >
          <div className="p-1 h-full min-h-[120px]">
            {isEnterstellarReady ? (
              <Zone name={zone.name} />
            ) : (
              <div className="h-full min-h-[120px] rounded-lg playground-skeleton" />
            )}
          </div>
        </motion.div>
        );
      })}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SceneGrid Component
// ---------------------------------------------------------------------------

/**
 * Renders the scene's zones as a CSS Grid with Zone instances.
 *
 * **Standard mode (healthy/cloud):**
 * Single grid with all zones rendered at full fidelity.
 *
 * **Hallucination mode:**
 * Dual-grid layout with 65/35% visual hierarchy:
 * - Left: "✅ Enterstellar Protected" — standard zones, full fidelity
 * - Right: "⚠ Without Enterstellar" — hallucinated zones with dimmed, red-tinted styling.
 *   These zones receive hallucinated intents through the real compiler,
 *   producing GenericCard fallbacks with ENS-* error codes.
 *
 * On narrow viewports (<768px), stacks vertically (hero on top, cautionary below).
 *
 * Each zone receives:
 * - `name` — matching `ZoneDefinition.name` for intent targeting
 * - Visual container with lifecycle-mapped styling
 * - Framer Motion staggered reveal animation
 * - Scene theme scoping via `.enterstellar-scene-{theme}` class
 *
 * The grid background uses the `playground-grid-bg` utility class
 * (dot pattern) for a premium "design tool" aesthetic.
 */
export function SceneGrid({
  scene,
  pipelineState,
  mode = 'healthy',
}: SceneGridProps): React.JSX.Element {
  const gridClass = layoutClasses[scene.layout] ?? 'grid grid-cols-1 md:grid-cols-2 gap-4';
  const isSingle = scene.layout === 'single';
  const isHallucinating = mode === 'hallucinating';

  /**
   * Provider readiness check.
   *
   * Provider renders children WITHOUT EnterstellarContext.Provider while
   * its internal store and telemetry initialize (async). Any Zone
   * mounted during this window throws ENS-3001.
   *
   * Solution: check EnterstellarContext directly via useContext. If null,
   * render zone containers with skeleton placeholders instead of
   * Zone components. Once Provider completes initialization,
   * the context becomes non-null and Zone mounts safely.
   */
  const enterstellarContext = useContext(EnterstellarContext);
  const isEnterstellarReady = enterstellarContext !== null;

  // ── Standard Mode (healthy/cloud) ─────────────────────────────────────

  if (!isHallucinating) {
    return (
      <ZoneGrid
        zones={scene.zones}
        scene={scene}
        pipelineState={pipelineState}
        isEnterstellarReady={isEnterstellarReady}
        isSingle={isSingle}
        gridClass={gridClass}
      />
    );
  }

  // ── Hallucination Mode — Dual-Grid (THE MOAT) ─────────────────────────
  //
  // Layout: 65% Enterstellar Protected (hero) | 35% Without Enterstellar (cautionary)
  // Stacks vertically on narrow viewports.
  //

  const hallucinatedZones = getHallucinatedZones(scene);

  return (
    <div
      className={cn(
        'h-full flex flex-col md:flex-row gap-4',
      )}
    >
      {/* ── Hero: "✅ Enterstellar Protected" (65% width) ── */}
      <div className="md:w-[65%] flex flex-col min-w-0">
        {/* Header badge */}
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-success text-sm">✅</span>
          <span className="text-[11px] font-semibold text-success tracking-wide uppercase">
            Enterstellar Protected
          </span>
          <span className="text-[10px] text-playground-muted">
            — Compiler-validated, type-safe output
          </span>
        </div>

        {/* Standard zones — full fidelity */}
        <div className="flex-1 min-h-0">
          <ZoneGrid
            zones={scene.zones}
            scene={scene}
            pipelineState={pipelineState}
            isEnterstellarReady={isEnterstellarReady}
            isSingle={isSingle}
            gridClass={gridClass}
            extraContainerClass="border-2 border-success/20 shadow-[0_0_20px_rgba(34,197,94,0.05)]"
          />
        </div>
      </div>

      {/* ── Cautionary Tale: "⚠ Without Enterstellar" (35% width) ── */}
      <div className="md:w-[35%] flex flex-col min-w-0 opacity-80">
        {/* Header badge */}
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-error text-sm">⚠</span>
          <span className="text-[11px] font-semibold text-error/80 tracking-wide uppercase">
            Without Enterstellar
          </span>
          <span className="text-[10px] text-playground-muted">
            — Raw LLM output, no validation
          </span>
        </div>

        {/* Hallucinated zones — dimmed, red-tinted */}
        <div className="flex-1 min-h-0">
          <ZoneGrid
            zones={hallucinatedZones}
            scene={scene}
            pipelineState={pipelineState}
            isEnterstellarReady={isEnterstellarReady}
            isSingle={isSingle}
            gridClass={isSingle ? 'flex items-center justify-center' : 'grid grid-cols-1 gap-3'}
            extraContainerClass={cn(
              'border-2 border-error/30',
              'bg-error/[0.02]',
              'shadow-[0_0_20px_rgba(239,68,68,0.05)]',
            )}
          />
        </div>
      </div>
    </div>
  );
}
