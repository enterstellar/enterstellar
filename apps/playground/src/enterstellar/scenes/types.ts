/**
 * @module playground/enterstellar/scenes/types
 * @description Type definitions for the Enterstellar Playground Scenes architecture.
 *
 * The `PlaygroundScene` is the **universal abstraction** for all playground
 * content. A single-component inspection is a Scene with 1 zone. A multi-zone
 * dashboard is a Scene with 4–6 zones. One route (`/playground`), zero UX fork,
 * zero code duplication.
 *
 * **Key design principle:** Quick demos and Domain dashboards share the same
 * type, the same rendering pipeline, and the same prompt flow. The only
 * difference is `zones.length` and `category`.
 *
 * @see implementation_plan.md §2.5.2 — Scenes Architecture
 * @see implementation_plan.md §2.5.3 — Quick Demo Scenes
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

// ---------------------------------------------------------------------------
// Zone Definition
// ---------------------------------------------------------------------------

/**
 * A single zone within a PlaygroundScene.
 *
 * Each zone maps to one `<Zone>` in the rendered grid. The zone
 * receives one `ComponentIntent` from the LLM and compiles/renders
 * independently. Crash isolation (RE16) is zone-scoped: if one zone
 * errors, the others continue rendering.
 *
 * @see @enterstellar-ai/react Zone — the React component that renders a zone
 * @see implementation_plan.md §2.5.2 — ZoneDefinition interface
 */
export type ZoneDefinition = {
  /** Unique zone name within the scene (kebab-case). Maps to `<Zone name={...}>`. */
  readonly name: string;

  /**
   * Grid position within the scene layout.
   *
   * - `row` / `col` — 1-indexed grid coordinates.
   * - `span` — number of columns this zone spans (default: 1).
   *
   * Used by `SceneGrid` to position zones via CSS Grid.
   */
  readonly position: {
    readonly row: number;
    readonly col: number;
    readonly span?: number;
  };

  /**
   * Optional hint for the LLM: which component to place in this zone.
   *
   * When provided, the system prompt tells the LLM to use this component
   * for the zone (e.g., `'MetricCard'`). When omitted (Freestyle mode),
   * the LLM selects freely.
   */
  readonly expectedComponent?: string;

  /**
   * Natural-language hint describing what this zone should display.
   *
   * Included in the system prompt so the LLM generates contextually
   * appropriate data for each zone (e.g., "Show heart rate vitals"
   * for a MetricCard zone in a medical dashboard).
   */
  readonly intentHint: string;

  /**
   * Size hint for CSS Grid positioning in `SceneGrid`.
   *
   * Maps to grid-column span and minmax() values:
   * - `'compact'` — narrow, single column (MetricCard, StatusBadge, AlertBanner)
   * - `'standard'` — default single column (UserProfile, ProgressTracker)
   * - `'wide'` — spans 2 columns (DataTable, ActivityFeed, TransactionLedger)
   * - `'full'` — spans full row (CommandPalette, PipelineBoard)
   *
   * When absent, defaults to `'standard'` in the grid renderer.
   *
   * Per `exactOptionalPropertyTypes`, this field is either absent or
   * a valid size hint string — never `undefined`.
   *
   * @see implementation_plan.md §3.2.3 — Dynamic Zone Sizing
   */
  readonly sizeHint?: 'compact' | 'standard' | 'wide' | 'full';

  /**
   * Whether this zone is optional.
   *
   * Optional zones are rendered only when the LLM provides an intent
   * for them. Unfilled optional zones are simply not rendered
   * (`display: none`), enabling 2–8 panels from the same scene
   * definition based on the user's prompt.
   *
   * When absent, the zone is required (always rendered).
   *
   * Per `exactOptionalPropertyTypes`, this field is either absent or
   * `true` — never `false` or `undefined`.
   *
   * @see implementation_plan.md §2.3 — Dynamic zone count via optional zones
   */
  readonly optional?: boolean;
};

// ---------------------------------------------------------------------------
// Scene Layout
// ---------------------------------------------------------------------------

