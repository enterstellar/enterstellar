/**
 * @module @enterstellar-ai/types/intent
 * @description ComponentIntent — the normalized message from an AI agent
 * to the Enterstellar rendering pipeline.
 *
 * A `ComponentIntent` is what the normalizer produces from any protocol
 * (AG-UI, A2UI, MCP, WebSocket, SSE). It is the universal input to the
 * compiler.
 *
 * @see Bible §3.2
 * @see Design Choices T3, T11
 * @see Appendix E P2 (correlationId), P8 (mode, interaction)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// String Union Types
// ---------------------------------------------------------------------------

/**
 * Protocol that produced this intent.
 * Each normalizer handles one protocol.
 *
 * @see Bible §4.9 — Normalizer
 */
export type IntentProtocol =
    | 'ag-ui'
    | 'a2ui'
    | 'mcp'
    | 'websocket'
    | 'sse'
    | 'custom';

/**
 * Layout hint for multi-zone rendering.
 * Used by the resolver to position components within a zone.
 */
export type IntentLayout =
    | 'single'
    | 'split'
    | 'grid'
    | 'stack'
    | 'tabs';

/**
 * Interaction mode for the component.
 * Closed enum — 3 values are exhaustive.
 *
 * @see Appendix E P8
 */
export type IntentInteraction =
    | 'read-only'
    | 'editable'
    | 'actionable';

// ---------------------------------------------------------------------------
// Nested Data Types (per T11)
// ---------------------------------------------------------------------------

/**
 * Source metadata injected by the normalizer.
 * Preserves protocol-specific context for tracing and debugging.
 */
export type IntentSource = {
    /** The protocol that produced this intent. */
    readonly protocol: IntentProtocol;
    /** Raw event ID from the source protocol, if available. */
    readonly rawEventId?: string;
    /**
     * Correlation ID tying related events across a multi-step interaction chain.
     * Extracted from the protocol (AG-UI `runId`, MCP `requestId`) or UUIDv4-generated.
     *
     * @see Appendix E P2
     */
    readonly correlationId?: string;
    /** Raw payload from the source protocol, preserved for debugging. */
    readonly raw?: unknown;
};

// ---------------------------------------------------------------------------
// ComponentIntent Type
// ---------------------------------------------------------------------------

/**
 * The normalized message from an AI agent to the Enterstellar rendering pipeline.
 *
 * Produced by the normalizer from any supported protocol. Consumed by the
 * compiler for validation, token enforcement, and accessibility auditing.
 *
 * @see Bible §3.2
 */
export type ComponentIntent = {
    /** PascalCase name of the target component in the registry. */
    readonly component: string;
    /** Props to pass to the component, validated by the compiler against the contract schema. */
    readonly props: Readonly<Record<string, unknown>>;
    /**
     * Confidence score from the agent (0.0–1.0).
     * Used by the compiler for fallback decisions and trace reporting.
     */
    readonly confidence: number;
    /** Optional layout hint for multi-zone rendering. */
    readonly layout?: IntentLayout;
    /**
     * Display mode hint for disambiguation.
     * Open type — allows domain-specific modes without requiring `@enterstellar-ai/types` releases.
     * Recommended values: `'snapshot'`, `'time-series'`, `'comparison'`, `'detail'`,
     * `'summary'`, `'list'`.
     *
     * @see Appendix E P8
     */
    readonly mode?: string;
    /**
     * Interaction mode for the component.
     * Helps the semantic index disambiguate (e.g., "show vitals" vs "edit vitals").
     *
     * @see Appendix E P8
     */
    readonly interaction?: IntentInteraction;
    /** Protocol-specific source metadata injected by the normalizer. */
    readonly _source?: IntentSource;
};

// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating `ComponentIntent` data at runtime.
 *
 * @see Design Choice T7
 */
export const ComponentIntentSchema = z.object({
    component: z.string().min(1, 'Component name is required.'),
    props: z.record(z.string(), z.unknown()),
    confidence: z
        .number()
        .min(0, 'Confidence must be >= 0.')
        .max(1, 'Confidence must be <= 1.'),
    layout: z
        .enum(['single', 'split', 'grid', 'stack', 'tabs'])
        .optional(),
    mode: z.string().optional(),
    interaction: z
        .enum(['read-only', 'editable', 'actionable'])
        .optional(),
    _source: z
        .object({
            protocol: z.enum([
                'ag-ui',
                'a2ui',
                'mcp',
                'websocket',
                'sse',
                'custom',
            ]),
            rawEventId: z.string().optional(),
            correlationId: z.string().optional(),
            raw: z.unknown().optional(),
        })
        .optional(),
});
