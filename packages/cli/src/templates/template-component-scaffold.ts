/**
 * @module @enterstellar-ai/cli/templates/template-component-scaffold
 * @description Generates the 4-file scaffold for `enterstellar add component <Name>`.
 *
 * Per Design Choice CLI2, `enterstellar add component PatientVitals` produces:
 *
 * 1. `PatientVitals.contract.ts` — Zod schema + `defineComponent()` contract
 * 2. `PatientVitals.tsx` — React render function stub
 * 3. `PatientVitals.test.ts` — Intent test with `harness.mock()` + `harness.resolve()`
 * 4. `PatientVitals.fixture.json` — Example props fixture
 *
 * All files are production-ready boilerplate — developers modify them,
 * not delete and rewrite them.
 *
 * @see Design Choice CLI2 — `enterstellar add component` scaffolding
 * @see Implementation Bible §4.17
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single scaffolded file with its relative filename and content. */
export interface ScaffoldFile {
    /** Filename relative to the components directory (e.g., `PatientVitals.contract.ts`). */
    readonly filename: string;
    /** Full file content as a string. */
    readonly content: string;
}

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates all 4 scaffold files for a new Enterstellar component.
 *
 * Each file is a complete, compilable source with:
 * - Proper imports referencing Enterstellar packages
 * - Zod schema with placeholder fields ready for customization
 * - A render function that uses the schema-defined props
 * - A test that verifies resolution and compilation
 * - A fixture with matching example prop values
 *
 * @param componentName - PascalCase component name (validated before this call).
 * @returns An array of 4 `ScaffoldFile` objects.
 *
 * @example
 * ```ts
 * const files = generateComponentScaffold('PatientVitals');
 * for (const { filename, content } of files) {
 *   await writeFile(\`src/enterstellar/components/\${filename}\`, content);
 * }
 * ```
 */
export function generateComponentScaffold(
    componentName: string,
): readonly ScaffoldFile[] {
    return [
        {
            filename: `${componentName}.contract.ts`,
            content: generateContract(componentName),
        },
        {
            filename: `${componentName}.tsx`,
            content: generateRender(componentName),
        },
        {
            filename: `${componentName}.test.ts`,
            content: generateComponentTest(componentName),
        },
        {
            filename: `${componentName}.fixture.json`,
            content: generateFixture(componentName),
        },
    ];
}

// ---------------------------------------------------------------------------
// Contract File
// ---------------------------------------------------------------------------

/**
 * Generates `<Name>.contract.ts` — Zod schema + defineComponent().
 *
 * Produces a skeleton contract with:
 * - A Zod object schema with `title` and `description` fields as defaults
 * - Full `defineComponent()` call with all required metadata fields
 * - JSDoc annotations on every field
 * - `render` imported from the companion `.tsx` file
 */
function generateContract(name: string): string {
    return `/**
 * ${name} — Component Contract
 *
 * This file defines the Zod props schema and Enterstellar ComponentContract
 * for the ${name} component. Modify the schema and metadata to match
 * your component's requirements.
 *
 * @see https://enterstellar.dev/docs/contracts
 */

import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

import { ${name}Render } from './${name}.js';

// ---------------------------------------------------------------------------
// Props Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for ${name} props.
 * Customize these fields to match your component's data requirements.
 */
export const ${name}Props = z.object({
  /** Primary heading text. */
  title: z.string().describe('Primary heading text.'),
  /** Descriptive body content. */
  description: z.string().describe('Descriptive body content.'),
});

/** TypeScript type inferred from the Zod schema. */
export type ${name}PropsType = z.infer<typeof ${name}Props>;

// ---------------------------------------------------------------------------
// Component Contract
// ---------------------------------------------------------------------------

/**
 * ${name} component contract.
 * Exported for registration in the Enterstellar registry.
 */
export const ${name}Contract = defineComponent({
  name: '${name}',
  description: 'TODO: Describe what ${name} displays or does.',
  category: 'data-display',
  tags: ['${name.toLowerCase()}'],
  props: ${name}Props,
  semantics: {
    type: 'data-display',
    density: 'medium',
    importance: 'standard',
    interactivity: 'read-only',
  },
  tokens: {
    background: 'color.background.surface',
    text: 'color.text.primary',
    border: 'color.neutral.200',
  },
  states: {
    loading: 'Skeleton placeholder with pulsing animation',
    error: 'Error banner with retry prompt',
    empty: 'Empty state with informative message',
    ready: 'Full component with all content rendered',
  },
  dataSource: null,
  accessibility: {
    role: 'region',
    ariaLabel: '${name}',
    announceOnUpdate: false,
  },
  auth: null,
  render: ${name}Render,
});
`;
}

