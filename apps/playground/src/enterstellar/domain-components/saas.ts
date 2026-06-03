/**
 * @module playground/enterstellar/domain-components/saas
 * @description Nexus CRM — SaaS Platform domain component contracts.
 *
 * **Components (6):**
 * 1. **PipelineBoard** — Sales pipeline kanban with stage totals
 * 2. **DealCard** — Individual deal card with value, stage, and probability
 * 3. **ActivityTimeline** — CRM activity timeline (calls, emails, meetings)
 * 4. **ForecastGauge** — Revenue forecast vs quota with weighted pipeline confidence
 * 5. **LeadScoreMatrix** — Multi-signal lead scoring (behavioral + demographic)
 * 6. **IntegrationStatus** — Third-party integration health monitor
 *
 * These are **data-only contracts** — no React, no JSX (Design Choice R6).
 * Renderers live in `domain-renderers/saas-renderers.tsx`.
 *
 * @see Bible §5.1 — defineComponent specification
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';
// ---------------------------------------------------------------------------
// 1. PipelineBoard
// ---------------------------------------------------------------------------

/**
 * PipelineBoard — sales pipeline kanban with stage totals.
 *
 * Displays a sales pipeline overview aggregating deal counts and total value
 * across custom stages (Lead, Qualified, Proposal, Negotiation, Closed Won).
 * Serves as the primary eagle-eye view for sales managers to track pipeline
 * health and identify bottlenecks.
 *
 * Inspired by Salesforce's Opportunity Kanban and HubSpot's Deal Pipeline.
 */
