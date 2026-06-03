/**
 * @module playground/enterstellar/domain-components/finance
 * @description Meridian Pay — Financial Services domain component contracts.
 *
 * **Components (6):**
 * 1. **TransactionLedger** — Sortable transaction history with status icons
 * 2. **RevenueChart** — Revenue KPI with trend, period comparison, and breakdown
 * 3. **ComplianceAlert** — Regulatory compliance notification with severity + deadline
 * 4. **RiskScorecard** — Multi-factor fraud risk assessment (velocity, geo, device)
 * 5. **CashFlowForecast** — Period cash flow projection with inflow/outflow bands
 * 6. **FeeSchedule** — Tiered pricing structure with volume thresholds
 *
 * These are **data-only contracts** — no React, no JSX (Design Choice R6).
 * Renderers live in `domain-renderers/finance-renderers.tsx`.
 *
 * @see Bible §5.1 — defineComponent specification
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

// ---------------------------------------------------------------------------
// 1. TransactionLedger
// ---------------------------------------------------------------------------

/**
 * TransactionLedger — sortable financial transaction history.
 *
 * Displays a chronological list of financial transactions with
 * status indicators (completed, pending, failed), amounts, and
 * counterparty information. Inspired by PayPal's transaction view.
 */
export const TransactionLedger = defineComponent({
  name: 'TransactionLedger',
  description: 'Sortable financial transaction history with status icons, amounts, and counterparty details.',
  category: 'data-display',
  tags: ['finance', 'transactions', 'ledger', 'payments', 'history'],
  props: z.object({
    title: z.string().min(1, 'Ledger title is required.'),
    transactions: z.array(z.object({
      id: z.string().min(1),
      date: z.string().min(1),
      description: z.string().min(1),
      amount: z.number(),
      currency: z.string().default('USD'),
      status: z.enum(['completed', 'pending', 'failed', 'reversed']),
      counterparty: z.string().min(1),
      type: z.enum(['credit', 'debit']),
    })).min(1, 'At least one transaction is required.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    accent: 'token:accent',
    success: 'token:success',
    danger: 'token:danger',
    warning: 'token:warning',
  },
  accessibility: {
    role: 'table',
    ariaLabel: 'Transaction ledger',
    announceOnUpdate: false,
  },
  states: {
    loading: 'TransactionLedgerLoading',
    error: 'TransactionLedgerError',
    empty: 'TransactionLedgerEmpty',
    ready: 'TransactionLedger',
  },
  examples: [
    {
      intent: 'Show recent wire transfers and payments for Meridian Pay',
      props: {
        title: 'Recent Transactions',
        transactions: [
          { id: 'TXN-001', date: '2024-03-15', description: 'Wire transfer to Acme Corp', amount: 25000, currency: 'USD', status: 'completed', counterparty: 'Acme Corp', type: 'debit' },
          { id: 'TXN-002', date: '2024-03-14', description: 'Payment from GlobalTech', amount: 12500, currency: 'USD', status: 'completed', counterparty: 'GlobalTech Inc', type: 'credit' },
          { id: 'TXN-003', date: '2024-03-14', description: 'Refund processing', amount: 3200, currency: 'USD', status: 'pending', counterparty: 'RetailMax', type: 'debit' },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 2. RevenueChart
// ---------------------------------------------------------------------------

/**
 * RevenueChart — revenue KPI with trend and period comparison.
 *
 * Displays a primary revenue figure with trend indicator, period-over-period
 * comparison, and optional category breakdown. Designed for executive
 * dashboards showing financial health at a glance.
 *
 * Inspired by Stripe's executive overview and Square's sales dashboard.
 */
export const RevenueChart = defineComponent({
  name: 'RevenueChart',
  description: 'Revenue KPI card with trend indicator, period comparison, and optional category breakdown.',
  category: 'data-display',
  tags: ['finance', 'revenue', 'kpi', 'chart', 'metrics'],
  props: z.object({
    title: z.string().min(1, 'Chart title is required.'),
    currentValue: z.number(),
    previousValue: z.number(),
    currency: z.string().default('USD'),
    period: z.string().min(1, 'Period label is required (e.g., "Q1 2024").'),
    trend: z.enum(['up', 'down', 'flat']),
    breakdown: z.array(z.object({
      category: z.string().min(1),
      value: z.number(),
      percentage: z.number().min(0).max(100),
    })).optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    accent: 'token:accent',
    success: 'token:success',
    danger: 'token:danger',
  },
  accessibility: {
    role: 'figure',
    ariaLabel: 'Revenue chart',
    announceOnUpdate: true,
  },
  states: {
    loading: 'RevenueChartLoading',
    error: 'RevenueChartError',
    empty: 'RevenueChartEmpty',
    ready: 'RevenueChart',
  },
  examples: [
    {
      intent: 'Show Q1 2024 revenue with breakdown by service line',
      props: {
        title: 'Quarterly Revenue',
        currentValue: 2450000,
        previousValue: 2180000,
        currency: 'USD',
        period: 'Q1 2024',
        trend: 'up',
        breakdown: [
          { category: 'Processing Fees', value: 1200000, percentage: 49 },
          { category: 'Subscription', value: 850000, percentage: 35 },
          { category: 'Enterprise', value: 400000, percentage: 16 },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 3. ComplianceAlert
// ---------------------------------------------------------------------------

/**
 * ComplianceAlert — regulatory compliance notification.
 *
 * Displays compliance-related notifications with severity (info, warning,
 * critical), deadline countdown, and regulation reference. Essential for
 * fintech dashboards that must surface regulatory requirements.
 *
 * Emulates the compliance centers found in Adyen and Brex administrative portals.
 */
export const ComplianceAlert = defineComponent({
  name: 'ComplianceAlert',
  description: 'Regulatory compliance notification with severity, deadline, and regulation reference.',
  category: 'feedback',
  tags: ['finance', 'compliance', 'alert', 'regulatory', 'notification'],
  props: z.object({
    title: z.string().min(1, 'Alert title is required.'),
    message: z.string().min(1, 'Alert message is required.'),
    severity: z.enum(['info', 'warning', 'critical']),
    regulation: z.string().min(1, 'Regulation reference is required (e.g., "SOX §302").'),
    deadline: z.string().optional(),
    actionRequired: z.boolean().default(false),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    warning: 'token:warning',
    danger: 'token:danger',
  },
  accessibility: {
    role: 'alert',
    ariaLabel: 'Compliance alert',
    announceOnUpdate: true,
  },
  states: {
    loading: 'ComplianceAlertLoading',
    error: 'ComplianceAlertError',
    empty: 'ComplianceAlertEmpty',
    ready: 'ComplianceAlert',
  },
  examples: [
    {
      intent: 'Show a SOX compliance warning about upcoming audit deadline',
      props: {
        title: 'SOX Compliance Review Due',
        message: 'Quarterly SOX §302 certification requires CFO sign-off on all material transactions above $50,000. 23 transactions pending review.',
        severity: 'warning',
        regulation: 'SOX §302',
        deadline: '2024-03-31',
        actionRequired: true,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 4. RiskScorecard
// ---------------------------------------------------------------------------

/**
 * RiskScorecard — multi-factor fraud risk assessment panel.
 *
 * Displays a composite risk score (0–100) derived from multiple fraud
 * detection signals: transaction velocity, geographic anomaly, device
 * fingerprint mismatch, and behavioral pattern deviation. Each factor
 * contributes a weighted sub-score with a status indicator.
 *
 * Inspired by Stripe Radar's risk evaluation and Adyen's RevenueProtect.
 * Real payment processors surface exactly this data to fraud analysts
 * during manual review queues.
 */
export const RiskScorecard = defineComponent({
  name: 'RiskScorecard',
  description: 'Multi-factor fraud risk assessment panel with composite score and per-signal breakdown.',
  category: 'data-display',
  tags: ['finance', 'risk', 'fraud', 'scoring', 'compliance'],
  props: z.object({
    transactionId: z.string().min(1),
    overallScore: z.number().min(0).max(100),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    factors: z.array(z.object({
      name: z.string().min(1),
      score: z.number().min(0).max(100),
      weight: z.number().min(0).max(1),
      status: z.enum(['pass', 'warn', 'fail']),
      detail: z.string().min(1),
    })).min(1, 'At least one risk factor is required.'),
    recommendation: z.enum(['approve', 'review', 'decline', 'block']),
    evaluatedAt: z.string().min(1),
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
    role: 'region',
    ariaLabel: 'Risk scorecard',
    announceOnUpdate: true,
  },
  states: {
    loading: 'RiskScorecardLoading',
    error: 'RiskScorecardError',
    empty: 'RiskScorecardEmpty',
    ready: 'RiskScorecard',
  },
  examples: [
    {
      intent: 'Show fraud risk assessment for transaction TXN-4821',
      props: {
        transactionId: 'TXN-4821',
        overallScore: 72,
        riskLevel: 'high',
        factors: [
          { name: 'Transaction Velocity', score: 85, weight: 0.3, status: 'fail', detail: '14 transactions in 2 minutes from same card — exceeds 5/min threshold' },
          { name: 'Geographic Anomaly', score: 62, weight: 0.25, status: 'warn', detail: 'Card used in São Paulo 3h after London transaction — possible travel' },
          { name: 'Device Fingerprint', score: 45, weight: 0.25, status: 'pass', detail: 'Known device, matching browser signature and screen resolution' },
          { name: 'Behavioral Pattern', score: 78, weight: 0.2, status: 'warn', detail: 'Transaction amount 4.2x above cardholder average of $340' },
        ],
        recommendation: 'review',
        evaluatedAt: '2024-03-15T14:32:18Z',
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 5. CashFlowForecast
// ---------------------------------------------------------------------------

/**
 * CashFlowForecast — period cash flow projection with inflow/outflow bands.
 *
 * Displays projected cash position across multiple periods with separate
 * inflow (receivables, subscriptions) and outflow (payroll, vendors, tax)
 * bars, a net position line, and a runway indicator showing how many
 * months of runway remain at current burn rate.
 *
 * Inspired by Treasury Prime and Brex's cash management dashboards.
 * CFOs and treasurers use this exact view for liquidity planning.
 */
export const CashFlowForecast = defineComponent({
  name: 'CashFlowForecast',
  description: 'Cash flow projection with inflow/outflow bars, net position, and runway indicator.',
  category: 'data-display',
  tags: ['finance', 'cash-flow', 'forecast', 'treasury', 'liquidity'],
  props: z.object({
    title: z.string().min(1),
    currency: z.string().default('USD'),
    currentBalance: z.number(),
    periods: z.array(z.object({
      label: z.string().min(1),
      inflow: z.number().min(0),
      outflow: z.number().min(0),
      netPosition: z.number(),
    })).min(2, 'At least two forecast periods are required.'),
    runwayMonths: z.number().min(0).optional(),
    burnRate: z.number().min(0).optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    danger: 'token:danger',
    accent: 'token:accent',
  },
  accessibility: {
    role: 'figure',
    ariaLabel: 'Cash flow forecast',
    announceOnUpdate: false,
  },
  states: {
    loading: 'CashFlowForecastLoading',
    error: 'CashFlowForecastError',
    empty: 'CashFlowForecastEmpty',
    ready: 'CashFlowForecast',
  },
  examples: [
    {
      intent: 'Show 6-month cash flow forecast for Meridian Pay',
      props: {
        title: '6-Month Cash Flow Forecast',
        currency: 'USD',
        currentBalance: 4200000,
        periods: [
          { label: 'Apr 2024', inflow: 1800000, outflow: 1350000, netPosition: 4650000 },
          { label: 'May 2024', inflow: 1650000, outflow: 1400000, netPosition: 4900000 },
          { label: 'Jun 2024', inflow: 2100000, outflow: 1550000, netPosition: 5450000 },
          { label: 'Jul 2024', inflow: 1750000, outflow: 1600000, netPosition: 5600000 },
          { label: 'Aug 2024', inflow: 1900000, outflow: 1500000, netPosition: 6000000 },
          { label: 'Sep 2024', inflow: 2200000, outflow: 1700000, netPosition: 6500000 },
        ],
        runwayMonths: 18.4,
        burnRate: 228000,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 6. FeeSchedule
// ---------------------------------------------------------------------------

/**
 * FeeSchedule — tiered pricing structure with volume thresholds.
 *
 * Displays a fee/pricing table showing tiered rate structures based on
 * transaction volume. Each tier has a volume range, per-transaction rate,
 * flat fee, and the customer's current tier is highlighted. Includes
 * estimated monthly cost based on current volume.
 *
 * Every payment processor (Stripe, Square, Adyen) publishes exactly this
 * kind of tiered pricing. Merchants use this view to understand their
 * effective rate and plan for volume-based tier upgrades.
 */
export const FeeSchedule = defineComponent({
  name: 'FeeSchedule',
  description: 'Tiered pricing table with volume thresholds, per-transaction rates, and current tier highlight.',
  category: 'data-display',
  tags: ['finance', 'pricing', 'fees', 'tiers', 'billing'],
  props: z.object({
    title: z.string().min(1),
    tiers: z.array(z.object({
      name: z.string().min(1),
      volumeMin: z.number().int().min(0),
      volumeMax: z.number().int().nullable(),
      ratePercentage: z.number().min(0).max(100),
      flatFee: z.number().min(0),
      currency: z.string().default('USD'),
    })).min(1, 'At least one pricing tier is required.'),
    currentTierIndex: z.number().int().min(0),
    currentMonthlyVolume: z.number().int().min(0),
    estimatedMonthlyCost: z.number().min(0).optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    accent: 'token:accent',
    success: 'token:success',
  },
  accessibility: {
    role: 'table',
    ariaLabel: 'Fee schedule',
    announceOnUpdate: false,
  },
  states: {
    loading: 'FeeScheduleLoading',
    error: 'FeeScheduleError',
    empty: 'FeeScheduleEmpty',
    ready: 'FeeSchedule',
  },
  examples: [
    {
      intent: 'Show Meridian Pay processing fee tiers',
      props: {
        title: 'Processing Fee Schedule',
        tiers: [
          { name: 'Starter', volumeMin: 0, volumeMax: 10000, ratePercentage: 2.9, flatFee: 0.30, currency: 'USD' },
          { name: 'Growth', volumeMin: 10001, volumeMax: 100000, ratePercentage: 2.5, flatFee: 0.25, currency: 'USD' },
          { name: 'Scale', volumeMin: 100001, volumeMax: 1000000, ratePercentage: 2.2, flatFee: 0.20, currency: 'USD' },
          { name: 'Enterprise', volumeMin: 1000001, volumeMax: null, ratePercentage: 1.8, flatFee: 0.15, currency: 'USD' },
        ],
        currentTierIndex: 1,
        currentMonthlyVolume: 47200,
        estimatedMonthlyCost: 1205.00,
      },
    },
  ],
});

/**
 * All Meridian Pay (Finance) domain component contracts.
 *
 * Spread into the playground registry and system prompt manifest.
 */
export const financeContracts = [
  TransactionLedger,
  RevenueChart,
  ComplianceAlert,
  RiskScorecard,
  CashFlowForecast,
  FeeSchedule,
] as const;
