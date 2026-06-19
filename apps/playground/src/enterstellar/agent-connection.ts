/**
 * @module playground/enterstellar/agent-connection
 * @description LiveAgentConnection — app-level implementation of `EnterstellarAgentConnection`
 * from `@enterstellar-ai/types` for the Enterstellar Playground Playground.
 *
 * This is the bridge between the Next.js API route (server-side LLM) and
 * Enterstellar's zone-based event architecture (client-side rendering). It follows
 * the same Map-based event emitter pattern as `MockAgentConnection` in
 * `apps/playground/`, but with real HTTP transport.
 *
 * **Key capabilities:**
 * - `sendSceneIntent()` — POSTs to `/api/playground`, receives `ZoneIntent[]`,
 *   and dispatches each intent to its target `<Zone>` with staggered delay.
 * - Streams: Healthy/Cloud modes receive a Vercel AI SDK data stream. The
 *   connection buffers tokens, parses the complete JSON on stream end, then
 *   dispatches per-zone intents.
 * - Dual concurrent: Hallucinating mode receives pre-completed JSON
 *   (`{ healthy, hallucinated }`), dispatches healthy intents to standard
 *   zones AND hallucinated intents to `hallucinated-*` zones through the
 *   real `@enterstellar-ai/compiler`. This is THE MOAT — the compiler validates both
 *   sets, proving the difference between protected (pass) and unprotected
 *   (fail → GenericCard fallback) rendering.
 *
 * **Design rule (RE3):** The connection is created and owned by the consumer
 * (the playground layout), NOT by Enterstellar internals.
 *
 * @see @enterstellar-ai/types — EnterstellarAgentConnection interface
 * @see apps/playground/src/enterstellar/mock-agent.ts — reference implementation
 * @see implementation_plan.md §3.3.2 — LiveAgentConnection specification
 */

import type {
  EnterstellarAgentConnection,
  AgentEventType,
  UserSignal,
  ComponentIntent,
} from '@enterstellar-ai/types';

import type { PlaygroundScene, ZoneIntent } from './scenes/types';
import { getHallucinatedZones } from './scenes/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback type for agent event listeners. */
type EventCallback = (data: unknown) => void;

/**
 * The playground mode — determines LLM prompting strategy and response format.
 *
 * - `'healthy'` — correct prompt, single streaming response
 * - `'hallucinating'` — dual concurrent (correct + sabotaged), JSON response
 * - `'cloud'` — correct prompt with Forge addendum, single streaming response
 */
export type PlaygroundMode = 'healthy' | 'hallucinating' | 'cloud';

/**
 * Result from a scene intent dispatch.
 *
 * Contains parsed intents, raw LLM text (for trace visualization),
 * and timing metadata (for the latency badge).
 */
