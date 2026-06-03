# @enterstellar-ai/global-index

> Federated registry discovery and search — the npm for ComponentContracts.

## Purpose

`@enterstellar-ai/global-index` provides `createGlobalIndex()` — the client SDK for the Global Index service at `index.enterstellar.dev`. It enables contract discovery across federated registries, full-text search, registry management, and publish-to-earn tracking. Every public method is type-safe, returns frozen objects, and produces `EnterstellarError` on failure — never raw exceptions.

**Key properties:**

- **GI1 (Discovery):** Registries self-register via `POST /v1/registries`. `GET /v1/registries` lists all. `POST /v1/registries/{id}/refresh` triggers on-demand refresh.
- **GI2 (Refresh):** On-demand registry refresh — no scheduled crawler on the client side.
- **GI3 (Verification):** Two tiers: "Indexed" (schema, tokens, a11y) and "Enterstellar Certified" (additional visual/functional tests). Client-side `verifyContract()` is a pre-check only.
- **GI4 (Screenshots):** PNG screenshots for "Certified" components, CDN-backed.
- **GI5 (Search):** Centralized search index for sub-100ms latency. `POST /v1/search` with filters, `GET /v1/contracts/{name}`, `GET /v1/featured`.
- **L15:** Zero framework dependencies — works in Node.js, Deno, browsers, and SSR.
- **Dispose guard:** Post-dispose method calls throw `ENS-5031` immediately. No leaked resources.

---

## Quick Start

```ts
import { createGlobalIndex } from '@enterstellar-ai/global-index';
import { createEnterstellarCloudClient } from '@enterstellar-ai/cloud';

const cloud = createEnterstellarCloudClient({ apiKey: 'cloud-key', tier: 'pro' });
const index = createGlobalIndex({
  apiKey: 'index-key',
  cloudClient: cloud,
});

// Search across all federated registries:
const results = await index.search('patient vitals', {
  topK: 10,
  filters: { category: 'clinical', certified: true },
});

// Get a specific contract by name + registry:
const contract = await index.getContract('PatientVitals', 'https://registry.acme.health');

// Get trending/featured contracts:
const featured = await index.featured();

// Register a new federated registry:
const registry = await index.registerRegistry({
  name: 'ACME Clinical',
  url: 'https://registry.acme.health',
  publisher: 'ACME Corp',
});

// Publish a contract:
const published = await index.publishContract(myContract);

// Check publisher earnings:
const stats = await index.getPublisherStats('ACME Corp');

// Cleanup on shutdown:
index.dispose();
```

---

## API Reference

### `createGlobalIndex(config): GlobalIndex`

Factory function. Validates config, creates internal HTTP transport with Bearer auth, and wires all internal modules (discovery, publishing, badges). Returns a frozen `GlobalIndex` instance.

**Throws:** `EnterstellarError` `ENS-5030` if `apiKey` is empty/missing or `cloudClient` is invalid.

### `GlobalIndex` Methods

| Method                           | Signature                                                                  | Description                                                                                                                            |
| :------------------------------- | :------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| `search(query, options?)`        | `(string, GlobalSearchOptions?) => Promise<readonly GlobalSearchResult[]>` | Search for contracts across all federated registries. Calls `POST /v1/search`. Supports category/publisher/certified filters and topK. |
| `getContract(name, registryUrl)` | `(string, string) => Promise<GlobalSearchResult \| null>`                  | Get details of a specific contract. Returns `null` on 404. Calls `GET /v1/contracts/{name}?registry={url}`.                            |
| `featured()`                     | `() => Promise<readonly GlobalSearchResult[]>`                             | Get trending/featured contracts. Calls `GET /v1/featured`.                                                                             |
| `registerRegistry(registration)` | `(RegistryRegistration) => Promise<FederatedRegistry>`                     | Register a new federated registry. Calls `POST /v1/registries`. Validates name/URL/publisher locally before sending.                   |
| `listRegistries()`               | `() => Promise<readonly FederatedRegistry[]>`                              | List all registered federated registries. Calls `GET /v1/registries`.                                                                  |
| `refreshRegistry(registryId)`    | `(string) => Promise<FederatedRegistry>`                                   | Trigger an on-demand registry refresh. Calls `POST /v1/registries/{id}/refresh`.                                                       |
| `publishContract(contract)`      | `(ComponentContract) => Promise<GlobalSearchResult>`                       | Publish a contract to the Global Index. Runs local Zod pre-validation (fail-fast). Calls `POST /v1/contracts`.                         |
| `getPublisherStats(publisher)`   | `(string) => Promise<PublishEarnings>`                                     | Get publish-to-earn stats for a publisher. Calls `GET /v1/publishers/{id}/stats`.                                                      |
| `dispose()`                      | `() => void`                                                               | Release resources. Post-dispose calls throw `ENS-5031`. Idempotent.                                                                    |

### Utility Functions

