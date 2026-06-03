/**
 * @module @enterstellar-ai/adapters/types
 * @description Module-local configuration types for adapter factories.
 *
 * These types define the "input" shape that consumers pass to
 * `createAuthAdapter()`, `createDataAdapter()`, etc. The actual adapter
 * interfaces (`AuthAdapter`, `DataAdapter`, `ErrorAdapter`, `AnalyticsAdapter`)
 * live in `@enterstellar-ai/types/adapters` and are re-exported from the barrel.
 *
 * Each config type mirrors its corresponding adapter interface, plus a
 * mandatory `name` field for identification in error messages and DevTools.
 *
 * @see Bible §4.15
 * @see Design Choices AD1–AD5
 * @see Design Choice T1 — interfaces for behavior, types for data shapes
 */

// ---------------------------------------------------------------------------
// Auth Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createAuthAdapter}.
 *
 * The consumer provides their implementation of each method. The factory
 * validates the config and wraps each method to catch errors → `EnterstellarError`
 * per Design Choice AD5.
 *
 * @example
 * ```ts
 * const auth = createAuthAdapter({
 *   name: 'supabase-auth',
 *   getSession: async () => {
 *     const { data } = await supabase.auth.getSession();
 *     if (!data.session) return null;
 *     return { userId: data.session.user.id, roles: ['clinician'] };
 *   },
 *   hasRole: async (role) => {
 *     const session = await supabase.auth.getSession();
 *     return session.data.session?.user.role === role;
 *   },
 *   onAuthChange: (cb) => {
 *     const { data } = supabase.auth.onAuthStateChange((_event, session) => {
 *       cb(session ? { userId: session.user.id, roles: ['clinician'] } : null);
 *     });
 *     return () => data.subscription.unsubscribe();
 *   },
 * });
 * ```
 */
export type AuthAdapterConfig = {
    /**
     * Human-readable adapter name for error messages and DevTools display.
     *
     * @example `'supabase-auth'`, `'clerk-auth'`, `'firebase-auth'`
     */
    readonly name: string;

    /**
     * Returns the current authentication session, or `null` if unauthenticated.
     *
     * @returns Session object with user ID and role list.
     */
    readonly getSession: () => Promise<{ userId: string; roles: string[] } | null>;

    /**
     * Checks whether the current user has a specific role.
     * Essential for RBAC — clinical vs. admin zone visibility.
     *
     * @param role - The role to check (e.g., `'clinician'`, `'admin'`).
     * @returns `true` if the user has the specified role.
     */
    readonly hasRole: (role: string) => Promise<boolean>;

    /**
     * Subscribes to authentication state changes.
     *
     * Essential for reactive auth gating — zones re-evaluate visibility
     * when sessions expire or roles change.
     *
     * @param callback - Called when auth state changes. Receives the new
     *   session object, or `null` if the user became unauthenticated.
     * @returns An unsubscribe function (synchronous).
     */
    readonly onAuthChange: (
        callback: (session: { userId: string; roles: string[] } | null) => void,
    ) => () => void;
};

// ---------------------------------------------------------------------------
// Data Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createDataAdapter}.
 *
 * Resolves abstract data source names (e.g., `'patients.vitals'`) to actual
 * data using convention-based dot-notation resolution (AD3).
 *
 * @example
 * ```ts
 * const data = createDataAdapter({
 *   name: 'supabase-data',
 *   query: async (resource, params) => {
 *     const { data } = await supabase.from(resource).select('*').match(params ?? {});
 *     return data ?? [];
 *   },
 *   mutate: async (resource, action, payload) => {
 *     if (action === 'create') {
 *       const { data } = await supabase.from(resource).insert(payload).select().single();
 *       return data;
 *     }
 *     return null;
 *   },
 *   subscribe: (resource, callback) => {
 *     const channel = supabase.channel(resource)
 *       .on('postgres_changes', { event: '*', schema: 'public', table: resource },
 *         () => { void query(resource).then(callback); })
 *       .subscribe();
 *     return () => { void supabase.removeChannel(channel); };
 *   },
 * });
 * ```
 */
export type DataAdapterConfig = {
    /**
     * Human-readable adapter name for error messages and DevTools display.
     *
     * @example `'supabase-data'`, `'firebase-data'`, `'prisma-data'`
     */
    readonly name: string;

    /**
     * Queries a resource by name with optional parameters.
     *
     * @param resource - The resource/table/collection to query (dot-notation per AD3).
     * @param params - Optional query parameters (filters, pagination, sorting).
     * @returns Array of records matching the query.
     */
    readonly query: (
        resource: string,
        params?: Readonly<Record<string, unknown>>,
    ) => Promise<readonly Record<string, unknown>[]>;

    /**
     * Performs a mutation (create, update, delete) on a resource.
     *
     * @param resource - The resource to mutate.
     * @param action - The mutation type: `'create'`, `'update'`, or `'delete'`.
     * @param data - The mutation payload.
     * @returns The mutated record, or `null` for deletes.
     */
    readonly mutate: (
        resource: string,
        action: 'create' | 'update' | 'delete',
        data: Readonly<Record<string, unknown>>,
    ) => Promise<Record<string, unknown> | null>;

    /**
     * Subscribes to real-time changes on a resource.
     * Essential for live data updates in Enterstellar zones (AD4 — realtime at v1).
     *
     * @param resource - The resource to subscribe to.
     * @param callback - Called when the resource changes.
     * @returns An unsubscribe function (synchronous).
     */
    readonly subscribe: (
        resource: string,
        callback: (data: readonly Record<string, unknown>[]) => void,
    ) => () => void;
};

