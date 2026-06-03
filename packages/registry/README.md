# @enterstellar-ai/registry

> Component Contract Registry — `defineComponent()`, `createRegistry()`, `mergeRegistries()`, and the full registration-time validation pipeline.

This is the "deck of cards" the LLM is allowed to play. Every component that Enterstellar can render must be defined as a `ComponentContract` and registered. The registry enforces 10 validation rules at definition time, generates token-efficient manifests for LLM prompt injection, and supports design token merging and event-driven lifecycle hooks.

## Quick Start

```ts
import { defineComponent, createRegistry, mergeRegistries } from '@enterstellar-ai/registry';
import { z } from 'zod';

// 1. Define a contract — validates immediately (R5), freezes output (R4)
const PatientVitals = defineComponent({
  name: 'PatientVitals',
  description: 'Displays real-time patient vital signs with risk stratification.',
  category: 'clinical',
  tags: ['patient', 'vitals', 'monitoring'],
  props: z.object({
    patientId: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  tokens: { statusColor: 'token:danger', cardBg: 'token:card-bg' },
  accessibility: { role: 'region', ariaLabel: 'Patient vitals', announceOnUpdate: true },
  states: {
    loading: 'VitalsLoading',
    error: 'VitalsError',
    empty: 'VitalsEmpty',
    ready: 'PatientVitals',
  },
  examples: [{ intent: 'Show patient vitals', props: { patientId: '123...', riskLevel: 'high' } }],
});

// 2. Create a registry with initial components
const registry = createRegistry({ components: [PatientVitals] });

// 3. Use the registry
registry.get('PatientVitals'); // ComponentContract
registry.list(); // ['PatientVitals']
registry.getManifest(); // CompactManifestEntry[]
registry.getSchema('PatientVitals'); // z.ZodType (for runtime validation)
```

## API Reference

### Factories

| Function                         | Returns                | Description                                                                                       |
| :------------------------------- | :--------------------- | :------------------------------------------------------------------------------------------------ |
| `defineComponent(input)`         | `ComponentContract`    | Validates, auto-generates `id` + `_meta`, freezes. Throws `EnterstellarError` on first violation. |
| `createRegistry(config)`         | `EnterstellarRegistry` | Creates a registry with initial components. Internal `Map` storage.                               |
| `mergeRegistries(...registries)` | `EnterstellarRegistry` | Merges multiple registries. Throws on cross-registry name duplicates.                             |

### `EnterstellarRegistry` Interface

| Method                      | Returns                           | Description                                                                     |
| :-------------------------- | :-------------------------------- | :------------------------------------------------------------------------------ |
| `get(name)`                 | `ComponentContract \| undefined`  | O(1) lookup by name.                                                            |
| `list()`                    | `readonly string[]`               | Sorted array of all registered component names.                                 |
| `register(contract)`        | `void`                            | Runtime registration. Validates + emits `register` event.                       |
| `unregister(name)`          | `boolean`                         | Removes a component. Returns `false` if not found.                              |
| `getManifest()`             | `readonly CompactManifestEntry[]` | Token-efficient entries for LLM prompt injection.                               |
| `getSchema(name)`           | `z.ZodType \| undefined`          | Returns the Zod props schema for a named component.                             |
| `getDesignTokens()`         | `DesignTokenSet`                  | Merged config-level + component-level tokens (first-wins).                      |
| `validate(contract)`        | `ValidationResult`                | Runs all 10 rules without registering.                                          |
| `publish(contract, target)` | `Promise<PublishResult>`          | Publishes to a remote registry via REST POST.                                   |
| `on(event, handler)`        | `() => void`                      | Subscribes to `register` / `unregister` / `update` events. Returns unsubscribe. |
| `size`                      | `number`                          | Current count of registered components.                                         |

### Validation Rules (R1–R10)

