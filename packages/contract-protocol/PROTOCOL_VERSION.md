# Enterstellar Contract Protocol — Versioning Policy

## Version Locking (CP1)

The version of `@enterstellar-ai/contract-protocol` is **permanently locked** to `@enterstellar-ai/types`.

If `@enterstellar-ai/types` is `1.2.0`, then `@enterstellar-ai/contract-protocol` **must** be `1.2.0`.

This is a non-negotiable invariant. There is no independent versioning for this package.

## Rationale

`@enterstellar-ai/contract-protocol` is a **serialized artifact** of `@enterstellar-ai/types`. Every schema in `schemas/` is generated directly from a Zod schema defined in `@enterstellar-ai/types` (except `design-tokens-dtcg.json`, which is hand-crafted but still versioned with the package). Independent versioning would create:

1. **Cognitive overhead** — developers must maintain a mapping matrix between type versions and schema versions.
2. **Drift risk** — schemas could fall out of sync with their source Zod definitions.
3. **Breaking confusion** — a `2.0.0` schema version implies breaking changes in the schema that may not correspond to breaking changes in the types.

## How to Release

1. Bump `@enterstellar-ai/types` version (e.g., `0.0.0` → `1.0.0`).
2. Set `@enterstellar-ai/contract-protocol` version to the **exact same value** (`1.0.0`).
3. Run `pnpm --filter @enterstellar-ai/contract-protocol run generate` to regenerate schemas.
4. Run `git diff schemas/` to verify schema changes match the type changes.
5. Commit both packages in the same changeset.

## Draft Specification

- **JSON Schema Draft:** Draft-07 (CP2 — permanently locked).
- **`$id` Strategy:** Relative paths (e.g., `./component-contract.json`) — no absolute URIs, permanently (CP7).
- **`$ref` Strategy:** No inter-schema `$ref` — each schema is self-contained (CP7).

## Current Version

```
0.0.0
```
