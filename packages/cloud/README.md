# @enterstellar-ai/cloud

> Enterstellar Cloud SDK — typed, universal client for `api.enterstellar.dev`. 13 methods + SSE streaming. Throw-on-error. Zero framework dependencies.

## Purpose

`@enterstellar-ai/cloud` provides `createEnterstellarCloudClient()` — the client-side SDK for all Enterstellar Cloud API interactions. Every method returns `CloudResult<T>` with `{ data, ipu }` — a universal wrapper that carries the response data and server-authoritative IPU metering in a single, predictable shape. Operational errors (429, 4xx, retries exhausted) throw `CloudError` with structured metadata (`upgradeUrl`, `retryAfterMs`, `requestId`) — callers never receive degraded or partial results.

**Key properties:**

- **SD3:** Throw-on-error — `CloudError` thrown on 429/4xx/5xx. No degraded returns.
- **SD5:** Blanket retry — 3 attempts with 1s/2s/4s exponential backoff on 5xx and network errors. Same `X-Idempotency-Key` across retries (AM10).
- **SD6:** Dual forge API — `forge()` returns a `Promise<CloudResult<ComponentContract>>`. `forge.stream()` returns `AsyncGenerator<ForgeFragment>` for real-time SSE streaming.
- **SD7:** Universal return type — all methods return `CloudResult<T>` with `{ data: T, ipu: CloudIPU | null }`.
- **SD1:** Anonymous mode — `pk_anon_*` API keys auto-detected. Only `submitSignal()` is available; all other methods throw `ENS-5004`.
- **SD9:** Single runtime dependency — `eventsource-parser` (2KB, MIT) for SSE parsing.
- **CL1:** Hybrid metering — `X-IPU-Used` / `X-IPU-Remaining` / `X-IPU-Cost` headers parsed on every response. Local tracker reconciles with server.
- **TA2:** Consent-gated traces — dual gate: `config.traceConsent` AND `trace.consent.anonymizedAggregation` must both be `true`.
- **L15:** Zero framework dependencies — works in Node.js, Deno, browsers, and SSR.

---

## Quick Start

```ts
import { createEnterstellarCloudClient } from '@enterstellar-ai/cloud';

const cloud = createEnterstellarCloudClient({
  apiKey: process.env['ENTERSTELLAR_API_KEY']!,
  traceConsent: true,
  sessionType: 'app',
});

// Generate via Cloud Forge (10 IPU):
const { data: contract, ipu } = await cloud.forge({ intent: 'show patient vitals' });
console.log(`Cost: ${ipu?.cost} IPU, Remaining: ${ipu?.remaining}`);

// Stream via Cloud Forge SSE (10 IPU):
for await (const fragment of cloud.forge.stream({ intent: 'show patient vitals' })) {
  if (fragment.type === 'node') console.log('Partial:', fragment.data);
  if (fragment.type === 'complete') console.log('Done:', fragment.data);
}

// Search via Cloud Semantic Index (1 IPU):
const { data: results } = await cloud.search('patient vitals display', 5);

// Route via Intent Router (1 IPU):
const { data: prediction } = await cloud.route('sha256_intent_hash');

// Submit trace (0 IPU, consent-gated):
const {
  data: { accepted },
} = await cloud.submitTrace(agentTrace);

// Check usage (0 IPU):
const { data: usage } = await cloud.getUsage();
console.log(`${usage.used}/${usage.limit} IPU used (${usage.tier})`);

// Shutdown:
cloud.dispose();
```

### Anonymous Mode (`pk_anon_*`)

```ts
const anonCloud = createEnterstellarCloudClient({ apiKey: 'pk_anon_<install_id>' });

// Only submitSignal() is available:
await anonCloud.submitSignal(signal); // ✅ Works

await anonCloud.forge({ intent: 'x' }); // ❌ Throws ENS-5004
await anonCloud.search('x'); // ❌ Throws ENS-5004
```

---

## API Reference

### `createEnterstellarCloudClient(config): EnterstellarCloudClient`

