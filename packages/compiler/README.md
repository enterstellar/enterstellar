# @enterstellar-ai/compiler

> UI Compiler — schema validation, design token enforcement, accessibility auditing, and **3-tier deterministic self-correction**.

This is the **M1 moat** — the only UI type-checker for AI-generated interfaces. Every `ComponentIntent` from any protocol passes through the compiler before rendering. No bypass, no escape hatch (L3). The compiler is framework-agnostic (L15) and never throws — it always returns a `CompilationResult` with a deterministic status.

## Quick Start

```ts
import { createCompiler } from '@enterstellar-ai/compiler';
import { createRegistry, defineComponent } from '@enterstellar-ai/registry';
import { z } from 'zod';

// 1. Set up registry with components
const registry = createRegistry({ components: [PatientVitals, ...] });

// 2. Create compiler (deterministic correction is ON by default)
const compiler = createCompiler({ registry });

// 3. Compile an intent
const result = await compiler.compile(
  { component: 'PatientVitals', props: { riskLevel: 3 }, confidence: 1.0 },
  { agent: 'gpt-4o' },
);
// result.status === 'pass' | 'corrected' | 'fail'
// result.props — validated, frozen props
// result.provenance — { agent, registry, compiledAt, compilerVersion }
// result.errors — CompilationError[] (empty on 'pass')
// result.correctionTrace — CorrectionTraceEntry[] (when selfCorrection.trace === true)

// 4. Lint mode — errors only, no CompilationResult
const errors = await compiler.lint(intent);

// 5. Custom middleware (HIPAA checks, custom tokens, etc.)
compiler.use(async (context, next) => {
  if (containsPHI(context.props)) {
    context.errors.push(createHipaaError(context));
    return context; // short-circuit
  }
  return next();
});
```

## Self-Correction Architecture (3-Tier)

The compiler implements a **3-tier** self-correction architecture that runs automatically on every `compile()` call. Each tier operates in strict priority order — lower tiers are always attempted before higher tiers.

### Tier 1 — Deterministic Correction (pure, zero-latency)

Five pure strategies applied in cascade order for each error:

| Strategy                | What It Fixes                                                 | Example                             |
| :---------------------- | :------------------------------------------------------------ | :---------------------------------- |
| **Type Coercion**       | `string ↔ number`, `number → string`, `boolean → string`      | `"72"` → `72`                       |
| **Boolean Coercion**    | `"yes"`, `"on"`, `1` → `true`; `"no"`, `"off"`, `0` → `false` | `"yes"` → `true`                    |
| **Default Extraction**  | Missing field with `z.default()`                              | `undefined` → `"active"`            |
| **Enum Nearest Match**  | Levenshtein typo correction within threshold                  | `"defualt"` → `"default"`           |
| **Token Nearest Match** | Invalid token reference resolved to nearest valid token       | `"token:denger"` → `"token:danger"` |

**Safety rules (§3.5):** Rejects `string → string[]`, `object → anything`, empty string → `0`, NaN, Infinity.

### Tier 2 — Template Correction (contract examples)

Falls back to `contract.examples[0].props` for **missing fields only** (`fix.was === undefined`). Includes a staleness guard (`safeParse` validation) to reject drifted examples.

**Activation guard (D-1):** Tier 2 does NOT substitute example data for wrong-type errors — that's Tier 1's domain.

### Tier 3 — LLM Correction (external callback)

Invokes the consumer-provided LLM callback (`selfCorrection.llm` or deprecated `onCorrection`) with errors + intent + schema. Retries up to `maxRetries`. Falls back to `fallbackComponent` after exhaustion.

### Short-Circuit Optimization (SC-16)

If Tier 1 resolves ALL errors, Tier 2 is skipped entirely. If Tier 1 + 2 resolve all errors, Tier 3 (LLM) is never invoked.

### Re-Validation (SC-10)

After any correction tier, corrected props are re-validated through the **full pipeline** (not just schema parse), ensuring cross-field Zod constraints remain satisfied.

## API Reference

### Factory

| Function                 | Returns                | Description                                                                     |
| :----------------------- | :--------------------- | :------------------------------------------------------------------------------ |
| `createCompiler(config)` | `EnterstellarCompiler` | Creates a compiler. Config has sensible defaults — only `registry` is required. |

### `EnterstellarCompiler` Interface

