/**
 * @module @enterstellar-ai/cli/templates/template-components
 * @description Generates 5 example component files for the scaffolded Enterstellar project.
 *
 * Each component file contains:
 * - A Zod props schema with realistic fields
 * - A `defineComponent()` call producing a valid `ComponentContract`
 * - A React render function (TSX) that uses the props
 *
 * The 5 components cover different `semantics.type` values:
 *
 * | Component       | Type           | Description                          |
 * |:----------------|:---------------|:-------------------------------------|
 * | `ExampleCard`   | `data-display` | Summary card with title, body, badge |
 * | `ExampleList`   | `data-display` | List with items and optional filter  |
 * | `ExampleChart`  | `data-display` | Bar chart with labeled data points   |
 * | `ExampleForm`   | `data-input`   | Simple form with text + select input |
 * | `ExampleDetail` | `data-display` | Detail view with key-value fields    |
 *
 * @see Implementation Bible §4.17 — 5 example components
 * @see Design Choice R1, R4 — defineComponent() and createRegistry()
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A map of filename → file content for all generated component files. */
export interface ComponentFileMap {
    readonly filename: string;
    readonly content: string;
}

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates all 5 example component files for the scaffolded project.
 *
 * Each entry contains the filename (e.g., `ExampleCard.tsx`) and the
 * full TypeScript/TSX source content including imports, Zod schema,
 * `defineComponent()` contract, and the React render function.
 *
 * @returns An array of `{ filename, content }` objects for each component.
 *
 * @example
 * ```ts
 * const components = generateComponents();
 * for (const { filename, content } of components) {
 *   await writeFile(\`src/enterstellar/components/\${filename}\`, content);
 * }
 * ```
 */
export function generateComponents(): readonly ComponentFileMap[] {
    return [
        { filename: 'ExampleCard.tsx', content: generateExampleCard() },
        { filename: 'ExampleList.tsx', content: generateExampleList() },
        { filename: 'ExampleChart.tsx', content: generateExampleChart() },
        { filename: 'ExampleForm.tsx', content: generateExampleForm() },
        { filename: 'ExampleDetail.tsx', content: generateExampleDetail() },
    ];
}

// ---------------------------------------------------------------------------
// ExampleCard — data-display / summary card
// ---------------------------------------------------------------------------

function generateExampleCard(): string {
    return `/**
 * ExampleCard — A summary card component.
 *
 * Displays a title, body text, and optional status badge.
 * Semantic type: \`data-display\`, density: \`low\`.
 */

import React from 'react';
import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

/** Props schema for ExampleCard. */
const ExampleCardProps = z.object({
  title: z.string().describe('Card title displayed at the top.'),
  body: z.string().describe('Main body text content.'),
  status: z.enum(['active', 'inactive', 'pending']).optional()
    .describe('Optional status badge label.'),
  imageUrl: z.string().url().optional()
    .describe('Optional header image URL.'),
});

/** ExampleCard render function. */
function ExampleCardRender(props: z.infer<typeof ExampleCardProps>): React.ReactElement {
  const { title, body, status, imageUrl } = props;

  return (
    <div style={{ border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-lg)', fontFamily: 'var(--font-family-sans)' }}>
      {imageUrl != null && <img src={imageUrl} alt={title} style={{ width: '100%', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--spacing-md)' }} />}
      <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}>{title}</h3>
      {status != null && (
        <span style={{ display: 'inline-block', marginTop: 'var(--spacing-xs)', padding: '2px 8px', fontSize: 'var(--font-size-xs)', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary-base)' }}>
          {status}
        </span>
      )}
      <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-base)', lineHeight: 'var(--font-lineHeight-normal)' }}>{body}</p>
    </div>
  );
}

/** ExampleCard component contract — exported for registry registration. */
export const ExampleCardContract = defineComponent({
  name: 'ExampleCard',
  description: 'A summary card displaying a title, body text, and optional status badge.',
  category: 'data-display',
  tags: ['card', 'summary', 'display'],
  props: ExampleCardProps,
  semantics: {
    type: 'data-display',
    density: 'low',
    importance: 'standard',
    interactivity: 'read-only',
  },
  tokens: {
    background: 'color.background.surface',
    border: 'color.neutral.200',
    title: 'color.text.primary',
    body: 'color.text.secondary',
  },
  states: {
    loading: 'Skeleton card with pulsing placeholder',
    error: 'Error banner with retry prompt',
    empty: 'Empty state with "No data available" message',
    ready: 'Full card with all content rendered',
  },
  dataSource: null,
  accessibility: {
    role: 'article',
    ariaLabel: 'Summary card',
    announceOnUpdate: false,
  },
  auth: null,
  render: ExampleCardRender,
});
`;
}

