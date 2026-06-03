# @enterstellar-ai/migration

> Migration pipeline — AST extraction, LLM enrichment, and contract assembly for migrating existing component libraries into Enterstellar `ComponentContract` standard.

This package converts existing React/Vue/Svelte component files into fully typed `.contract.ts` + `.test.ts` files. It is a **library**, not a CLI — the CLI (`@enterstellar-ai/cli`) provides command routing and terminal output. This separation allows `@enterstellar-ai/cloud` to import `extractManifest()` for server-side extraction without depending on the CLI binary (Correction 4).

## Quick Start

```ts
import { extractManifest } from '@enterstellar-ai/migration';
import fs from 'node:fs';

// 1. Read component source from disk (CLI) or receive from HTTP body (server)
const source = fs.readFileSync('src/components/Button.tsx', 'utf-8');

// 2. Extract a structural manifest from the source string
const result = extractManifest(source, 'Button.tsx');
// result.manifest.name      — 'Button'
// result.manifest.props      — Zod schema for Button's props
// result.manifest.category   — EnrichableField<string> with source provenance
// result.diagnostics         — ExtractDiagnostic[] (informational)

// 3. (Optional) Enrich heuristic fields via LLM
import { resolveProvider, enrichManifest } from '@enterstellar-ai/migration';

const provider = resolveProvider({
  providerName: 'openai',
  apiKey: 'sk-xxx',
  model: 'gpt-4o-mini',
});
const enrichResult = await enrichManifest(result.manifest, source, provider);
// enrichResult.manifest        — enriched StructuralManifest
// enrichResult.enrichedFields  — ['description', 'tags'] (for @enriched-fields header)
// enrichResult.skippedFields   — ['category'] (ast-determined, never sent to LLM)
// enrichResult.diagnostics     — EnrichDiagnostic[] (errors/warnings from provider)

// 4. Assemble contract + test files
import { assembleContract, assembleTest } from '@enterstellar-ai/migration';

const contract = assembleContract(result.manifest, 'src/Button.tsx', '1.0.0');
// contract.content             — TypeScript source for Button.contract.ts
// contract.provenance.outcome  — 'clean' | 'warn' | 'review' (computed from annotations)

const test = assembleTest(result.manifest, './Button.contract');
// test — TypeScript source for Button.test.ts
```

## API Reference

### Phase 1 — Extraction

| Function                    | Signature                       | Returns               | Description                                                                                                                                                                                                                   |
| :-------------------------- | :------------------------------ | :-------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extractManifest`           | `(source, filename?, project?)` | `ExtractResult`       | Extracts a `StructuralManifest` from a component source string using `ts-morph` AST analysis. Synchronous.                                                                                                                    |
| `createExtractionProject`   | `()`                            | `Project`             | Factory for shared `ts-morph` Project instance. Used by CLI for batch performance — pass to `extractManifest()` as third arg.                                                                                                 |
| `scanComponentsLightweight` | `(srcDir)`                      | `ComponentScanResult` | Syntax-only scan of a directory for React component files. Classifies into 3 tiers: auto-migratable, manual review, skipped. Used by `enterstellar init` for existing project detection (Correction 5 L187-213). Synchronous. |

**Internal module architecture (Phase 1):**

| File                  | Purpose                                                                | Key Exports                                                                                                                                                                                                                    |
| :-------------------- | :--------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract-manifest.ts` | Orchestrator — wires all helpers together                              | `extractManifest()`                                                                                                                                                                                                            |
| `scan-lightweight.ts` | Syntax-only scanner for `enterstellar init` existing project detection | `scanComponentsLightweight()`, `ComponentScanResult`                                                                                                                                                                           |
| `ts-morph-helpers.ts` | AST traversal utilities (9 exported functions)                         | `findComponentExport()`, `extractDefaultProps()`, `extractGenerics()`, `detectExistingZodSchemas()`, `detectEventHandlers()`, `extractJsDoc()`, `detectAriaAttributes()`, `detectDesignTokenRefs()`, `detectLifecycleStates()` |
| `zod-inference.ts`    | Recursive TS type → Zod schema mapper (17 type mappings)               | `typeToZodSchema()`, `isAllStringLiterals()`                                                                                                                                                                                   |
| `heuristics.ts`       | Heuristic fallback functions for enrichable fields                     | `inferCategory()`, `generateHeuristicIntent()`, `generateHeuristicDescription()`                                                                                                                                               |