export type SceneIntentResult = {
  /** Parsed intents dispatched to zones (one per zone). */
  readonly intents: readonly ZoneIntent[];
  /** Raw LLM output text (for trace panel display). */
  readonly rawText: string;
  /** Total request duration in milliseconds (API call + parsing). */
  readonly durationMs: number;
  /**
   * Hallucinated intents (only present in `'hallucinating'` mode).
   * Used for side-by-side dual-trace comparison.
   */
  readonly hallucinatedIntents?: readonly ZoneIntent[];
  /** Raw hallucinated LLM output text (only in `'hallucinating'` mode). */
  readonly hallucinatedRawText?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Stagger delay between zone intent dispatches (milliseconds). */
const ZONE_STAGGER_MS = 250;

/** API endpoint for the playground route handler. */
const API_ENDPOINT = '/playground/api/playground';

// ---------------------------------------------------------------------------
// LiveAgentConnection
// ---------------------------------------------------------------------------

/**
 * Live agent connection for the Enterstellar Playground Playground.
 *
 * Implements `EnterstellarAgentConnection` from `@enterstellar-ai/types` with an in-memory
 * event emitter backed by a `Map<AgentEventType, Set<EventCallback>>`.
 *
 * **Usage:**
 * ```ts
 * const connection = new LiveAgentConnection();
 *
 * // Pass to Provider
 * <Provider registry={registry} connection={connection}>
 *   <Zone name="vitals" />
 * </Provider>
 *
 * // Dispatch a scene intent
 * const result = await connection.sendSceneIntent(scene, 'Show patient vitals', 'healthy');
 * ```
 *
 * @see EnterstellarAgentConnection — the interface this implements
 */
export class LiveAgentConnection implements EnterstellarAgentConnection {
  /** Map of event type → Set of listener callbacks. */
  private readonly listeners = new Map<AgentEventType, Set<EventCallback>>();

  /** Connection status flag. */
  connected = true;

  // ── EnterstellarAgentConnection interface methods ──────────────────────────────

  /**
   * Subscribes to agent-to-UI events.
   *
   * The primary event type used by `<Zone>` is `'intent'`. When
   * `sendSceneIntent()` dispatches a zone intent, zones subscribed to
   * `'intent'` receive a `{ zone, intent }` event payload.
   *
   * @param event - The event type (`'intent'`, `'lifecycle'`, etc.).
   * @param callback - Called when the event fires.
   * @returns An unsubscribe function.
   */
  on(event: AgentEventType, callback: EventCallback): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);

    return () => {
      set.delete(callback);
    };
  }

  /**
   * Raw event subscription.
   *
   * In the playground, raw events are not used — all agent communication
   * flows through the typed `on('intent', ...)` path. This method exists
   * to satisfy the `EnterstellarAgentConnection` interface.
   *
   * @param _callback - Ignored.
   * @returns A no-op unsubscribe function.
   */
  onRawEvent(_callback: EventCallback): () => void {
    return () => undefined;
  }

  /**
   * Dispatches a user signal to the agent.
   *
   * In the playground, user signals are not sent to a real agent — the
   * playground is demo-only. This method exists to satisfy the interface.
   *
   * @param _signal - Ignored.
   * @param _options - Ignored.
   */
  async dispatch(_signal: UserSignal, _options?: { readonly immediate?: boolean }): Promise<void> {
    // No-op: playground has no real bidirectional agent
  }

  /**
   * Disconnects the agent connection.
   * Clears all listeners and marks the connection as disconnected.
   */
  disconnect(): Promise<void> {
    this.connected = false;
    this.listeners.clear();
    return Promise.resolve();
  }

  // ── Playground-specific methods ───────────────────────────────────────

  /**
   * Sends a user intent to the API route for the active scene, then
   * dispatches parsed `ComponentIntent`s to each target zone.
   *
   * **Flow:**
   * 1. POST `{ intent, scene, mode }` to `/api/playground`
   * 2. Healthy/Cloud: read Vercel AI SDK data stream → buffer → parse JSON on end
   * 3. Hallucinating: read JSON response with `{ healthy, hallucinated }` arrays
   * 4. For each zone intent: emit `{ zone, intent }` via `on('intent', ...)` callback
   * 5. Stagger each zone dispatch by 250ms for visual effect
   * 6. Return full result with raw text + duration for trace visualization
   *
   * @param scene - The active PlaygroundScene.
   * @param userIntent - The user's natural-language intent.
   * @param mode - The playground mode (`'healthy'`, `'hallucinating'`, `'cloud'`).
   * @returns Parsed intents, raw LLM text, and timing metadata.
   * @throws {Error} If the API request fails or the response is unparseable.
   */
  async sendSceneIntent(
    scene: PlaygroundScene,
    userIntent: string,
    mode: PlaygroundMode,
  ): Promise<SceneIntentResult> {
    const startTime = performance.now();

    // Emit lifecycle event: loading
    this.emit('lifecycle', { state: 'loading', scene: scene.id });

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: userIntent,
          scene,
          mode,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${String(response.status)}: ${errorText}`);
      }

      if (mode === 'hallucinating') {
        return await this.handleDualResponse(response, scene, startTime);
      }

      return await this.handleStreamResponse(response, scene, startTime);
    } catch (error) {
      // Emit lifecycle event: error
      this.emit('lifecycle', {
        state: 'error',
        scene: scene.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Handles a streaming response (healthy/cloud mode).
   *
   * Reads the Vercel AI SDK data stream, extracts text chunks,
   * buffers the complete JSON, parses it as `ZoneIntent[]`,
   * and dispatches each intent with staggered delay.
   *
   * @internal
   */
  private async handleStreamResponse(
    response: Response,
    scene: PlaygroundScene,
    startTime: number,
  ): Promise<SceneIntentResult> {
    const body = response.body;
    if (body === null) {
      throw new Error('Response body is null');
    }

    // Read the Vercel AI SDK data stream and buffer text chunks
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let rawText = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      rawText += chunk;
    }

    // Parse the complete JSON as ZoneIntent[]
    const intents = this.parseZoneIntents(rawText);

    // Dispatch each intent to its zone with staggered delay
    await this.dispatchZoneIntents(intents, scene);

    const durationMs = performance.now() - startTime;

    // Emit lifecycle event: ready
    this.emit('lifecycle', { state: 'ready', scene: scene.id, durationMs });

    return { intents, rawText, durationMs };
  }

  /**
   * Handles a dual JSON response (hallucinating mode).
   *
   * Both healthy and hallucinated responses are already complete
   * (via `generateText()` + `Promise.all()`).
   *
   * **THE MOAT dispatch:**
   * 1. Dispatch healthy intents to standard zone names → compiler validates → PASS
   * 2. Dispatch hallucinated intents to `hallucinated-*` zone names → compiler
   *    validates → FAIL (ENS-3004/ENS-2001) → GenericCard fallback
   *
   * Both sets go through the **real `@enterstellar-ai/compiler`**. The hallucinated
   * side proves the compiler's value by catching invented component names,
   * wrong prop types, and missing accessibility attributes.
   *
   * @internal
   */
  private async handleDualResponse(
    response: Response,
    scene: PlaygroundScene,
    startTime: number,
  ): Promise<SceneIntentResult> {
    const json: { healthy: string; hallucinated: string } = await response.json();

    const healthyIntents = this.parseZoneIntents(json.healthy);
    const hallucinatedIntents = this.parseZoneIntents(json.hallucinated);

    // 1. Dispatch healthy intents to standard zones (compiler → PASS)
    await this.dispatchZoneIntents(healthyIntents, scene);

    // 2. Dispatch hallucinated intents to hallucinated-* zones (compiler → FAIL)
    //    These go through the REAL compiler — Zone validates the intent
    //    against the registry. Hallucinated component names (ENS-3004) or
    //    invalid props (ENS-2001) produce GenericCard fallbacks.
    await this.dispatchHallucinatedIntents(hallucinatedIntents, scene);

    const durationMs = performance.now() - startTime;

    // Emit lifecycle event: ready
    this.emit('lifecycle', { state: 'ready', scene: scene.id, durationMs });

    return {
      intents: healthyIntents,
      rawText: json.healthy,
      durationMs,
      hallucinatedIntents,
      hallucinatedRawText: json.hallucinated,
    };
  }

  /**
   * Parses raw LLM output text as a `ZoneIntent[]` array.
   *
   * Handles edge cases:
   * - LLM wraps output in markdown code fences
   * - LLM outputs a single object instead of an array
   * - LLM includes trailing commas or extra whitespace
   *
   * @internal
   */
  private parseZoneIntents(rawText: string): ZoneIntent[] {
    let cleaned = rawText.trim();

    // Strip markdown code fences if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed: unknown = JSON.parse(cleaned);

      // If the LLM output a single object, wrap in array
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return [parsed as ZoneIntent];
      }

      if (Array.isArray(parsed)) {
        return parsed as ZoneIntent[];
      }

      return [];
    } catch {
      // Last resort: try to extract JSON array from the text
      const arrayMatch = /\[[\s\S]*\]/.exec(cleaned);
      if (arrayMatch !== null) {
        try {
          return JSON.parse(arrayMatch[0]) as ZoneIntent[];
        } catch {
          return [];
        }
      }
      return [];
    }
  }

  /**
   * Dispatches zone intents to `<Zone>` subscribers with staggered delay.
   *
   * Each zone receives its intent 250ms after the previous zone for a
   * visual "cascade" effect. This is genuine Enterstellar multi-zone behavior —
   * zones compile independently and render as their intent arrives.
   *
   * @param intents - Parsed zone intents from the LLM.
   * @param scene - Active scene (used for zone name matching).
   *
   * @internal
   */
  private async dispatchZoneIntents(
    intents: readonly ZoneIntent[],
    scene: PlaygroundScene,
  ): Promise<void> {
    for (let i = 0; i < intents.length; i++) {
      const zoneIntent = intents[i];
      if (zoneIntent === undefined) continue;

      // Stagger: wait before dispatching each subsequent zone
      if (i > 0) {
        await this.delay(ZONE_STAGGER_MS);
      }

      // Convert ZoneIntent → ComponentIntent for the Enterstellar pipeline
      const componentIntent: ComponentIntent = {
        component: zoneIntent.component,
        props: zoneIntent.props,
        confidence: zoneIntent.confidence,
        _source: {
          protocol: 'custom',
          rawEventId: `playground-${scene.id}-zone-${zoneIntent.zone}`,
        },
      };

      // Determine target zone name — use the intent's zone field,
      // falling back to the scene's zone definition by index
      const targetZone =
        zoneIntent.zone !== '' ? zoneIntent.zone : (scene.zones[i]?.name ?? `zone-${String(i)}`);

      // Emit to all 'intent' subscribers — Zone filters by zone name
      this.emit('intent', { zone: targetZone, intent: componentIntent });
    }
  }

  /**
   * Dispatches hallucinated intents to `hallucinated-*` zone names.
   *
   * Uses `getHallucinatedZones()` to resolve the target zone names —
   * either from the scene's explicit `hallucinatedZones` or auto-mirrored
   * from standard zones with a `hallucinated-` prefix.
   *
   * The hallucinated intents go through the **real** `@enterstellar-ai/compiler`
   * inside each `<Zone>`. When the compiler encounters an invented
   * component name (ENS-3004) or invalid props (ENS-2001), it produces
   * a `GenericCard` fallback — proving THE MOAT.
   *
   * @param intents - Hallucinated zone intents from the LLM.
   * @param scene - Active scene (for hallucinated zone name resolution).
   *
   * @internal
   */
  private async dispatchHallucinatedIntents(
    intents: readonly ZoneIntent[],
    scene: PlaygroundScene,
  ): Promise<void> {
    const hallucinatedZones = getHallucinatedZones(scene);

    for (let i = 0; i < intents.length; i++) {
      const zoneIntent = intents[i];
      if (zoneIntent === undefined) continue;

      // Stagger: wait before dispatching each subsequent zone
      if (i > 0) {
        await this.delay(ZONE_STAGGER_MS);
      }

      // Convert ZoneIntent → ComponentIntent for the Enterstellar pipeline
      const componentIntent: ComponentIntent = {
        component: zoneIntent.component,
        props: zoneIntent.props,
        confidence: zoneIntent.confidence,
        _source: {
          protocol: 'custom',
          rawEventId: `playground-${scene.id}-hallucinated-${zoneIntent.zone}`,
        },
      };

      // Target the hallucinated zone name — either from explicit
      // hallucinatedZones or auto-mirrored with 'hallucinated-' prefix
      const targetZone = hallucinatedZones[i]?.name ?? `hallucinated-zone-${String(i)}`;

      // Emit to 'intent' subscribers — the hallucinated Zone
      // compiles this through the REAL pipeline, producing failures
      this.emit('intent', { zone: targetZone, intent: componentIntent });
    }
  }

  /**
   * Emits an event to all listeners of the given type.
   *
   * @param event - Event type.
   * @param data - Event payload.
   *
   * @internal
   */
  private emit(event: AgentEventType, data: unknown): void {
    const set = this.listeners.get(event);
    if (set === undefined) return;
    for (const callback of set) {
      callback(data);
    }
  }

  /**
   * Promise-based delay utility for staggered dispatch.
   *
   * @param ms - Delay duration in milliseconds.
   *
   * @internal
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
