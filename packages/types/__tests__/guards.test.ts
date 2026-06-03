/**
 * @module @enterstellar-ai/types/__tests__/guards
 * @description Unit tests for type guard functions.
 */

import { describe, it, expect } from 'vitest';
import {
    isComponentId,
    isZoneId,
    isTraceId,
    isForgeSignal,
    isCompilationResult,
    isComponentIntent,
    isAgentTrace,
    isUserSignal,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Branded Type Guards
// ---------------------------------------------------------------------------

describe('branded type guards', () => {
    describe('isComponentId', () => {
        it('should return true for a non-empty string', () => {
            expect(isComponentId('PatientVitals')).toBe(true);
        });

        it('should return false for an empty string', () => {
            expect(isComponentId('')).toBe(false);
        });

        it('should return false for non-string values', () => {
            expect(isComponentId(123)).toBe(false);
            expect(isComponentId(null)).toBe(false);
            expect(isComponentId(undefined)).toBe(false);
            expect(isComponentId({})).toBe(false);
        });
    });

    describe('isZoneId', () => {
        it('should return true for a non-empty string', () => {
            expect(isZoneId('main-sidebar')).toBe(true);
        });

        it('should return false for non-string values', () => {
            expect(isZoneId(42)).toBe(false);
            expect(isZoneId(null)).toBe(false);
        });
    });

    describe('isTraceId', () => {
        it('should return true for a non-empty string', () => {
            expect(isTraceId('abc-123')).toBe(true);
        });

        it('should return false for empty string', () => {
            expect(isTraceId('')).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// Data Shape Type Guards
// ---------------------------------------------------------------------------

describe('data shape type guards', () => {
    describe('isForgeSignal', () => {
        const validSignal = {
            intentHash: 'sha256:abc123',
            componentName: 'PatientVitals',
            intentCategory: 'clinical',
            compilationStatus: 'pass',
            forgeMode: 'none',
            forgeUsed: false,
            latencyMs: 42,
            selfCorrectionAttempts: 0,
            correctionTokensUsed: 0,
            timestamp: '2026-02-20T00:00:00Z',
            sdkVersion: '0.1.0',
            registrySize: 10,
            platform: 'web',
        };

        it('should return true for a valid ForgeSignal shape', () => {
            expect(isForgeSignal(validSignal)).toBe(true);
        });

        it('should return false for null', () => {
            expect(isForgeSignal(null)).toBe(false);
        });

        it('should return false for missing required fields', () => {
            const { intentHash: _, ...partial } = validSignal;
            expect(isForgeSignal(partial)).toBe(false);
        });

        it('should return false for wrong field types', () => {
            expect(isForgeSignal({ ...validSignal, latencyMs: 'slow' })).toBe(false);
        });
    });

    describe('isCompilationResult', () => {
        const validResult = {
            componentName: 'PatientVitals',
            props: { patientId: '123' },
            status: 'pass',
            provenance: {
                agent: 'gpt-4o',
                registry: 'default',
                compiledAt: '2026-02-20T00:00:00Z',
                compilerVersion: '0.1.0',
            },
            errors: [],
            selfCorrectionAttempts: 0,
        };

        it('should return true for a valid CompilationResult shape', () => {
            expect(isCompilationResult(validResult)).toBe(true);
        });

        it('should return false for missing provenance', () => {
            const { provenance: _, ...partial } = validResult;
            expect(isCompilationResult(partial)).toBe(false);
        });

        it('should return false for non-array errors', () => {
            expect(isCompilationResult({ ...validResult, errors: 'none' })).toBe(false);
        });
    });

    describe('isComponentIntent', () => {
        const validIntent = {
            component: 'PatientVitals',
            props: { patientId: '123' },
            confidence: 0.95,
        };

        it('should return true for a valid ComponentIntent shape', () => {
            expect(isComponentIntent(validIntent)).toBe(true);
        });

        it('should return false for missing component', () => {
            const { component: _, ...partial } = validIntent;
            expect(isComponentIntent(partial)).toBe(false);
        });

        it('should return false for non-number confidence', () => {
            expect(isComponentIntent({ ...validIntent, confidence: 'high' })).toBe(false);
        });
    });

    describe('isAgentTrace', () => {
        const validTrace = {
            id: 'trace-123',
            timestamp: '2026-02-20T00:00:00Z',
            intent: { raw: 'show vitals', component: 'PatientVitals', confidence: 0.9 },
            resolution: { strategy: 'exact', resolvedComponent: 'PatientVitals', candidatesConsidered: 1 },
            compilation: { status: 'pass', errorCount: 0, selfCorrectionAttempts: 0, tokensValidated: true, accessibilityInjected: true },
            determinism: { level: 1.0, cacheHit: false, zone: 'main' },
            metrics: { totalMs: 50, resolutionMs: 10, compilationMs: 5, renderMs: 35 },
            consent: { anonymizedAggregation: false },
        };

        it('should return true for a valid AgentTrace shape', () => {
            expect(isAgentTrace(validTrace)).toBe(true);
        });

        it('should return false for missing intent', () => {
            const { intent: _, ...partial } = validTrace;
            expect(isAgentTrace(partial)).toBe(false);
        });

        it('should return false for primitives', () => {
            expect(isAgentTrace('trace')).toBe(false);
            expect(isAgentTrace(42)).toBe(false);
        });
    });

    describe('isUserSignal', () => {
        const validSignal = {
            type: 'click',
            zone: 'main',
            component: 'PatientVitals',
            payload: { action: 'view-detail' },
            timestamp: '2026-02-20T00:00:00Z',
        };

        it('should return true for a valid UserSignal shape', () => {
            expect(isUserSignal(validSignal)).toBe(true);
        });

        it('should return false for missing zone', () => {
            const { zone: _, ...partial } = validSignal;
            expect(isUserSignal(partial)).toBe(false);
        });

        it('should return false for null payload', () => {
            expect(isUserSignal({ ...validSignal, payload: null })).toBe(false);
        });
    });
});