/**
 * Layout mode for rendering zones within the demo viewport.
 *
 * - `single` — Centered, full-width. Used for Quick demos (1 zone).
 * - `grid-2col` — Two-column grid. Compact multi-zone layouts.
 * - `grid-3col` — Three-column grid. Dense dashboards.
 * - `sidebar-left` — Large main zone with smaller sidebar zones.
 * - `dashboard` — Flexible CSS Grid with explicit row/col positioning.
 */
export type SceneLayout =
  | 'single'
  | 'grid-2col'
  | 'grid-3col'
  | 'sidebar-left'
  | 'dashboard';

// ---------------------------------------------------------------------------
// Scene Category
// ---------------------------------------------------------------------------

/**
 * Scene category determines visual treatment and chip styling.
 *
 * - `quick` — Single-zone atomic component inspection. Default Enterstellar theme.
 *   Displayed with ⚡ prefix in suggestion chips.
 * - `domain` — Multi-zone dashboard with a fictional brand theme.
 *   Displayed with 💡 prefix in suggestion chips.
 */
export type SceneCategory = 'quick' | 'domain';

// ---------------------------------------------------------------------------
// Playground Scene
// ---------------------------------------------------------------------------

/**
 * Universal scene definition — handles atomic demos AND multi-zone dashboards.
 *
 * The `PlaygroundScene` is the core data structure driving the entire
 * playground UI. It tells the system:
 * - **What to render** — zone names, expected components, grid positions.
 * - **How to prompt the LLM** — suggested intents, intent hints per zone.
 * - **How to style the output** — theme key maps to CSS class scoping.
 * - **How to lay out the viewport** — layout mode for CSS Grid configuration.
 *
 * Quick scenes have 1 zone. Domain scenes have 4–6 zones. The same type,
 * the same pipeline, the same UI components handle both.
 *
 * @example
 * ```ts
 * const quickMetricCard: PlaygroundScene = {
 *   id: 'quick-metric-card',
 *   name: 'MetricCard',
 *   description: 'Explore the MetricCard component with live data',
 *   category: 'quick',
 *   theme: 'enterstellar',
 *   zones: [{
 *     name: 'main',
 *     position: { row: 1, col: 1 },
 *     expectedComponent: 'MetricCard',
 *     intentHint: 'Show a server CPU usage metric',
 *   }],
 *   suggestedIntents: ['Show me server CPU usage'],
 *   layout: 'single',
 * };
 * ```
 *
 * @see implementation_plan.md §2.5.2 — PlaygroundScene interface
 */
export type PlaygroundScene = {
  /**
   * Unique scene identifier (kebab-case).
   *
   * Quick demos: `'quick-metric-card'`, `'quick-data-table'`, etc.
   * Domain scenes: `'scene-finance'`, `'scene-medical'`, etc.
   */
  readonly id: string;

  /** Human-readable scene name. Displayed in the prompt bar chip label. */
  readonly name: string;

  /** Short description. Shown in chip tooltips and scene selection UI. */
  readonly description: string;

  /**
   * Scene category.
   *
   * `'quick'` = 1-zone atomic inspection (default Enterstellar theme).
   * `'domain'` = 4–6 zone multi-zone dashboard (custom brand theme).
   */
  readonly category: SceneCategory;

  /**
   * Design token set key.
   *
   * Maps to a CSS class `.enterstellar-scene-{theme}` that scopes design
   * token custom property overrides to the demo zone container.
   * The controls bar and prompt bar always use Enterstellar Playground blue.
   *
   * Built-in themes: `'enterstellar'` (default), `'finance'`, `'medical'`,
   * `'commerce'`, `'saas'`, `'education'`.
   *
   * @see implementation_plan.md §3.7 — Scene Token System
   */
  readonly theme: string;

  /**
   * Zone definitions — the individual `<Zone>`s within this scene.
   *
   * Quick scenes: exactly 1 zone.
   * Domain scenes: 4–6 zones with distinct positions in the grid.
   */
  readonly zones: readonly ZoneDefinition[];

  /**
   * Hallucination mode zones.
   *
   * When `mode === 'hallucinating'`, these zones render alongside the
   * standard `zones` in a dual-grid layout (65/35 visual hierarchy).
   * The hallucinated intents from the LLM are dispatched **HERE** —
   * through the **real `@enterstellar-ai/compiler`**. This proves Enterstellar's value:
   * the compiler catches invented component names, wrong prop types,
   * and missing accessibility attributes, producing `GenericCard`
   * fallbacks with real `ENS-*` error codes.
   *
   * **Auto-generation:** When this field is absent, `SceneGrid`
   * auto-generates hallucinated zones by mirroring the standard
   * `zones` with a `hallucinated-` name prefix. Explicit definition
   * is only needed when hallucinated zones require different grid
   * positions or intent hints.
   *
   * Per `exactOptionalPropertyTypes`, this field is either absent or
   * a valid `readonly ZoneDefinition[]` — never `undefined`.
   *
   * @see implementation_plan.md §2.2 — Hallucination Mode (THE MOAT)
   * @see implementation_plan.md §3.2.2 — Hallucination Dual-Grid
   */
  readonly hallucinatedZones?: readonly ZoneDefinition[];

  /**
   * Pre-written intent suggestions for the LLM.
   *
   * The first element is used as the default auto-send when the user
   * clicks a scene chip. All elements are shown in the typewriter
   * placeholder rotation.
   */
  readonly suggestedIntents: readonly string[];

  /** Layout mode for CSS Grid configuration. */
  readonly layout: SceneLayout;
};