// ---------------------------------------------------------------------------
// Render File
// ---------------------------------------------------------------------------

/**
 * Generates `<Name>.tsx` — React render function stub.
 *
 * Produces a minimal functional component that renders the props
 * from the companion contract file.
 */
function generateRender(name: string): string {
    return `/**
 * ${name} — Render Function
 *
 * This file contains the React render function for the ${name} component.
 * The props are validated by the Zod schema in ${name}.contract.ts
 * before reaching this function — you can trust the types.
 *
 * @see https://enterstellar.dev/docs/components
 */

import React from 'react';

import type { ${name}PropsType } from './${name}.contract.js';

/**
 * Renders the ${name} component.
 *
 * @param props - Validated props matching the ${name}Props Zod schema.
 * @returns A React element rendering the component.
 */
export function ${name}Render(props: ${name}PropsType): React.ReactElement {
  const { title, description } = props;

  return (
    <div
      style={{
        border: '1px solid var(--color-neutral-200)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-lg)',
        fontFamily: 'var(--font-family-sans)',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          marginTop: 'var(--spacing-sm)',
          fontSize: 'var(--font-size-base)',
          color: 'var(--color-text-secondary)',
          lineHeight: 'var(--font-lineHeight-normal)',
        }}
      >
        {description}
      </p>
    </div>
  );
}
`;
}

// ---------------------------------------------------------------------------
// Test File
// ---------------------------------------------------------------------------

/**
 * Generates `<Name>.test.ts` — intent test with harness.mock().
 *
 * Produces a test that:
 * 1. Creates a test harness with a mock response for this component
 * 2. Resolves an intent and verifies it maps to this component
 * 3. Verifies the compilation passes with valid props
 */
function generateComponentTest(name: string): string {
    const intentPhrase = `Show ${name.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}`;

    return `/**
 * ${name} — Intent Tests
 *
 * Tests that the ${name} component correctly resolves from intents
 * and compiles with valid props.
 *
 * Run with: \`pnpm test\`
 */

import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@enterstellar-ai/test';

import { registry } from '../../enterstellar/registry.js';

const harness = createTestHarness({
  registry,
  mocks: [
    {
      intent: '${intentPhrase}',
      response: {
        component: '${name}',
        props: {
          title: 'Test ${name}',
          description: 'This is a test rendering of ${name}.',
        },
      },
    },
  ],
});

describe('${name}', () => {
  it('resolves intent to ${name} component', async () => {
    const result = await harness.resolve('${intentPhrase}');

    expect(result.contract).not.toBeNull();
    expect(result.contract?.name).toBe('${name}');
  });

  it('compiles valid props successfully', async () => {
    const result = await harness.resolve('${intentPhrase}');

    expect(result.status).toBe('pass');
    expect(result.errors).toHaveLength(0);
  });
});
`;
}

// ---------------------------------------------------------------------------
// Fixture File
// ---------------------------------------------------------------------------

/**
 * Generates `<Name>.fixture.json` — example props.
 *
 * Produces a JSON file with valid prop values that match the
 * default Zod schema (title + description).
 */
function generateFixture(name: string): string {
    const fixture = {
        title: `Example ${name}`,
        description: `This is an example ${name} component with sample data. Replace these values with real content.`,
    };

    return JSON.stringify(fixture, null, 2) + '\n';
}