| Method                      | Returns                                | Description                                                                  |
| :-------------------------- | :------------------------------------- | :--------------------------------------------------------------------------- |
| `compile(intent, options?)` | `Promise<CompilationResult>`           | Full pipeline: RESOLVE → PARSE → TOKENS → A11Y → TRACE. Never throws.        |
| `lint(intent)`              | `Promise<readonly CompilationError[]>` | Errors only — no provenance, no trace, no self-correction (C19).             |
| `use(step)`                 | `void`                                 | Registers a custom middleware step. Runs after built-in steps, before trace. |

### Pipeline Steps (5)

| Step        | Error Code             | What It Does                                                                    |
| :---------- | :--------------------- | :------------------------------------------------------------------------------ |
| **RESOLVE** | `ENS-2004`             | Looks up `ComponentContract` in registry. Short-circuits if not found.          |
| **PARSE**   | `ENS-2001`, `ENS-2008` | Zod `safeParse()` + `.strip()` to remove unknown props (P10).                   |
| **TOKENS**  | `ENS-2002`, `ENS-2007` | Validates design token references. Strict mode rejects; non-strict coerces.     |
| **A11Y**    | `ENS-2003`             | Auto-injects `role`, `aria-label`, `aria-live`. Never injects `tabindex` (C10). |
| **TRACE**   | —                      | Builds `CompilationResult` with provenance and optional diff (C13).             |

### Error Factories (ENS-2001–2012)

| Code       | Factory                          | Trigger                                              |
| :--------- | :------------------------------- | :--------------------------------------------------- |
| `ENS-2001` | `schemaParseError()`             | Zod validation failure                               |
| `ENS-2002` | `invalidTokenError()`            | Non-token value in token-enforced field              |
| `ENS-2003` | `missingAccessibilityError()`    | Missing required ARIA attribute                      |
| `ENS-2004` | `unknownComponentError()`        | Component not found in registry                      |
| `ENS-2005` | `selfCorrectionExhaustedError()` | All self-correction retries exhausted                |
| `ENS-2006` | `fallbackRenderedError()`        | Fallback component was rendered                      |
| `ENS-2007` | `tokenCoercionWarning()`         | Token coerced in non-strict mode (warning)           |
| `ENS-2008` | `propsStrippedWarning()`         | Unknown props stripped (warning)                     |
| `ENS-2009` | `correctionCallbackError()`      | Self-correction callback threw or returned invalid   |
| `ENS-2010` | `maxNestingDepthError()`         | Intent tree exceeds `maxNestingDepth` (P4)           |
| `ENS-2011` | `deterministicCorrectionInfo()`  | Tier 1 deterministic correction applied (info-level) |
| `ENS-2012` | `templateCorrectionInfo()`       | Tier 2 template correction applied (info-level)      |

### Validation Failure Strategies

| Strategy         | Behavior                                                                                                                        |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `'self-correct'` | Invokes LLM correction callback with errors + intent + schema (C4/C5). Retries up to `maxRetries`. Falls back after exhaustion. |
| `'fallback'`     | Immediately renders `fallbackComponent` from registry (C6).                                                                     |
| `'reject'`       | Returns `CompilationResult` with `status: 'fail'`, no fallback.                                                                 |

### Exported Types

| Type                            | Description                                                                                                                 |
| :------------------------------ | :-------------------------------------------------------------------------------------------------------------------------- |
| `EnterstellarCompiler`          | Compiler interface with `compile()`, `lint()`, `use()`.                                                                     |
| `CompilerConfig`                | Full config. `CompilerConfigInput` is the partial version with defaults.                                                    |
| `CompilationStep`               | `(context, next) => Promise<CompilationContext>` — middleware signature.                                                    |
| `CompilationContext`            | Mutable pipeline state: props, errors, warnings, injections.                                                                |
| `CompilationWarning`            | Non-fatal warning (code, path, message).                                                                                    |
| `CompileOptions`                | Options for `compile()`: `{ agent?: string }`.                                                                              |
| `CorrectionContext`             | Passed to correction callback: intent + schema + errors (C5).                                                               |
| `CorrectionCallback`            | `(errors, context) => Promise<CorrectionResult>`.                                                                           |
| `CorrectionResult`              | Corrected component + props from the callback.                                                                              |
| `CorrectionStrategy`            | `'type-coercion' \| 'boolean-coercion' \| 'default-extraction' \| 'enum-nearest' \| 'token-nearest' \| 'example-fallback'`. |
| `CorrectionTraceEntry`          | Tier, error code, field, was, correctedTo, strategy — one per fix.                                                          |
| `DeterministicCorrectionResult` | Return type of `attemptDeterministicCorrection()`.                                                                          |
| `SelfCorrectionConfig`          | Config for `selfCorrection: { deterministic?, llm?, trace?, enumMatchThreshold? }`.                                         |
| `ValidationFailureStrategy`     | `'self-correct' \| 'fallback' \| 'reject'`.                                                                                 |
| `ValidationFailureConfig`       | Strategy + maxRetries + fallbackComponent.                                                                                  |
| `TelemetryRecordInput`          | Telemetry signal with correction breakdown fields.                                                                          |
| `TelemetryRecorder`             | `(record: TelemetryRecordInput) => void`.                                                                                   |
| `PipelineStepName`              | `'resolve' \| 'parse' \| 'token' \| 'accessibility' \| 'trace' \| 'custom'`.                                                |
| `NamedStep`                     | `{ name: PipelineStepName, execute: CompilationStep }`.                                                                     |
| `NestingValidationResult`       | `{ valid: boolean, depth: number, error?: CompilationError }`.                                                              |

