/**
 * @module @enterstellar-ai/normalizer/__tests__/ag-ui-adapter
 * @description Unit tests for `createAGUIAdapter()`.
 *
 * Exhaustive test coverage for the AG-UI protocol adapter:
 * - `tool_call_start` → `ComponentIntent` normalization
 * - Lifecycle events (`run_started`, `run_finished`, `run_error`) → `null`
 * - Text message events → `null`
 * - Unknown / malformed events → `canHandle: false`
 * - `correlationId` extraction from `runId` (P2)
 * - Configurable `defaultConfidence` (N4)
 *
 * @see Design Choice N4 — AG-UI event mapping
 * @see Appendix E P2 — correlationId
 */

import { describe, it, expect } from 'vitest';

import { createAGUIAdapter } from '../src/adapters/ag-ui-adapter.js';
import { AGUI_PROTOCOL, DEFAULT_AGUI_CONFIDENCE } from '../src/constants.js';

// ---------------------------------------------------------------------------
// Protocol Identity
// ---------------------------------------------------------------------------

describe('createAGUIAdapter — protocol', () => {
    it('has protocol set to "ag-ui"', () => {
        const adapter = createAGUIAdapter();
        expect(adapter.protocol).toBe(AGUI_PROTOCOL);
    });
});

// ---------------------------------------------------------------------------
// canHandle()
// ---------------------------------------------------------------------------

describe('createAGUIAdapter — canHandle()', () => {
    const adapter = createAGUIAdapter();

    it('returns true for tool_call_start events', () => {
        expect(adapter.canHandle({ type: 'tool_call_start' })).toBe(true);
    });

    it('returns true for text_message_start events', () => {
        expect(adapter.canHandle({ type: 'text_message_start' })).toBe(true);
    });

    it('returns true for run_started events', () => {
        expect(adapter.canHandle({ type: 'run_started' })).toBe(true);
    });

    it('returns true for run_finished events', () => {
        expect(adapter.canHandle({ type: 'run_finished' })).toBe(true);
    });

    it('returns true for run_error events', () => {
        expect(adapter.canHandle({ type: 'run_error' })).toBe(true);
    });

    it('returns false for unknown event types', () => {
        expect(adapter.canHandle({ type: 'unknown_event' })).toBe(false);
    });

    it('returns false for non-object values', () => {
        expect(adapter.canHandle('string')).toBe(false);
        expect(adapter.canHandle(42)).toBe(false);
        expect(adapter.canHandle(true)).toBe(false);
        expect(adapter.canHandle(undefined)).toBe(false);
    });

    it('returns false for null', () => {
        expect(adapter.canHandle(null)).toBe(false);
    });

    it('returns false for objects without a type field', () => {
        expect(adapter.canHandle({ name: 'foo' })).toBe(false);
    });

    it('returns false for objects with non-string type field', () => {
        expect(adapter.canHandle({ type: 123 })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// normalize() — tool_call_start
// ---------------------------------------------------------------------------

describe('createAGUIAdapter — normalize() tool_call_start', () => {
    const adapter = createAGUIAdapter();

    it('converts tool_call_start to ComponentIntent', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'PatientVitals',
            args: { patientId: 'P-123' },
            runId: 'run-abc',
        });

        expect(result).not.toBeNull();
        expect(result!.component).toBe('PatientVitals');
        expect(result!.props).toEqual({ patientId: 'P-123' });
        expect(result!.confidence).toBe(DEFAULT_AGUI_CONFIDENCE);
    });

    it('extracts correlationId from runId (P2)', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
            args: {},
            runId: 'run-correlation-id',
        });

        expect(result!._source!.correlationId).toBe('run-correlation-id');
    });

    it('extracts rawEventId from toolCallId', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-unique-id',
            toolName: 'Component',
            args: {},
        });

        expect(result!._source!.rawEventId).toBe('tc-unique-id');
    });

    it('sets _source.protocol to "ag-ui"', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
            args: {},
        });

        expect(result!._source!.protocol).toBe('ag-ui');
    });

    it('defaults to empty props when args is missing', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
        });

        expect(result!.props).toEqual({});
    });

    it('defaults to empty props when args is not an object', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
            args: 'not-an-object',
        });

        expect(result!.props).toEqual({});
    });

    it('defaults to empty string component when toolName is missing', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            args: {},
        });

        expect(result!.component).toBe('');
    });

    it('omits correlationId when runId is absent', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
            args: {},
        });

        expect(result!._source).toBeDefined();
        expect(result!._source!.correlationId).toBeUndefined();
    });

    it('omits rawEventId when toolCallId is absent', () => {
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolName: 'Component',
            args: {},
        });

        expect(result!._source).toBeDefined();
        expect(result!._source!.rawEventId).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// normalize() — configurable confidence
// ---------------------------------------------------------------------------

describe('createAGUIAdapter — configurable defaultConfidence', () => {
    it('uses custom confidence when configured', () => {
        const adapter = createAGUIAdapter({ defaultConfidence: 0.95 });
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
            args: {},
        });

        expect(result!.confidence).toBe(0.95);
    });

    it('uses DEFAULT_AGUI_CONFIDENCE when not configured', () => {
        const adapter = createAGUIAdapter();
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
            args: {},
        });

        expect(result!.confidence).toBe(DEFAULT_AGUI_CONFIDENCE);
        expect(result!.confidence).toBe(0.8);
    });

    it('uses DEFAULT_AGUI_CONFIDENCE when config is empty object', () => {
        const adapter = createAGUIAdapter({});
        const result = adapter.normalize({
            type: 'tool_call_start',
            toolCallId: 'tc-001',
            toolName: 'Component',
            args: {},
        });

        expect(result!.confidence).toBe(DEFAULT_AGUI_CONFIDENCE);
    });
});

// ---------------------------------------------------------------------------
// normalize() — lifecycle events → null (N4)
// ---------------------------------------------------------------------------

describe('createAGUIAdapter — normalize() lifecycle events', () => {
    const adapter = createAGUIAdapter();

    it('returns null for run_started', () => {
        expect(adapter.normalize({ type: 'run_started', runId: 'r-1' })).toBeNull();
    });

    it('returns null for run_finished', () => {
        expect(adapter.normalize({ type: 'run_finished', runId: 'r-1' })).toBeNull();
    });

    it('returns null for run_error', () => {
        expect(adapter.normalize({ type: 'run_error', runId: 'r-1' })).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// normalize() — text_message_start → null (N4)
// ---------------------------------------------------------------------------

describe('createAGUIAdapter — normalize() text messages', () => {
    const adapter = createAGUIAdapter();

    it('returns null for text_message_start (handled by chat layer)', () => {
        expect(adapter.normalize({
            type: 'text_message_start',
            messageId: 'msg-1',
            content: 'Hello, how can I help?',
        })).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// normalize() — edge cases
// ---------------------------------------------------------------------------

describe('createAGUIAdapter — normalize() edge cases', () => {
    const adapter = createAGUIAdapter();

    it('returns null for non-object input', () => {
        expect(adapter.normalize('string')).toBeNull();
        expect(adapter.normalize(42)).toBeNull();
        expect(adapter.normalize(null)).toBeNull();
    });

    it('returns null for objects without type field', () => {
        expect(adapter.normalize({ name: 'foo' })).toBeNull();
    });

    it('returns null for unknown event types (not matching AG-UI)', () => {
        expect(adapter.normalize({ type: 'custom_event' })).toBeNull();
    });
});