// ---------------------------------------------------------------------------
// ExampleList — data-display / list
// ---------------------------------------------------------------------------

function generateExampleList(): string {
    return `/**
 * ExampleList — A filterable list component.
 *
 * Displays an array of items with optional search filtering.
 * Semantic type: \`data-display\`, density: \`high\`.
 */

import React from 'react';
import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

/** Props schema for ExampleList. */
const ExampleListProps = z.object({
  heading: z.string().describe('List heading text.'),
  items: z.array(z.object({
    id: z.string().describe('Unique item identifier.'),
    label: z.string().describe('Display label for the item.'),
    description: z.string().optional().describe('Optional secondary text.'),
  })).describe('Array of list items to display.'),
  showFilter: z.boolean().optional().describe('Whether to show the search filter input.'),
});

/** ExampleList render function. */
function ExampleListRender(props: z.infer<typeof ExampleListProps>): React.ReactElement {
  const { heading, items, showFilter } = props;

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)' }}>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-md)' }}>{heading}</h3>
      {showFilter === true && (
        <input
          type="text"
          placeholder="Filter items..."
          aria-label="Filter list items"
          style={{ width: '100%', padding: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)', border: '1px solid var(--color-neutral-300)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-base)' }}
        />
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ padding: 'var(--spacing-sm) 0', borderBottom: '1px solid var(--color-neutral-100)' }}>
            <div style={{ fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)' }}>{item.label}</div>
            {item.description != null && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: '2px' }}>{item.description}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ExampleList component contract — exported for registry registration. */
export const ExampleListContract = defineComponent({
  name: 'ExampleList',
  description: 'A filterable list displaying items with labels and optional descriptions.',
  category: 'data-display',
  tags: ['list', 'filter', 'items'],
  props: ExampleListProps,
  semantics: {
    type: 'data-display',
    density: 'high',
    importance: 'standard',
    interactivity: 'read-only',
  },
  tokens: {
    background: 'color.background.page',
    border: 'color.neutral.100',
    label: 'color.text.primary',
    description: 'color.text.muted',
  },
  states: {
    loading: 'Skeleton list with pulsing rows',
    error: 'Error banner with retry prompt',
    empty: 'Empty state with "No items found" message',
    ready: 'Full list with all items rendered',
  },
  dataSource: null,
  accessibility: {
    role: 'list',
    ariaLabel: 'Item list',
    announceOnUpdate: true,
  },
  auth: null,
  render: ExampleListRender,
});
`;
}

// ---------------------------------------------------------------------------
// ExampleChart — data-display / chart
// ---------------------------------------------------------------------------

