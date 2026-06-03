/**
 * @module @enterstellar-ai/forge/templates/builtin
 * @description The 7 pre-approved LocalForge template schemas.
 *
 * Each template is a declarative JSON schema describing a layout pattern.
 * Templates define: dynamic slots (prop surface), default design tokens,
 * lifecycle state renderers, and accessibility defaults.
 *
 * Templates are NOT React components — they are pure data. Each renderer
 * interprets the schema per platform (L15, F1).
 *
 * **The 7 patterns:**
 * | Pattern | Use Case |
 * |:--------|:---------|
 * | `card` | Single-entity summary (patient card, product card) |
 * | `list` | Ordered collection of items |
 * | `table` | Tabular data with rows and columns |
 * | `chart` | Data visualization (bar, line, pie) |
 * | `form` | Input collection with fields |
 * | `detail` | Full-page entity detail view |
 * | `badge` | Status indicator or label |
 *
 * @see Design Choice F2 — 7 pre-approved patterns.
 * @see Design Choice F4 — shipped inside `@enterstellar-ai/forge`, not a separate package.
 */

import type { ForgeTemplate } from '../types.js';

// ---------------------------------------------------------------------------
// Card Template
// ---------------------------------------------------------------------------

/**
 * Card template — single-entity summary.
 *
 * Used for patient cards, product cards, user profiles, and any single-entity
 * overview. Typically rendered as a bordered/shadowed container with title,
 * subtitle, and key-value content.
 *
 * @see Design Choice F2 — decision tree routes `data-display` category here.
 */
const CARD_TEMPLATE: ForgeTemplate = {
    name: 'card',
    categories: ['data-display', 'clinical'],
    description: 'Single-entity summary card with title, subtitle, and content slots.',
    slots: [
        { name: 'title', type: 'string', required: true, description: 'Primary heading for the card.' },
        { name: 'subtitle', type: 'string', required: false, description: 'Secondary heading or context line.' },
        { name: 'content', type: 'record', required: false, description: 'Key-value pairs for card body.' },
        { name: 'status', type: 'string', required: false, description: 'Status indicator text.' },
        { name: 'actions', type: 'string[]', required: false, description: 'Action button labels.' },
    ],
    tokens: {
        background: 'token:surface',
        border: 'token:border',
        shadow: 'token:shadow-sm',
        titleColor: 'token:text-primary',
        subtitleColor: 'token:text-secondary',
    },
    states: {
        loading: 'CardSkeleton',
        error: 'CardError',
        empty: 'CardEmpty',
        ready: 'Card',
    },
    accessibility: {
        role: 'article',
        ariaLabel: '{name} card',
        announceOnUpdate: false,
    },
};

// ---------------------------------------------------------------------------
// List Template
// ---------------------------------------------------------------------------

/**
 * List template — ordered collection of items.
 *
 * Used for patient lists, search results, notification feeds, and task lists.
 * Renders as a vertical stack of items with optional grouping.
 */
const LIST_TEMPLATE: ForgeTemplate = {
    name: 'list',
    categories: ['data-display', 'navigation', 'layout'],
    description: 'Ordered collection of items with optional grouping.',
    slots: [
        { name: 'items', type: 'string[]', required: true, description: 'Array of item labels or identifiers.' },
        { name: 'heading', type: 'string', required: false, description: 'List heading.' },
        { name: 'emptyMessage', type: 'string', required: false, description: 'Message shown when items array is empty.' },
        { name: 'selectable', type: 'boolean', required: false, description: 'Whether items are selectable.' },
    ],
    tokens: {
        background: 'token:surface',
        itemBorder: 'token:border-subtle',
        itemHover: 'token:surface-hover',
        textColor: 'token:text-primary',
    },
    states: {
        loading: 'ListSkeleton',
        error: 'ListError',
        empty: 'ListEmpty',
        ready: 'List',
    },
    accessibility: {
        role: 'list',
        ariaLabel: '{name} list',
        announceOnUpdate: true,
    },
};

// ---------------------------------------------------------------------------
// Table Template
// ---------------------------------------------------------------------------

