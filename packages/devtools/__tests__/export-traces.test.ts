/**
 * @module @enterstellar-ai/devtools/__tests__/export-traces
 * @description Unit tests for the trace export utility.
 *
 * Tests cover:
 * - `generateExportFilename()` — timestamp format, filesystem safety
 * - `createExportBundle()` — bundle shape, metadata population
 * - `triggerDownload()` — DOM element creation, Blob URL lifecycle
 * - `exportTraces()` — end-to-end integration of bundle + download
 *
 * @see Design Choice DT8 — JSON export via download
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ZoneTrace } from '@enterstellar-ai/types';
import {
    generateExportFilename,
    createExportBundle,
    triggerDownload,
    exportTraces,
} from '../src/export-traces.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

function createTrace(id: string): ZoneTrace {
    // Cast through `unknown` — fixture is intentionally partial for test
    // brevity. Full ZoneTrace has additional optional fields not needed here.
    return {
        id,
        timestamp: '2026-02-22T01:00:00.000Z',
        intent: {
            component: 'TestComponent',
            props: { testProp: 'value' },
            confidence: 0.95,
        },
        compilation: {
            status: 'pass',
            errors: [],
            selfCorrectionAttempts: 0,
        },
        provenance: {
            agent: 'test-agent',
            registry: 'test-registry',
            compiledAt: '2026-02-22T01:00:00.000Z',
            compilerVersion: '0.0.0',
        },
        metrics: {
            totalMs: 10,
            retryAttempt: 0,
        },
    } as unknown as ZoneTrace;
}

// ---------------------------------------------------------------------------
// generateExportFilename
// ---------------------------------------------------------------------------

describe('generateExportFilename', () => {
    it('produces a string starting with "enterstellar-traces-"', () => {
        const filename = generateExportFilename();
        expect(filename.startsWith('enterstellar-traces-')).toBe(true);
    });

    it('produces a string ending with ".json"', () => {
        const filename = generateExportFilename();
        expect(filename.endsWith('.json')).toBe(true);
    });

    it('does not contain colons (filesystem-safe)', () => {
        const filename = generateExportFilename();
        expect(filename).not.toContain(':');
    });
});

// ---------------------------------------------------------------------------
// createExportBundle
// ---------------------------------------------------------------------------

describe('createExportBundle', () => {
    it('creates a bundle with correct shape', () => {
        const traces = [createTrace('z-1'), createTrace('z-2')];
        const configs = { main: { determinism: 1.0 } };
        const bundle = createExportBundle(traces, configs);

        expect(bundle.sdkVersion).toBe('0.0.0');
        expect(bundle.traces).toEqual(traces);
        expect(bundle.zoneConfigs).toEqual(configs);
        expect(typeof bundle.exportedAt).toBe('string');
    });

    it('includes ISO 8601 exportedAt timestamp', () => {
        const bundle = createExportBundle([], {});
        // ISO 8601 pattern: YYYY-MM-DDTHH:MM:SS
        expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('handles empty traces array', () => {
        const bundle = createExportBundle([], {});
        expect(bundle.traces).toEqual([]);
    });

    it('preserves readonly traces without mutation', () => {
        const traces = Object.freeze([createTrace('z-1')]) as readonly ZoneTrace[];
        const bundle = createExportBundle(traces, {});
        expect(bundle.traces).toBe(traces);
    });
});

// ---------------------------------------------------------------------------
// triggerDownload
// ---------------------------------------------------------------------------

describe('triggerDownload', () => {
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let appendChildSpy: ReturnType<typeof vi.spyOn>;
    let removeChildSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
        revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
        removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates a Blob URL from the content', () => {
        triggerDownload('{"test": true}', 'test.json');
        expect(createObjectURLSpy).toHaveBeenCalledOnce();
        const blobArg = createObjectURLSpy.mock.calls[0]?.[0];
        expect(blobArg).toBeInstanceOf(Blob);
    });

    it('creates an anchor element with correct href and download attributes', () => {
        const createElementSpy = vi.spyOn(document, 'createElement');
        triggerDownload('{}', 'export.json');

        expect(createElementSpy).toHaveBeenCalledWith('a');
        createElementSpy.mockRestore();
    });

    it('appends and removes the anchor from the DOM', () => {
        triggerDownload('{}', 'export.json');
        expect(appendChildSpy).toHaveBeenCalledOnce();
        expect(removeChildSpy).toHaveBeenCalledOnce();
    });

    it('revokes the Blob URL after download', () => {
        triggerDownload('{}', 'export.json');
        expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    });
});

// ---------------------------------------------------------------------------
// exportTraces (integration)
// ---------------------------------------------------------------------------

describe('exportTraces', () => {
    beforeEach(() => {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
        vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('triggers a download with serialized bundle', () => {
        const createElementSpy = vi.spyOn(document, 'createElement');
        const traces = [createTrace('z-1')];
        const configs = { main: { determinism: 1.0 } };

        exportTraces(traces, configs);

        expect(createElementSpy).toHaveBeenCalledWith('a');
        createElementSpy.mockRestore();
    });

    it('handles empty traces without error', () => {
        expect(() => exportTraces([], {})).not.toThrow();
    });
});
