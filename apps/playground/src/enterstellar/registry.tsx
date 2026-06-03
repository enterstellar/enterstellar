/**
 * @module playground/enterstellar/registry
 * @description Production demo component registry for the Enterstellar Playground.
 *
 * Defines 39 real-world, visually impressive components using the full Enterstellar
 * pipeline: `defineComponent()` → `createRegistry()`. Each component has:
 *
 * - Zod v4 prop schema with meaningful constraints
 * - Design tokens (symbolic `token:*` references, resolved per scene theme)
 * - All 4 lifecycle states (loading, error, empty, ready)
 * - Accessibility configuration (ARIA role + label)
 * - At least 1 example with intent + props
 *
 * **Components (8):**
 * 1. MetricCard — Dashboard metric with trend and sparkline
 * 2. DataTable — Sortable structured tabular data
 * 3. StatusBadge — Real-time status indicator with pulse
 * 4. UserProfile — Profile card with avatar and stats
 * 5. ActivityFeed — Timeline of events
 * 6. ProgressTracker — Multi-step progress indicator
 * 7. AlertBanner — Dismissible system notification
 * 8. CommandPalette — Searchable keyboard-navigable command list
 * 9. GenericCard — Universal fallback (THE MOAT)
 *
 * **Domain Components (30 — 6 per domain):**
 * - Finance (Meridian Pay): TransactionLedger, RevenueChart, ComplianceAlert, CashFlowForecast, RiskScorecard, FeeSchedule
 * - Medical (VitalSync): PatientTimeline, VitalsMonitor, ClinicalAlert, MedicationSchedule, LabResultsPanel, CareTeamRoster
 * - Commerce (ARC Store): ProductCatalog, OrderPipeline, InventoryTracker, CustomerSegment, ShippingTracker, ReturnsDashboard
 * - SaaS (Nexus CRM): PipelineBoard, DealCard, ActivityTimeline, ForecastGauge, LeadScoreMatrix, IntegrationStatus
 * - Education (Cortex Learn): CourseProgress, StudentAnalytics, AssessmentResults, CurriculumMap, EngagementHeatmap, CertificationTracker
 *
 * **Important:** This file contains ONLY contracts (pure data). Renderers
 * are in `renderers.tsx` per Design Choice R6. The split ensures
 * `@enterstellar-ai/registry` has zero framework imports.
 *
 * @see Bible §5.1 — defineComponent specification
 * @see Design Choices R1–R12 — registration rules
 * @see implementation_plan.md §2.5.1 — Component Registry
 */

import { z } from 'zod';

import { defineComponent, createRegistry } from '@enterstellar-ai/registry';
import type { EnterstellarRegistry } from '@enterstellar-ai/registry';

// Domain-specific component contracts (30 components)
import {
  financeContracts,
  medicalContracts,
  commerceContracts,
  saasContracts,
  educationContracts,
} from './domain-components';

// ---------------------------------------------------------------------------
// 1. MetricCard
// ---------------------------------------------------------------------------

/**
 * MetricCard — classic dashboard metric with animated sparkline.
 *
 * Demonstrates numeric data display with trend indicators. The `sparkline`
 * prop accepts an array of numbers for inline trend visualization.
 * The `trend` enum drives the visual treatment (green up / red down / gray flat).
 */
