# @enterstellar-ai/forge

> Runtime component generation — when the registry has no match, the Forge creates an ephemeral `ComponentContract` on the fly, either from local templates (free) or via a cloud LLM (IPU metered).

The Forge is Enterstellar's self-growing registry brain (Moat M5). It bridges the gap between runtime intent and registered components: simple patterns resolve instantly via LocalForge's 7 built-in templates, while complex UI is generated through a consumer-provided CloudForge callback. Every forged contract passes the full Enterstellar compiler pipeline (L3) before reaching the renderer.

## Quick Start

```ts
import { createComponentForge } from '@enterstellar-ai/forge';
import { createCompiler } from '@enterstellar-ai/compiler';
import { createRegistry } from '@enterstellar-ai/registry';

// 1. Create compiler and registry
const registry = createRegistry({ components: [...] });
const compiler = createCompiler({ registry });

// 2. Create the forge
const forge = createComponentForge({
  routing: 'auto',
  compiler,
  registry,
  constraints: {
    designTokens: { 'colors-primary': 'token:primary' },
    componentPatterns: ['card', 'list', 'table', 'chart', 'form', 'detail', 'badge'],
    maxComplexity: 5,
    requiredStates: ['loading', 'error', 'empty', 'ready'],
    accessibility: 'WCAG-AA',
  },
  coldPath: { enabled: true, clusterThreshold: 5, autoPromote: false },
  onCloudForge: async (intent, prompt) => cloudClient.forge(intent, prompt),
});

// 3. Forge a component for an unmatched intent
const result = await forge.forge({ component: 'PatientTimeline', props: {}, confidence: 0.3 });
// result.success === true
// result.contract.name === '__forged_patienttimeline_a1b2c3d4'
// result.forgeMode === 'local'
```

## API Reference

### Factory

| Function                       | Returns          | Description                                                        |
| :----------------------------- | :--------------- | :----------------------------------------------------------------- |
| `createComponentForge(config)` | `ComponentForge` | Creates the forge. Returns frozen plain object with closures (R1). |

### `ComponentForge` Interface

| Method                             | Returns                       | Description                                                                                                |
| :--------------------------------- | :---------------------------- | :--------------------------------------------------------------------------------------------------------- |
| `forge(intent, context?)`          | `Promise<ForgeResult>`        | Generates an ephemeral `ComponentContract` for an unmatched intent. Routes via auto/local-only/cloud-only. |
| `registerTemplate(name, template)` | `void`                        | Registers a custom template for LocalForge. Validates against `ForgeTemplateSchema`.                       |
| `getStats()`                       | `ForgeStats`                  | Returns forge invocation statistics (totals, success/failure, local/cloud counts, top intents).            |
| `getTraceHistory()`                | `readonly ForgeTraceRecord[]` | Returns Cold Path trace history for intent clustering analysis.                                            |

### `ForgeResult`

| Field               | Type                        | Description                                                                            |
| :------------------ | :-------------------------- | :------------------------------------------------------------------------------------- |
| `success`           | `boolean`                   | Whether the forge generated a valid contract.                                          |
| `contract`          | `ComponentContract \| null` | The forged contract (`_meta.forged = true`, `__forged_` prefix), or `null` on failure. |
| `compilationResult` | `CompilationResult \| null` | Full compiler output — forged contracts must pass the compiler (L3).                   |
| `fallbackUsed`      | `boolean`                   | Whether the fallback component was used instead.                                       |
| `forgeMode`         | `'local' \| 'cloud'`        | Which forge mode generated this contract.                                              |

### Error Codes

| Code       | Scenario                                               | Recoverable |
| :--------- | :----------------------------------------------------- | :---------- |
| `ENS-4001` | Forge generation failed (no template match + no cloud) | ✅ Yes      |
| `ENS-4002` | Template not found for category                        | ✅ Yes      |
| `ENS-4003` | CloudForge network/callback error                      | ✅ Yes      |
| `ENS-4004` | Forged contract failed compiler validation             | ✅ Yes      |
| `ENS-4005` | Custom template failed structural validation           | ❌ No       |

### Types

| Type                 | Description                                                                                                         |
| :------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `ComponentForge`     | Full forge interface (all methods above).                                                                           |
| `ForgeConfig`        | Config for `createComponentForge()`: `routing`, `constraints`, `coldPath`, `compiler`, `registry`, `onCloudForge?`. |
| `ForgeConstraints`   | Guardrails: `designTokens`, `componentPatterns`, `maxComplexity`, `requiredStates`, `accessibility`.                |
| `ForgeTemplate`      | Declarative template schema: `name`, `categories`, `description`, `slots`, `tokens`, `states`, `accessibility`.     |
| `ForgeTemplateSlot`  | Slot definition: `name`, `type`, `required`, `description`.                                                         |
| `ForgePatternName`   | Union of 7 built-in patterns: `'card' \| 'list' \| 'table' \| 'chart' \| 'form' \| 'detail' \| 'badge'`.            |
| `CloudForgeCallback` | `(intent, systemPrompt) => Promise<ComponentContract \| null>`. Consumer-provided LLM callback.                     |
| `ForgeStats`         | Statistics: `totalForged`, `successCount`, `failureCount`, `localCount`, `cloudCount`, `topIntents`.                |
| `ForgeResult`        | From `@enterstellar-ai/types`. Result of a forge invocation.                                                        |
| `ForgeTraceRecord`   | From `@enterstellar-ai/types`. Single trace entry for Cold Path clustering.                                         |
| `ColdPathConfig`     | From `@enterstellar-ai/types`. `enabled`, `clusterThreshold`, `autoPromote`.                                        |

