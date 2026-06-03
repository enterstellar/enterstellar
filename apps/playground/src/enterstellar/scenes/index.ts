/**
 * @module playground/enterstellar/scenes
 * @description Scene registry — exports all 14 PlaygroundScenes.
 *
 * Central barrel file for the Scenes architecture. Provides:
 * - Individual scene exports (for direct access)
 * - Categorized arrays: `allQuickScenes`, `allDomainScenes`
 * - Combined array: `allScenes` (for iteration)
 * - Lookup map: `sceneById` (for O(1) lookup by scene ID)
 *
 * @see implementation_plan.md §2.5.2 — Scenes Architecture
 * @see implementation_plan.md §2.5.3 — Quick Demo Scenes
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

// ---------------------------------------------------------------------------
// Type Re-exports
// ---------------------------------------------------------------------------

export type {
  PlaygroundScene,
  ZoneDefinition,
  ZoneIntent,
  SceneLayout,
  SceneCategory,
} from './types';

// ---------------------------------------------------------------------------
// Quick Scenes (8 single-zone demos)
// ---------------------------------------------------------------------------

export {
  quickMetricCard,
  quickDataTable,
  quickStatusBadge,
  quickUserProfile,
  quickActivityFeed,
  quickProgressTracker,
  quickAlertBanner,
  quickCommandPalette,
  allQuickScenes,
} from './quick-scenes';

// ---------------------------------------------------------------------------
// Domain Scenes (5 multi-zone dashboards)
// ---------------------------------------------------------------------------

export { sceneFinance } from './scene-finance';
export { sceneMedical } from './scene-medical';
export { sceneCommerce } from './scene-commerce';
export { sceneSaas } from './scene-saas';
export { sceneEducation } from './scene-education';
export { sceneOpenCanvas } from './scene-open-canvas';

import { allQuickScenes } from './quick-scenes';
import { sceneFinance } from './scene-finance';
import { sceneMedical } from './scene-medical';
import { sceneCommerce } from './scene-commerce';
import { sceneSaas } from './scene-saas';
import { sceneEducation } from './scene-education';
import { sceneOpenCanvas } from './scene-open-canvas';

import type { PlaygroundScene } from './types';

/**
 * All 5 domain scenes in display order.
 *
 * Used by the intent suggestions component to render
 * 💡-prefixed chips in the prompt bar.
 */
export const allDomainScenes: readonly PlaygroundScene[] = [
  sceneFinance,
  sceneMedical,
  sceneCommerce,
  sceneSaas,
  sceneEducation,
] as const;

/**
 * All 14 scenes combined (8 Quick + 5 Domain + 1 Open Canvas).
 *
 * Used for iteration when searching across all scenes
 * (e.g., typewriter placeholder rotation).
 */
export const allScenes: readonly PlaygroundScene[] = [
  ...allQuickScenes,
  ...allDomainScenes,
  sceneOpenCanvas,
] as const;

/**
 * O(1) scene lookup by ID.
 *
 * Used by the playground page to resolve a scene from URL
 * parameters or chip click events.
 *
 * @example
 * ```ts
 * const scene = sceneById.get('scene-medical');
 * // → VitalSync medical dashboard scene
 * ```
 */
export const sceneById: ReadonlyMap<string, PlaygroundScene> = new Map(
  allScenes.map((scene) => [scene.id, scene]),
);