Factory function. Validates config, initializes HTTP + SSE transports with bearer auth, creates IPU tracker, and wires all cloud proxy modules. Auto-detects anonymous mode from `pk_anon_` API key prefix.

**Throws:** `CloudError` `ENS-5001` if `apiKey` is empty, whitespace-only, or missing.

### `EnterstellarCloudClient` Methods

| Method                         | Signature                                                          | IPU | Description                                                                                                                       |
| :----------------------------- | :----------------------------------------------------------------- | :-: | :-------------------------------------------------------------------------------------------------------------------------------- |
| `forge(options)`               | `(ForgeOptions) → Promise<CloudResult<ComponentContract>>`         | 10  | Generate a `ComponentContract` via Cloud Forge (SD6).                                                                             |
| `forge.stream(options)`        | `(ForgeOptions) → AsyncGenerator<ForgeFragment>`                   | 10  | Stream forge via SSE. Yields `meta → node* → property* → complete` (CF6).                                                         |
| `search(query, topK?)`         | `(string, number?) → Promise<CloudResult<SemanticSearchResult[]>>` |  1  | Search for components via Cloud Semantic Index. Default `topK: 5` (SI5).                                                          |
| `route(intentHash)`            | `(string) → Promise<CloudResult<RouterPrediction>>`                |  1  | Route an intent hash to predicted components (IR2).                                                                               |
| `routeBatch(intentHashes)`     | `(string[]) → Promise<CloudResult<RouterPrediction[]>>`            | 1×N | Batch routing. `result.data[i]` corresponds to `intentHashes[i]` (F19).                                                           |
| `submitSignal(signal)`         | `(ForgeSignal) → Promise<CloudResult<{ accepted }>>`               |  0  | Submit a forge signal. **Only method available in anonymous mode** (SD1, SD4).                                                    |
| `submitTrace(trace)`           | `(AgentTrace) → Promise<CloudResult<{ accepted }>>`                |  0  | Submit an `AgentTrace`. Consent-gated (TA2): both `config.traceConsent` AND `trace.consent.anonymizedAggregation` must be `true`. |
| `analytics(query)`             | `(AnalyticsQuery) → Promise<CloudResult<AnalyticsResult>>`         |  5  | Query trace analytics. POST to `/v1/traces/analytics` (F17). 30s timeout.                                                         |
| `businessAnalytics(query)`     | `(AnalyticsQuery) → Promise<CloudResult<AnalyticsResult>>`         |  5  | Query business analytics. POST to `/v1/analytics/query` (TA10). 30s timeout.                                                      |
| `getUsage()`                   | `() → Promise<CloudResult<CloudUsage>>`                            |  0  | Query IPU usage for the current billing period.                                                                                   |
| `getTraces(options?)`          | `(TraceListOptions?) → Promise<CloudResult<TracePage>>`            |  0  | List traces with cursor-based pagination (TA7).                                                                                   |
| `getLedger(options?)`          | `(LedgerListOptions?) → Promise<CloudResult<LedgerPage>>`          |  0  | List IPU ledger entries with cursor-based pagination (AM13).                                                                      |
| `certify(contractId)`          | `(string) → Promise<CloudResult<CertifyResult>>`                   | 20  | Start certification. Returns `{ status: 'pending', pollUrl }` (GI5). 90s timeout.                                                 |
| `deleteProjectData(projectId)` | `(string) → Promise<CloudResult<{ accepted }>>`                    |  0  | GDPR soft-delete. Returns `202 Accepted` (AG9).                                                                                   |
| `dispose()`                    | `() → void`                                                        |  —  | Release all resources. Post-dispose calls throw `ENS-5002`. Idempotent.                                                           |

### Types

