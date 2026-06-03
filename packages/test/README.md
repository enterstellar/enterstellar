# @enterstellar-ai/test

> Intent-based testing framework for Enterstellar GenUI — deterministic harness, assertion helpers, Vitest matchers, VCR fixtures, coverage analysis, and regression detection.

The Enterstellar test harness replaces real LLM calls with deterministic mock responses while keeping the **compiler validation pipeline completely real**. Zod schema validation, design token enforcement, and accessibility auditing all run against the actual `@enterstellar-ai/compiler` — only the intent resolution step is mocked. This means tests catch every category of production bug except LLM misbehavior.

## Quick Start

```ts
import { createTestHarness } from '@enterstellar-ai/test';
import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
import { z } from 'zod';

// 1. Define a component
const PatientVitals = defineComponent({
  name: 'PatientVitals',
  description: 'Displays patient vital signs.',
  category: 'clinical',
  tags: ['vitals'],
  props: z.object({ patientId: z.string(), riskLevel: z.string() }),
  tokens: { background: 'token:surface-primary' },
  accessibility: { role: 'region', ariaLabel: 'Patient vitals', announceOnUpdate: true },
  states: {
    loading: 'Loading vitals…',
    error: 'Failed to load',
    empty: 'No data',
    ready: 'PatientVitals',
  },
  examples: [{ intent: 'show patient vitals', props: { patientId: 'P-001', riskLevel: 'high' } }],
});

// 2. Create registry + test harness
const registry = createRegistry({ components: [PatientVitals] });
const harness = createTestHarness({ registry });

// 3. Mock an intent
harness.mock('show patient vitals', {
  component: 'PatientVitals',
  props: { patientId: 'P-001', riskLevel: 'high' },
  confidence: 1.0,
});

// 4. Resolve and assert
const trace = await harness.resolve('show patient vitals');
harness.expect.componentToBe(trace, 'PatientVitals');

// Compile raw to get CompilationResult for detailed assertions
const result = await harness.compileRaw({
  component: 'PatientVitals',
  props: { patientId: 'P-001', riskLevel: 'high' },
});
harness.expect.compilationToPass(result);
```

### With Vitest Matchers

```ts
import { createTestHarness, enterstellarMatchers } from '@enterstellar-ai/test';
import { expect } from 'vitest';

expect.extend(enterstellarMatchers);

const trace = await harness.resolve('show patient vitals');
expect(trace).toResolveToComponent('PatientVitals');
expect(trace).toHaveLatencyBelow(500);
```

### Auto-Mock Mode

```ts
// Auto-generate mocks for all registry components from their contract examples
harness.autoMock();
const trace = await harness.resolve('show patient vitals');
```

### VCR Fixtures

```ts
import { saveFixtures, loadFixtures } from '@enterstellar-ai/test';

// Record mode — save current results
await saveFixtures(entries, '.enterstellar-fixtures');

// Replay mode — load and use as mock responses
const fixtures = await loadFixtures('.enterstellar-fixtures');
```

## API Reference

### Factory

| Function                    | Returns                   | Description                                                              |
| :-------------------------- | :------------------------ | :----------------------------------------------------------------------- |
| `createTestHarness(config)` | `EnterstellarTestHarness` | Creates a test harness. Accepts `registry` and optional `mockResponses`. |

### `EnterstellarTestHarness` Interface

| Method                      | Returns                      | Description                                                                                              |
| :-------------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------- |
| `resolve(intent, options?)` | `Promise<AgentTrace>`        | Simulates full pipeline: mock lookup → real compilation → synthetic trace. Throws `ENS-5010` if no mock. |
| `compileRaw(raw)`           | `Promise<CompilationResult>` | Compiles raw JSON directly (skips intent resolution).                                                    |
| `mock(intent, response)`    | `void`                       | Register an inline mock for a specific intent string.                                                    |
| `autoMock()`                | `void`                       | Auto-generate mocks from registry component examples.                                                    |
| `expect`                    | `TestAssertions`             | Framework-agnostic assertion helpers.                                                                    |

### Assertion Helpers (`harness.expect.*`)

| Method                              | Error Code | Description                                        |
| :---------------------------------- | :--------- | :------------------------------------------------- |
| `componentToBe(trace, name)`        | `ENS-5001` | Asserts the trace resolved to the named component. |
| `confidenceAbove(trace, threshold)` | `ENS-5002` | Asserts resolution confidence exceeds threshold.   |
| `compilationToPass(result)`         | `ENS-5003` | Asserts compilation result has status `'pass'`.    |
| `tokenCompliant(result)`            | `ENS-5004` | Asserts no design token violations (`ENS-2002`).   |
| `latencyBelow(trace, maxMs)`        | `ENS-5005` | Asserts total pipeline latency below threshold.    |
| `accessibilityToPass(result)`       | `ENS-5006` | Asserts no accessibility violations (`ENS-2003`).  |