### Naming Utilities

| Function                     | Returns  | Description                                                |
| :--------------------------- | :------- | :--------------------------------------------------------- |
| `slugifyIntent(intent)`      | `string` | Converts intent to kebab-case slug, truncated to 30 chars. |
| `xxHash8(input, seed?)`      | `string` | Pure TS xxHash32, returns 8-char hex string.               |
| `generateForgedName(intent)` | `string` | Produces `__forged_{slug}_{8hex}` name per F13.            |

### Template Exports

| Export                   | Description                                           |
| :----------------------- | :---------------------------------------------------- |
| `BUILTIN_TEMPLATES`      | Array of 7 built-in `ForgeTemplate` objects.          |
| `BUILTIN_TEMPLATE_NAMES` | `ReadonlySet<string>` of built-in template names.     |
| `ForgeTemplateSchema`    | Zod schema for validating `ForgeTemplate` at runtime. |

## Design Choices Applied

| Decision | Summary                                                                                |
| :------- | :------------------------------------------------------------------------------------- |
| **F1**   | Templates are JSON schemas with slots + token mappings (not React components).         |
| **F2**   | 7 pre-approved patterns: card, list, table, chart, form, detail, badge.                |
| **F3**   | Custom templates via `forge.registerTemplate()`, validated by `ForgeTemplateSchema`.   |
| **F4**   | All 7 built-in templates shipped inside `@enterstellar-ai/forge`.                      |
| **F5**   | CloudForge uses general-purpose model with specialized system prompt (no fine-tuning). |
| **F6**   | Cloud returns data contract only — no render function.                                 |
| **F7**   | 3-layer guardrails: system prompt → Zod validation → token allowlist.                  |
| **F8**   | Auto-routing: registry → LocalForge → CloudForge.                                      |
| **F9**   | Never hard-fail. All failures produce fallback `ForgeResult`.                          |
| **F10**  | Cold Path pipeline runs server-side. Client-side provides trace logging + clustering.  |
| **F11**  | Default cluster threshold: 5 occurrences.                                              |
| **F13**  | Forged names: `__forged_{slug}_{8-char-xxHash}`.                                       |
| **L3**   | Every forged contract passes the full compiler pipeline. No bypass.                    |
| **L13**  | No injected content — system prompt enforces no promotional/advertising content.       |
| **R1**   | Factory pattern — returns plain frozen object with closures.                           |

## Configuration

### `ForgeConfig` Options

| Option         | Type                                     | Required            | Default | Description                                |
| :------------- | :--------------------------------------- | :------------------ | :------ | :----------------------------------------- |
| `routing`      | `'auto' \| 'local-only' \| 'cloud-only'` | Yes                 | —       | Routing mode for LocalForge vs CloudForge. |
| `constraints`  | `ForgeConstraints`                       | Yes                 | —       | Generation constraints and guardrails.     |
| `coldPath`     | `ColdPathConfig`                         | Yes                 | —       | Cold Path pipeline configuration.          |
| `compiler`     | `EnterstellarCompiler`                   | Yes                 | —       | Injected compiler instance (L3).           |
| `registry`     | `EnterstellarRegistry`                   | Yes                 | —       | Injected registry instance.                |
| `onCloudForge` | `CloudForgeCallback`                     | For auto/cloud-only | —       | Consumer-provided LLM callback.            |

### `ForgeConstraints` Options

| Option              | Type                                  | Default     | Description                                                  |
| :------------------ | :------------------------------------ | :---------- | :----------------------------------------------------------- |
| `designTokens`      | `DesignTokenSet`                      | —           | Token allowlist. Forged contracts may only use these tokens. |
| `componentPatterns` | `ForgePatternName[]`                  | All 7       | Allowed base patterns for LocalForge.                        |
| `maxComplexity`     | `number`                              | `5`         | Maximum nesting depth for forged component trees.            |
| `requiredStates`    | `string[]`                            | All 4       | Required lifecycle states.                                   |
| `accessibility`     | `'WCAG-A' \| 'WCAG-AA' \| 'WCAG-AAA'` | `'WCAG-AA'` | WCAG accessibility level.                                    |

### Build Configuration

| File               | Purpose                                                           |
| :----------------- | :---------------------------------------------------------------- |
| `tsconfig.json`    | Extends `tsconfig.base.json` — 15 strict flags.                   |
| `tsup.config.ts`   | Builds ESM + CJS + DTS. `composite: false`, `incremental: false`. |
| `vitest.config.ts` | Test runner with 90% coverage thresholds.                         |

**Peer dependencies:** `@enterstellar-ai/types`, `@enterstellar-ai/compiler`, `@enterstellar-ai/registry`, `zod`

## See Also

- [Implementation Bible §4.10](../../agent/03-enterstellar-implementation-bible.md) — forge specification.
- [Design Choices — F1–F14](../../agent/04-enterstellar-design-choices.md) — locked decisions.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
