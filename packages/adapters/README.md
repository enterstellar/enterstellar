# @enterstellar-ai/adapters

> Pluggable infrastructure adapters — auth, data, error handling, analytics.

This package provides **factory functions** for creating validated adapter instances that bridge Enterstellar components to external services. Every adapter method is wrapped in error handling (AD5) — raw vendor errors never leak to consumers. The package is framework-agnostic (L15) and exports only interfaces and factories, not concrete implementations.

## Quick Start

```ts
import {
  createAuthAdapter,
  createDataAdapter,
  createErrorAdapter,
  createAnalyticsAdapter,
} from '@enterstellar-ai/adapters';

// 1. Create adapters with your implementations
const auth = createAuthAdapter({
  name: 'supabase-auth',
  getSession: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return { userId: data.session.user.id, roles: ['clinician'] };
  },
  hasRole: async (role) => {
    const session = await supabase.auth.getSession();
    return session.data.session?.user.role === role;
  },
  onAuthChange: (cb) => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      cb(session ? { userId: session.user.id, roles: ['clinician'] } : null);
    });
    return () => data.subscription.unsubscribe();
  },
});

const data = createDataAdapter({
  name: 'supabase-data',
  query: async (resource, params) => {
    const { data } = await supabase
      .from(resource)
      .select('*')
      .match(params ?? {});
    return data ?? [];
  },
  mutate: async (resource, action, payload) => {
    if (action === 'create') {
      const { data } = await supabase.from(resource).insert(payload).select().single();
      return data;
    }
    return null;
  },
  subscribe: (resource, callback) => {
    const channel = supabase
      .channel(resource)
      .on('postgres_changes', { event: '*', schema: 'public', table: resource }, () => {
        data.query(resource).then(callback);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  },
});

// 2. Pass adapters to Provider
// <Provider adapters={{ auth, data }} ... />

// 3. For testing, use noop adapters
import { createNoopAuthAdapter, createNoopDataAdapter } from '@enterstellar-ai/adapters';
const testAuth = createNoopAuthAdapter(); // getSession → null, hasRole → false
const testData = createNoopDataAdapter(); // query → [], mutate → null
```

## API Reference

### Factories

| Function                         | Returns            | Description                                                           |
| :------------------------------- | :----------------- | :-------------------------------------------------------------------- |
| `createAuthAdapter(config)`      | `AuthAdapter`      | Validates config, wraps methods in AD5 error handling. Frozen object. |
| `createDataAdapter(config)`      | `DataAdapter`      | Validates config, wraps query/mutate/subscribe. Frozen object.        |
| `createErrorAdapter(config)`     | `ErrorAdapter`     | Validates config, wraps report/shouldRetry/sanitize. Frozen object.   |
| `createAnalyticsAdapter(config)` | `AnalyticsAdapter` | Validates config, wraps track/identify. Frozen object.                |

### Noop Factories (Testing & Development)

| Function                       | Returns            | Description                                                                    |
| :----------------------------- | :----------------- | :----------------------------------------------------------------------------- |
| `createNoopAuthAdapter()`      | `AuthAdapter`      | `getSession` → `null`, `hasRole` → `false`, `onAuthChange` → noop unsubscribe. |
| `createNoopDataAdapter()`      | `DataAdapter`      | `query` → `[]`, `mutate` → `null`, `subscribe` → noop unsubscribe.             |
| `createNoopErrorAdapter()`     | `ErrorAdapter`     | `report` → void, `shouldRetry` → `false`, `sanitize` → identity. All async.    |
| `createNoopAnalyticsAdapter()` | `AnalyticsAdapter` | `track` → void, `identify` → void.                                             |

### Error Factories (ENS-7001–7005)

| Code       | Factory                    | Trigger                                         | Recoverable |
| :--------- | :------------------------- | :---------------------------------------------- | :---------- |
| `ENS-7001` | `adapterValidationError()` | Config missing required methods or invalid name | No          |
| `ENS-7002` | `adapterMethodError()`     | Adapter method threw during execution           | Yes         |
| `ENS-7003` | `adapterQueryError()`      | DataAdapter `query()` failed                    | Yes         |
| `ENS-7004` | `adapterMutationError()`   | DataAdapter `mutate()` failed                   | Yes         |
| `ENS-7005` | `adapterAuthError()`       | AuthAdapter session/role check failed           | Yes         |

### Validation Utility

| Function                              | Returns | Description                                                                             |
| :------------------------------------ | :------ | :-------------------------------------------------------------------------------------- |
| `validateAdapterConfig(type, config)` | `void`  | Validates name (non-empty string) + required methods (typeof check). Throws `ENS-7001`. |