### Utility Exports

| Export                             | Description                                                |
| :--------------------------------- | :--------------------------------------------------------- |
| `attemptDeterministicCorrection()` | Public API for Tier 1 + 2 correction (advanced consumers). |
| `validateNestingDepth(props, max)` | Validates intent tree depth (P4).                          |
| `COMPILER_VERSION`                 | Semver string matching `package.json`.                     |

## Configuration

### `CompilerConfigInput` (passed to `createCompiler()`)

| Option                | Type                      | Required | Default                                                                         | Description                                               |
| :-------------------- | :------------------------ | :------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------- |
| `registry`            | `EnterstellarRegistry`    | **Yes**  | —                                                                               | The registry to validate intents against.                 |
| `onValidationFailure` | `ValidationFailureConfig` | No       | `{ strategy: 'self-correct', maxRetries: 2, fallbackComponent: 'GenericCard' }` | How to handle validation failures.                        |
| `strictDesignTokens`  | `boolean`                 | No       | `true`                                                                          | Reject non-token visual values (C8).                      |
| `autoAccessibility`   | `boolean`                 | No       | `true`                                                                          | Auto-inject ARIA attributes (C10).                        |
| `maxNestingDepth`     | `number`                  | No       | `10`                                                                            | Max intent tree depth. Range: 3–20 (P4).                  |
| `includeDiff`         | `boolean`                 | No       | `true`                                                                          | Include raw vs. compiled prop diff (C13).                 |
| `selfCorrection`      | `SelfCorrectionConfig`    | No       | `{ deterministic: true }`                                                       | 3-tier self-correction configuration (see below).         |
| `onCorrection`        | `CorrectionCallback`      | No       | `undefined`                                                                     | **Deprecated.** Use `selfCorrection.llm` instead (SC-09). |
| `onTelemetry`         | `TelemetryRecorder`       | No       | `undefined`                                                                     | Telemetry recorder injected by `Provider` (TL1).          |

### `SelfCorrectionConfig`

| Option               | Type                 | Default     | Description                                                      |
| :------------------- | :------------------- | :---------- | :--------------------------------------------------------------- |
| `deterministic`      | `boolean`            | `true`      | Enable Tier 1 + 2 deterministic correction. Set `false` to skip. |
| `llm`                | `CorrectionCallback` | `undefined` | Tier 3 LLM callback. Replaces deprecated `onCorrection`.         |
| `trace`              | `boolean`            | `false`     | Attach `correctionTrace` to `CompilationResult` for DevTools.    |
| `enumMatchThreshold` | `number`             | `2`         | Max Levenshtein distance for enum fuzzy matching. Range: 1–5.    |

### Build Configuration

| File             | Purpose                                                                                    |
| :--------------- | :----------------------------------------------------------------------------------------- |
| `tsconfig.json`  | Extends `tsconfig.base.json` — 15 strict flags. Overrides `composite: false` for tsup DTS. |
| `tsup.config.ts` | Builds ESM + CJS + DTS. Single entry: `src/index.ts`.                                      |

**Peer dependencies:** `@enterstellar-ai/types`, `@enterstellar-ai/registry`, `zod ^4.3.6`

## See Also

- [Implementation Bible §5.2](../../agent/03-enterstellar-implementation-bible.md) — compiler specification.
- [Self-Correction Bible](../../archive/ADOPTION/self-correction/self-correction-consolidated-bible.md) — 3-tier correction architecture.
- [Design Choices — Module 3](../../agent/04-enterstellar-design-choices.md) — locked decisions C1–C20.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