### Phase 2 — Enrichment

| Function / Class          | Signature                      | Returns                         | Description                                                                                                                           |
| :------------------------ | :----------------------------- | :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------ |
| `enrichManifest`          | `(manifest, source, provider)` | `Promise<EnrichResult>`         | Phase 2 orchestrator. Partitions fields by provenance, calls provider, merges overlay. Never throws — errors captured in diagnostics. |
| `mergeOverlay`            | `(manifest, overlay)`          | `{ manifest, enrichedFields }`  | Immutable overlay merge. Only patches `heuristic-fallback` fields — `ast-determined` fields are never overwritten.                    |
| `resolveProvider(config)` | `(EnrichmentConfig)`           | `EnrichmentProvider`            | Factory: enrichment config → provider instance (BYO-key or Enterstellar Cloud).                                                       |
| `ENRICHABLE_FIELD_KEYS`   | constant                       | `readonly EnrichableFieldKey[]` | The 7 enrichable field keys, compile-time guarded against `EnrichableFieldKey` union.                                                 |

**Internal module architecture (Phase 2):**

| File                  | Purpose                                                                             | Key Exports                                                    |
| :-------------------- | :---------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| `enrich-manifest.ts`  | Orchestrator — gating logic, provider dispatch, overlay merge                       | `enrichManifest()`, `mergeOverlay()`, `ENRICHABLE_FIELD_KEYS`  |
| `build-prompt.ts`     | Pure prompt builder for BYO-key provider (internal — NOT exported from root barrel) | `buildEnrichmentPrompt()`                                      |
| `byo-key-provider.ts` | OpenAI-compatible chat completions API provider                                     | `BYOKeyEnrichmentProvider` (class)                             |
| `cloud-provider.ts`   | Enterstellar Cloud forge API provider (follows `@enterstellar-ai/cloud` patterns)   | `CloudEnrichmentProvider` (class)                              |
| `resolve-provider.ts` | Factory: `EnrichmentConfig` → provider instance                                     | `resolveProvider()`, `EnrichmentConfig` (type)                 |
| `types.ts`            | Provider interface, error codes, error class                                        | `EnrichmentProvider`, `EnrichmentError`, `EnrichmentErrorCode` |

### Phase 3 — Assembly