```ts
/** Configuration for createEnterstellarCloudClient(). */
type CloudConfig = {
  readonly apiKey: string; // Bearer token (CL4)
  readonly baseUrl?: string | undefined; // Default: 'https://api.enterstellar.dev' (SD8)
  readonly timeoutMs?: number | undefined; // Default: 10_000 (per-operation overrides)
  readonly traceConsent?: boolean | undefined; // Default: false (TA2)
  readonly sessionType?: SessionType | undefined; // Default: 'app' (D111)
};

/** Universal return wrapper for all SDK methods (SD7). */
type CloudResult<T> = {
  readonly data: T;
  readonly ipu: CloudIPU | null; // null in anonymous mode or absent headers
};

/** IPU metering data from server response headers. */
type CloudIPU = {
  readonly used: number; // X-IPU-Used
  readonly remaining: number; // X-IPU-Remaining
  readonly cost: number; // X-IPU-Cost
};

/** 5-variant discriminated union for SSE streaming (CF6). */
type ForgeFragment =
  | ForgeMetaFragment // { type: 'meta', data: { provider, model }, ipu }
  | ForgeNodeFragment // { type: 'node', data: Partial<ComponentContract> }
  | ForgePropertyFragment // { type: 'property', data: { path, value } }
  | ForgeCompleteFragment // { type: 'complete', data: ComponentContract, ipu }
  | ForgeErrorFragment; // { type: 'error', data: { code, message } }

/** Session type for ClickHouse analytics (D111). */
type SessionType = 'app' | 'browser' | 'os' | 'connect' | 'agent' | 'other';
```

### Exports

```ts
// Factory
export { createEnterstellarCloudClient } from './create-cloud-client.js';

// Error class (for instanceof checks)
export { CloudError } from './errors.js';

// Constants
export { CLOUD_SDK_VERSION } from './version.js';
export { IPU_COSTS } from './metering/ipu-costs.js';

// Types (re-exported for consumer use)
export type {
  EnterstellarCloudClient,
  CloudConfig,
  CloudIPU,
  CloudResult,
  CloudUsage,
  SessionType,
  ForgeOptions,
  ForgeFragment,
  ForgeFunction,
  ForgeMetaFragment,
  ForgeNodeFragment,
  ForgePropertyFragment,
  ForgeCompleteFragment,
  ForgeErrorFragment,
  RouterPrediction,
  AnalyticsQuery,
  AnalyticsResult,
  TraceListOptions,
  LedgerListOptions,
  TracePage,
  LedgerPage,
  CertifyResult,
} from './types.js';

export type { CloudErrorBody } from './errors.js';
```

---

## Configuration

### `CloudConfig`

| Option         | Type          | Default                          | Description                                                                         |
| :------------- | :------------ | :------------------------------- | :---------------------------------------------------------------------------------- |
| `apiKey`       | `string`      | _(required)_                     | Bearer token for `api.enterstellar.dev`. `pk_anon_*` prefix → anonymous mode (SD1). |
| `baseUrl`      | `string`      | `'https://api.enterstellar.dev'` | Cloud API base URL. Override for staging/self-hosted (SD8).                         |
| `timeoutMs`    | `number`      | `10_000`                         | Default per-request HTTP timeout. Per-operation overrides apply (F21).              |
| `traceConsent` | `boolean`     | `false`                          | Client-level trace consent flag (TA2). Must also have per-trace consent.            |
| `sessionType`  | `SessionType` | `'app'`                          | Session type for ClickHouse analytics (D111).                                       |

### IPU Cost Schedule (§9.1)

| Operation           |  Cost   | API Endpoint                     | Timeout |
| :------------------ | :-----: | :------------------------------- | :-----: |
| Cloud Forge         | 10 IPU  | `POST /v1/forge`                 |   30s   |
| Semantic Search     |  1 IPU  | `POST /v1/semantic-search`       |   10s   |
| Route               |  1 IPU  | `POST /v1/route`                 |   10s   |
| Route Batch         | 1×N IPU | `POST /v1/route/batch`           |   10s   |
| Trace Analytics     |  5 IPU  | `POST /v1/traces/analytics`      |   30s   |
| Business Analytics  |  5 IPU  | `POST /v1/analytics/query`       |   30s   |
| Certify             | 20 IPU  | `POST /v1/contracts/:id/certify` |   90s   |
| Signal Submit       |  0 IPU  | `POST /v1/signals`               |   10s   |
| Trace Submit        |  0 IPU  | `POST /v1/traces`                |   10s   |
| Get Traces          |  0 IPU  | `GET /v1/traces`                 |   10s   |
| Ledger Query        |  0 IPU  | `GET /v1/usage/ledger`           |   10s   |
| Usage Query         |  0 IPU  | `GET /v1/usage`                  |   10s   |
| Delete Project Data |  0 IPU  | `DELETE /v1/project/:id/data`    |   10s   |

