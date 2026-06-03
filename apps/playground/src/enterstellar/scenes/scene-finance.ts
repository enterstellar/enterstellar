/**
 * @module playground/enterstellar/scenes/scene-finance
 * @description Meridian Pay — Financial Services domain scene.
 *
 * A multi-zone financial dashboard demonstrating Enterstellar's ability to render
 * a cohesive multi-zone application from a single LLM call. Uses the
 * `finance` theme (deep navy + gold, serif accents, high-contrast data).
 *
 * **Fictional brand:** Meridian Pay
 * **Visual DNA:** Deep navy + gold, serif accents, high-contrast data
 *
 * **Zones (4 required + 5 optional):**
 * 1. `revenue-metric` — RevenueChart showing quarterly revenue KPI (compact)
 * 2. `compliance-alert` — ComplianceAlert for regulatory notifications (compact)
 * 3. `transactions` — TransactionLedger with recent wire transfers (wide)
 * 4. `activity-log` — ActivityFeed of financial operations (standard)
 * 5. `status-badge` — StatusBadge for system health (compact, optional)
 * 6. `metric-card` — MetricCard for secondary KPI (compact, optional)
 * 7. `risk-scorecard` — RiskScorecard for transaction risk assessment (standard, optional)
 * 8. `cash-flow-forecast` — CashFlowForecast with inflow/outflow projections (wide, optional)
 * 9. `fee-schedule` — FeeSchedule with tiered pricing (standard, optional)
 *
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import type { PlaygroundScene } from './types';

/**
 * Meridian Pay — Financial Services dashboard.
 *
 * Demonstrates Enterstellar rendering a complete fintech application with
 * 100% domain-specific components (TransactionLedger, RevenueChart,
 * ComplianceAlert, RiskScorecard, CashFlowForecast, FeeSchedule). 
 * Dynamic zone sizing ensures data-heavy components get more horizontal
 * space than compact UI elements.
 */
export const sceneFinance: PlaygroundScene = {
  id: 'scene-finance',
  name: 'Financial Dashboard',
  description: 'Meridian Pay — Revenue metrics, transactions, and compliance alerts',
  category: 'domain',
  theme: 'finance',
  layout: 'grid-2col',
  zones: [
    {
      name: 'revenue-metric',
      position: { row: 1, col: 1 },
      expectedComponent: 'RevenueChart',
      intentHint: 'Show quarterly revenue with trend and breakdown by service line',
      sizeHint: 'compact',
    },
    {
      name: 'compliance-alert',
      position: { row: 1, col: 2 },
      expectedComponent: 'ComplianceAlert',
      intentHint: 'Show a regulatory compliance notification or audit reminder',
      sizeHint: 'compact',
    },
    {
      name: 'transactions',
      position: { row: 2, col: 1, span: 2 },
      expectedComponent: 'TransactionLedger',
      intentHint: 'Show a sortable ledger of recent wire transfers and payments',
      sizeHint: 'wide',
    },
    {
      name: 'activity-log',
      position: { row: 3, col: 1 },
      expectedComponent: 'ActivityFeed',
      intentHint: 'Show recent financial operations (approvals, transfers, reconciliations)',
      sizeHint: 'standard',
    },
    {
      name: 'status-badge',
      position: { row: 3, col: 2 },
      expectedComponent: 'StatusBadge',
      intentHint: 'Show system health status for payment processing',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'metric-card',
      position: { row: 4, col: 1 },
      expectedComponent: 'MetricCard',
      intentHint: 'Show a secondary KPI like transaction volume or processing speed',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'risk-scorecard',
      position: { row: 5, col: 1 },
      expectedComponent: 'RiskScorecard',
      intentHint: 'Show a transaction risk assessment with factor breakdown and recommendation',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'cash-flow-forecast',
      position: { row: 5, col: 2 },
      expectedComponent: 'CashFlowForecast',
      intentHint: 'Show a cash flow forecast with inflow/outflow projections and runway',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'fee-schedule',
      position: { row: 6, col: 1, span: 2 },
      expectedComponent: 'FeeSchedule',
      intentHint: 'Show the tiered fee schedule with current tier highlighted',
      sizeHint: 'wide',
      optional: true,
    },
  ],
  suggestedIntents: [
    'Show me a financial dashboard for Meridian Pay with revenue, transactions, and compliance',
    'Display a fintech operations overview with KPIs and recent activity',
    'Build a treasury management dashboard with real-time metrics',
  ],
};
