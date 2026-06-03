/**
 * @module playground/enterstellar/scenes/quick-scenes
 * @description 8 single-zone Quick demo scenes — one per component.
 *
 * Quick scenes provide atomic component inspection. Each scene has:
 * - 1 zone (centered, full-width via `layout: 'single'`)
 * - Default Enterstellar theme (Cloud blue palette)
 * - `category: 'quick'` — displayed with ⚡ prefix in suggestion chips
 * - `expectedComponent` set to the target component
 * - Multiple `suggestedIntents` for typewriter placeholder rotation
 *
 * These scenes demonstrate individual component capabilities without
 * the complexity of multi-zone orchestration. Visitors can inspect
 * each component's contract, props, tokens, and trace output in isolation.
 *
 * @see implementation_plan.md §2.5.3 — Quick Demo Scenes
 */

import type { PlaygroundScene } from './types';

// ---------------------------------------------------------------------------
// Quick Scenes (1 zone each, default Enterstellar theme)
// ---------------------------------------------------------------------------

/**
 * Quick: MetricCard — dashboard metric with trend and sparkline.
 *
 * Demonstrates numeric data display with animated inline SVG sparkline.
 * The simplest and most visually immediate component in the registry.
 */
export const quickMetricCard: PlaygroundScene = {
  id: 'quick-metric-card',
  name: 'MetricCard',
  description: 'Explore the MetricCard component with live trend data',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'MetricCard',
      intentHint: 'Show a single dashboard metric with value, trend, and sparkline',
    },
  ],
  suggestedIntents: [
    'Show me server CPU usage at 72%',
    'Display monthly revenue of $1.2M with upward trend',
    'Show active users count at 3,847 with sparkline',
  ],
};

/**
 * Quick: DataTable — sortable structured tabular data.
 *
 * Demonstrates complex nested props (columns + rows) and interactive
 * column sorting. The most data-dense component in the registry.
 */
export const quickDataTable: PlaygroundScene = {
  id: 'quick-data-table',
  name: 'DataTable',
  description: 'Explore the sortable DataTable with structured columns and rows',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'DataTable',
      intentHint: 'Show a sortable data table with multiple columns and rows',
    },
  ],
  suggestedIntents: [
    'Show a table of recent transactions',
    'Display a sortable employee directory',
    'Show API endpoint performance metrics in a table',
  ],
};

/**
 * Quick: StatusBadge — real-time status indicator with pulse.
 *
 * Demonstrates the smallest component with enum-driven severity
 * and optional ping animation for live status monitoring.
 */
export const quickStatusBadge: PlaygroundScene = {
  id: 'quick-status-badge',
  name: 'StatusBadge',
  description: 'Explore the StatusBadge with real-time status indicators',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'StatusBadge',
      intentHint: 'Show a real-time status indicator with colored dot and label',
    },
  ],
  suggestedIntents: [
    'Show system health status as all systems operational',
    'Display database connection status as warning',
    'Show API gateway status as online with pulse',
  ],
};

/**
 * Quick: UserProfile — profile card with avatar and stats.
 *
 * Demonstrates compound data display with image rendering,
 * text hierarchy, and grid-based statistics layout.
 */
export const quickUserProfile: PlaygroundScene = {
  id: 'quick-user-profile',
  name: 'UserProfile',
  description: 'Explore the UserProfile card with avatar and statistics',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'UserProfile',
      intentHint: 'Show a user profile card with name, role, avatar, and key stats',
    },
  ],
  suggestedIntents: [
    'Show user profile for Sarah Chen, Senior Engineer',
    'Display account info for Alex Kim with project stats',
    'Show team lead Jordan Lee with commit history',
  ],
};

/**
 * Quick: ActivityFeed — chronological timeline of events.
 *
 * Demonstrates list rendering with structured entries, timestamps,
 * and a visual timeline connector between events.
 */
export const quickActivityFeed: PlaygroundScene = {
  id: 'quick-activity-feed',
  name: 'ActivityFeed',
  description: 'Explore the ActivityFeed timeline with user-attributed events',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'ActivityFeed',
      intentHint: 'Show a chronological timeline of events with timestamps and users',
    },
  ],
  suggestedIntents: [
    'Show recent deployment activity',
    'Display the latest security audit log entries',
    'Show recent team collaboration activity',
  ],
};

/**
 * Quick: ProgressTracker — multi-step progress indicator.
 *
 * Demonstrates ordinal progress with step labels and visual
 * state mapping (complete → active → pending).
 */
export const quickProgressTracker: PlaygroundScene = {
  id: 'quick-progress-tracker',
  name: 'ProgressTracker',
  description: 'Explore the multi-step ProgressTracker with labeled stages',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'ProgressTracker',
      intentHint: 'Show a multi-step progress indicator with current position',
    },
  ],
  suggestedIntents: [
    'Show onboarding progress at step 3 of 5',
    'Display deployment pipeline at the testing stage',
    'Show order fulfillment progress at shipping',
  ],
};

/**
 * Quick: AlertBanner — dismissible system notification.
 *
 * Demonstrates the feedback pattern with severity-driven styling
 * and interactive dismiss functionality.
 */
export const quickAlertBanner: PlaygroundScene = {
  id: 'quick-alert-banner',
  name: 'AlertBanner',
  description: 'Explore the dismissible AlertBanner with severity levels',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'AlertBanner',
      intentHint: 'Show a system notification banner with severity and dismiss option',
    },
  ],
  suggestedIntents: [
    'Show a critical security alert about unusual login activity',
    'Display an info banner about scheduled maintenance',
    'Show a warning about approaching storage limits',
  ],
};

/**
 * Quick: CommandPalette — searchable keyboard-navigable command list.
 *
 * Demonstrates the navigation pattern with interactive search filtering,
 * keyboard controls (↑↓ Enter), and grouped commands with shortcuts.
 */
export const quickCommandPalette: PlaygroundScene = {
  id: 'quick-command-palette',
  name: 'CommandPalette',
  description: 'Explore the searchable CommandPalette with keyboard navigation',
  category: 'quick',
  theme: 'enterstellar',
  layout: 'single',
  zones: [
    {
      name: 'main',
      position: { row: 1, col: 1 },
      expectedComponent: 'CommandPalette',
      intentHint: 'Show a searchable list of admin commands with keyboard shortcuts',
    },
  ],
  suggestedIntents: [
    'Show available admin commands',
    'Display developer tools command palette',
    'Show navigation shortcuts for the dashboard',
  ],
};

// ---------------------------------------------------------------------------
// All Quick Scenes
// ---------------------------------------------------------------------------

/**
 * All 8 Quick demo scenes in display order.
 *
 * Used by the scene registry and the intention suggestions component
 * to render ⚡-prefixed chips in the prompt bar.
 */
export const allQuickScenes: readonly PlaygroundScene[] = [
  quickMetricCard,
  quickDataTable,
  quickStatusBadge,
  quickUserProfile,
  quickActivityFeed,
  quickProgressTracker,
  quickAlertBanner,
  quickCommandPalette,
] as const;