| Function                       | Signature                                     | Description                                                                                                           |
| :----------------------------- | :-------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `verifyContract(data)`         | `(unknown) => ContractVerification`           | Client-side Zod validation against `ComponentContractSchema`. Returns `{ valid, issues }`. Pure function, no network. |
| `isValidContract(data)`        | `(unknown) => boolean`                        | Boolean type guard — returns `true` if data passes `ComponentContractSchema`.                                         |
| `isCertified(result)`          | `(GlobalSearchResult) => boolean`             | Returns `true` when `certified=true` AND `certificationTier='certified'`. Defensive dual-check.                       |
| `isIndexed(result)`            | `(GlobalSearchResult) => boolean`             | Returns `true` when `certificationTier='indexed'`.                                                                    |
| `getCertificationTier(result)` | `(GlobalSearchResult) => CertificationTier`   | Direct accessor: `'indexed'` or `'certified'`.                                                                        |
| `getScreenshotUrl(result)`     | `(GlobalSearchResult) => string \| undefined` | Returns the CDN screenshot URL, or `undefined` if not available.                                                      |
| `hasScreenshot(result)`        | `(GlobalSearchResult) => boolean`             | Returns `true` when a non-empty `screenshotUrl` is present.                                                           |
| `getRelevanceScore(result)`    | `(GlobalSearchResult) => number`              | Returns the relevance score (0–1), defaulting to `0` if undefined.                                                    |

### Types

```ts
type GlobalIndexConfig = {
  readonly apiKey: string; // Bearer token for index.enterstellar.dev
  readonly cloudClient: CloudClientLike; // EnterstellarCloudClient structural dependency
  readonly endpoint?: string | undefined; // Default: 'https://index.enterstellar.dev'
  readonly timeoutMs?: number | undefined; // Default: 10_000
};

type GlobalSearchResult = {
  readonly contract: ComponentContract;
  readonly registryUrl: string;
  readonly publisher: string;
  readonly stars: number;
  readonly usageCount: number;
  readonly certified: boolean;
  readonly certificationTier: CertificationTier;
  readonly score?: number | undefined;
  readonly screenshotUrl?: string | undefined;
};

type FederatedRegistry = {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly publisher: string;
  readonly contractCount: number;
  readonly lastRefreshedAt: string;
  readonly active: boolean;
};

type PublishEarnings = {
  readonly publisher: string;
  readonly totalContracts: number;
  readonly totalRenders: number;
  readonly revenueShareCents: number;
  readonly freeCreditsEarned: number;
  readonly certifiedCount: number;
};
```

### Exports

```ts
// Factory
export { createGlobalIndex } from './create-global-index.js';

// Types (re-exported for consumer use)
export type {
  CertificationTier,
  CloudClientLike,
  ContractVerification,
  ContractVerificationIssue,
  FederatedRegistry,
  GlobalIndex,
  GlobalIndexConfig,
  GlobalSearchFilters,
  GlobalSearchOptions,
  GlobalSearchResult,
  PublishEarnings,
  RegistryRegistration,
} from './types.js';

// Contract verification utilities
export { isValidContract, verifyContract } from './discovery/contract-verifier.js';

// Badge / certification utilities
export {
  getCertificationTier,
  getRelevanceScore,
  getScreenshotUrl,
  hasScreenshot,
  isCertified,
  isIndexed,
} from './publishing/badge-service.js';
```

---

## Configuration

### `GlobalIndexConfig`

| Option        | Type              | Default                            | Description                                                                                 |
| :------------ | :---------------- | :--------------------------------- | :------------------------------------------------------------------------------------------ |
| `apiKey`      | `string`          | _(required)_                       | Bearer token for `index.enterstellar.dev`.                                                  |
| `cloudClient` | `CloudClientLike` | _(required)_                       | `EnterstellarCloudClient` instance (structural dependency — must have `getUsage()` method). |
| `endpoint`    | `string`          | `'https://index.enterstellar.dev'` | Global Index service base URL. Override for staging/self-hosted.                            |
| `timeoutMs`   | `number`          | `10_000`                           | Per-request HTTP timeout in ms via `AbortController`. Must be positive.                     |

---

## Error Codes

| Code       | Module       | Recoverable | Description                                                                           |
| :--------- | :----------- | :---------- | :------------------------------------------------------------------------------------ |
| `ENS-5030` | global-index | No          | Configuration error — missing `apiKey`, invalid `cloudClient`, or bad `timeoutMs`.    |
| `ENS-5031` | global-index | No          | Method called after `dispose()` — create a new instance via `createGlobalIndex()`.    |
| `ENS-5032` | global-index | Yes         | Search/network error — HTTP failure, timeout, or network unavailable. Retryable.      |
| `ENS-5033` | global-index | Yes         | Contract not found — expected case for `getContract()` returning `null`.              |
| `ENS-5034` | global-index | Yes         | Registry operation failed — registration input invalid or server error.               |
| `ENS-5035` | global-index | Yes         | Response validation failed — server returned data that doesn't match expected schema. |

---

## Design Choices Applied

GI1 (registry self-registration), GI2 (on-demand refresh), GI3 (two-tier verification: Indexed/Certified), GI4 (CDN-backed screenshots), GI5 (centralized search index), L12/TL10 (no PII in transit), L15 (framework-agnostic).

---

## Bible Reference

See [Implementation Bible §4.14](../../agent/03-enterstellar-implementation-bible.md) for the canonical `GlobalIndex` specification, and [Design Choices Appendix](../../agent/04-enterstellar-design-choices.md) for decisions GI1–GI5.
