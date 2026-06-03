/**
 * @module @enterstellar-ai/types/__tests__/schemas
 * @description Unit tests for all Zod schemas — parse valid data, reject invalid data.
 */

import { describe, it, expect } from 'vitest';
import {
    ComponentContractSchema,
    ComponentIntentSchema,
    CompilationResultSchema,
    CompilationErrorSchema,
    AgentTraceSchema,
    ZoneConfigSchema,
    ForgeSignalSchema,
    UserSignalSchema,
    SerializedStateSchema,
    ZoneStateSchema,
    SessionStateSchema,
    ForgeResultSchema,
    ForgeTraceRecordSchema,
    DesignTokenSetSchema,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const validContract = {
    name: 'PatientVitals',
    id: 'PatientVitals',
    description: 'Displays patient vital signs in a compact card format.',
    category: 'clinical',
    tags: ['patient', 'vitals', 'clinical'],
    props: {},
    tokens: { color: 'token:danger' },
    accessibility: {
        role: 'region',
        ariaLabel: 'Patient vital signs',
        announceOnUpdate: true,
    },
    states: {
        loading: 'VitalsLoading',
        error: 'VitalsError',
        empty: 'VitalsEmpty',
        ready: 'VitalsReady',
    },
    examples: [
        { intent: 'Show patient vitals', props: { patientId: '123' } },
    ],
    _meta: {
        forged: false,
        version: '1.0.0',
        createdAt: '2026-02-20T00:00:00Z',
    },
};

const validIntent = {
    component: 'PatientVitals',
    props: { patientId: '123' },
    confidence: 0.95,
    layout: 'single',
    mode: 'snapshot',
    interaction: 'read-only',
    _source: {
        protocol: 'ag-ui',
        correlationId: 'corr-123',
    },
};

const validCompilationResult = {
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

const validTrace = {
    id: 'trace-abc-123',
    timestamp: '2026-02-20T00:00:00Z',
    correlationId: 'corr-123',
    intent: {
        raw: 'show patient vitals',
        component: 'PatientVitals',
        confidence: 0.95,
        mode: 'snapshot',
    },
    resolution: {
        strategy: 'exact',
        resolvedComponent: 'PatientVitals',
        candidatesConsidered: 1,
    },
    compilation: {
        status: 'pass',
        errorCount: 0,
        selfCorrectionAttempts: 0,
        tokensValidated: true,
        accessibilityInjected: true,
    },
    determinism: {
        level: 1.0,
        cacheHit: false,
        zone: 'main',
    },
    metrics: {
        totalMs: 50,
        resolutionMs: 10,
        compilationMs: 5,
        renderMs: 35,
    },
    consent: {
        anonymizedAggregation: false,
    },
};

const validZoneConfig = {
    id: 'main-zone',
    name: 'main',
    determinism: 0.8,
    allowedComponents: ['PatientVitals', 'MedicationList'],
    fallbackComponent: 'GenericCard',
    agentTimeoutMs: 5000,
    cache: { enabled: true, ttl: 3600 },
    activateOn: 'mount',
};

const validForgeSignal = {
    intentHash: 'sha256:abc123def456',
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

const validUserSignal = {
    type: 'click',
    zone: 'main',
    component: 'PatientVitals',
    payload: { action: 'view-detail' },
    timestamp: '2026-02-20T00:00:00Z',
};

const validSerializedState = {
    schemaVersion: '1.0.0',
    zones: {
        main: {
            name: 'main',
            lifecycleState: 'ready',
            determinism: 1.0,
            lastUpdated: '2026-02-20T00:00:00Z',
        },
    },
    traceIds: ['trace-1', 'trace-2'],
    session: {
        id: 'session-123',
        startedAt: '2026-02-20T00:00:00Z',
    },
    extensions: {},
};

// ---------------------------------------------------------------------------
// ComponentContractSchema
// ---------------------------------------------------------------------------

describe('ComponentContractSchema', () => {
    it('should parse a valid contract', () => {
        const result = ComponentContractSchema.safeParse(validContract);
        expect(result.success).toBe(true);
    });

    it('should reject missing name', () => {
        const { name: _, ...invalid } = validContract;
        const result = ComponentContractSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject description > 120 characters', () => {
        const invalid = { ...validContract, description: 'x'.repeat(121) };
        const result = ComponentContractSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject empty tags array', () => {
        const invalid = { ...validContract, tags: [] };
        const result = ComponentContractSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should accept optional origin field', () => {
        const withOrigin = {
            ...validContract,
            origin: {
                registryUrl: 'https://registry.enterstellar.dev',
                publisher: 'enterstellar-team',
                verifiedAt: '2026-02-20T00:00:00Z',
            },
        };
        const result = ComponentContractSchema.safeParse(withOrigin);
        expect(result.success).toBe(true);
    });

    it('should accept optional auth field', () => {
        const withAuth = {
            ...validContract,
            auth: { required: true, roles: ['clinician'] },
        };
        const result = ComponentContractSchema.safeParse(withAuth);
        expect(result.success).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// ComponentIntentSchema
// ---------------------------------------------------------------------------

describe('ComponentIntentSchema', () => {
    it('should parse a valid intent with all fields', () => {
        const result = ComponentIntentSchema.safeParse(validIntent);
        expect(result.success).toBe(true);
    });

    it('should parse a minimal intent (only required fields)', () => {
        const minimal = {
            component: 'PatientVitals',
            props: {},
            confidence: 0.5,
        };
        const result = ComponentIntentSchema.safeParse(minimal);
        expect(result.success).toBe(true);
    });

    it('should reject confidence > 1', () => {
        const invalid = { ...validIntent, confidence: 1.5 };
        const result = ComponentIntentSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject confidence < 0', () => {
        const invalid = { ...validIntent, confidence: -0.1 };
        const result = ComponentIntentSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject invalid layout value', () => {
        const invalid = { ...validIntent, layout: 'circular' };
        const result = ComponentIntentSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject invalid interaction value', () => {
        const invalid = { ...validIntent, interaction: 'destructive' };
        const result = ComponentIntentSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// CompilationResultSchema + CompilationErrorSchema
// ---------------------------------------------------------------------------

describe('CompilationResultSchema', () => {
    it('should parse a valid result', () => {
        const result = CompilationResultSchema.safeParse(validCompilationResult);
        expect(result.success).toBe(true);
    });

    it('should accept result with errors', () => {
        const withErrors = {
            ...validCompilationResult,
            status: 'fail',
            errors: [
                {
                    code: 'ENS-2001',
                    path: 'props.riskLevel',
                    message: 'Unknown prop.',
                },
            ],
        };
        const result = CompilationResultSchema.safeParse(withErrors);
        expect(result.success).toBe(true);
    });

    it('should accept result with diff', () => {
        const withDiff = {
            ...validCompilationResult,
            diff: {
                raw: { color: '#ff0000' },
                compiled: { color: 'token:danger' },
            },
        };
        const result = CompilationResultSchema.safeParse(withDiff);
        expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
        const invalid = { ...validCompilationResult, status: 'unknown' };
        const result = CompilationResultSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

describe('CompilationErrorSchema', () => {
    it('should parse a valid error with fix suggestion', () => {
        const error = {
            code: 'ENS-2002',
            path: 'tokens.color',
            message: 'Unknown token.',
            received: '#ff0000',
            expected: 'token:danger',
            fix: { field: 'tokens.color', was: '#ff0000', shouldBe: 'token:danger' },
        };
        const result = CompilationErrorSchema.safeParse(error);
        expect(result.success).toBe(true);
    });

    it('should parse a valid error without fix', () => {
        const error = {
            code: 'ENS-2001',
            path: 'props.unknownProp',
            message: 'Unknown prop.',
        };
        const result = CompilationErrorSchema.safeParse(error);
        expect(result.success).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// AgentTraceSchema
// ---------------------------------------------------------------------------

describe('AgentTraceSchema', () => {
    it('should parse a valid trace', () => {
        const result = AgentTraceSchema.safeParse(validTrace);
        expect(result.success).toBe(true);
    });

    it('should reject invalid resolution strategy', () => {
        const invalid = {
            ...validTrace,
            resolution: { ...validTrace.resolution, strategy: 'magic' },
        };
        const result = AgentTraceSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject determinism > 1', () => {
        const invalid = {
            ...validTrace,
            determinism: { ...validTrace.determinism, level: 1.5 },
        };
        const result = AgentTraceSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject negative metrics', () => {
        const invalid = {
            ...validTrace,
            metrics: { ...validTrace.metrics, totalMs: -1 },
        };
        const result = AgentTraceSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ZoneConfigSchema
// ---------------------------------------------------------------------------

describe('ZoneConfigSchema', () => {
    it('should parse a valid zone config', () => {
        const result = ZoneConfigSchema.safeParse(validZoneConfig);
        expect(result.success).toBe(true);
    });

    it('should reject determinism > 1', () => {
        const invalid = { ...validZoneConfig, determinism: 2.0 };
        const result = ZoneConfigSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject determinism < 0', () => {
        const invalid = { ...validZoneConfig, determinism: -0.5 };
        const result = ZoneConfigSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject invalid activateOn value', () => {
        const invalid = { ...validZoneConfig, activateOn: 'hover' };
        const result = ZoneConfigSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ForgeSignalSchema
// ---------------------------------------------------------------------------

describe('ForgeSignalSchema', () => {
    it('should parse a valid signal', () => {
        const result = ForgeSignalSchema.safeParse(validForgeSignal);
        expect(result.success).toBe(true);
    });

    it('should reject invalid intentCategory', () => {
        const invalid = { ...validForgeSignal, intentCategory: 'medical' };
        const result = ForgeSignalSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject negative latencyMs', () => {
        const invalid = { ...validForgeSignal, latencyMs: -1 };
        const result = ForgeSignalSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject invalid platform', () => {
        const invalid = { ...validForgeSignal, platform: 'ios' };
        const result = ForgeSignalSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// UserSignalSchema
// ---------------------------------------------------------------------------

describe('UserSignalSchema', () => {
    it('should parse a valid user signal', () => {
        const result = UserSignalSchema.safeParse(validUserSignal);
        expect(result.success).toBe(true);
    });

    it('should accept signal with correlationId', () => {
        const withCorr = { ...validUserSignal, correlationId: 'corr-123' };
        const result = UserSignalSchema.safeParse(withCorr);
        expect(result.success).toBe(true);
    });

    it('should reject invalid type', () => {
        const invalid = { ...validUserSignal, type: 'hover' };
        const result = UserSignalSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should reject empty zone', () => {
        const invalid = { ...validUserSignal, zone: '' };
        const result = UserSignalSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// SerializedStateSchema + sub-schemas
// ---------------------------------------------------------------------------

describe('SerializedStateSchema', () => {
    it('should parse a valid serialized state', () => {
        const result = SerializedStateSchema.safeParse(validSerializedState);
        expect(result.success).toBe(true);
    });

    it('should reject missing schemaVersion', () => {
        const { schemaVersion: _, ...invalid } = validSerializedState;
        const result = SerializedStateSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('should accept state with threadId', () => {
        const withThread = {
            ...validSerializedState,
            session: { ...validSerializedState.session, threadId: 'patient-123-consult' },
        };
        const result = SerializedStateSchema.safeParse(withThread);
        expect(result.success).toBe(true);
    });
});

describe('ZoneStateSchema', () => {
    it('should reject invalid lifecycleState', () => {
        const invalid = {
            name: 'main',
            lifecycleState: 'pending',
            determinism: 0.5,
            lastUpdated: '2026-02-20T00:00:00Z',
        };
        const result = ZoneStateSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });
});

describe('SessionStateSchema', () => {
    it('should parse a valid session', () => {
        const session = { id: 'sess-1', startedAt: '2026-02-20T00:00:00Z' };
        const result = SessionStateSchema.safeParse(session);
        expect(result.success).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// ForgeResultSchema + ForgeTraceRecordSchema
// ---------------------------------------------------------------------------

describe('ForgeResultSchema', () => {
    it('should parse a valid forge result', () => {
        const result = ForgeResultSchema.safeParse({
            success: true,
            contract: { name: 'Forged' },
            compilationResult: null,
            fallbackUsed: false,
            forgeMode: 'local',
        });
        expect(result.success).toBe(true);
    });

    it('should reject invalid forgeMode', () => {
        const result = ForgeResultSchema.safeParse({
            success: true,
            contract: null,
            compilationResult: null,
            fallbackUsed: false,
            forgeMode: 'magical',
        });
        expect(result.success).toBe(false);
    });
});

describe('ForgeTraceRecordSchema', () => {
    it('should parse a valid forge trace record', () => {
        const result = ForgeTraceRecordSchema.safeParse({
            intentSlug: 'treatment-comparison',
            intentHash: 'sha256:abc',
            forgeMode: 'cloud',
            success: true,
            timestamp: '2026-02-20T00:00:00Z',
        });
        expect(result.success).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// DesignTokenSetSchema
// ---------------------------------------------------------------------------

describe('DesignTokenSetSchema', () => {
    it('should parse a valid token set', () => {
        const result = DesignTokenSetSchema.safeParse({
            color: 'token:danger',
            background: 'token:card-bg',
        });
        expect(result.success).toBe(true);
    });

    it('should reject empty token values', () => {
        const result = DesignTokenSetSchema.safeParse({
            color: '',
        });
        expect(result.success).toBe(false);
    });
});