function generateExampleChart(): string {
    return `/**
 * ExampleChart — A simple bar chart component.
 *
 * Renders horizontal bars with labels and percentage values.
 * Semantic type: \`data-display\`, density: \`medium\`.
 */

import React from 'react';
import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

/** Props schema for ExampleChart. */
const ExampleChartProps = z.object({
  title: z.string().describe('Chart title.'),
  dataPoints: z.array(z.object({
    label: z.string().describe('Data point label.'),
    value: z.number().min(0).max(100).describe('Value as a percentage (0–100).'),
    color: z.string().optional().describe('Optional bar color override.'),
  })).describe('Array of data points to render as bars.'),
  showValues: z.boolean().optional().describe('Whether to display numeric values on bars.'),
});

/** ExampleChart render function. */
function ExampleChartRender(props: z.infer<typeof ExampleChartProps>): React.ReactElement {
  const { title, dataPoints, showValues } = props;

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)' }}>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-lg)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {dataPoints.map((point, index) => (
          <div key={point.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <span style={{ width: '80px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', textAlign: 'right' }}>{point.label}</span>
            <div style={{ flex: 1, backgroundColor: 'var(--color-neutral-100)', borderRadius: 'var(--radius-full)', height: '24px', overflow: 'hidden' }}>
              <div
                style={{
                  width: \`\${String(point.value)}%\`,
                  height: '100%',
                  backgroundColor: point.color ?? 'var(--color-primary-base)',
                  borderRadius: 'var(--radius-full)',
                  transition: 'width 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: 'var(--spacing-sm)',
                }}
                role="meter"
                aria-valuenow={point.value}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={\`\${point.label}: \${String(point.value)}%\`}
              >
                {showValues !== false && (
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-contrast)', fontWeight: 'var(--font-weight-medium)' }}>
                    {point.value}%
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ExampleChart component contract — exported for registry registration. */
export const ExampleChartContract = defineComponent({
  name: 'ExampleChart',
  description: 'A horizontal bar chart displaying labeled data points with percentage values.',
  category: 'data-display',
  tags: ['chart', 'bar', 'visualization'],
  props: ExampleChartProps,
  semantics: {
    type: 'data-display',
    density: 'medium',
    importance: 'standard',
    interactivity: 'read-only',
  },
  tokens: {
    background: 'color.background.page',
    barFill: 'color.primary.base',
    barTrack: 'color.neutral.100',
    label: 'color.text.secondary',
  },
  states: {
    loading: 'Skeleton bars with pulsing animation',
    error: 'Error banner with retry prompt',
    empty: 'Empty state with "No data to chart" message',
    ready: 'Full chart with all bars rendered',
  },
  dataSource: null,
  accessibility: {
    role: 'img',
    ariaLabel: 'Bar chart',
    announceOnUpdate: false,
  },
  auth: null,
  render: ExampleChartRender,
});
`;
}

// ---------------------------------------------------------------------------
// ExampleForm — data-input / form
// ---------------------------------------------------------------------------

function generateExampleForm(): string {
    return `/**
 * ExampleForm — A simple input form component.
 *
 * Demonstrates a data-input component with text and select fields.
 * Semantic type: \`data-input\`, interactivity: \`editable\`.
 */

import React from 'react';
import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

/** Props schema for ExampleForm. */
const ExampleFormProps = z.object({
  title: z.string().describe('Form heading text.'),
  fields: z.array(z.object({
    name: z.string().describe('Field identifier (used as input name).'),
    label: z.string().describe('Human-readable field label.'),
    type: z.enum(['text', 'email', 'number', 'select']).describe('Input type.'),
    placeholder: z.string().optional().describe('Input placeholder text.'),
    options: z.array(z.string()).optional().describe('Options for select fields.'),
    required: z.boolean().optional().describe('Whether the field is required.'),
  })).describe('Array of form field definitions.'),
  submitLabel: z.string().optional().describe('Submit button label. Defaults to "Submit".'),
});

/** ExampleForm render function. */
function ExampleFormRender(props: z.infer<typeof ExampleFormProps>): React.ReactElement {
  const { title, fields, submitLabel } = props;

  const inputStyle = {
    width: '100%',
    padding: 'var(--spacing-sm)',
    border: '1px solid var(--color-neutral-300)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-base)',
    fontFamily: 'var(--font-family-sans)',
  };

  return (
    <form
      style={{ fontFamily: 'var(--font-family-sans)' }}
      onSubmit={(e) => { e.preventDefault(); }}
    >
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-lg)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        {fields.map((field) => (
          <div key={field.name}>
            <label
              htmlFor={field.name}
              style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color-text-primary)', marginBottom: 'var(--spacing-xs)' }}
            >
              {field.label}
              {field.required === true && <span style={{ color: 'var(--color-error-base)' }}> *</span>}
            </label>
            {field.type === 'select' ? (
              <select id={field.name} name={field.name} required={field.required ?? false} style={inputStyle}>
                <option value="">{field.placeholder ?? 'Select...'}</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                id={field.name}
                name={field.name}
                type={field.type}
                placeholder={field.placeholder ?? ''}
                required={field.required ?? false}
                style={inputStyle}
              />
            )}
          </div>
        ))}
      </div>
      <button
        type="submit"
        style={{
          marginTop: 'var(--spacing-xl)',
          padding: 'var(--spacing-sm) var(--spacing-xl)',
          backgroundColor: 'var(--color-primary-base)',
          color: 'var(--color-primary-contrast)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-base)',
          fontWeight: 'var(--font-weight-medium)',
          cursor: 'pointer',
        }}
      >
        {submitLabel ?? 'Submit'}
      </button>
    </form>
  );
}

/** ExampleForm component contract — exported for registry registration. */
export const ExampleFormContract = defineComponent({
  name: 'ExampleForm',
  description: 'A dynamic form component with configurable text and select fields.',
  category: 'data-input',
  tags: ['form', 'input', 'editable'],
  props: ExampleFormProps,
  semantics: {
    type: 'data-input',
    density: 'medium',
    importance: 'important',
    interactivity: 'editable',
  },
  tokens: {
    background: 'color.background.page',
    border: 'color.neutral.300',
    label: 'color.text.primary',
    button: 'color.primary.base',
  },
  states: {
    loading: 'Skeleton form with pulsing input placeholders',
    error: 'Error banner above form with field-level error messages',
    empty: 'Empty form ready for user input',
    ready: 'Form rendered with all fields and submit button',
  },
  dataSource: null,
  accessibility: {
    role: 'form',
    ariaLabel: 'Input form',
    announceOnUpdate: false,
  },
  auth: null,
  render: ExampleFormRender,
});
`;
}

