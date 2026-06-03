# @enterstellar-ai/contract-protocol

> Language-agnostic JSON Schema definitions of Enterstellar's core data contracts — the Enterstellar Protocol Spec for non-TypeScript renderers.

This package is the interoperability bridge. It publishes 8 JSON Schemas (Draft-07) that formalize the Enterstellar pipeline contracts: `ComponentContract`, `ComponentIntent`, `CompilationResult`, `AgentTrace`, `ForgeSignal`, `UserSignal`, `ZoneConfig`, and `DesignTokens (DTCG)`. Every schema is auto-generated from `@enterstellar-ai/types` Zod schemas (except DTCG, which is hand-crafted per CP9). Non-TypeScript environments (Swift, Kotlin, Python, Rust) use these schemas directly — no `@enterstellar-ai/types` dependency required.

## Quick Start

**TypeScript/Node.js — CLI validation:**

```bash
# Validate a contract file against the schema
npx @enterstellar-ai/contract-protocol validate component-contract my-contract.json

# Validate a telemetry signal
npx @enterstellar-ai/contract-protocol validate forge-signal signal.json
```

**Python — runtime validation:**

```python
import json
import jsonschema

with open("schemas/component-contract.json") as f:
    schema = json.load(f)

contract = {
    "name": "PatientVitals",
    "id": "patient-vitals",
    "description": "Displays patient vital signs",
    # ... all required fields
}

jsonschema.validate(contract, schema)  # raises on failure
```

**Swift — runtime validation:**

```swift
import Foundation

let schemaData = try Data(contentsOf: schemaURL)
let schema = try JSONSerialization.jsonObject(with: schemaData)
// Use a Draft-07 validator (e.g., JSONSchema.swift)
```

## Schemas

| Schema                | File                      | Source             | Description                                                           |
| :-------------------- | :------------------------ | :----------------- | :-------------------------------------------------------------------- |
| `ComponentContract`   | `component-contract.json` | Auto-generated     | Component blueprint: props, tokens, accessibility, states, examples.  |
| `ComponentIntent`     | `component-intent.json`   | Auto-generated     | Agent's output: component name, props, confidence, mode, interaction. |
| `CompilationResult`   | `compilation-result.json` | Auto-generated     | Compiler output: validated props, provenance, errors, diff.           |
| `AgentTrace`          | `agent-trace.json`        | Auto-generated     | Full observability record: intent, resolution, compilation, metrics.  |
| `ForgeSignal`         | `forge-signal.json`       | Auto-generated     | Mandatory telemetry payload. Zero PII. Powers the data flywheel.      |
| `UserSignal`          | `user-signal.json`        | Auto-generated     | User interaction signal: fire-and-forget dispatch to agent.           |
| `ZoneConfig`          | `zone-config.json`        | Auto-generated     | Zone configuration: determinism dial, allowed components, cache.      |
| `DesignTokens (DTCG)` | `design-tokens-dtcg.json` | Hand-crafted (CP9) | Enterstellar-specific subset of W3C DTCG spec. 5 token groups.        |

All schemas use JSON Schema Draft-07 (CP2) with relative `$id` (CP7).

## CLI Validator

The CLI validator uses `ajv` to validate any JSON file against any Enterstellar schema.

```bash
enterstellar-protocol-validate <schema-name> <input-file>
```

**Exit codes:**

| Code | Meaning                                                     |
| :--- | :---------------------------------------------------------- |
| `0`  | Input is valid against the schema.                          |
| `1`  | Input is invalid — validation errors printed to stderr.     |
| `2`  | Usage error — missing args, unknown schema, file not found. |

**Example output (invalid):**

```
FAIL: 'my-contract.json' is invalid against 'component-contract'.

Validation errors:
  1. (root): must have required property 'name' [{"missingProperty":"name"}]
```

## Examples

7 example files in `examples/` form a coherent clinical pipeline narrative around a `PatientVitals` component:

| File                                     | Schema               | Description                                        |
| :--------------------------------------- | :------------------- | :------------------------------------------------- |
| `patient-vitals.contract.json`           | `component-contract` | Full contract with data source, auth, tokens.      |
| `patient-vitals.intent.json`             | `component-intent`   | Agent's request with AG-UI source metadata.        |
| `patient-vitals.compilation-result.json` | `compilation-result` | Passing compilation with accessibility injection.  |
| `patient-vitals.signal.json`             | `forge-signal`       | Telemetry payload (SHA-256 intent hash, zero PII). |
| `patient-vitals.trace.json`              | `agent-trace`        | Full pipeline trace with latency breakdown.        |
| `patient-vitals.user-signal.json`        | `user-signal`        | Click interaction from patient sidebar zone.       |
| `zone-config.example.json`               | `zone-config`        | Clinical patient-sidebar zone configuration.       |

All examples validate against their respective schemas.

## Conformance Suite

The `conformance/` directory provides valid and invalid fixture pairs for every schema. Non-TypeScript teams use these to verify their JSON Schema validator implementations.

```
conformance/
├── component-contract/
│   ├── valid/minimal.json     # Required fields only — MUST pass
│   ├── valid/full.json        # All fields including optionals — MUST pass
│   ├── invalid/missing-name.json
│   └── invalid/description-too-long.json
├── component-intent/
│   ├── valid/minimal.json
│   ├── valid/full.json
│   └── invalid/confidence-out-of-range.json
├── ... (8 schema directories total)
└── README.md                  # Usage guide with Python + Swift examples
```

**23 fixtures total** covering: required-field checks, maxLength, number ranges `[0, 1]`, enum constraints, `exclusiveMinimum`, and `additionalProperties`.

## Configuration

This package has no runtime configuration. It ships static JSON files only.

**Build & tooling configuration:**

| File                  | Purpose                                                               |
| :-------------------- | :-------------------------------------------------------------------- |
| `tsconfig.json`       | Extends `tsconfig.base.json`. `noEmit: true` (no compiled TS output). |
| `vitest.config.ts`    | 90% coverage threshold. Tests in `__tests__/`.                        |
| `scripts/generate.ts` | Schema generator — `pnpm run generate` to regenerate.                 |

**Schema generation:**

```bash
# Regenerate all schemas from @enterstellar-ai/types Zod schemas
pnpm --filter @enterstellar-ai/contract-protocol run generate

# Verify no drift (CI check)
pnpm --filter @enterstellar-ai/contract-protocol run generate && git diff --exit-code schemas/
```

**Versioning:** Schema versions are locked to `@enterstellar-ai/types` — when `@enterstellar-ai/types` is `1.2.0`, `@enterstellar-ai/contract-protocol` is `1.2.0` (CP1).

## See Also

- [Implementation Bible §4.14b](../../agent/03-enterstellar-implementation-bible.md) — canonical contract-protocol specification.
- [Design Choices — Module 18b](../../agent/04-enterstellar-design-choices.md) — locked decisions CP1–CP10.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, README standard.
- [PROTOCOL_VERSION.md](./PROTOCOL_VERSION.md) — schema versioning policy.
