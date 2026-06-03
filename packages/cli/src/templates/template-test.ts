/**
 * @module @enterstellar-ai/cli/templates/template-test
 * @description Generates `src/tests/enterstellar.test.ts` — example intent-based tests.
 *
 * Produces 3 test cases demonstrating Enterstellar's intent testing workflow:
 *
 * 1. **Resolution test** — Verifies that an intent resolves to the correct component.
 * 2. **Validation pass test** — Verifies that valid props compile successfully.
 * 3. **Validation fail test** — Verifies that invalid props produce correct errors.
 *
 * Uses `createTestHarness()` from `@enterstellar-ai/test` with mock responses so tests
 * are fully deterministic — no real LLM calls.
 *
 * @see Implementation Bible §4.17 — "Example intent-based tests"
 * @see Tasks M3.4 — "3 tests: resolution, validation pass, validation fail"
 */

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates the `src/tests/enterstellar.test.ts` file content for a scaffolded project.
 *
 * The generated file:
 * 1. Imports `createTestHarness` and assertion helpers from `@enterstellar-ai/test`.
 * 2. Imports the project registry.
 * 3. Creates a test harness with mock responses for deterministic testing.
 * 4. Defines 3 test cases covering resolution, pass, and fail scenarios.
 *
 * @returns A TypeScript source string for `src/tests/enterstellar.test.ts`.
 *
 * @example
 * ```ts
 * const content = generateTest();
 * await writeFile('my-app/src/tests/enterstellar.test.ts', content);
 * ```
 */
export function generateTest(): string {
    return `/**
 * Enterstellar Intent-Based Tests
 *
 * These tests demonstrate how to verify that your Enterstellar registry
 * correctly resolves intents to components and compiles valid output.
 *
 * Run with: \`pnpm test\` or \`vitest run\`
 *
 * @see https://enterstellar.dev/docs/testing
 */

import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@enterstellar-ai/test';

import { registry } from '../enterstellar/registry.js';

/**
 * Create a test harness with mock responses.
 *
 * The harness wraps the real registry and compiler but uses
 * mock agent responses so tests are deterministic — no LLM calls.
 */
const harness = createTestHarness({
  registry,
  mocks: [
    {
      intent: 'Show a summary card',
      response: {
        component: 'ExampleCard',
        props: {
          title: 'Test Card',
          body: 'This is a test card rendered by Enterstellar.',
          status: 'active',
        },
      },
    },
    {
      intent: 'Display a list of items',
      response: {
        component: 'ExampleList',
        props: {
          heading: 'Test Items',
          items: [
            { id: '1', label: 'Item One', description: 'First test item' },
            { id: '2', label: 'Item Two', description: 'Second test item' },
          ],
          showFilter: true,
        },
      },
    },
    {
      intent: 'Show invalid data',
      response: {
        component: 'ExampleCard',
        props: {
          // Missing required 'title' and 'body' — should fail validation
        },
      },
    },
  ],
});

describe('Enterstellar Intent Tests', () => {
  // -------------------------------------------------------------------------
  // Test 1: Component Resolution
  // -------------------------------------------------------------------------

  it('resolves "Show a summary card" to ExampleCard', async () => {
    const result = await harness.resolve('Show a summary card');

    expect(result.contract).not.toBeNull();
    expect(result.contract?.name).toBe('ExampleCard');
    expect(result.compiledIntent.component).toBe('ExampleCard');
  });

  // -------------------------------------------------------------------------
  // Test 2: Validation Pass
  // -------------------------------------------------------------------------

  it('compiles valid props for ExampleList successfully', async () => {
    const result = await harness.resolve('Display a list of items');

    expect(result.status).toBe('pass');
    expect(result.errors).toHaveLength(0);
    expect(result.contract?.name).toBe('ExampleList');
  });

  // -------------------------------------------------------------------------
  // Test 3: Validation Fail
  // -------------------------------------------------------------------------

  it('rejects invalid props with compilation errors', async () => {
    const result = await harness.resolve('Show invalid data');

    expect(result.status).toBe('fail');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
`;
}