// ---------------------------------------------------------------------------
// ExampleDetail — data-display / detail view
// ---------------------------------------------------------------------------

function generateExampleDetail(): string {
    return `/**
 * ExampleDetail — A key-value detail view component.
 *
 * Displays structured information as labeled rows.
 * Semantic type: \`data-display\`, density: \`medium\`.
 */

import React from 'react';
import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

/** Props schema for ExampleDetail. */
const ExampleDetailProps = z.object({
  title: z.string().describe('Detail view heading.'),
  subtitle: z.string().optional().describe('Optional subtitle or category.'),
  fields: z.array(z.object({
    label: z.string().describe('Field label (key).'),
    value: z.string().describe('Field value.'),
    emphasis: z.boolean().optional().describe('Whether to emphasize this field.'),
  })).describe('Array of key-value field pairs.'),
  footer: z.string().optional().describe('Optional footer text.'),
});

/** ExampleDetail render function. */
function ExampleDetailRender(props: z.infer<typeof ExampleDetailProps>): React.ReactElement {
  const { title, subtitle, fields, footer } = props;

  return (
    <div style={{ fontFamily: 'var(--font-family-sans)', border: '1px solid var(--color-neutral-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: 'var(--spacing-lg)', borderBottom: '1px solid var(--color-neutral-100)', backgroundColor: 'var(--color-background-surface)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)' }}>{title}</h3>
        {subtitle != null && (
          <p style={{ margin: 0, marginTop: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>{subtitle}</p>
        )}
      </div>
      <dl style={{ margin: 0, padding: 0 }}>
        {fields.map((field, index) => (
          <div
            key={field.label}
            style={{
              display: 'flex',
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderBottom: index < fields.length - 1 ? '1px solid var(--color-neutral-100)' : 'none',
              backgroundColor: index % 2 === 0 ? 'var(--color-background-page)' : 'var(--color-background-surface)',
            }}
          >
            <dt style={{ flex: '0 0 140px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-medium)' }}>
              {field.label}
            </dt>
            <dd style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)', fontWeight: field.emphasis === true ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)' }}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      {footer != null && (
        <div style={{ padding: 'var(--spacing-md) var(--spacing-lg)', borderTop: '1px solid var(--color-neutral-100)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** ExampleDetail component contract — exported for registry registration. */
export const ExampleDetailContract = defineComponent({
  name: 'ExampleDetail',
  description: 'A detail view displaying structured key-value field pairs with optional header and footer.',
  category: 'data-display',
  tags: ['detail', 'fields', 'key-value'],
  props: ExampleDetailProps,
  semantics: {
    type: 'data-display',
    density: 'medium',
    importance: 'standard',
    interactivity: 'read-only',
  },
  tokens: {
    background: 'color.background.page',
    surface: 'color.background.surface',
    border: 'color.neutral.200',
    label: 'color.text.muted',
    value: 'color.text.primary',
  },
  states: {
    loading: 'Skeleton detail rows with pulsing placeholders',
    error: 'Error banner with retry prompt',
    empty: 'Empty state with "No details available" message',
    ready: 'Full detail view with all fields rendered',
  },
  dataSource: null,
  accessibility: {
    role: 'region',
    ariaLabel: 'Detail view',
    announceOnUpdate: false,
  },
  auth: null,
  render: ExampleDetailRender,
});
`;
}
