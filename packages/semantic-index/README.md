# @enterstellar-ai/semantic-index

> Embedding-based component retrieval — reduces the LLM context window from ~50K tokens to ~200 by selecting only the most relevant `ComponentContract`s for any natural-language intent.

The Semantic Index is the core of Enterstellar's Intent Router (Moat M4). It embeds every registered component into a dense vector space and uses cosine similarity to match intents to components — enabling the LLM to see only what matters, not the entire registry.

## Quick Start

```ts
import { createSemanticIndex } from '@enterstellar-ai/semantic-index';
import { createRegistry, defineComponent } from '@enterstellar-ai/registry';

// 1. Create a registry with components
const registry = createRegistry({ components: [PatientVitals, MedicationList] });

// 2. Create the semantic index with an embedding provider
const index = createSemanticIndex({
  registry,
  provider: 'local',
  embeddingProvider: myOnnxProvider, // implements EmbeddingProvider
});

// 3. Build the index (embeds all components)
await index.build();

// 4. Search for components matching an intent
const results = await index.search('show patient vitals');
// [{ componentName: 'PatientVitals', similarity: 0.92, contract: ... }]

// 5. Generate token-efficient manifest for LLM prompt injection
const manifest = index.getCompactManifest(results);
// CompactManifestEntry[] with similarity scores (SI8)
```

## API Reference

### Factory

| Function                      | Returns         | Description                                                 |
| :---------------------------- | :-------------- | :---------------------------------------------------------- |
| `createSemanticIndex(config)` | `SemanticIndex` | Creates the index. Returns plain object with closures (R1). |

### `SemanticIndex` Interface

| Method                        | Returns                           | Description                                                                                  |
| :---------------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------- |
| `build()`                     | `Promise<void>`                   | Embeds all registry components into the vector store. Must be called once before `search()`. |
| `search(intent, options?)`    | `Promise<SemanticSearchResult[]>` | Returns top-K components matching the intent, sorted by similarity.                          |
| `getCompactManifest(results)` | `CompactManifestEntry[]`          | Generates token-efficient manifest entries with similarity scores (SI8).                     |
| `warmup(intents)`             | `Promise<void>`                   | Pre-computes embeddings and caches results for common intents (SI11).                        |
| `rebuild()`                   | `Promise<void>`                   | Clears store + cache and rebuilds the full index.                                            |
| `size`                        | `number`                          | Current number of indexed components.                                                        |

### `EmbeddingProvider` Interface

| Method         | Returns                   | Description                             |
| :------------- | :------------------------ | :-------------------------------------- |
| `embed(texts)` | `Promise<Float64Array[]>` | Embeds text strings into dense vectors. |
| `dimensions`   | `number`                  | Dimensionality of output vectors.       |

### Search Options

| Option   | Type           | Default | Description                                            |
| :------- | :------------- | :------ | :----------------------------------------------------- |
| `topK`   | `number`       | `5`     | Max results (1–20). Throws `ENS-5022` if out of range. |
| `filter` | `SearchFilter` | —       | Post-search filter by `category` and/or `tags` (SI7).  |

### Error Codes

| Code       | Scenario                                     | Recoverable |
| :--------- | :------------------------------------------- | :---------- |
| `ENS-5020` | Embedding provider failed                    | ✅ Yes      |
| `ENS-5021` | `search()` called before `build()`           | ❌ No       |
| `ENS-5022` | Invalid `topK` (outside 1–20)                | ❌ No       |
| `ENS-5023` | Cloud endpoint unreachable (hybrid fallback) | ✅ Yes      |
| `ENS-5024` | Embedding dimension mismatch                 | ❌ No       |
| `ENS-5025` | Warmup failed for one or more intents        | ✅ Yes      |

### Types

| Type                   | Description                                                                                                             |
| :--------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| `SemanticIndex`        | Full index interface (all methods above).                                                                               |
| `SemanticIndexConfig`  | Config for `createSemanticIndex()`: `registry`, `provider`, `embeddingProvider?`, `noMatchThreshold?`, `maxCacheSize?`. |
| `SearchOptions`        | `{ topK?: number, filter?: SearchFilter }`.                                                                             |
| `SearchFilter`         | `{ category?: string, tags?: string[] }`.                                                                               |
| `EmbeddingProvider`    | Pluggable embedding model interface.                                                                                    |
| `VectorStore`          | Abstract vector storage interface.                                                                                      |
| `VectorSearchHit`      | `{ id: string, score: number }`.                                                                                        |
| `QueryCache`           | LRU cache interface for search results.                                                                                 |
| `SemanticSearchResult` | `{ componentName, similarity, contract }` — from `@enterstellar-ai/types`.                                              |

## Design Choices Applied

| Decision | Summary                                                                                   |
| :------- | :---------------------------------------------------------------------------------------- |
| **SI1**  | Default local model: ONNX `all-MiniLM-L6-v2` (384 dims, ~30MB).                           |
| **SI2**  | Embedding text: `name + description + category + tags + props.keys + accessibility.role`. |
| **SI3**  | Auto-recompute on registry `register`/`update`/`unregister` events.                       |
| **SI4**  | Brute-force cosine ≤500 components; HNSW 500+ (HNSW adapter-ready).                       |
| **SI5**  | Default `topK: 5`, max 20.                                                                |
| **SI6**  | Default `noMatchThreshold: 0.4` — below triggers Forge (caller's responsibility).         |
| **SI7**  | Post-search filtered by `category`, `tags`.                                               |
| **SI8**  | Similarity scores included in `CompactManifestEntry.score`.                               |
| **SI9**  | LRU cache (max 100, exact string match, invalidated on registry changes).                 |
| **SI10** | Performance target: <10ms for 500 components, <30ms for 5000.                             |
| **SI11** | `warmup(intents)` pre-computes embeddings + caches results.                               |
| **SI12** | Hybrid: local first, cloud fallback when local confidence < threshold.                    |

## Configuration

### `SemanticIndexConfig` Options

| Option              | Type                             | Required         | Default | Description                                                   |
| :------------------ | :------------------------------- | :--------------- | :------ | :------------------------------------------------------------ |
| `registry`          | `EnterstellarRegistry`           | Yes              | —       | Registry to index. Events subscribed for incremental updates. |
| `provider`          | `'local' \| 'cloud' \| 'hybrid'` | Yes              | —       | Where embedding + search runs.                                |
| `embeddingProvider` | `EmbeddingProvider`              | For local/hybrid | —       | Pluggable embedding model.                                    |
| `cloudEndpoint`     | `string`                         | For cloud        | —       | Cloud semantic search endpoint URL.                           |
| `noMatchThreshold`  | `number`                         | No               | `0.4`   | Min similarity score. Below = excluded.                       |
| `maxCacheSize`      | `number`                         | No               | `100`   | LRU cache capacity.                                           |

### Build Configuration

| File               | Purpose                                         |
| :----------------- | :---------------------------------------------- |
| `tsconfig.json`    | Extends `tsconfig.base.json` — 15 strict flags. |
| `tsup.config.ts`   | Builds ESM + CJS + DTS.                         |
| `vitest.config.ts` | Test runner with 90% coverage thresholds.       |

**Peer dependencies:** `@enterstellar-ai/types`

## See Also

- [Implementation Bible §4.7](../../agent/03-enterstellar-implementation-bible.md) — semantic index specification.
- [Design Choices — SI1–SI12](../../agent/04-enterstellar-design-choices.md) — locked decisions.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
