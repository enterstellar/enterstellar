# @enterstellar-ai/adapter-firebase

> Firebase adapter — Auth + Data adapters for Firebase (Bible §4.15, P1 priority).

This package provides **factory functions** that map Firebase Auth and Firestore SDK calls to Enterstellar adapter interfaces. Each factory builds an `AuthAdapterConfig` or `DataAdapterConfig` and delegates to `createAuthAdapter()` / `createDataAdapter()` from `@enterstellar-ai/adapters`, which handle all validation (ENS-7001) and AD5 error wrapping. This package is purely an SDK-to-Enterstellar translator — it contains zero business logic.

## Quick Start

```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import {
  createFirebaseAuthAdapter,
  createFirebaseDataAdapter,
} from '@enterstellar-ai/adapter-firebase';

const app = initializeApp({ projectId: 'my-project', apiKey: '...' });

// 1. Create adapters
const auth = createFirebaseAuthAdapter({ auth: getAuth(app) });
const data = createFirebaseDataAdapter({ firestore: getFirestore(app) });

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

| Function                            | Returns       | Description                                                                                            |
| :---------------------------------- | :------------ | :----------------------------------------------------------------------------------------------------- |
| `createFirebaseAuthAdapter(config)` | `AuthAdapter` | Maps Firebase Auth calls to Enterstellar interface. Delegates to `createAuthAdapter()`. Frozen object. |
| `createFirebaseDataAdapter(config)` | `DataAdapter` | Maps Firestore calls to Enterstellar interface. Delegates to `createDataAdapter()`. Frozen object.     |

### Auth Adapter Method Mapping

| Enterstellar Method | Firebase SDK Call                                                         | Output                      |
| :------------------ | :------------------------------------------------------------------------ | :-------------------------- |
| `getSession()`      | `auth.currentUser` + `getIdTokenResult().claims`                          | `{ userId, roles } \| null` |
| `hasRole(role)`     | `auth.currentUser` + `getIdTokenResult().claims` → `roles.includes(role)` | `boolean`                   |
| `onAuthChange(cb)`  | `onAuthStateChanged(auth, cb)` → translate → `cb(session)`                | `() => void` (unsubscribe)  |

### Data Adapter Method Mapping

| Enterstellar Method                | Firebase SDK Call                                                    | Output                       |
| :--------------------------------- | :------------------------------------------------------------------- | :--------------------------- |
| `query(resource, params?)`         | `getDocs(collection(firestore, resource))` + `where()` constraints   | `Record[]` (with `id` field) |
| `mutate(resource, 'create', data)` | `addDoc(collection(...), payload)` → `{ id: docRef.id, ...payload }` | `Record`                     |
| `mutate(resource, 'update', data)` | `updateDoc(doc(..., data.id), payload)` → `{ id, ...payload }`       | `Record`                     |
| `mutate(resource, 'delete', data)` | `deleteDoc(doc(..., data.id))`                                       | `null`                       |
| `subscribe(resource, cb)`          | `onSnapshot(collection(...), snapshot => ...)`                       | `() => void` (unsubscribe)   |

### Exported Types

| Type                       | Description                                                                                         |
| :------------------------- | :-------------------------------------------------------------------------------------------------- |
| `FirebaseAuthConfig`       | Config for `createFirebaseAuthAdapter()`: Firebase Auth instance + optional name and roleExtractor. |
| `FirebaseDataConfig`       | Config for `createFirebaseDataAdapter()`: Firestore instance + optional name.                       |
| `FIREBASE_ADAPTER_VERSION` | Semver string matching `package.json`.                                                              |

## Configuration

### `FirebaseAuthConfig`

| Property        | Type                          | Required | Default                                         | Description                                   |
| :-------------- | :---------------------------- | :------- | :---------------------------------------------- | :-------------------------------------------- |
| `auth`          | `Auth`                        | Yes      | —                                               | Firebase Auth instance from `getAuth()`.      |
| `name`          | `string`                      | No       | `'firebase-auth'`                               | Adapter name for error messages and DevTools. |
| `roleExtractor` | `(user: unknown) => string[]` | No       | Extracts from `getIdTokenResult().claims.roles` | Custom role extraction for RBAC zone gating.  |

### `FirebaseDataConfig`

| Property    | Type        | Required | Default           | Description                                   |
| :---------- | :---------- | :------- | :---------------- | :-------------------------------------------- |
| `firestore` | `Firestore` | Yes      | —                 | Firestore instance from `getFirestore()`.     |
| `name`      | `string`    | No       | `'firebase-data'` | Adapter name for error messages and DevTools. |

### Role Extraction Strategy

Firebase stores RBAC roles in custom claims via `getIdTokenResult().claims`. The default extractor:

1. Calls `user.getIdTokenResult()` (async operation).
2. Reads `claims['roles']`.
3. Validates that `roles` is an array.
4. Filters out non-string values silently.
5. Falls back to `[]` if any check fails.

**Important: `onAuthChange()` role behavior:**

- **With custom `roleExtractor`:** Roles are extracted synchronously from the Firebase `User` object — roles are included in every callback.
- **Without custom `roleExtractor`:** Roles default to `[]` in the callback. `getIdTokenResult()` is async and cannot be awaited inside `onAuthStateChanged`. Full role resolution is available via `getSession()` / `hasRole()`.

To use a custom extraction source (e.g., custom claims, external RBAC service):

```ts
const auth = createFirebaseAuthAdapter({
  auth: getAuth(app),
  roleExtractor: (user) => {
    const u = user as { customClaims?: { roles?: string[] } };
    return u.customClaims?.roles ?? [];
  },
});
```

### Document ID Handling

All Firestore documents are returned with `{ id: docSnap.id, ...docSnap.data() }`. The `id` field is the Firestore document ID, injected for consistency with Supabase and Enterstellar conventions.

For `mutate('create')`, the input `id` field is stripped from the payload — Firestore auto-generates document IDs. For `mutate('update')` and `mutate('delete')`, the `id` field is required in the payload to identify the document.

### AD5 Error Wrapping

All error wrapping is delegated to `createAuthAdapter()` / `createDataAdapter()` from `@enterstellar-ai/adapters`. Raw Firebase SDK errors propagate upward and are caught by the factory wrapper:

| Enterstellar Method          | Error Code | Trigger                         |
| :--------------------------- | :--------- | :------------------------------ |
| `getSession()` / `hasRole()` | `ENS-7005` | Firebase Auth SDK error         |
| `onAuthChange()`             | `ENS-7002` | Subscription registration error |
| `query()`                    | `ENS-7003` | Firestore query error           |
| `mutate()`                   | `ENS-7004` | Firestore mutation error        |
| `subscribe()`                | `ENS-7002` | Snapshot subscription error     |

Original errors are preserved in `cause` for debugging.

### Design Choices Applied

| Decision | Rule                                                                                    |
| :------- | :-------------------------------------------------------------------------------------- |
| AD1      | Minimal but complete: `getSession`, `hasRole`, `onAuthChange`.                          |
| AD4      | Firebase P1: auth + Firestore queries + Firestore realtime.                             |
| AD5      | Error wrapping delegated to `@enterstellar-ai/adapters` — raw vendor errors never leak. |
| R1       | Plain objects with closures — no class instances.                                       |
| R4       | `Object.freeze()` on all returned adapters.                                             |

### Build Configuration

| File             | Purpose                                                                  |
| :--------------- | :----------------------------------------------------------------------- |
| `tsconfig.json`  | Extends `tsconfig.base.json`. Overrides `composite: false` for tsup DTS. |
| `tsup.config.ts` | Builds ESM + CJS + DTS. Single entry: `src/index.ts`.                    |

**Peer dependencies:** `@enterstellar-ai/types`, `firebase`

## See Also

- [Implementation Bible §4.15](../../agent/03-enterstellar-implementation-bible.md) — adapter layer specification.
- [Design Choices — Adapters](../../agent/04-enterstellar-design-choices.md) — locked decisions AD1–AD5.
- [@enterstellar-ai/adapters README](../adapters/README.md) — core adapter factories and validation.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