/**
 * Table template — tabular data with rows and columns.
 *
 * Used for data grids, comparison tables, lab results, and financial reports.
 * Renders as structured rows with defined columns.
 */
const TABLE_TEMPLATE: ForgeTemplate = {
    name: 'table',
    categories: ['data-display', 'admin'],
    description: 'Tabular data display with columns, rows, and optional sorting.',
    slots: [
        { name: 'columns', type: 'string[]', required: true, description: 'Column header labels.' },
        { name: 'caption', type: 'string', required: false, description: 'Table caption for accessibility.' },
        { name: 'sortable', type: 'boolean', required: false, description: 'Whether columns are sortable.' },
        { name: 'striped', type: 'boolean', required: false, description: 'Whether to use alternating row colors.' },
    ],
    tokens: {
        background: 'token:surface',
        headerBackground: 'token:surface-elevated',
        border: 'token:border',
        textColor: 'token:text-primary',
        headerTextColor: 'token:text-secondary',
    },
    states: {
        loading: 'TableSkeleton',
        error: 'TableError',
        empty: 'TableEmpty',
        ready: 'Table',
    },
    accessibility: {
        role: 'table',
        ariaLabel: '{name} table',
        announceOnUpdate: false,
    },
};

// ---------------------------------------------------------------------------
// Chart Template
// ---------------------------------------------------------------------------

/**
 * Chart template — data visualization.
 *
 * Used for trend charts, distribution visualizations, and comparative analysis.
 * The actual rendering engine (Chart.js, D3, etc.) is platform-specific —
 * this template only declares the data contract.
 */
const CHART_TEMPLATE: ForgeTemplate = {
    name: 'chart',
    categories: ['data-display', 'clinical'],
    description: 'Data visualization chart with configurable type and data slots.',
    slots: [
        { name: 'chartType', type: 'string', required: true, description: 'Chart type: bar, line, pie, area, scatter.' },
        { name: 'title', type: 'string', required: false, description: 'Chart title.' },
        { name: 'xLabel', type: 'string', required: false, description: 'X-axis label.' },
        { name: 'yLabel', type: 'string', required: false, description: 'Y-axis label.' },
        { name: 'showLegend', type: 'boolean', required: false, description: 'Whether to display the legend.' },
    ],
    tokens: {
        background: 'token:surface',
        axisColor: 'token:text-secondary',
        gridColor: 'token:border-subtle',
        primaryColor: 'token:accent',
        secondaryColor: 'token:accent-secondary',
    },
    states: {
        loading: 'ChartSkeleton',
        error: 'ChartError',
        empty: 'ChartEmpty',
        ready: 'Chart',
    },
    accessibility: {
        role: 'img',
        ariaLabel: '{name} chart',
        announceOnUpdate: false,
    },
};

// ---------------------------------------------------------------------------
// Form Template
// ---------------------------------------------------------------------------

/**
 * Form template — input collection with fields.
 *
 * Used for data entry, settings panels, search filters, and clinical forms.
 * Generates contracts with field-level slots for dynamic form construction.
 */
const FORM_TEMPLATE: ForgeTemplate = {
    name: 'form',
    categories: ['form', 'admin'],
    description: 'Input collection form with configurable fields and validation.',
    slots: [
        { name: 'fields', type: 'string[]', required: true, description: 'Field names for the form.' },
        { name: 'title', type: 'string', required: false, description: 'Form title.' },
        { name: 'submitLabel', type: 'string', required: false, description: 'Submit button label.' },
        { name: 'cancelLabel', type: 'string', required: false, description: 'Cancel button label.' },
        { name: 'readonly', type: 'boolean', required: false, description: 'Whether the form is read-only.' },
    ],
    tokens: {
        background: 'token:surface',
        inputBorder: 'token:border',
        inputFocus: 'token:accent',
        labelColor: 'token:text-secondary',
        errorColor: 'token:danger',
    },
    states: {
        loading: 'FormSkeleton',
        error: 'FormError',
        empty: 'FormEmpty',
        ready: 'Form',
    },
    accessibility: {
        role: 'form',
        ariaLabel: '{name} form',
        announceOnUpdate: false,
    },
};

