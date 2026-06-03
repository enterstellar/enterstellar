/**
 * @module @enterstellar-ai/connection/event-emitter
 * @description Minimal, typed, internal event emitter — zero external dependencies.
 *
 * Provides a strongly-typed pub/sub mechanism for routing `AgentEventType`
 * events to `on()` subscribers and raw events to `onRawEvent()` subscribers.
 *
 * Design: plain object with closures (R1). NOT a class. Generics enforce
 * type safety per event channel — consumers cannot subscribe to an event
 * with the wrong handler signature.
 *
 * @internal Not exported from the public API surface.
 *
 * @see Design Choice P7 — Event whitelist
 * @see Design Choice R1 — Plain objects, not classes
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Handler function for a specific event channel. */
type EventHandler<T> = (data: T) => void;

// ---------------------------------------------------------------------------
// Event Emitter Interface
// ---------------------------------------------------------------------------

/**
 * Typed event emitter returned by `createEventEmitter()`.
 *
 * Generics constrain event names to keys of `TEvents` and handler
 * signatures to the corresponding value types. This prevents misuse
 * at compile time.
 */
type TypedEventEmitter<TEvents extends Record<string, unknown>> = {
    /**
     * Subscribes a handler to a specific event.
     *
     * @param event - The event name (must be a key of `TEvents`).
     * @param handler - Callback invoked when the event is emitted.
     * @returns An unsubscribe function. Calling it removes only this handler.
     */
    readonly on: <K extends keyof TEvents & string>(
        event: K,
        handler: EventHandler<TEvents[K]>,
    ) => () => void;

    /**
     * Emits an event, invoking all registered handlers synchronously.
     *
     * Handlers that throw are caught and logged to `console.error`
     * to prevent one broken handler from blocking others.
     *
     * @param event - The event name to emit.
     * @param data - The payload to pass to all handlers.
     */
    readonly emit: <K extends keyof TEvents & string>(
        event: K,
        data: TEvents[K],
    ) => void;

    /**
     * Removes all handlers from all event channels.
     * Called during `disconnect()` to prevent memory leaks.
     */
    readonly removeAll: () => void;

    /**
     * Returns the current count of listeners for a specific event.
     * Useful for testing and diagnostics.
     *
     * @param event - The event name to count listeners for.
     * @returns The number of registered handlers.
     */
    readonly listenerCount: (
        event: keyof TEvents & string,
    ) => number;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal, typed event emitter with zero external dependencies.
 *
 * The emitter stores handlers in a `Map<string, Set<handler>>` structure.
 * `Set` is used (instead of an array) for O(1) unsubscribe without
 * array splicing or index invalidation during concurrent emit/unsubscribe.
 *
 * @returns A frozen `TypedEventEmitter` instance.
 *
 * @example
 * ```ts
 * type Events = {
 *   intent: ComponentIntent;
 *   lifecycle: 'loading' | 'ready' | 'error';
 * };
 *
 * const emitter = createEventEmitter<Events>();
 * const unsub = emitter.on('intent', (intent) => console.log(intent));
 * emitter.emit('intent', someIntent);
 * unsub(); // removes only this handler
 * ```
 */
export function createEventEmitter<
    TEvents extends Record<string, unknown>,
>(): TypedEventEmitter<TEvents> {
    // Internal store: event name → set of handlers.
    // `Set` provides O(1) delete and safe iteration during concurrent unsub.
    const listeners = new Map<string, Set<EventHandler<never>>>();

    /**
     * Retrieves or lazily creates the handler set for an event channel.
     */
    function getHandlers(event: string): Set<EventHandler<never>> {
        let handlers = listeners.get(event);
        if (handlers === undefined) {
            handlers = new Set<EventHandler<never>>();
            listeners.set(event, handlers);
        }
        return handlers;
    }

    const emitter: TypedEventEmitter<TEvents> = {
        on<K extends keyof TEvents & string>(
            event: K,
            handler: EventHandler<TEvents[K]>,
        ): () => void {
            const handlers = getHandlers(event);
            // Cast is safe: the generic constraint ensures handler type matches.
            const typedHandler = handler as EventHandler<never>;
            handlers.add(typedHandler);

            // Return an unsubscribe function. Safe to call multiple times.
            let active = true;
            return (): void => {
                if (active) {
                    active = false;
                    handlers.delete(typedHandler);
                }
            };
        },

        emit<K extends keyof TEvents & string>(
            event: K,
            data: TEvents[K],
        ): void {
            const handlers = listeners.get(event);
            if (handlers === undefined) {
                return;
            }

            // Iterate over a snapshot-safe `Set`. Handlers that throw
            // are caught to prevent one broken handler from blocking others.
            for (const handler of handlers) {
                try {
                    (handler as EventHandler<TEvents[K]>)(data);
                } catch (error: unknown) {
                    // Log but do not re-throw — other handlers must still execute.
                    // In production, this would be captured by the error adapter.
                    console.error(
                        `[@enterstellar-ai/connection] Event handler for '${event}' threw:`,
                        error,
                    );
                }
            }
        },

        removeAll(): void {
            listeners.clear();
        },

        listenerCount(event: keyof TEvents & string): number {
            const handlers = listeners.get(event);
            return handlers === undefined ? 0 : handlers.size;
        },
    };

    return emitter;
}

// ---------------------------------------------------------------------------
// Re-export the type for use in other internal modules
// ---------------------------------------------------------------------------

export type { TypedEventEmitter };
