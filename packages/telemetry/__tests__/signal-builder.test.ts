/**
 * @module @enterstellar-ai/telemetry/__tests__/signal-builder
 * @description Tests for `buildSignal` — assembles ForgeSignal from raw input.
 *
 * Verifies auto-filled fields (TL2), intent hashing (TL3), PII guard (TL8),
 * full signal shape, and caller-provided field passthrough.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildSignal } from '../src/signal-builder.js';
import type { ForgeSignalInput } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/** A clean, valid input fixture for all tests. */
const VALID_INPUT: ForgeSignalInput = {
    rawIntent: 'show patient vitals',
    componentName: 'PatientVitals',
    intentCategory: 'clinical',
    compilationStatus: 'pass',
    forgeMode: 'none',
    forgeUsed: false,
    latencyMs: 12,
    selfCorrectionAttempts: 0,
    correctionTokensUsed: 0,
};

const DEFAULT_CONFIG = { platform: 'web' as const, registrySize: 42 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSignal', () => {
    // -------------------------------------------------------------------------
    // TL2 — Auto-filled fields
    // -------------------------------------------------------------------------

    it('auto-fills timestamp as a valid ISO 8601 string', async () => {
        const signal = await buildSignal(VALID_INPUT, DEFAULT_CONFIG);

        expect(signal.timestamp).toBeDefined();
        // ISO 8601 format check
        expect(new Date(signal.timestamp).toISOString()).toBe(signal.timestamp);
    });

    it('auto-fills sdkVersion from ENTERSTELLAR_TYPES_VERSION', async () => {
        const signal = await buildSignal(VALID_INPUT, DEFAULT_CONFIG);

        expect(signal.sdkVersion).toBe('0.1.0');
    });

    it('auto-fills platform from config', async () => {
        const signal = await buildSignal(VALID_INPUT, { platform: 'native', registrySize: 10 });

        expect(signal.platform).toBe('native');
    });

    it('auto-fills registrySize from config', async () => {
        const signal = await buildSignal(VALID_INPUT, DEFAULT_CONFIG);

        expect(signal.registrySize).toBe(42);
    });

    // -------------------------------------------------------------------------
    // TL3 — Intent hashing
    // -------------------------------------------------------------------------

    it('hashes rawIntent to SHA-256 and stores in intentHash', async () => {
        const signal = await buildSignal(VALID_INPUT, DEFAULT_CONFIG);

        // intentHash should be a 64-char hex string (SHA-256)
        expect(signal.intentHash).toHaveLength(64);
        expect(signal.intentHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does NOT include rawIntent in the output signal', async () => {
        const signal = await buildSignal(VALID_INPUT, DEFAULT_CONFIG);

        // ForgeSignal type does not have rawIntent — verify at runtime
        expect(signal).not.toHaveProperty('rawIntent');
    });

    // -------------------------------------------------------------------------
    // TL8 — PII guard
    // -------------------------------------------------------------------------

    it('passes clean component names through unchanged', async () => {
        const signal = await buildSignal(VALID_INPUT, DEFAULT_CONFIG);

        expect(signal.componentName).toBe('PatientVitals');
    });

    it('sanitizes component names flagged by PII guard', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const input: ForgeSignalInput = {
            ...VALID_INPUT,
            componentName: '928374651',
        };
        const signal = await buildSignal(input, DEFAULT_CONFIG);

        expect(signal.componentName).toBe('__pii_redacted__');
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0]?.[0]).toContain('PII guard');

        warnSpy.mockRestore();
    });

    // -------------------------------------------------------------------------
    // Full signal shape
    // -------------------------------------------------------------------------

    it('produces a complete ForgeSignal with all 12 fields', async () => {
        const signal = await buildSignal(VALID_INPUT, DEFAULT_CONFIG);

        expect(signal).toHaveProperty('intentHash');
        expect(signal).toHaveProperty('componentName');
        expect(signal).toHaveProperty('intentCategory');
        expect(signal).toHaveProperty('compilationStatus');
        expect(signal).toHaveProperty('forgeMode');
        expect(signal).toHaveProperty('forgeUsed');
        expect(signal).toHaveProperty('latencyMs');
        expect(signal).toHaveProperty('selfCorrectionAttempts');
        expect(signal).toHaveProperty('correctionTokensUsed');
        expect(signal).toHaveProperty('timestamp');
        expect(signal).toHaveProperty('sdkVersion');
        expect(signal).toHaveProperty('registrySize');
        expect(signal).toHaveProperty('platform');
    });

    it('forwards caller-provided fields unchanged', async () => {
        const input: ForgeSignalInput = {
            ...VALID_INPUT,
            compilationStatus: 'corrected',
            forgeMode: 'cloud',
            forgeUsed: true,
            latencyMs: 250,
            selfCorrectionAttempts: 2,
            correctionTokensUsed: 1500,
        };
        const signal = await buildSignal(input, DEFAULT_CONFIG);

        expect(signal.compilationStatus).toBe('corrected');
        expect(signal.forgeMode).toBe('cloud');
        expect(signal.forgeUsed).toBe(true);
        expect(signal.latencyMs).toBe(250);
        expect(signal.selfCorrectionAttempts).toBe(2);
        expect(signal.correctionTokensUsed).toBe(1500);
    });
});