| Rule | Error Code | Check                                                                       |
| :--- | :--------- | :-------------------------------------------------------------------------- |
| R1   | `ENS-1002` | Name must be PascalCase (≥2 chars, alphanumeric).                           |
| R2   | `ENS-1003` | Description must be ≤120 characters.                                        |
| R3   | `ENS-1004` | Tags must have 1–10 entries.                                                |
| R4   | `ENS-1005` | All four lifecycle states (loading, error, empty, ready) must be non-empty. |
| R5   | `ENS-1006` | `states.ready` must match the component's own name.                         |
| R6   | `ENS-1007` | Token values must start with `token:` prefix.                               |
| R7   | `ENS-1008` | Props must be a Zod schema with `safeParse()`.                              |
| R8   | `ENS-1009` | Accessibility `role` must be a valid WAI-ARIA role.                         |
| R9   | `ENS-1010` | Description must be non-empty.                                              |
| R10  | `ENS-1001` | No duplicate names within a registry.                                       |

### Utility Exports

| Export                        | Description                                                        |
| :---------------------------- | :----------------------------------------------------------------- |
| `generateManifest(contracts)` | Generates `CompactManifestEntry[]` from an iterable of contracts.  |
| `validateContract(contract)`  | Runs all 10 rules, returns `ValidationResult` with all violations. |

### Types

| Type                     | Description                                                                               |
| :----------------------- | :---------------------------------------------------------------------------------------- |
| `EnterstellarRegistry`   | Full registry interface (all methods above).                                              |
| `RegistryConfig`         | Config for `createRegistry()`: `components`, `designTokens?`, `remote?`.                  |
| `ComponentContractInput` | `Omit<ComponentContract, 'id' \| '_meta'>` — what developers pass to `defineComponent()`. |
| `ValidationResult`       | `{ valid: boolean, violations: ValidationViolation[] }`.                                  |
| `ValidationViolation`    | `{ rule: string, field: string, message: string }`.                                       |
| `RegistryEvent`          | `'register' \| 'unregister' \| 'update'`.                                                 |
| `PublishTarget`          | Remote target: `{ registryUrl, credentials: { apiKey } }`.                                |
| `PublishResult`          | `{ published: boolean, url: string }`.                                                    |

## Example Components

10 clinical-domain example components are available in `examples/components.ts`:

```ts
import { allExampleComponents } from '@enterstellar-ai/registry/examples/components';
import { createRegistry } from '@enterstellar-ai/registry';

const registry = createRegistry({ components: [...allExampleComponents] });
registry.list();
// ['AlertBanner', 'AppointmentCard', 'ClinicalNote', 'DiagnosisSummary',
//  'GenericCard', 'LabResults', 'MedicationList', 'PatientHeader',
//  'PatientVitals', 'VitalsChart']
```

## Configuration

### `RegistryConfig` Options

| Option         | Type                           | Required | Default     | Description                                                                                             |
| :------------- | :----------------------------- | :------- | :---------- | :------------------------------------------------------------------------------------------------------ |
| `components`   | `readonly ComponentContract[]` | Yes      | —           | Initial contracts to register eagerly.                                                                  |
| `designTokens` | `DesignTokenSet`               | No       | `{}`        | Registry-level design tokens. Merged with component tokens (first-wins).                                |
| `remote`       | `RemoteRegistryConfig`         | No       | `undefined` | Federation config: `{ url: string, syncInterval: number }`. Stub-ready — runtime sync deferred to M3.5. |

### Build Configuration

| File               | Purpose                                                       |
| :----------------- | :------------------------------------------------------------ |
| `tsconfig.json`    | Extends `tsconfig.base.json` — 15 strict flags.               |
| `tsup.config.ts`   | Builds ESM + CJS + DTS. Overrides `composite: false` for DTS. |
| `vitest.config.ts` | Test runner configuration.                                    |

**Peer dependencies:** `@enterstellar-ai/types`, `zod ^4.3.6`

## See Also

- [Implementation Bible §5.1](../../agent/03-enterstellar-implementation-bible.md) — registry specification.
- [Design Choices — Module 2](../../agent/04-enterstellar-design-choices.md) — locked decisions R1–R20.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