export const PipelineBoard = defineComponent({
  name: 'PipelineBoard',
  description: 'Sales pipeline board with stages, deal counts, and total value per stage.',
  category: 'data-display',
  tags: ['saas', 'crm', 'pipeline', 'sales', 'kanban'],
  props: z.object({
    title: z.string().min(1),
    stages: z.array(z.object({
      name: z.string().min(1),
      dealCount: z.number().int().min(0),
      totalValue: z.number().min(0),
      color: z.string().optional(),
    })).min(1),
    totalPipelineValue: z.number().min(0).optional(),
    currency: z.string().default('USD'),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent' },
  accessibility: { role: 'group', ariaLabel: 'Sales pipeline board', announceOnUpdate: false },
  states: { loading: 'PipelineBoardLoading', error: 'PipelineBoardError', empty: 'PipelineBoardEmpty', ready: 'PipelineBoard' },
  examples: [{ intent: 'Show Nexus CRM sales pipeline', props: { title: 'Sales Pipeline', stages: [{ name: 'Lead', dealCount: 42, totalValue: 420000 }, { name: 'Qualified', dealCount: 28, totalValue: 680000 }, { name: 'Proposal', dealCount: 15, totalValue: 1200000 }, { name: 'Negotiation', dealCount: 8, totalValue: 960000 }, { name: 'Closed Won', dealCount: 12, totalValue: 2400000 }], totalPipelineValue: 5660000, currency: 'USD' } }],
});
// ---------------------------------------------------------------------------
// 2. DealCard
// ---------------------------------------------------------------------------

/**
 * DealCard — individual deal card with value, stage, and probability.
 *
 * Visually represents a single sales opportunity. Displays the target
 * company, deal name, projected value, assigned representative, and the
 * probability of closing. Used both inside the PipelineBoard and as
 * standalone widgets on rep dashboards.
 *
 * Mimics standard CRM opportunity cards across major enterprise platforms.
 */
export const DealCard = defineComponent({
  name: 'DealCard',
  description: 'Individual CRM deal card with company, value, stage, probability, and assigned rep.',
  category: 'data-display',
  tags: ['saas', 'crm', 'deal', 'sales', 'opportunity'],
  props: z.object({
    company: z.string().min(1),
    dealName: z.string().min(1),
    value: z.number().min(0),
    currency: z.string().default('USD'),
    stage: z.string().min(1),
    probability: z.number().min(0).max(100),
    assignedTo: z.string().min(1),
    closeDate: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent', success: 'token:success' },
  accessibility: { role: 'article', ariaLabel: 'Deal card', announceOnUpdate: false },
  states: { loading: 'DealCardLoading', error: 'DealCardError', empty: 'DealCardEmpty', ready: 'DealCard' },
  examples: [{ intent: 'Show deal card for TechVentures enterprise deal', props: { company: 'TechVentures Inc', dealName: 'Enterprise Platform License', value: 240000, currency: 'USD', stage: 'Negotiation', probability: 75, assignedTo: 'Sarah Kim', closeDate: '2024-04-15', priority: 'high' } }],
});
// ---------------------------------------------------------------------------
// 3. ActivityTimeline
// ---------------------------------------------------------------------------

/**
 * ActivityTimeline — CRM activity timeline (calls, emails, meetings).
 *
 * A chronological feed of all touchpoints with a prospect or account.
 * Aggregates emails, phone calls, meetings, notes, and task completions
 * to ensure all account executives have full context before outreach.
 *
 * Inspired by Outreach's Sequence view and Salesforce's Activity History.
 */
export const ActivityTimeline = defineComponent({
  name: 'ActivityTimeline',
  description: 'CRM activity timeline showing calls, emails, meetings, and notes with timestamps.',
  category: 'data-display',
  tags: ['saas', 'crm', 'activity', 'timeline', 'engagement'],
  props: z.object({
    title: z.string().min(1),
    activities: z.array(z.object({
      type: z.enum(['call', 'email', 'meeting', 'note', 'task']).default('task'),
      subject: z.string().min(1),
      contact: z.string().min(1),
      timestamp: z.string().min(1),
      outcome: z.string().optional(),
      rep: z.string().min(1),
    })).min(1),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent' },
  accessibility: { role: 'feed', ariaLabel: 'Activity timeline', announceOnUpdate: false },
  states: { loading: 'ActivityTimelineLoading', error: 'ActivityTimelineError', empty: 'ActivityTimelineEmpty', ready: 'ActivityTimeline' },
  examples: [{ intent: 'Show recent CRM activities for Nexus team', props: { title: 'Recent Activity', activities: [{ type: 'call', subject: 'Discovery call with TechVentures', contact: 'Mark Johnson', timestamp: '2024-03-15 14:30', outcome: 'Positive — scheduled demo', rep: 'Sarah Kim' }, { type: 'email', subject: 'Proposal follow-up', contact: 'Lisa Wang', timestamp: '2024-03-15 11:20', rep: 'James Cole' }] } }],
});

// ---------------------------------------------------------------------------
// 4. ForecastGauge
// ---------------------------------------------------------------------------

/**
 * ForecastGauge — revenue forecast vs quota with weighted pipeline confidence.
 *
 * Displays the current period's revenue forecast against quota with a
 * visual gauge showing attainment percentage. Includes weighted pipeline
 * (sum of deal value × probability for all active deals), best-case
 * and worst-case scenarios, and a confidence breakdown by pipeline stage.
 *
 * Inspired by Salesforce Einstein Forecasting and Clari's revenue
 * intelligence. Sales VPs review this exact view in weekly forecast calls
 * to assess quota attainment likelihood.
 */
export const ForecastGauge = defineComponent({
  name: 'ForecastGauge',
  description: 'Revenue forecast gauge showing quota attainment, weighted pipeline, and confidence bands.',
  category: 'data-display',
  tags: ['saas', 'forecast', 'quota', 'revenue', 'sales-ops'],
  props: z.object({
    period: z.string().min(1),
    quota: z.number().min(0),
    closedWon: z.number().min(0),
    weightedPipeline: z.number().min(0),
    bestCase: z.number().min(0),
    worstCase: z.number().min(0),
    attainmentPercentage: z.number().min(0).max(200),
    currency: z.string().default('USD'),
    stageConfidence: z.array(z.object({
      stage: z.string().min(1),
      value: z.number().min(0),
      probability: z.number().min(0).max(100),
      weighted: z.number().min(0),
    })).optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    danger: 'token:danger',
    warning: 'token:warning',
    accent: 'token:accent',
  },
  accessibility: {
    role: 'meter',
    ariaLabel: 'Revenue forecast gauge',
    announceOnUpdate: true,
  },
  states: {
    loading: 'ForecastGaugeLoading',
    error: 'ForecastGaugeError',
    empty: 'ForecastGaugeEmpty',
    ready: 'ForecastGauge',
  },
  examples: [
    {
      intent: 'Show Q1 revenue forecast vs quota for Nexus CRM',
      props: {
        period: 'Q1 2024',
        quota: 5000000,
        closedWon: 2400000,
        weightedPipeline: 1840000,
        bestCase: 5200000,
        worstCase: 3600000,
        attainmentPercentage: 85,
        currency: 'USD',
        stageConfidence: [
          { stage: 'Commit', value: 960000, probability: 90, weighted: 864000 },
          { stage: 'Best Case', value: 1200000, probability: 60, weighted: 720000 },
          { stage: 'Pipeline', value: 640000, probability: 40, weighted: 256000 },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 5. LeadScoreMatrix
// ---------------------------------------------------------------------------

/**
 * LeadScoreMatrix — multi-signal lead scoring with behavioral and demographic dimensions.
 *
 * Displays a lead's composite score derived from two signal categories:
 * behavioral (page visits, email opens, content downloads, webinar
 * attendance, free trial usage) and demographic (company size, industry,
 * title seniority, technology stack, budget authority). Each signal
 * contributes a weighted sub-score.
 *
 * Inspired by HubSpot's predictive lead scoring, Marketo's engagement
 * scoring, and 6sense's intent data model. Marketing teams use this
 * to qualify MQLs and route them to sales.
 */
export const LeadScoreMatrix = defineComponent({
  name: 'LeadScoreMatrix',
  description: 'Multi-signal lead scoring matrix with behavioral and demographic signal breakdown.',
  category: 'data-display',
  tags: ['saas', 'lead-scoring', 'marketing', 'qualification', 'signals'],
  props: z.object({
    leadName: z.string().min(1),
    company: z.string().min(1),
    overallScore: z.number().min(0).max(100),
    grade: z.enum(['A', 'B', 'C', 'D', 'F']),
    behavioralSignals: z.array(z.object({
      signal: z.string().min(1),
      value: z.string().min(1),
      score: z.number().min(0).max(100),
      weight: z.number().min(0).max(1),
    })).min(1, 'At least one behavioral signal is required.'),
    demographicSignals: z.array(z.object({
      signal: z.string().min(1),
      value: z.string().min(1),
      score: z.number().min(0).max(100),
      weight: z.number().min(0).max(1),
    })).min(1, 'At least one demographic signal is required.'),
    recommendation: z.enum(['nurture', 'mql', 'sql', 'fast-track']),
    lastActivity: z.string().min(1),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    warning: 'token:warning',
    accent: 'token:accent',
  },
  accessibility: {
    role: 'region',
    ariaLabel: 'Lead score matrix',
    announceOnUpdate: false,
  },
  states: {
    loading: 'LeadScoreMatrixLoading',
    error: 'LeadScoreMatrixError',
    empty: 'LeadScoreMatrixEmpty',
    ready: 'LeadScoreMatrix',
  },
  examples: [
    {
      intent: 'Show lead score breakdown for Jennifer Park at DataFlow Inc',
      props: {
        leadName: 'Jennifer Park',
        company: 'DataFlow Inc',
        overallScore: 82,
        grade: 'A',
        behavioralSignals: [
          { signal: 'Pricing page visits', value: '7 visits (14 days)', score: 90, weight: 0.25 },
          { signal: 'Case study downloads', value: '3 downloads', score: 75, weight: 0.2 },
          { signal: 'Email engagement', value: '85% open rate', score: 85, weight: 0.15 },
          { signal: 'Webinar attendance', value: 'Attended live demo', score: 95, weight: 0.15 },
        ],
        demographicSignals: [
          { signal: 'Company size', value: '500–1000 employees', score: 80, weight: 0.1 },
          { signal: 'Industry', value: 'Financial Services', score: 90, weight: 0.1 },
          { signal: 'Title seniority', value: 'VP of Engineering', score: 85, weight: 0.05 },
        ],
        recommendation: 'sql',
        lastActivity: '2024-03-15T14:20:00Z',
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 6. IntegrationStatus
// ---------------------------------------------------------------------------

/**
 * IntegrationStatus — third-party integration health monitor.
 *
 * Displays the health status of connected third-party integrations
 * (Slack, Salesforce, HubSpot, Stripe, etc.) with current sync status
 * (synced, syncing, error, paused), error rate over the last 24h,
 * last successful sync timestamp, records synced, and data freshness.
 *
 * Every SaaS platform has an integrations health page. Ops teams use
 * this to monitor data pipeline health and catch sync failures before
 * they cascade into customer-facing issues.
 */
export const IntegrationStatus = defineComponent({
  name: 'IntegrationStatus',
  description: 'Third-party integration health monitor with sync status, error rates, and data freshness.',
  category: 'data-display',
  tags: ['saas', 'integration', 'sync', 'health', 'platform'],
  props: z.object({
    title: z.string().min(1),
    integrations: z.array(z.object({
      name: z.string().min(1),
      provider: z.string().min(1),
      status: z.enum(['synced', 'syncing', 'error', 'paused', 'disconnected']),
      lastSyncAt: z.string().min(1),
      recordsSynced: z.number().int().min(0),
      errorRate24h: z.number().min(0).max(100),
      errorMessage: z.string().optional(),
    })).min(1, 'At least one integration is required.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    danger: 'token:danger',
    warning: 'token:warning',
  },
  accessibility: {
    role: 'status',
    ariaLabel: 'Integration status',
    announceOnUpdate: true,
  },
  states: {
    loading: 'IntegrationStatusLoading',
    error: 'IntegrationStatusError',
    empty: 'IntegrationStatusEmpty',
    ready: 'IntegrationStatus',
  },
  examples: [
    {
      intent: 'Show integration health status for Nexus CRM',
      props: {
        title: 'Integration Health',
        integrations: [
          { name: 'CRM Sync', provider: 'Salesforce', status: 'synced', lastSyncAt: '2024-03-15T14:30:00Z', recordsSynced: 142800, errorRate24h: 0.02 },
          { name: 'Marketing Hub', provider: 'HubSpot', status: 'syncing', lastSyncAt: '2024-03-15T14:25:00Z', recordsSynced: 89400, errorRate24h: 0.1 },
          { name: 'Payments', provider: 'Stripe', status: 'error', lastSyncAt: '2024-03-15T12:00:00Z', recordsSynced: 23100, errorRate24h: 4.2, errorMessage: 'Rate limit exceeded — retry in 300s' },
          { name: 'Team Chat', provider: 'Slack', status: 'synced', lastSyncAt: '2024-03-15T14:28:00Z', recordsSynced: 5200, errorRate24h: 0 },
        ],
      },
    },
  ],
});

/**
 * All Nexus CRM (SaaS) domain component contracts.
 *
 * Spread into the playground registry and system prompt manifest.
 */
export const saasContracts = [
  PipelineBoard,
  DealCard,
  ActivityTimeline,
  ForecastGauge,
  LeadScoreMatrix,
  IntegrationStatus,
] as const;
