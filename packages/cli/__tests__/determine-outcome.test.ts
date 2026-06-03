/**
 * @module @enterstellar-ai/cli/__tests__/determine-outcome
 * @description Tests for outcome determination, content patching, and
 * provenance reconstruction.
 *
 * Covers all 3 exported functions from `determine-outcome.ts`:
 * - `determineOutcome()` — annotation arrays → MigrationOutcome
 * - `patchContractContent()` — `@outcome clean` placeholder replacement (Audit E1)
 * - `reconstructProvenance()` — readonly field override (Audit E1)
 *
 * @see Correction 1 — 4-Level Outcome Model
 * @see Audit E1 — `@outcome clean` placeholder patching
 */

import { describe, it, expect } from 'vitest';

import {
    determineOutcome,
    patchContractContent,
    reconstructProvenance,
} from '../src/migrate/determine-outcome.js';

import type { ContractAssemblyResult, MigrationProvenance } from '@enterstellar-ai/migration';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal `ContractAssemblyResult` factory for testing.
 * Only `reviewAnnotations` and `warnAnnotations` are relevant to
 * outcome determination — other fields use placeholder values.
 */
function makeAssemblyResult(
    overrides: Partial<Pick<ContractAssemblyResult, 'reviewAnnotations' | 'warnAnnotations'>> = {},
): ContractAssemblyResult {
    return {
        content: '/* generated contract */',
        reviewAnnotations: overrides.reviewAnnotations ?? [],
        warnAnnotations: overrides.warnAnnotations ?? [],
        provenance: {
            source: 'Button.tsx',
            generatedAt: '2026-01-01T00:00:00.000Z',
            pipelineVersion: '1.0.0',
            phases: ['ast'],
            outcome: 'clean',
        },
    };
}

/**
 * Minimal `MigrationProvenance` fixture for reconstruction tests.
 */
const BASE_PROVENANCE: MigrationProvenance = {
    source: 'Card.tsx',
    generatedAt: '2026-05-20T12:00:00.000Z',
    pipelineVersion: '1.0.0',
    phases: ['ast', 'enrichment'],
    enrichmentProvider: 'openai',
    enrichedFields: ['description', 'tags'],
    outcome: 'clean',
};

// ---------------------------------------------------------------------------
// determineOutcome
// ---------------------------------------------------------------------------

describe('determineOutcome', () => {
    it('returns "clean" when both annotation arrays are empty', () => {
        const result = makeAssemblyResult();
        expect(determineOutcome(result)).toBe('clean');
    });

    it('returns "warn" when only warnAnnotations are present', () => {
        const result = makeAssemblyResult({
            warnAnnotations: ['@enterstellar-warn heuristic category inference'],
        });
        expect(determineOutcome(result)).toBe('warn');
    });

    it('returns "review" when only reviewAnnotations are present', () => {
        const result = makeAssemblyResult({
            reviewAnnotations: ['@enterstellar-review missing aria-label'],
        });
        expect(determineOutcome(result)).toBe('review');
    });

    it('returns "review" when BOTH annotations are present (review > warn precedence)', () => {
        const result = makeAssemblyResult({
            reviewAnnotations: ['@enterstellar-review missing aria-label'],
            warnAnnotations: ['@enterstellar-warn heuristic category inference'],
        });
        expect(determineOutcome(result)).toBe('review');
    });

    it('handles multiple reviewAnnotations', () => {
        const result = makeAssemblyResult({
            reviewAnnotations: [
                '@enterstellar-review missing aria-label',
                '@enterstellar-review no accessible name',
            ],
        });
        expect(determineOutcome(result)).toBe('review');
    });

    it('handles multiple warnAnnotations', () => {
        const result = makeAssemblyResult({
            warnAnnotations: [
                '@enterstellar-warn heuristic category inference',
                '@enterstellar-warn heuristic intent inference',
                '@enterstellar-warn heuristic description inference',
            ],
        });
        expect(determineOutcome(result)).toBe('warn');
    });
});

// ---------------------------------------------------------------------------
// patchContractContent (Audit E1)
// ---------------------------------------------------------------------------

describe('patchContractContent', () => {
    const CONTENT_WITH_PLACEHOLDER = [
        '/**',
        ' * @enterstellar-generated',
        ' * @source Button.tsx',
        ' * @outcome clean',
        ' * @pipeline-version 1.0.0',
        ' */',
    ].join('\n');

    it('replaces @outcome clean with @outcome review', () => {
        const patched = patchContractContent(CONTENT_WITH_PLACEHOLDER, 'review');
        expect(patched).toContain('@outcome review');
        expect(patched).not.toContain('@outcome clean');
    });

    it('replaces @outcome clean with @outcome warn', () => {
        const patched = patchContractContent(CONTENT_WITH_PLACEHOLDER, 'warn');
        expect(patched).toContain('@outcome warn');
        expect(patched).not.toContain('@outcome clean');
    });

    it('returns content unchanged when outcome is "clean" (identity case)', () => {
        const patched = patchContractContent(CONTENT_WITH_PLACEHOLDER, 'clean');
        expect(patched).toBe(CONTENT_WITH_PLACEHOLDER);
    });

    it('replaces @outcome clean with @outcome skip', () => {
        const patched = patchContractContent(CONTENT_WITH_PLACEHOLDER, 'skip');
        expect(patched).toContain('@outcome skip');
        expect(patched).not.toContain('@outcome clean');
    });
});

// ---------------------------------------------------------------------------
// reconstructProvenance (Audit E1)
// ---------------------------------------------------------------------------

describe('reconstructProvenance', () => {
    it('overrides the outcome field on the provenance object', () => {
        const corrected = reconstructProvenance(BASE_PROVENANCE, 'review');
        expect(corrected.outcome).toBe('review');
    });

    it('preserves all other fields from the original provenance', () => {
        const corrected = reconstructProvenance(BASE_PROVENANCE, 'warn');
        expect(corrected.source).toBe('Card.tsx');
        expect(corrected.generatedAt).toBe('2026-05-20T12:00:00.000Z');
        expect(corrected.pipelineVersion).toBe('1.0.0');
        expect(corrected.phases).toEqual(['ast', 'enrichment']);
        expect(corrected.enrichmentProvider).toBe('openai');
        expect(corrected.enrichedFields).toEqual(['description', 'tags']);
    });

    it('returns a new object (does not mutate the original)', () => {
        const corrected = reconstructProvenance(BASE_PROVENANCE, 'review');
        expect(corrected).not.toBe(BASE_PROVENANCE);
        // Original is still 'clean' (readonly, but verify no mutation occurred).
        expect(BASE_PROVENANCE.outcome).toBe('clean');
    });

    it('handles identity case (outcome = clean → clean)', () => {
        const corrected = reconstructProvenance(BASE_PROVENANCE, 'clean');
        expect(corrected.outcome).toBe('clean');
        expect(corrected).not.toBe(BASE_PROVENANCE);
    });
});
