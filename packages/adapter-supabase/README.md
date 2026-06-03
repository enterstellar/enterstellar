# @enterstellar-ai/adapter-supabase

> Supabase adapter — Auth + Data adapters for Supabase (Bible §4.15, P0 priority).

This package provides **factory functions** that map Supabase SDK calls to Enterstellar adapter interfaces. Each factory builds an `AuthAdapterConfig` or `DataAdapterConfig` and delegates to `createAuthAdapter()` / `createDataAdapter()` from `@enterstellar-ai/adapters`, which handle all validation (ENS-7001) and AD5 error wrapping. This package is purely an SDK-to-Enterstellar translator — it contains zero business logic.

## Quick Start

```ts
import { createClient } from '@supabase/supabase-js';
import {
  createSupabaseAuthAdapter,
  createSupabaseDataAdapter,
} from '@enterstellar-ai/adapter-supabase';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. Create adapters
const auth = createSupabaseAuthAdapter({ client: supabase });
const data = createSupabaseDataAdapter({ client: supabase });

// 2. Pass to Provider
// <Provider adapters={{ auth, data }} ... />

// 3. Use in application code
const session = await auth.getSession(); // { userId, roles } | null
const isAdmin = await auth.hasRole('admin'); // boolean
const unsub = auth.onAuthChange((session) => {
  console.log('Auth state changed:', session);
});

const patients = await data.query('patients', { status: 'active' });
const newPatient = await data.mutate('patients', 'create', {
  name: 'Jane Doe',
  status: 'active',
});
const unsubData = data.subscribe('patients', (records) => {
  console.log('Patients updated:', records);
});
```

## API Reference

### Factories

| Function                            | Returns       | Description                                                                                                      |
| :---------------------------------- | :------------ | :--------------------------------------------------------------------------------------------------------------- |
| `createSupabaseAuthAdapter(config)` | `AuthAdapter` | Maps Supabase auth calls to Enterstellar interface. Delegates to `createAuthAdapter()`. Frozen object.           |
| `createSupabaseDataAdapter(config)` | `DataAdapter` | Maps Supabase PostgREST + Realtime to Enterstellar interface. Delegates to `createDataAdapter()`. Frozen object. |

### Auth Adapter Method Mapping

| Enterstellar Method | Supabase SDK Call                                             | Output                      |
| :------------------ | :------------------------------------------------------------ | :-------------------------- |
| `getSession()`      | `client.auth.getSession()` → `toEnterstellarSession()`        | `{ userId, roles } \| null` |
| `hasRole(role)`     | `client.auth.getSession()` → `roles.includes(role)`           | `boolean`                   |
| `onAuthChange(cb)`  | `client.auth.onAuthStateChange()` → translate → `cb(session)` | `() => void` (unsubscribe)  |

### Data Adapter Method Mapping

| Enterstellar Method                | Supabase SDK Call                                                             | Output                     |
| :--------------------------------- | :---------------------------------------------------------------------------- | :------------------------- |
| `query(resource, params?)`         | `.from(resource).select('*')` + `.eq()` filters                               | `Record[]`                 |
| `mutate(resource, 'create', data)` | `.from(resource).insert(data).select().single()`                              | `Record`                   |
| `mutate(resource, 'update', data)` | `.from(resource).update(data).eq('id', data.id).select().single()`            | `Record`                   |
| `mutate(resource, 'delete', data)` | `.from(resource).delete().eq('id', data.id)`                                  | `null`                     |
| `subscribe(resource, cb)`          | `.channel('enterstellar-{resource}').on('postgres_changes', ...).subscribe()` | `() => void` (unsubscribe) |

### Exported Types

| Type                       | Description                                                                                  |
| :------------------------- | :------------------------------------------------------------------------------------------- |
| `SupabaseAuthConfig`       | Config for `createSupabaseAuthAdapter()`: Supabase client + optional name and roleExtractor. |
| `SupabaseDataConfig`       | Config for `createSupabaseDataAdapter()`: Supabase client + optional name.                   |
| `SUPABASE_ADAPTER_VERSION` | Semver string matching `package.json`.                                                       |

