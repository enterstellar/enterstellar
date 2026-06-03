# @enterstellar-ai/types

> Shared type definitions, Zod schemas, branded identifiers, type guards, and the `EnterstellarError` class for the Enterstellar ecosystem.

This is the foundation package — every other `@enterstellar-ai/*` package depends on it. It defines the vocabulary of the Enterstellar pipeline: contracts, intents, compilation results, traces, zone configs, telemetry signals, state, and connection protocols. All types are framework-agnostic (L15) and split by domain (T6).

## Quick Start

```ts
import {
  createComponentId,
  createTraceId,
  EnterstellarError,
  ComponentContractSchema,
  isComponentIntent,
  ENTERSTELLAR_TYPES_VERSION,
} from '@enterstellar-ai/types';

// Branded identifiers — type-safe, never confused
const id = createComponentId('PatientVitals');
const traceId = createTraceId();

// Zod schema validation at runtime
const result = ComponentContractSchema.safeParse(contractData);
if (!result.success) console.error(result.error);

// Type guards for narrowing unknown data
if (isComponentIntent(unknownValue)) {
  console.log(unknownValue.component); // narrowed
}

// Structured errors with machine-readable codes
throw new EnterstellarError('ENS-1001', 'registry', 'Component already registered.', true);
```

## API Reference

### Branded Types (T10)

| Constructor               | Returns       | Description                                      |
| :------------------------ | :------------ | :----------------------------------------------- |
| `createComponentId(name)` | `ComponentId` | PascalCase component name. Throws on empty.      |
| `createZoneId(name)`      | `ZoneId`      | Kebab-case zone name. Throws on empty.           |
| `createTraceId()`         | `TraceId`     | Auto-generated UUIDv4 via `crypto.randomUUID()`. |

### Core Types

| Type                          | File            | Bible § | Description                                                                   |
| :---------------------------- | :-------------- | :------ | :---------------------------------------------------------------------------- |
| `ComponentContract`           | `contract.ts`   | §3.1    | Component blueprint: props schema, tokens, accessibility, states, examples.   |
| `DesignTokenSet`              | `token.ts`      | §3.1b   | `Record<string, string>` — token path → value mappings.                       |
| `TokenResolver`               | `token.ts`      | §3.1b   | Interface: `resolve(path, context?)` + `validate(path)`.                      |
| `ComponentIntent`             | `intent.ts`     | §3.2    | Agent's output: component name, props, confidence, mode, interaction.         |
| `CompilationResult`           | `compiler.ts`   | §3.3    | Compiler output: validated props, provenance, errors, diff.                   |
| `CompilationError`            | `compiler.ts`   | §3.3    | Structured error with code, path, message, and optional fix.                  |
| `AgentTrace`                  | `trace.ts`      | §3.4    | Full observability record: intent, resolution, compilation, metrics, consent. |
| `ZoneConfig`                  | `config.ts`     | §3.5    | Zone configuration: determinism dial, allowed components, cache, activation.  |
| `ForgeSignal`                 | `telemetry.ts`  | §3.7    | Mandatory telemetry payload. Zero PII. Powers the data flywheel.              |
| `EnterstellarStore`           | `state.ts`      | §3.8    | Framework-agnostic state interface: `get/set/subscribe/snapshot/restore`.     |
| `UserSignal`                  | `connection.ts` | §3.9    | User interaction signal: fire-and-forget dispatch to agent.                   |
| `EnterstellarAgentConnection` | `connection.ts` | §3.10   | Bidirectional agent connection: `dispatch()`, `on()`, `disconnect()`.         |
| `SpatialContext`              | `spatial.ts`    | P13     | DOM-awareness data: zone dimensions, visibility, explicit `captureContext()`. |
| `CompactManifestEntry`        | `manifest.ts`   | §4.1    | Token-efficient LLM context: name, description, props summary.                |
| `ForgeResult`                 | `forge.ts`      | §4.10   | Forge output: generated contract, compilation result, forge mode.             |

### Adapter Interfaces

| Interface          | Methods                                                                                 |
| :----------------- | :-------------------------------------------------------------------------------------- |
| `AuthAdapter`      | `getSession()`, `hasRole(role)`, `signOut()`                                            |
| `DataAdapter`      | `query(resource, params?)`, `mutate(resource, action, data)`, `subscribe(resource, cb)` |
| `ErrorAdapter`     | `report(error, context?)`, `shouldRetry(error, attempt)`, `sanitize(error)`             |
| `AnalyticsAdapter` | `track(event, properties?)`, `identify(userId, traits?)`                                |

### Zod Schemas (T7)

Every data type has a paired Zod schema for runtime validation:

`ComponentContractSchema`, `ComponentIntentSchema`, `CompilationResultSchema`, `CompilationErrorSchema`, `AgentTraceSchema`, `ZoneConfigSchema`, `ForgeSignalSchema`, `UserSignalSchema`, `SerializedStateSchema`, `ZoneStateSchema`, `SessionStateSchema`, `DesignTokenSetSchema`, `ForgeResultSchema`, `ForgeTraceRecordSchema`

### Type Guards (T17)

`isComponentId`, `isZoneId`, `isTraceId`, `isForgeSignal`, `isCompilationResult`, `isComponentIntent`, `isAgentTrace`, `isUserSignal`

### Error Handling

```ts
class EnterstellarError extends Error {
  code: EnterstellarErrorCode;        // 'ENS-1001' through 'ENS-5005'
  module: EnterstellarErrorModule;    // 'registry' | 'compiler' | ... | 'cli'
  recoverable: boolean;       // Can the operation be retried?
  timestamp: string;          // ISO 8601
  toJSON(): { ... };          // Serialization for logging / DevTools
}
```

### Constants

| Export                       | Value     | Description                                    |
| :--------------------------- | :-------- | :--------------------------------------------- |
| `ENTERSTELLAR_TYPES_VERSION` | `'0.1.0'` | Semver for runtime compatibility checks (T14). |

## Configuration

This package has no runtime configuration. All behavior is determined by the types, schemas, and constructors themselves. Consumer packages (e.g., `@enterstellar-ai/registry`, `@enterstellar-ai/compiler`) use these types as their API contracts.

**Build configuration:**

| File               | Purpose                                                           |
| :----------------- | :---------------------------------------------------------------- |
| `tsconfig.json`    | Extends `tsconfig.base.json` — 15 strict flags.                   |
| `tsup.config.ts`   | Builds ESM + CJS + DTS. Overrides `composite: false` for DTS.     |
| `vitest.config.ts` | 90% coverage threshold on lines, functions, branches, statements. |

## See Also

- [Implementation Bible §3](../../agent/03-enterstellar-implementation-bible.md) — canonical type specifications.
- [Design Choices — Module 1](../../agent/04-enterstellar-design-choices.md) — locked decisions T1–T17.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