| Function                                                    | Returns                   | Description                                                                                                                                                  |
| :---------------------------------------------------------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assembleContract(manifest, sourcePath, version, options?)` | `ContractAssemblyResult`  | Generates a `.contract.ts` file from a `StructuralManifest`. Sync. Outcome is computed inline from annotation arrays — no placeholder, no CLI-side patching. |
| `assembleTest(manifest, importPath)`                        | `string`                  | Generates a `.test.ts` scaffold using `vitest` + `ComponentContractSchema`. Sync.                                                                            |
| `generateExampleProps(schema, defaults)`                    | `Record<string, unknown>` | Derives minimal valid props from a Zod schema + defaults.                                                                                                    |

### Pipeline Types

| Type                     | Description                                                                                                 |
| :----------------------- | :---------------------------------------------------------------------------------------------------------- |
| `StructuralManifest`     | Phase 1 output. Structural fields (bare) + enrichable fields (`EnrichableField<T>` with source provenance). |
| `SemanticOverlay`        | Phase 2 output. Sparse patch of LLM-enriched values.                                                        |
| `EnrichableField<T>`     | Wrapper: `{ value: T, source: ManifestFieldSource, sourceLocation?: SourceLocation }`.                      |
| `ManifestFieldSource`    | `'ast-determined' \| 'heuristic-fallback' \| 'enrichment'`.                                                 |
| `SourceLocation`         | `{ file: string, line: number }` — traces values back to source AST nodes.                                  |
| `GenericParam`           | `{ name: string, constraint?: string }` — captured generic type parameters.                                 |
| `EnrichableFieldKey`     | Union of the 7 enrichable field keys on `StructuralManifest`.                                               |
| `EnrichedFieldPatch`     | Type-safe `{ key, value }` pair — key determines value type at compile time.                                |
| `ExtractResult`          | `{ manifest: StructuralManifest, diagnostics: ExtractDiagnostic[] }`.                                       |
| `ExtractDiagnostic`      | `{ level: 'info' \| 'warning' \| 'error', message: string, field?: string }`.                               |
| `EnrichResult`           | `{ manifest, enrichedFields, skippedFields, diagnostics }` — Phase 2 output with full provenance.           |
| `EnrichDiagnostic`       | `{ level, message, field?, errorCode? }` — Phase 2 diagnostic with optional error code.                     |
| `MigrationOutcome`       | `'clean' \| 'warn' \| 'review' \| 'skip'` — 4-level outcome model.                                          |
| `MigrationProvenance`    | Provenance metadata for the `@enterstellar-generated` header on contracts.                                  |
| `MigrationResult`        | Per-component migration result (outcome, paths, annotations, diagnostics).                                  |
| `MigrateBatchSummary`    | Aggregate summary (counts per outcome, timing, all results).                                                |
| `ContractAssemblyResult` | `{ content, reviewAnnotations, warnAnnotations, provenance }` — Phase 3 contract output.                    |
| `AssemblyOptions`        | `{ enrichedFields?, enrichmentProvider? }` — optional enrichment metadata for provenance.                   |
| `EnrichmentProvider`     | Single-method interface: `enrich(manifest, source) → Promise<SemanticOverlay>`.                             |
| `EnrichmentErrorCode`    | `'AUTH_FAILED' \| 'QUOTA_EXHAUSTED' \| 'RATE_LIMITED' \| 'PROVIDER_ERROR' \| 'PARSE_ERROR'`.                |
| `EnrichmentError`        | Error class with `code: EnrichmentErrorCode` and `retryAfterMs?: number`.                                   |
| `EnrichmentConfig`       | Factory input: `{ providerName?, apiKey?, model?, baseUrl?, sessionToken?, onIPU? }`.                       |
| `ComponentScanResult`    | Lightweight scan result: `{ total, autoMigratable, manualReview, skipped, reactVersion?, files }`.          |

### Zod Schemas (T7)

| Schema                      | Validates             | Purpose                                                                                     |
| :-------------------------- | :-------------------- | :------------------------------------------------------------------------------------------ |
| `MigrationResultSchema`     | `MigrationResult`     | Runtime validation for `--format json` output.                                              |
| `MigrateBatchSummarySchema` | `MigrateBatchSummary` | Runtime validation for `--format json` batch output.                                        |
| `SemanticOverlaySchema`     | `SemanticOverlay`     | Runtime validation of LLM enrichment responses. Uses `z.discriminatedUnion` on `key` field. |

## Configuration

### Build Configuration

| File               | Purpose                                                                                    |
| :----------------- | :----------------------------------------------------------------------------------------- |
| `tsconfig.json`    | Extends `tsconfig.base.json` — 15 strict flags. Overrides `composite: false` for tsup DTS. |
| `tsup.config.ts`   | Builds ESM + CJS + DTS. Single entry: `src/index.ts`.                                      |
| `vitest.config.ts` | Node environment, globals enabled, 90% coverage thresholds.                                |

### Dependencies

| Package    | Size | Purpose                          |
| :--------- | :--- | :------------------------------- |
| `ts-morph` | ~2MB | AST extraction engine (Phase 1). |

> **Note:** `fast-glob` and `ignore` are dependencies of `@enterstellar-ai/cli` (not `@enterstellar-ai/migration`). The migration package is a pure library — filesystem discovery is the CLI's responsibility.

**Peer dependencies:** `@enterstellar-ai/types`, `@enterstellar-ai/compiler`, `zod ^4.3.6`

## See Also

- [Migration Pipeline](../../archive/ADOPTION/migration/migration-01-pipeline.md) — Corrections 1 & 2: outcome model, binary source model.
- [Migration Enrichment](../../archive/ADOPTION/migration/migration-02-enrichment.md) — Correction 3: EnrichmentProvider interface.
- [Migration CLI](../../archive/ADOPTION/migration/migration-03-cli.md) — Correction 5: CLI interface, flag reference.
- [Migration Server](../../archive/ADOPTION/migration/migration-04-server-extract.md) — Correction 4: server-side extraction.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
