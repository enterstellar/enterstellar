/**
 * @module playground/enterstellar/scenes/scene-saas
 * @description Nexus CRM — SaaS Platform domain scene.
 *
 * A multi-zone SaaS CRM dashboard demonstrating Enterstellar's ability to render
 * a modern platform administration interface. Uses the `saas` theme
 * (cool purple gradient, rounded, modern SaaS aesthetic).
 *
 * **Fictional brand:** Nexus CRM
 * **Visual DNA:** Dark purple + electric blue, modern SaaS aesthetic
 *
 * **Zones (4 required + 5 optional):**
 * 1. `pipeline-board` — PipelineBoard showing sales pipeline stages (full)
 * 2. `deal-card` — DealCard for top opportunity (compact)
 * 3. `activity-timeline` — ActivityTimeline with CRM activities (standard)
 * 4. `metric-card` — MetricCard for win rate or MRR (compact)
 * 5. `status-badge` — StatusBadge for CRM system health (compact, optional)
 * 6. `user-profile` — UserProfile for top sales rep (compact, optional)
 * 7. `forecast-gauge` — ForecastGauge with quota attainment and pipeline confidence (standard, optional)
 * 8. `lead-score` — LeadScoreMatrix with behavioral/demographic signals (standard, optional)
 * 9. `integrations` — IntegrationStatus with sync health and error rates (wide, optional)
 *
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import type { PlaygroundScene } from './types';

/**
 * Nexus CRM — SaaS Platform dashboard.
 *
 * Demonstrates Enterstellar rendering a comprehensive CRM application with
 * advanced sales forecasting, complex lead scoring matrices, 
 * pipeline analytics, and real-time integration health metrics —
 * all in a modern SaaS aesthetic.
 */
export const sceneSaas: PlaygroundScene = {
  id: 'scene-saas',
  name: 'CRM Dashboard',
  description: 'Nexus CRM — Sales pipeline, deals, and team activity',
  category: 'domain',
  theme: 'saas',
  layout: 'grid-2col',
  zones: [
    {
      name: 'pipeline-board',
      position: { row: 1, col: 1, span: 2 },
      expectedComponent: 'PipelineBoard',
      intentHint: 'Show the full sales pipeline with stage counts and values',
      sizeHint: 'full',
    },
    {
      name: 'deal-card',
      position: { row: 2, col: 1 },
      expectedComponent: 'DealCard',
      intentHint: 'Show the top deal or most recently updated opportunity',
      sizeHint: 'compact',
    },
    {
      name: 'activity-timeline',
      position: { row: 2, col: 2 },
      expectedComponent: 'ActivityTimeline',
      intentHint: 'Show recent CRM activities: calls, emails, meetings',
      sizeHint: 'standard',
    },
    {
      name: 'metric-card',
      position: { row: 3, col: 1 },
      expectedComponent: 'MetricCard',
      intentHint: 'Show win rate or monthly recurring revenue as a KPI',
      sizeHint: 'compact',
    },
    {
      name: 'status-badge',
      position: { row: 3, col: 2 },
      expectedComponent: 'StatusBadge',
      intentHint: 'Show CRM sync status or data freshness indicator',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'user-profile',
      position: { row: 4, col: 1 },
      expectedComponent: 'UserProfile',
      intentHint: 'Show the top-performing sales rep with stats',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'forecast-gauge',
      position: { row: 5, col: 1 },
      expectedComponent: 'ForecastGauge',
      intentHint: 'Show revenue forecast with quota attainment, weighted pipeline, and stage confidence',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'lead-score',
      position: { row: 5, col: 2 },
      expectedComponent: 'LeadScoreMatrix',
      intentHint: 'Show a lead scoring breakdown with behavioral and demographic signals',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'integrations',
      position: { row: 6, col: 1, span: 2 },
      expectedComponent: 'IntegrationStatus',
      intentHint: 'Show integration sync status with error rates and record counts',
      sizeHint: 'wide',
      optional: true,
    },
  ],
  suggestedIntents: [
    'Show me a CRM dashboard for Nexus with pipeline, deals, and activity',
    'Display a sales operations overview with win rate and team engagement',
    'Build a revenue management dashboard with pipeline visualization',
  ],
};
