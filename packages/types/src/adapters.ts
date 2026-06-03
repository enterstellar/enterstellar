/**
 * @module @enterstellar-ai/types/adapters
 * @description Adapter interfaces for infrastructure integration.
 *
 * Adapters provide the bridge between Enterstellar components and external services
 * (auth, data, errors, analytics). Each adapter follows a strict interface
 * defined here — implementations live in `@enterstellar-ai/adapter-*` packages.
 *
 * @see Bible §3.6
 * @see Design Choice T1 — interfaces for objects with methods.
 */

// ---------------------------------------------------------------------------
// Auth Adapter
// ---------------------------------------------------------------------------

/**
 * Authentication adapter interface.
 *
 * Implementations gate component visibility based on auth state.
 * Three methods: `getSession()` for current state, `hasRole()` for
 * RBAC (clinical vs admin zones), and `onAuthChange()` for reactive
 * auth gating — zones re-evaluate visibility when sessions expire
 * or roles change.
 *
 * `signIn()`/`signOut()` are NOT adapter concerns — they belong to
 * the auth provider (Supabase, Clerk, Firebase, etc.).
 *
 * @see Bible §3.6
 * @see Design Choice AD1
 */
export interface AuthAdapter {
    /**
     * Gets the current authentication session, if any.
     *
     * @returns Session object with user ID and roles, or `null` if unauthenticated.
     */
    getSession(): Promise<{ userId: string; roles: string[] } | null>;

    /**
     * Checks whether the current user has a specific role.
     * Essential for RBAC — determines clinical vs admin zone visibility.
     *
     * @param role - The role to check for (e.g., `'clinician'`, `'admin'`).
     * @returns `true` if the user has the role.
     */
    hasRole(role: string): Promise<boolean>;

    /**
     * Subscribes to authentication state changes.
     *
     * Essential for reactive auth gating — zones re-evaluate visibility
     * when sessions expire or roles change. Every major auth provider
     * supports this: Supabase `onAuthStateChange()`, Firebase
     * `onAuthStateChanged()`, Clerk `addListener()`.
     *
     * @param callback - Called when auth state changes. Receives the new
     *   session object, or `null` if the user became unauthenticated.
     * @returns An unsubscribe function (synchronous).
     *
     * @example
     * ```ts
     * const unsubscribe = auth.onAuthChange((session) => {
     *   if (!session) console.log('User signed out');
     * });
     * // Later: unsubscribe();
     * ```
     */
    onAuthChange(
        callback: (session: { userId: string; roles: string[] } | null) => void,
    ): () => void;
}

// ---------------------------------------------------------------------------
// Data Adapter
// ---------------------------------------------------------------------------

/**
 * Data access adapter interface.
 * Implementations resolve component `dataSource` fields to actual data.
 *
 * @see Bible §3.6
 */
export interface DataAdapter {
    /**
     * Queries a resource by name with optional parameters.
     *
     * @param resource - The resource/table/collection to query.
     * @param params - Optional query parameters (filters, pagination, sorting).
     * @returns The query result as an array of records.
     */
    query(
        resource: string,
        params?: Readonly<Record<string, unknown>>,
    ): Promise<readonly Record<string, unknown>[]>;

    /**
     * Performs a mutation (create, update, delete) on a resource.
     *
     * @param resource - The resource to mutate.
     * @param action - The mutation type (`'create'`, `'update'`, `'delete'`).
     * @param data - The mutation payload.
     * @returns The mutated record, or `null` for deletes.
     */
    mutate(
        resource: string,
        action: 'create' | 'update' | 'delete',
        data: Readonly<Record<string, unknown>>,
    ): Promise<Record<string, unknown> | null>;

    /**
     * Subscribes to real-time changes on a resource.
     *
     * @param resource - The resource to subscribe to.
     * @param callback - Called when the resource changes.
     * @returns An unsubscribe function.
     */
    subscribe(
        resource: string,
        callback: (data: readonly Record<string, unknown>[]) => void,
    ): () => void;
}

// ---------------------------------------------------------------------------
// Error Adapter
// ---------------------------------------------------------------------------

/**
 * Error handling adapter interface.
 *
 * Implementations provide error reporting, retry logic, and PII sanitization.
 * All methods are async per AD2 — even `shouldRetry` and `sanitize` which
 * may seem synchronous in simple implementations, but production adapters
 * may require remote circuit breaker checks or external PII detection
 * services (Google DLP, AWS Comprehend, Microsoft Presidio).
 *
 * @see Bible §3.6
 * @see Design Choice AD2
 */
export interface ErrorAdapter {
    /**
     * Reports an error to the external error tracking service.
     *
     * @param error - The error to report (may be an `EnterstellarError`).
     * @param context - Optional contextual metadata for the error report.
     */
    report(
        error: Error,
        context?: Readonly<Record<string, unknown>>,
    ): Promise<void>;

    /**
     * Determines whether a failed operation should be retried.
     *
     * Async to support production implementations that consult remote
     * circuit breakers (LaunchDarkly, Unleash) or rate-limit services
     * before deciding whether to retry.
     *
     * @param error - The error that caused the failure.
     * @param attemptNumber - The current retry attempt (1-based).
     * @returns `true` if the operation should be retried.
     */
    shouldRetry(error: Error, attemptNumber: number): Promise<boolean>;

    /**
     * Sanitizes an error before it is logged or displayed.
     * Strips any PII or sensitive data from the error message and stack.
     *
     * Async to support production implementations that call external
     * PII detection services (Google DLP, AWS Comprehend Medical)
     * for HIPAA-compliant sanitization.
     *
     * @param error - The error to sanitize.
     * @returns A sanitized copy of the error.
     */
    sanitize(error: Error): Promise<Error>;
}

// ---------------------------------------------------------------------------
// Analytics Adapter
// ---------------------------------------------------------------------------

/**
 * Analytics adapter interface.
 * Implementations forward user interaction events to analytics services.
 *
 * @see Bible §3.6
 */
export interface AnalyticsAdapter {
    /**
     * Tracks a named event with optional properties.
     *
     * @param event - The event name (e.g., `'zone_rendered'`, `'intent_resolved'`).
     * @param properties - Optional event properties for segmentation.
     */
    track(
        event: string,
        properties?: Readonly<Record<string, unknown>>,
    ): void;

    /**
     * Identifies the current user for analytics attribution.
     *
     * @param userId - Unique user identifier.
     * @param traits - Optional user traits (role, plan, etc.).
     */
    identify(
        userId: string,
        traits?: Readonly<Record<string, unknown>>,
    ): void;
}