// ---------------------------------------------------------------------------
// Detail Template
// ---------------------------------------------------------------------------

/**
 * Detail template — full entity detail view.
 *
 * Used for patient profiles, product details, order details, and any
 * full-page or full-panel entity display with multiple sections.
 */
const DETAIL_TEMPLATE: ForgeTemplate = {
    name: 'detail',
    categories: ['data-display', 'clinical', 'admin'],
    description: 'Full entity detail view with sections and metadata.',
    slots: [
        { name: 'title', type: 'string', required: true, description: 'Entity name or primary identifier.' },
        { name: 'subtitle', type: 'string', required: false, description: 'Secondary identifier or context.' },
        { name: 'sections', type: 'string[]', required: false, description: 'Section names for the detail view.' },
        { name: 'metadata', type: 'record', required: false, description: 'Key-value metadata pairs.' },
        { name: 'editable', type: 'boolean', required: false, description: 'Whether inline editing is enabled.' },
    ],
    tokens: {
        background: 'token:surface',
        sectionBorder: 'token:border-subtle',
        titleColor: 'token:text-primary',
        metadataColor: 'token:text-secondary',
        accentColor: 'token:accent',
    },
    states: {
        loading: 'DetailSkeleton',
        error: 'DetailError',
        empty: 'DetailEmpty',
        ready: 'Detail',
    },
    accessibility: {
        role: 'article',
        ariaLabel: '{name} detail view',
        announceOnUpdate: true,
    },
};

// ---------------------------------------------------------------------------
// Badge Template
// ---------------------------------------------------------------------------

/**
 * Badge template — status indicator or label.
 *
 * Used for status badges, tags, pills, severity indicators, and inline labels.
 * The simplest template — few slots, minimal surface area.
 */
const BADGE_TEMPLATE: ForgeTemplate = {
    name: 'badge',
    categories: ['feedback', 'utility'],
    description: 'Status indicator badge with label and variant.',
    slots: [
        { name: 'label', type: 'string', required: true, description: 'Badge display text.' },
        { name: 'variant', type: 'string', required: false, description: 'Visual variant: info, success, warning, danger, neutral.' },
        { name: 'icon', type: 'string', required: false, description: 'Optional icon name or identifier.' },
    ],
    tokens: {
        background: 'token:surface-elevated',
        textColor: 'token:text-primary',
        borderRadius: 'token:radius-full',
        infoColor: 'token:info',
        successColor: 'token:success',
        warningColor: 'token:warning',
        dangerColor: 'token:danger',
    },
    states: {
        loading: 'BadgeSkeleton',
        error: 'BadgeError',
        empty: 'BadgeEmpty',
        ready: 'Badge',
    },
    accessibility: {
        role: 'status',
        ariaLabel: '{name} badge',
        announceOnUpdate: true,
    },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * The 7 pre-approved LocalForge template schemas.
 *
 * Exported as a readonly tuple for type-safe iteration and as individual
 * constants for direct access. The template registry pre-loads all of
 * these at initialization time.
 *
 * @see Design Choice F2 — 7 pre-approved patterns.
 * @see Design Choice F4 — shipped inside `@enterstellar-ai/forge`.
 */
export const BUILTIN_TEMPLATES: readonly ForgeTemplate[] = [
    CARD_TEMPLATE,
    LIST_TEMPLATE,
    TABLE_TEMPLATE,
    CHART_TEMPLATE,
    FORM_TEMPLATE,
    DETAIL_TEMPLATE,
    BADGE_TEMPLATE,
] as const;

/**
 * Lookup map of built-in template names for quick existence checks.
 *
 * @example
 * ```ts
 * BUILTIN_TEMPLATE_NAMES.has('card'); // true
 * BUILTIN_TEMPLATE_NAMES.has('timeline'); // false
 * ```
 */
export const BUILTIN_TEMPLATE_NAMES: ReadonlySet<string> = new Set(
    BUILTIN_TEMPLATES.map((t) => t.name),
);