## Configuration

### `SupabaseAuthConfig`

| Property        | Type                          | Required | Default                             | Description                                   |
| :-------------- | :---------------------------- | :------- | :---------------------------------- | :-------------------------------------------- |
| `client`        | `SupabaseClient`              | Yes      | —                                   | Supabase client from `createClient()`.        |
| `name`          | `string`                      | No       | `'supabase-auth'`                   | Adapter name for error messages and DevTools. |
| `roleExtractor` | `(user: unknown) => string[]` | No       | Extracts from `user_metadata.roles` | Custom role extraction for RBAC zone gating.  |

### `SupabaseDataConfig`

| Property | Type             | Required | Default           | Description                                   |
| :------- | :--------------- | :------- | :---------------- | :-------------------------------------------- |
| `client` | `SupabaseClient` | Yes      | —                 | Supabase client from `createClient()`.        |
| `name`   | `string`         | No       | `'supabase-data'` | Adapter name for error messages and DevTools. |

### Default Role Extraction

By default, roles are extracted from `user.user_metadata.roles`. The extractor:

1. Validates that `user_metadata` exists and is an object.
2. Validates that `roles` is an array.
3. Filters out non-string values silently.
4. Falls back to `[]` if any check fails.

To use a custom extraction source (e.g., `app_metadata`, a custom claims table):

```ts
const auth = createSupabaseAuthAdapter({
  client: supabase,
  roleExtractor: (user) => {
    const u = user as { app_metadata?: { roles?: string[] } };
    return u.app_metadata?.roles ?? [];
  },
});
```

### AD5 Error Wrapping

All error wrapping is delegated to `createAuthAdapter()` / `createDataAdapter()` from `@enterstellar-ai/adapters`. Raw Supabase SDK errors are thrown via `if (error) throw error` and caught by the factory wrapper:

| Enterstellar Method          | Error Code | Trigger                           |
| :--------------------------- | :--------- | :-------------------------------- |
| `getSession()` / `hasRole()` | `ENS-7005` | Supabase auth SDK error           |
| `onAuthChange()`             | `ENS-7002` | Subscription registration error   |
| `query()`                    | `ENS-7003` | Supabase PostgREST query error    |
| `mutate()`                   | `ENS-7004` | Supabase PostgREST mutation error |
| `subscribe()`                | `ENS-7002` | Realtime channel error            |

Original errors are preserved in `cause` for debugging.

### Subscribe Strategy (v1)

The `subscribe()` method uses a re-fetch pattern:

1. Subscribes to `postgres_changes` events via Supabase Realtime.
2. On any change event, re-fetches all rows from the table.
3. Passes the full result set to the callback.

A v2 optimization could apply incremental updates from the change payload.

### Design Choices Applied

| Decision | Rule                                                                                    |
| :------- | :-------------------------------------------------------------------------------------- |
| AD1      | Minimal but complete: `getSession`, `hasRole`, `onAuthChange`.                          |
| AD4      | Supabase P0: auth + basic queries + realtime subscriptions.                             |
| AD5      | Error wrapping delegated to `@enterstellar-ai/adapters` — raw vendor errors never leak. |
| R1       | Plain objects with closures — no class instances.                                       |
| R4       | `Object.freeze()` on all returned adapters.                                             |

### Build Configuration

| File             | Purpose                                                                  |
| :--------------- | :----------------------------------------------------------------------- |
| `tsconfig.json`  | Extends `tsconfig.base.json`. Overrides `composite: false` for tsup DTS. |
| `tsup.config.ts` | Builds ESM + CJS + DTS. Single entry: `src/index.ts`.                    |

**Peer dependencies:** `@enterstellar-ai/types`, `@supabase/supabase-js`

## See Also

- [Implementation Bible §4.15](../../agent/03-enterstellar-implementation-bible.md) — adapter layer specification.
- [Design Choices — Adapters](../../agent/04-enterstellar-design-choices.md) — locked decisions AD1–AD5.
- [@enterstellar-ai/adapters README](../adapters/README.md) — core adapter factories and validation.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