---

## Error Handling (SD3)

All operational errors throw `CloudError` with structured metadata:

```ts
try {
  await cloud.forge({ intent: 'show vitals' });
} catch (error) {
  if (error instanceof CloudError) {
    console.log(error.code); // 'ENS-5003' (base code)
    console.log(error.cloudCode); // 'ENS-C4290' (server code)
    console.log(error.upgradeUrl); // 'https://cloud.enterstellar.dev/billing/upgrade'
    console.log(error.retryAfterMs); // 3600000
    console.log(error.requestId); // 'req_01HYX...'
    console.log(error.recoverable); // true (429 is recoverable)
  }
}
```

### Error Codes

| Code        | Module | Recoverable | Description                                                                       |
| :---------- | :----- | :---------- | :-------------------------------------------------------------------------------- |
| `ENS-5001`  | cloud  | No          | `apiKey` is empty or missing — configuration error.                               |
| `ENS-5002`  | cloud  | No          | Method called after `dispose()` — logic error.                                    |
| `ENS-5003`  | cloud  | Yes         | Server request failed — network/server error, can retry.                          |
| `ENS-5004`  | cloud  | No          | Method called in anonymous mode — `pk_anon_*` key only supports `submitSignal()`. |
| `ENS-5005`  | cloud  | Yes         | All 3 retry attempts exhausted — 5xx/network persistent failure.                  |
| `ENS-C4290` | cloud  | Yes         | IPU quota exceeded — carries `upgradeUrl` and `retryAfterMs`.                     |

### Retry Strategy (SD5)

```
Transport: fetch POST /v1/{endpoint}
    │
    ├── Attempt 1
    │     5xx/network → wait 1s → Attempt 2
    │     429         → throw CloudError (ENS-C4290) immediately
    │     4xx         → throw CloudError immediately (no retry)
    │     2xx         → parse response → return CloudResult<T>
    │
    ├── Attempt 2
    │     5xx/network → wait 2s → Attempt 3
    │     Same X-Idempotency-Key as Attempt 1 (AM10)
    │
    └── Attempt 3
          5xx/network → throw CloudError (ENS-5005)
          2xx         → parse response → return CloudResult<T>
```

---

## Consent Model (TA2)

Trace submission requires dual consent:

```
client.submitTrace(trace)
    │
    ├── Gate 1: config.traceConsent === true?
    │     false → return { data: { accepted: false }, ipu: null }  (zero network)
    │
    ├── Gate 2: trace.consent.anonymizedAggregation === true?
    │     false → return { data: { accepted: false }, ipu: null }  (zero network)
    │
    └── Both true → POST /v1/traces → return { data: { accepted }, ipu }
```

---

## Design Choices Applied

SD1 (anonymous mode auto-detection), SD2 (additive semver), SD3 (throw-on-error), SD4 (transparent telemetry), SD5 (blanket retry with backoff), SD6 (dual forge API), SD7 (universal `CloudResult<T>`), SD8 (default `baseUrl`), SD9 (`eventsource-parser` only dep), SD10 (`@enterstellar-cloud/types`), CL1 (hybrid IPU tracking), AM10 (universal idempotency), CF6 (SSE event types), D111 (`sessionType`), TA2 (consent-gated traces), F17 (POST for analytics), F18 (IPU on meta+complete), F19 (batch ordering), F21 (per-operation timeouts), F22 (User-Agent header), L15 (framework-agnostic).

---

## Bible Reference

See [Implementation Bible §9.1–§9.4](../../archive/CLOUD/02-enterstellar-cloud-implementation-bible.md) for the canonical API surface, endpoint mapping, header contract, and error body format.
See [Locked Design Choices SD1–SD10](../../archive/CLOUD/03-enterstellar-cloud-design-choices.md) for all SDK design decisions.
