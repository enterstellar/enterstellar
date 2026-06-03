# @enterstellar-ai/contracts-shadcn

> Pre-converted Enterstellar ComponentContracts for [shadcn/ui](https://ui.shadcn.com/) — enabling one-line registration of shadcn components into the Enterstellar GenUI Compiler.

shadcn/ui uses a **code-copy distribution model** — components are copied into the developer's source tree, not installed from npm. This means there is no universal import path that this package can reference directly. Instead, developers provide their local component implementations via `registerShadcnContracts()`.

## Current State

- **Registration logic:** Production-grade with 3-path validation.
- **Contracts:** Empty. Populated by the CI sync pipeline (`sync-contracts-shadcn.yml`).
- **Once contracts land**, `registerShadcnContracts()` will validate and pair them with local component implementations via `defineComponent()`.

## Quick Start

```ts
import { registerShadcnContracts } from '@enterstellar-ai/contracts-shadcn';
import { createRegistry } from '@enterstellar-ai/registry';

// Import your local shadcn component implementations.
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';

// Register: pairs your components with Enterstellar contracts.
const contracts = registerShadcnContracts({ Button, Card, Dialog });

// Include in your Enterstellar registry alongside your own contracts.
const registry = createRegistry({
  components: [...myContracts, ...contracts],
});
```

## API Reference

### `registerShadcnContracts(components)`

| Parameter    | Type                 | Description                                                                  |
| :----------- | :------------------- | :--------------------------------------------------------------------------- |
| `components` | `ShadcnComponentMap` | Map of contract names (PascalCase) to local React component implementations. |

**Returns:** `readonly ComponentContract[]` — validated contracts for `createRegistry()`.

**Throws:**

| Condition                | Error Message                                                                        |
| :----------------------- | :----------------------------------------------------------------------------------- |
| Unknown key (typo)       | `'Buttn' is not a known shadcn contract. Did you mean 'Button'?`                     |
| `undefined`/`null` value | `Component 'Button' was not provided. Run 'npx shadcn@latest add button' to add it.` |

**Warn (console.warn):**

| Condition                  | Message                                                                                     |
| :------------------------- | :------------------------------------------------------------------------------------------ |
| Missing key (not provided) | `ShadcnButton: contract registered without renderer. <Zone> will use GenericCard fallback.` |

### `ShadcnComponentMap`

```ts
type ShadcnComponentMap = Partial<
  Record<ShadcnContractName, ComponentType<Record<string, unknown>>>
>;
```

Keys must match contract names in PascalCase. Missing keys are valid — contracts are registered without renderers, falling back to `GenericCard`. Unknown keys trigger an error with a Levenshtein-based suggestion (distance ≤ 3).

### `SHADCN_CONTRACTS`

```ts
export const SHADCN_CONTRACTS: Record<string, ComponentContractInput> = {};
```

Master record of all shadcn/ui component contracts. Empty pre-CI — populated by the sync pipeline. Each key is a PascalCase component name, each value is a `defineComponent()`-compatible input.

### Utilities

| Export                                | Description                                                  |
| :------------------------------------ | :----------------------------------------------------------- |
| `levenshteinDistance(a, b)`           | Edit distance between two strings (O(m×n) time, O(n) space). |
| `findClosestMatch(input, candidates)` | Best match within distance ≤ 3, or `undefined`.              |

## Configuration

No configuration required. This package provides pre-built contracts — no build step, no code generation needed by the consumer.

### Dependencies

| Package                            | Purpose                                                                          |
| :--------------------------------- | :------------------------------------------------------------------------------- |
| `@enterstellar-ai/react` (peer)    | Provides `defineComponent()` for contract validation and renderer registration.  |
| `@enterstellar-ai/registry` (peer) | Provides `defineComponent()` and `ComponentContractInput` for contract creation. |
| `@enterstellar-ai/types` (peer)    | Provides `ComponentContract` type definition.                                    |
| `zod` (peer)                       | Runtime schema validation for contract prop types.                               |

> **Note:** There is no `shadcn` peer dependency — shadcn uses a code-copy model. The developer imports their own copied components directly.

## CI Sync Pipeline

The `.github/workflows/sync-contracts-shadcn.yml` workflow defines the contract generation pipeline:

1. `npx shadcn@latest add --all` — fetch latest component source.
2. `enterstellar migrate` — generate contracts from source.
3. Diff against published contracts.
4. Classify changes (minor/major/deprecation).
5. Open human-gated PR if changes detected.

Schedule: Weekly, Monday 06:00 UTC.

## File Structure

```
packages/contracts-shadcn/
├── src/
│   ├── index.ts                    ← Barrel: public API surface
│   ├── register.ts                 ← registerShadcnContracts() implementation
│   ├── contracts/
│   │   └── index.ts                ← SHADCN_CONTRACTS record (populated by CI)
│   └── utils/
│       └── levenshtein.ts          ← Levenshtein distance + closest match
├── __tests__/
│   ├── smoke.test.ts               ← Barrel export smoke tests
│   ├── register.test.ts            ← Registration validation path tests
│   └── levenshtein.test.ts         ← Edit distance + closest match tests
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

## See Also

- [Contract Packs Spec](../../archive/ADOPTION/migration/migration-05-contract-packs.md) — Correction 7: contract pack architecture.
- [Migration Pipeline](../../archive/ADOPTION/migration/migration-01-pipeline.md) — Corrections 1 & 2: the pipeline that generates contracts.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