### Custom Vitest Matchers

| Matcher                      | Description                                       |
| :--------------------------- | :------------------------------------------------ |
| `toResolveToComponent(name)` | Asserts `AgentTrace` resolved to named component. |
| `toPassValidation()`         | Asserts `CompilationResult` has `status: 'pass'`. |
| `toBeTokenCompliant()`       | Asserts no design token violations.               |
| `toHaveLatencyBelow(maxMs)`  | Asserts total latency below threshold.            |
| `toPassAccessibility()`      | Asserts no accessibility violations.              |

### VCR Fixture Utilities

| Function                           | Returns                   | Description                                                   |
| :--------------------------------- | :------------------------ | :------------------------------------------------------------ |
| `saveFixtures(entries, directory)` | `Promise<void>`           | Saves fixture entries as JSON. Creates directory recursively. |
| `loadFixtures(directory)`          | `Promise<FixtureEntry[]>` | Loads and parses fixture JSON from directory.                 |
| `listFixtureFiles(directory)`      | `Promise<string[]>`       | Lists all `.json` files in a directory.                       |

### Coverage & Regression

| Function                                   | Returns                | Description                                                     |
| :----------------------------------------- | :--------------------- | :-------------------------------------------------------------- |
| `computeIntentCoverage(registry, results)` | `IntentCoverageResult` | Compares registry components against test results for coverage. |
| `detectRegressions(baseline, current)`     | `RegressionEntry[]`    | Identifies component resolution changes between runs.           |

### Exported Types

| Type                      | Description                                                                  |
| :------------------------ | :--------------------------------------------------------------------------- |
| `EnterstellarTestHarness` | Public interface with `resolve`, `compileRaw`, `mock`, `autoMock`, `expect`. |
| `TestHarnessConfig`       | Factory configuration: `registry` + optional `mockResponses`.                |
| `ResolveOptions`          | Optional `context` for a single `resolve()` call.                            |
| `CompileRawInput`         | Raw component + props input for `compileRaw()`.                              |
| `TestAssertions`          | Framework-agnostic assertion helper interface.                               |
| `TestResultRecord`        | Test result for coverage/regression analysis.                                |
| `IntentCoverageResult`    | Coverage report: `covered`, `total`, `percentage`, `uncovered`.              |
| `RegressionEntry`         | Regression entry: `intent`, `baselineComponent`, `currentComponent`.         |
| `FixtureEntry`            | VCR fixture: `intent`, `response` (`ComponentIntent`), `recordedAt`.         |

### Utility Exports

| Export                 | Description                                          |
| :--------------------- | :--------------------------------------------------- |
| `enterstellarMatchers` | Custom Vitest matchers object for `expect.extend()`. |
| `TEST_VERSION`         | Semver string matching `package.json`.               |

## Configuration

### `TestHarnessConfig` (passed to `createTestHarness()`)

| Option          | Type                              | Required | Default | Description                                               |
| :-------------- | :-------------------------------- | :------- | :------ | :-------------------------------------------------------- |
| `registry`      | `EnterstellarRegistry`            | **Yes**  | —       | The registry to resolve and compile against.              |
| `mockResponses` | `Record<string, ComponentIntent>` | No       | `{}`    | Pre-configured mock responses (intent → ComponentIntent). |

### Build Configuration

| File             | Purpose                                                                                    |
| :--------------- | :----------------------------------------------------------------------------------------- |
| `tsconfig.json`  | Extends `tsconfig.base.json` — 15 strict flags. Overrides `composite: false` for tsup DTS. |
| `tsup.config.ts` | Builds ESM + CJS + DTS. Single entry: `src/index.ts`.                                      |

**Peer dependencies:** `@enterstellar-ai/types`, `@enterstellar-ai/registry`, `@enterstellar-ai/compiler`, `zod ^4.3.6`

### Design Choices Applied

| Choice | Description                                                      |
| :----- | :--------------------------------------------------------------- |
| TE1    | Mocks for unit tests, VCR fixtures for integration tests.        |
| TE2    | Inline mock, JSON fixture, and auto-generated modes.             |
| TE3    | Real compiler — only intent resolution is mocked.                |
| TE4    | Broad Vitest matcher set with `.not` negation.                   |
| TE5    | Intent coverage analysis via `computeIntentCoverage()`.          |
| TE7    | Regression detection for LLM upgrades via `detectRegressions()`. |

## See Also

- [Implementation Bible §4.5](../../agent/03-enterstellar-implementation-bible.md) — test harness specification.
- [Design Choices — Module Test](../../agent/04-enterstellar-design-choices.md) — locked decisions TE1–TE7.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