// ---------------------------------------------------------------------------
// Zone Intent (LLM output per zone)
// ---------------------------------------------------------------------------

/**
 * A single zone's intent output from the LLM.
 *
 * The API route returns `ZoneIntent[]` — one per zone in the scene.
 * Each entry is then parsed into a `ComponentIntent` from `@enterstellar-ai/types`
 * and dispatched to the corresponding `<Zone>`.
 *
 * This type represents the **raw LLM output format** before it becomes
 * a proper `ComponentIntent`. The `LiveAgentConnection` handles the
 * conversion.
 *
 * @see ComponentIntent from @enterstellar-ai/types — the canonical intent type
 */
export type ZoneIntent = {
  /** Zone name — must match a `ZoneDefinition.name` in the active scene. */
  readonly zone: string;
  /** PascalCase component name from the registry (or `__forge__` for Forge). */
  readonly component: string;
  /** Component props — validated by the compiler against the contract schema. */
  readonly props: Readonly<Record<string, unknown>>;
  /** LLM confidence score (0.0–1.0). */
  readonly confidence: number;
};

// ---------------------------------------------------------------------------
// Hallucination Zone Utilities
// ---------------------------------------------------------------------------

/**
 * Returns the hallucinated zones for a scene.
 *
 * If the scene explicitly defines `hallucinatedZones`, returns them as-is.
 * Otherwise, auto-generates hallucinated zones by mirroring the scene's
 * standard `zones` with a `hallucinated-` name prefix and the same
 * grid positions.
 *
 * This utility is consumed by `SceneGrid` (for rendering the dual-grid
 * layout) and `agent-connection.ts` (for dispatching hallucinated intents
 * to the correct zone names).
 *
 * @param scene - The active playground scene.
 * @returns A readonly array of `ZoneDefinition`s for the hallucinated grid.
 *
 * @example
 * ```ts
 * const hallucinatedZones = getHallucinatedZones(medicalScene);
 * // [{ name: 'hallucinated-vitals', ... }, { name: 'hallucinated-medications', ... }]
 * ```
 */
export function getHallucinatedZones(scene: PlaygroundScene): readonly ZoneDefinition[] {
  // Use explicit hallucinatedZones if provided by the scene definition
  if (scene.hallucinatedZones !== undefined) {
    return scene.hallucinatedZones;
  }

  // Auto-mirror standard zones with 'hallucinated-' prefix
  return scene.zones.map((zone): ZoneDefinition => ({
    name: `hallucinated-${zone.name}`,
    position: zone.position,
    // exactOptionalPropertyTypes: only include expectedComponent when defined
    ...(zone.expectedComponent !== undefined ? { expectedComponent: zone.expectedComponent } : {}),
    intentHint: zone.intentHint,
  }));
}
