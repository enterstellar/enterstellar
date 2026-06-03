# Enterstellar Contract Protocol — Conformance Suite

Cross-language test fixtures for validating Enterstellar contract implementations.

## Structure

Each schema has a directory containing `valid/` and `invalid/` subdirectories:

```
conformance/
├── {schema-name}/
│   ├── valid/
│   │   ├── minimal.json      # Minimum valid document (required fields only)
│   │   └── full.json         # All fields populated (required + optional)
│   └── invalid/
│       ├── {violation}.json   # One specific schema violation per file
│       └── ...
```

## Usage

1. Load the schema from `schemas/{schema-name}.json`
2. For each file in `conformance/{schema-name}/valid/`:  
   → Validate against the schema → **MUST pass**
3. For each file in `conformance/{schema-name}/invalid/`:  
   → Validate against the schema → **MUST fail**

### Example: Python (jsonschema)

```python
import json
import jsonschema

schema = json.load(open("schemas/component-contract.json"))
valid   = json.load(open("conformance/component-contract/valid/minimal.json"))
invalid = json.load(open("conformance/component-contract/invalid/missing-name.json"))

jsonschema.validate(valid, schema)          # ✅ No exception
jsonschema.validate(invalid, schema)        # ❌ Raises ValidationError
```

### Example: Swift (JSONSchema)

```swift
let schema = try JSONSchema(data: schemaData)
let valid  = try JSONSerialization.jsonObject(with: validData)
let invalid = try JSONSerialization.jsonObject(with: invalidData)

XCTAssertNoThrow(try schema.validate(valid))     // ✅
XCTAssertThrowsError(try schema.validate(invalid)) // ❌
```

## Conventions

- **One violation per file.** Each invalid fixture tests exactly one schema rule.
- **File names describe the violation.** E.g., `missing-name.json`, `invalid-category.json`.
- **No external dependencies.** Fixtures are standalone JSON — no `$ref` resolution needed.
- **All JSON Schema Draft-07.** Use any Draft-07-compatible validator.

## Schemas Covered

| Schema               | Fixtures                                             |
| :------------------- | :--------------------------------------------------- |
| `component-contract` | Minimal, full, and 2 invalid variants                |
| `component-intent`   | Minimal, full, and 1 invalid variant                 |
| `compilation-result` | Minimal, full, and 1 invalid variant                 |
| `agent-trace`        | Minimal, full, and 1 invalid variant                 |
| `forge-signal`       | Complete (all fields required) and 1 invalid variant |
| `user-signal`        | Minimal, full, and 1 invalid variant                 |
| `zone-config`        | Complete (all fields required) and 1 invalid variant |
| `design-tokens-dtcg` | Valid token set and 1 invalid variant                |

## See Also

- [PROTOCOL_VERSION.md](../PROTOCOL_VERSION.md) — Protocol version and compatibility rules.
- [schemas/](../schemas/) — The JSON Schema definitions.
- [examples/](../examples/) — Realistic example documents (also valid fixtures).