### Adapter Interfaces (re-exported from `@enterstellar-ai/types`)

| Interface          | Methods                                                                                       |
| :----------------- | :-------------------------------------------------------------------------------------------- |
| `AuthAdapter`      | `getSession()`, `hasRole(role)`, `onAuthChange(cb)`                                           |
| `DataAdapter`      | `query(resource, params?)`, `mutate(resource, action, data)`, `subscribe(resource, callback)` |
| `ErrorAdapter`     | `report(error, context?)`, `shouldRetry(error, attempt)`, `sanitize(error)`                   |
| `AnalyticsAdapter` | `track(event, properties?)`, `identify(userId, traits?)`                                      |

### Exported Types

| Type                     | Description                                                                       |
| :----------------------- | :-------------------------------------------------------------------------------- | ------ | ------- | ---------------------------------------------------- |
| `AuthAdapterConfig`      | Config for `createAuthAdapter()`: `name` + auth method implementations.           |
| `DataAdapterConfig`      | Config for `createDataAdapter()`: `name` + data method implementations.           |
| `ErrorAdapterConfig`     | Config for `createErrorAdapter()`: `name` + error method implementations.         |
| `AnalyticsAdapterConfig` | Config for `createAnalyticsAdapter()`: `name` + analytics method implementations. |
| `AdapterType`            | `'auth'                                                                           | 'data' | 'error' | 'analytics'` — discriminator for adapter categories. |
| `ADAPTERS_VERSION`       | Semver string matching `package.json`.                                            |

## Configuration

### Config Objects (passed to factories)

Every adapter config requires a `name` (non-empty string) plus all methods defined by the corresponding `@enterstellar-ai/types` interface.

| Config                   | Required Methods                        | Async/Sync                                                        |
| :----------------------- | :-------------------------------------- | :---------------------------------------------------------------- |
| `AuthAdapterConfig`      | `getSession`, `hasRole`, `onAuthChange` | getSession/hasRole async, onAuthChange sync (returns unsubscribe) |
| `DataAdapterConfig`      | `query`, `mutate`, `subscribe`          | query/mutate async, subscribe sync                                |
| `ErrorAdapterConfig`     | `report`, `shouldRetry`, `sanitize`     | All async (AD2)                                                   |
| `AnalyticsAdapterConfig` | `track`, `identify`                     | Both sync (fire-and-forget)                                       |

### AD5 Error Wrapping

All factories wrap consumer methods in error handling per Design Choice AD5:

- `getSession()` / `hasRole()` → `ENS-7005` (auth-specific)
- `onAuthChange()` → `ENS-7002` (subscription management)
- `query()` → `ENS-7003` (includes resource name)
- `mutate()` → `ENS-7004` (includes resource + action)
- `subscribe()` / `track()` / `identify()` / `report()` / `shouldRetry()` / `sanitize()` → `ENS-7002`

Original errors are preserved in `cause` for debugging.

### Design Choices Applied

| Decision | Rule                                                                                                                                                            |
| :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD1      | Minimal but complete: `getSession`, `hasRole`, `onAuthChange`. `signIn`/`signOut` are NOT adapter concerns.                                                     |
| AD2      | Async-by-default for I/O methods. Sync for fire-and-forget (`track`, `identify`). `shouldRetry`/`sanitize` are async (future: circuit breakers, PII detection). |
| AD3      | Convention-based dot-notation (`patients.vitals`) for resource identifiers.                                                                                     |
| AD5      | Wrap into EnterstellarError — raw vendor errors never leak.                                                                                                     |
| R1       | Plain objects with closures — no class instances.                                                                                                               |
| R4       | `Object.freeze()` on all returned adapters.                                                                                                                     |
| L15      | Zero framework dependencies. Engine-only package.                                                                                                               |

### Build Configuration

| File             | Purpose                                                                                    |
| :--------------- | :----------------------------------------------------------------------------------------- |
| `tsconfig.json`  | Extends `tsconfig.base.json` — 15 strict flags. Overrides `composite: false` for tsup DTS. |
| `tsup.config.ts` | Builds ESM + CJS + DTS. Single entry: `src/index.ts`.                                      |

**Peer dependencies:** `@enterstellar-ai/types`

## See Also

- [Implementation Bible §4.15](../../agent/03-enterstellar-implementation-bible.md) — adapter layer specification.
- [Design Choices — Adapters](../../agent/04-enterstellar-design-choices.md) — locked decisions AD1–AD5.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