const MetricCard = defineComponent({
  name: 'MetricCard',
  description: 'Dashboard metric card with value, trend indicator, and optional sparkline.',
  category: 'data-display',
  tags: ['metric', 'card', 'dashboard', 'kpi', 'stats'],
  props: z.object({
    label: z.string().min(1, 'Metric label is required.'),
    value: z.union([z.string(), z.number()]),
    unit: z.string().optional(),
    trend: z.enum(['up', 'down', 'flat']).optional(),
    sparkline: z.array(z.number()).max(20, 'Sparkline supports max 20 data points.').optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    accent: 'token:accent',
    trendUp: 'token:success',
    trendDown: 'token:danger',
  },
  accessibility: {
    role: 'status',
    ariaLabel: 'Metric card',
    announceOnUpdate: true,
  },
  states: {
    loading: 'MetricCardLoading',
    error: 'MetricCardError',
    empty: 'MetricCardEmpty',
    ready: 'MetricCard',
  },
  examples: [
    {
      intent: 'Show me server CPU usage at 72%',
      props: {
        label: 'CPU Usage',
        value: 72,
        unit: '%',
        trend: 'up',
        sparkline: [45, 52, 48, 61, 58, 72],
      },
    },
    {
      intent: 'Show monthly revenue of $1.2M',
      props: {
        label: 'Monthly Revenue',
        value: '$1.2M',
        trend: 'up',
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 2. DataTable
// ---------------------------------------------------------------------------

/**
 * DataTable — structured tabular data with sortable columns.
 *
 * Demonstrates complex nested props (columns + rows) with Zod array
 * validation. The `sortable` flag enables client-side column sorting
 * in the interactive renderer.
 */
const DataTable = defineComponent({
  name: 'DataTable',
  description: 'Sortable data table with typed columns and rows for structured data display.',
  category: 'data-display',
  tags: ['table', 'data', 'grid', 'list', 'sortable'],
  props: z.object({
    columns: z.array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        align: z.enum(['left', 'center', 'right']).optional(),
      }),
    ).min(1, 'At least one column is required.'),
    rows: z.array(
      z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    ),
    sortable: z.boolean().optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    headerBg: 'token:surface',
    rowHover: 'token:accent',
  },
  accessibility: {
    role: 'table',
    ariaLabel: 'Data table',
    announceOnUpdate: false,
  },
  states: {
    loading: 'DataTableLoading',
    error: 'DataTableError',
    empty: 'DataTableEmpty',
    ready: 'DataTable',
  },
  examples: [
    {
      intent: 'Show a table of recent transactions',
      props: {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'description', label: 'Description' },
          { key: 'amount', label: 'Amount', align: 'right' },
          { key: 'status', label: 'Status' },
        ],
        rows: [
          { date: '2026-04-10', description: 'Wire Transfer', amount: '$12,400', status: 'Completed' },
          { date: '2026-04-09', description: 'Invoice #1042', amount: '$3,200', status: 'Pending' },
          { date: '2026-04-08', description: 'Subscription', amount: '$99', status: 'Completed' },
        ],
        sortable: true,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 3. StatusBadge
// ---------------------------------------------------------------------------

/**
 * StatusBadge — real-time status indicator with optional pulse animation.
 *
 * Demonstrates feedback pattern with enum-driven visual states.
 * The `pulse` flag adds a CSS animation for live status indicators.
 */
const StatusBadge = defineComponent({
  name: 'StatusBadge',
  description: 'Real-time status indicator with colored dot and optional pulse animation.',
  category: 'feedback',
  tags: ['status', 'badge', 'indicator', 'health', 'online'],
  props: z.object({
    status: z.enum(['online', 'offline', 'warning', 'error', 'maintenance', 'stable', 'critical']),
    label: z.string().min(1, 'Status label is required.'),
    pulse: z.boolean().optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    statusOnline: 'token:success',
    statusOffline: 'token:text-secondary',
    statusWarning: 'token:warning',
    statusError: 'token:danger',
  },
  accessibility: {
    role: 'status',
    ariaLabel: 'Status indicator',
    announceOnUpdate: true,
  },
  states: {
    loading: 'StatusBadgeLoading',
    error: 'StatusBadgeError',
    empty: 'StatusBadgeEmpty',
    ready: 'StatusBadge',
  },
  examples: [
    {
      intent: 'Show system health status as online',
      props: { status: 'online', label: 'All Systems Operational', pulse: true },
    },
    {
      intent: 'Show database status as warning',
      props: { status: 'warning', label: 'High Latency Detected', pulse: true },
    },
  ],
});

// ---------------------------------------------------------------------------
// 4. UserProfile
// ---------------------------------------------------------------------------

/**
 * UserProfile — profile card with avatar, role, and stats.
 *
 * Demonstrates compound data display with an avatar image URL,
 * nested stats array, and text hierarchy.
 */
const UserProfile = defineComponent({
  name: 'UserProfile',
  description: 'User profile card with avatar, name, role, and key statistics.',
  category: 'data-display',
  tags: ['profile', 'user', 'avatar', 'card', 'account'],
  props: z.object({
    name: z.string().min(1, 'User name is required.'),
    role: z.string().min(1, 'Role is required.'),
    avatar: z.string().optional(),
    stats: z.array(
      z.object({
        label: z.string().min(1),
        value: z.union([z.string(), z.number()]),
      }),
    ).optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    accent: 'token:accent',
    avatarBg: 'token:surface',
  },
  accessibility: {
    role: 'article',
    ariaLabel: 'User profile',
    announceOnUpdate: false,
  },
  states: {
    loading: 'UserProfileLoading',
    error: 'UserProfileError',
    empty: 'UserProfileEmpty',
    ready: 'UserProfile',
  },
  examples: [
    {
      intent: 'Show user profile for Sarah Chen',
      props: {
        name: 'Sarah Chen',
        role: 'Senior Engineer',
        avatar: 'https://i.pravatar.cc/150?u=sarah',
        stats: [
          { label: 'Projects', value: 12 },
          { label: 'Commits', value: 847 },
          { label: 'Reviews', value: 234 },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 5. ActivityFeed
// ---------------------------------------------------------------------------

/**
 * ActivityFeed — timeline of events with timestamps and user attribution.
 *
 * Demonstrates list rendering with structured entries. Each entry has
 * a timestamp, action description, and user name for attribution.
 */
const ActivityFeed = defineComponent({
  name: 'ActivityFeed',
  description: 'Chronological activity feed with timestamped, user-attributed events.',
  category: 'data-display',
  tags: ['activity', 'feed', 'timeline', 'events', 'log'],
  props: z.object({
    entries: z.array(
      z.object({
        timestamp: z.string().min(1),
        action: z.string().min(1),
        user: z.string().min(1),
      }),
    ).min(1, 'At least one entry is required.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    timelineDot: 'token:accent',
    timelineLine: 'token:card-border',
  },
  accessibility: {
    role: 'log',
    ariaLabel: 'Activity feed',
    announceOnUpdate: true,
  },
  states: {
    loading: 'ActivityFeedLoading',
    error: 'ActivityFeedError',
    empty: 'ActivityFeedEmpty',
    ready: 'ActivityFeed',
  },
  examples: [
    {
      intent: 'Show recent deployment activity',
      props: {
        entries: [
          { timestamp: '2 min ago', action: 'Deployed v2.4.1 to production', user: 'Sarah Chen' },
          { timestamp: '15 min ago', action: 'Merged PR #847: Fix auth flow', user: 'Alex Kim' },
          { timestamp: '1 hour ago', action: 'Created branch feature/dashboard', user: 'Jordan Lee' },
          { timestamp: '3 hours ago', action: 'Updated CI pipeline config', user: 'Sarah Chen' },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 6. ProgressTracker
// ---------------------------------------------------------------------------

/**
 * ProgressTracker — multi-step progress indicator.
 *
 * Demonstrates ordinal progress visualization with step labels
 * and a `current` index. Steps before `current` are complete,
 * the `current` step is active, and subsequent steps are pending.
 */
const ProgressTracker = defineComponent({
  name: 'ProgressTracker',
  description: 'Multi-step progress indicator with labeled stages and current position.',
  category: 'feedback',
  tags: ['progress', 'steps', 'tracker', 'wizard', 'onboarding'],
  props: z.object({
    title: z.string().min(1, 'Progress title is required.'),
    steps: z.array(z.string().min(1)).min(2, 'At least 2 steps are required.'),
    current: z.number().int().min(0, 'Current step must be >= 0.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    stepComplete: 'token:success',
    stepActive: 'token:accent',
    stepPending: 'token:card-border',
  },
  accessibility: {
    role: 'progressbar',
    ariaLabel: 'Progress tracker',
    announceOnUpdate: true,
  },
  states: {
    loading: 'ProgressTrackerLoading',
    error: 'ProgressTrackerError',
    empty: 'ProgressTrackerEmpty',
    ready: 'ProgressTracker',
  },
  examples: [
    {
      intent: 'Show onboarding progress at step 3 of 5',
      props: {
        title: 'Account Setup',
        steps: ['Create Account', 'Verify Email', 'Set Profile', 'Connect Team', 'Launch'],
        current: 2,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 7. AlertBanner
// ---------------------------------------------------------------------------

/**
 * AlertBanner — dismissible system notification banner.
 *
 * Demonstrates feedback pattern with severity-driven styling.
 * The `dismissible` flag enables a close button that removes the
 * banner from the DOM (ephemeral React state — never leaks into pipeline).
 */
const AlertBanner = defineComponent({
  name: 'AlertBanner',
  description: 'Dismissible alert banner with severity levels for system notifications.',
  category: 'feedback',
  tags: ['alert', 'banner', 'notification', 'warning', 'error', 'info'],
  props: z.object({
    severity: z.enum(['info', 'success', 'warning', 'error', 'critical']),
    title: z.string().min(1, 'Alert title is required.'),
    message: z.string().min(1, 'Alert message is required.'),
    dismissible: z.boolean().optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    severityInfo: 'token:accent',
    severitySuccess: 'token:success',
    severityWarning: 'token:warning',
    severityError: 'token:danger',
  },
  accessibility: {
    role: 'alert',
    ariaLabel: 'System notification',
    announceOnUpdate: true,
  },
  states: {
    loading: 'AlertBannerLoading',
    error: 'AlertBannerError',
    empty: 'AlertBannerEmpty',
    ready: 'AlertBanner',
  },
  examples: [
    {
      intent: 'Show a critical security alert',
      props: {
        severity: 'critical',
        title: 'Security Alert',
        message: 'Unusual login activity detected from IP 192.168.1.42. Please verify your recent sessions.',
        dismissible: true,
      },
    },
    {
      intent: 'Show an info banner about scheduled maintenance',
      props: {
        severity: 'info',
        title: 'Scheduled Maintenance',
        message: 'Systems will be briefly unavailable on April 15 from 2:00-4:00 AM UTC.',
        dismissible: true,
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 8. CommandPalette
// ---------------------------------------------------------------------------

/**
 * CommandPalette — searchable, keyboard-navigable command list.
 *
 * Demonstrates navigation pattern with interactive search and
 * keyboard controls (↑↓ for navigation, Enter for selection).
 * The `commands` array provides the full command set; the renderer
 * handles client-side filtering based on search input.
 */
const CommandPalette = defineComponent({
  name: 'CommandPalette',
  description: 'Searchable command palette with keyboard navigation and optional shortcuts.',
  category: 'navigation',
  tags: ['command', 'palette', 'search', 'navigation', 'keyboard', 'menu'],
  props: z.object({
    commands: z.array(
      z.object({
        label: z.string().min(1),
        action: z.string().min(1),
        shortcut: z.string().optional(),
        group: z.string().optional(),
      }),
    ).min(1, 'At least one command is required.'),
    placeholder: z.string().optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    searchBg: 'token:surface',
    highlightBg: 'token:accent',
    shortcutBg: 'token:surface',
  },
  accessibility: {
    role: 'listbox',
    ariaLabel: 'Command palette',
    announceOnUpdate: false,
  },
  states: {
    loading: 'CommandPaletteLoading',
    error: 'CommandPaletteError',
    empty: 'CommandPaletteEmpty',
    ready: 'CommandPalette',
  },
  examples: [
    {
      intent: 'Show available admin commands',
      props: {
        commands: [
          { label: 'Deploy to Production', action: 'deploy:prod', shortcut: '⌘⇧D', group: 'Deployment' },
          { label: 'Rollback Release', action: 'deploy:rollback', shortcut: '⌘⇧R', group: 'Deployment' },
          { label: 'View Logs', action: 'logs:view', shortcut: '⌘L', group: 'Monitoring' },
          { label: 'Clear Cache', action: 'cache:clear', group: 'Maintenance' },
          { label: 'Invite Team Member', action: 'team:invite', group: 'Team' },
          { label: 'API Key Settings', action: 'settings:api', shortcut: '⌘,', group: 'Settings' },
        ],
        placeholder: 'Type a command...',
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 9. GenericCard (Fallback)
// ---------------------------------------------------------------------------

/**
 * GenericCard — general-purpose card component.
 *
 * Crucially acts as the Enterstellar compiler's default fallback component when
 * an intent repeatedly fails validation (ENS-3004). Because all props are
 * optional, it gracefully accepts any unrecognized data without crashing.
 */
const GenericCard = defineComponent({
  name: 'GenericCard',
  description: 'General-purpose card for fallback or generic content display.',
  category: 'data-display',
  tags: ['card', 'generic', 'layout', 'fallback', 'error'],
  props: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    body: z.string().optional(),
    imageUrl: z.string().optional(),
    actionLabel: z.string().optional(),
    actionUrl: z.string().optional(),
    variant: z.enum(['default', 'outlined', 'elevated']).optional(),
    // Compiler fallback instrumentation (C6)
    originalComponent: z.string().optional(),
    originalProps: z.record(z.string(), z.unknown()).optional(),
    errors: z.array(
      z.object({
        code: z.string(),
        message: z.string(),
        path: z.string(),
      })
    ).optional(),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    titleColor: 'token:text-primary',
    subtitleColor: 'token:text-secondary',
    borderColor: 'token:card-border',
  },
  accessibility: {
    role: 'article',
    ariaLabel: 'Content card',
    announceOnUpdate: false,
  },
  states: {
    loading: 'GenericCardLoading',
    error: 'GenericCardError',
    empty: 'GenericCardEmpty',
    ready: 'GenericCard',
  },
  examples: [
    {
      intent: 'Show information card',
      props: { title: 'System Message', variant: 'default' },
    },
  ],
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * The production playground component registry.
 *
 * Contains all 39 demo components. Passed to `<Provider registry={...}>`
 * in the playground layout. The provider auto-creates the compiler from
 * this registry (RE1).
 *
 * **Design tokens** declared here are the global token set. Scene-specific
 * token overrides are handled via CSS custom property scoping (§3.7),
 * not via registry reconfiguration.
 *
 * @see Design Choice R1 — plain object with closures
 * @see Design Choice R17 — internal Map for O(1) lookups
 */
export const playgroundRegistry: EnterstellarRegistry = createRegistry({
  components: [
    MetricCard,
    DataTable,
    StatusBadge,
    UserProfile,
    ActivityFeed,
    ProgressTracker,
    AlertBanner,
    CommandPalette,
    GenericCard,
    // Domain components (30)
    ...financeContracts,
    ...medicalContracts,
    ...commerceContracts,
    ...saasContracts,
    ...educationContracts,
  ],
  designTokens: {
    'card-bg': 'token:card-bg',
    'card-border': 'token:card-border',
    'text-primary': 'token:text-primary',
    'text-secondary': 'token:text-secondary',
    'surface': 'token:surface',
    'accent': 'token:accent',
    'success': 'token:success',
    'danger': 'token:danger',
    'warning': 'token:warning',
  },
});

/**
 * All 39 component contracts exported as an array.
 *
 * Used by `generateManifest()` in the system prompt builder
 * to create the compact manifest injected into the LLM prompt.
 */
export const playgroundContracts = [
  MetricCard,
  DataTable,
  StatusBadge,
  UserProfile,
  ActivityFeed,
  ProgressTracker,
  AlertBanner,
  CommandPalette,
  GenericCard,
  // Domain components (30)
  ...financeContracts,
  ...medicalContracts,
  ...commerceContracts,
  ...saasContracts,
  ...educationContracts,
] as const;
