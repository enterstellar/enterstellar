/**
 * @module playground/enterstellar/scenes/scene-open-canvas
 * @description Open Canvas — domain-agnostic freeform scene.
 *
 * Used when the user types a custom prompt that is not bound to any
 * specific domain scene chip. The Open Canvas provides 8 generic zones
 * with no `expectedComponent` constraints — the LLM selects components
 * freely from the full 30-component manifest based on the prompt's
 * semantic content.
 *
 * **Key design decisions:**
 * - **No forced theme.** Uses `'enterstellar'` (default) so the data context
 *   loader in `route.ts` falls through to keyword heuristic matching.
 * - **No expectedComponent.** Every zone is freestyle — the LLM picks
 *   based on the prompt, not the scene definition.
 * - **Mixed sizeHints.** Visual variety: compact KPI panels, standard
 *   detail panels, wide data-heavy panels — a natural dashboard feel.
 * - **8 zones (4 required + 4 optional).** The first 4 always render,
 *   giving minimum visual density. Zones 5–8 render only if the LLM
 *   provides intents, enabling 4–8 panel layouts from the same scene.
 * - **Generic zone names.** `canvas-primary`, `canvas-secondary`, etc.
 *   Named descriptively so the LLM can sensibly decide which zone gets
 *   what (a metric vs a table vs a feed), but not domain-locked.
 *
 * @see implementation_plan.md §2.5 — Scenes Architecture
 * @see route.ts — keyword heuristic for data context fallback
 */

import type { PlaygroundScene } from './types';

/**
 * Open Canvas — freeform playground scene.
 *
 * Provides a balanced 8-zone grid layout for any arbitrary prompt.
 * The LLM receives all 30 component contracts and selects the best
 * components to match the user's natural-language intent.
 *
 * The `grid-2col` layout renders zones in a clean 2-column CSS Grid,
 * with `sizeHint` controlling column spanning:
 * - `compact` → single column, small height (KPIs, badges)
 * - `standard` → single column (detail cards, profiles)
 * - `wide` → spans 2 columns (tables, feeds, timelines)
 */
export const sceneOpenCanvas: PlaygroundScene = {
  id: 'scene-open-canvas',
  name: 'Open Canvas',
  description: 'Freestyle layout — the AI picks the best components for your prompt',
  category: 'domain',
  theme: 'enterstellar',
  layout: 'grid-2col',
  zones: [
    // ── Required zones (always rendered) ──
    {
      name: 'canvas-primary',
      position: { row: 1, col: 1, span: 2 },
      intentHint: 'Primary data visualization or key metric overview for the prompt topic',
      sizeHint: 'wide',
    },
    {
      name: 'canvas-kpi-a',
      position: { row: 2, col: 1 },
      intentHint: 'A compact KPI or status indicator relevant to the prompt topic',
      sizeHint: 'compact',
    },
    {
      name: 'canvas-kpi-b',
      position: { row: 2, col: 2 },
      intentHint: 'A second compact KPI, alert, or status badge relevant to the prompt topic',
      sizeHint: 'compact',
    },
    {
      name: 'canvas-detail',
      position: { row: 3, col: 1, span: 2 },
      intentHint: 'Detailed data table, list, or feed showing records relevant to the prompt topic',
      sizeHint: 'wide',
    },
    // ── Optional zones (rendered only when LLM provides intents) ──
    {
      name: 'canvas-secondary',
      position: { row: 4, col: 1 },
      intentHint: 'Secondary detail view — profile, timeline, or progress tracker',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'canvas-sidebar',
      position: { row: 4, col: 2 },
      intentHint: 'Supporting information — activity log, notifications, or contextual alerts',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'canvas-supplement-a',
      position: { row: 5, col: 1 },
      intentHint: 'Supplementary metric, chart, or summary related to the prompt topic',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'canvas-supplement-b',
      position: { row: 5, col: 2 },
      intentHint: 'Additional supplementary component for comprehensive coverage',
      sizeHint: 'compact',
      optional: true,
    },
  ],
  suggestedIntents: [
    'Build me a comprehensive operations dashboard with KPIs and activity tracking',
    'Show a user engagement analytics view with cohort metrics and funnels',
    'Create a supply chain monitoring panel with shipment status and inventory',
    'Design an HR people ops dashboard with headcount trends and open positions',
    'Show a customer success scorecard with NPS, churn risk, and support tickets',
  ],
};