// ---------------------------------------------------------------------------
// Error Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createErrorAdapter}.
 *
 * Implementations provide retry logic, error reporting, and PII sanitization.
 * All methods are async per AD2 — `shouldRetry` and `sanitize` support
 * production use cases such as remote circuit breaker checks and external
 * PII detection services. Raw vendor errors are wrapped into `EnterstellarError`
 * per AD5.
 *
 * @example
 * ```ts
 * const errors = createErrorAdapter({
 *   name: 'sentry-error',
 *   report: async (error, context) => {
 *     Sentry.captureException(error, { extra: context });
 *   },
 *   shouldRetry: async (error, attempt) => attempt < 3 && isTransient(error),
 *   sanitize: async (error) => {
 *     const sanitized = new Error(error.message.replace(/\d{3}-\d{2}-\d{4}/g, '[REDACTED]'));
 *     sanitized.stack = error.stack;
 *     return sanitized;
 *   },
 * });
 * ```
 */
export type ErrorAdapterConfig = {
    /**
     * Human-readable adapter name for error messages and DevTools display.
     *
     * @example `'sentry-error'`, `'datadog-error'`, `'console-error'`
     */
    readonly name: string;

    /**
     * Reports an error to the external error tracking service.
     *
     * @param error - The error to report (may be an `EnterstellarError`).
     * @param context - Optional contextual metadata for the error report.
     */
    readonly report: (
        error: Error,
        context?: Readonly<Record<string, unknown>>,
    ) => Promise<void>;

    /**
     * Determines whether a failed operation should be retried.
     *
     * Async to support production implementations that consult remote
     * circuit breakers or rate-limit services before deciding.
     *
     * @param error - The error that caused the failure.
     * @param attemptNumber - The current retry attempt (1-based).
     * @returns `true` if the operation should be retried.
     */
    readonly shouldRetry: (error: Error, attemptNumber: number) => Promise<boolean>;

    /**
     * Sanitizes an error before it is logged or displayed.
     * Must strip any PII or sensitive data from the error message and stack.
     *
     * Async to support production implementations that call external
     * PII detection services for HIPAA-compliant sanitization.
     *
     * @param error - The error to sanitize.
     * @returns A sanitized copy of the error.
     */
    readonly sanitize: (error: Error) => Promise<Error>;
};

// ---------------------------------------------------------------------------
// Analytics Adapter Config
// ---------------------------------------------------------------------------

/**
 * Configuration for {@link createAnalyticsAdapter}.
 *
 * Implementations forward user interaction events and identity to analytics
 * services. Both methods are fire-and-forget (void return).
 *
 * @example
 * ```ts
 * const analytics = createAnalyticsAdapter({
 *   name: 'mixpanel-analytics',
 *   track: (event, properties) => {
 *     mixpanel.track(event, properties);
 *   },
 *   identify: (userId, traits) => {
 *     mixpanel.identify(userId);
 *     if (traits) mixpanel.people.set(traits);
 *   },
 * });
 * ```
 */
export type AnalyticsAdapterConfig = {
    /**
     * Human-readable adapter name for error messages and DevTools display.
     *
     * @example `'mixpanel-analytics'`, `'amplitude-analytics'`, `'posthog-analytics'`
     */
    readonly name: string;

    /**
     * Tracks a named event with optional properties.
     * Fire-and-forget — no return value.
     *
     * @param event - The event name (e.g., `'zone_rendered'`, `'intent_resolved'`).
     * @param properties - Optional event properties for segmentation.
     */
    readonly track: (
        event: string,
        properties?: Readonly<Record<string, unknown>>,
    ) => void;

    /**
     * Identifies the current user for analytics attribution.
     * Fire-and-forget — no return value.
     *
     * @param userId - Unique user identifier.
     * @param traits - Optional user traits (role, plan, etc.).
     */
    readonly identify: (
        userId: string,
        traits?: Readonly<Record<string, unknown>>,
    ) => void;
};

// ---------------------------------------------------------------------------
// Adapter Type Discriminator
// ---------------------------------------------------------------------------

/**
 * Discriminated adapter type name.
 * Used by {@link validateAdapterConfig} to determine which fields to validate.
 */
export type AdapterType = 'auth' | 'data' | 'error' | 'analytics';
