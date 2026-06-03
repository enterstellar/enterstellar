/**
 * @module @enterstellar-ai/semantic-index/__tests__/embedding-text
 * @description Tests for `buildEmbeddingText()` — the pure function that converts
 * a `ComponentContract` into embedding text per the locked SI2 formula.
 *
 * **SI2 formula (locked):**
 * `name + description + category + tags.join(' ') + props.keys.join(' ') + accessibility.role`
 *
 * **Excluded:** `states` keys (SI2 — universal across components, no discriminating signal).
 *
 * @see Design Choice SI2
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import type { ComponentContract, ComponentCategory } from '@enterstellar-ai/types';
import { createComponentId } from '@enterstellar-ai/types';

import { buildEmbeddingText } from '../src/embedding-text.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a valid `ComponentContract` for testing.
 * Tests override specific fields to verify embedding text composition.
 */
function createTestContract(
    overrides: Partial<Omit<ComponentContract, 'id' | '_meta'>> = {},
): ComponentContract {
    const name = overrides.name ?? 'PatientVitals';
    return {
        id: createComponentId(name),
        name,
        description: overrides.description ?? 'Displays real-time patient vital signs.',
        category: (overrides.category ?? 'clinical') as ComponentCategory,
        tags: overrides.tags ?? ['patient', 'vitals', 'monitoring'],
        props: overrides.props ?? z.object({
            patientId: z.string(),
            riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
        }),
        tokens: overrides.tokens ?? { statusColor: 'token:danger' },
        accessibility: overrides.accessibility ?? {
            role: 'region',
            ariaLabel: 'Patient vitals',
            announceOnUpdate: true,
        },
        states: overrides.states ?? {
            loading: 'VitalsLoading',
            error: 'VitalsError',
            empty: 'VitalsEmpty',
            ready: 'PatientVitals',
        },
        examples: overrides.examples ?? [
            { intent: 'Show patient vitals', props: { patientId: '123', riskLevel: 'high' } },
        ],
        _meta: { forged: false, version: '1.0.0', createdAt: new Date().toISOString() },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildEmbeddingText()', () => {
    // --- SI2 Field Concatenation ---

    it('concatenates name, description, category, tags, prop keys, and accessibility role', () => {
        const contract = createTestContract();
        const text = buildEmbeddingText(contract);

        // Verify all SI2 fields are present
        expect(text).toContain('PatientVitals');
        expect(text).toContain('Displays real-time patient vital signs.');
        expect(text).toContain('clinical');
        expect(text).toContain('patient');
        expect(text).toContain('vitals');
        expect(text).toContain('monitoring');
        expect(text).toContain('patientId');
        expect(text).toContain('riskLevel');
        expect(text).toContain('region');
    });

    it('produces the correct concatenation order per SI2', () => {
        const contract = createTestContract({
            name: 'AlertBanner',
            description: 'Shows alerts.',
            category: 'feedback' as ComponentCategory,
            tags: ['alert'],
            props: z.object({ severity: z.string() }),
            accessibility: { role: 'alert', ariaLabel: 'Alert banner', announceOnUpdate: true },
            states: { loading: 'Loading', error: 'Error', empty: 'Empty', ready: 'AlertBanner' },
        });
        const text = buildEmbeddingText(contract);

        // Order: name → description → category → tags → props.keys → accessibility.role
        expect(text).toBe('AlertBanner Shows alerts. feedback alert severity alert');
    });

    // --- SI2 Exclusion: states keys ---

    it('does NOT include states keys (loading, error, empty, ready) per SI2', () => {
        const contract = createTestContract({
            states: {
                loading: 'UniqueLoadingState',
                error: 'UniqueErrorState',
                empty: 'UniqueEmptyState',
                ready: 'PatientVitals',
            },
        });
        const text = buildEmbeddingText(contract);

        expect(text).not.toContain('UniqueLoadingState');
        expect(text).not.toContain('UniqueErrorState');
        expect(text).not.toContain('UniqueEmptyState');
        // 'PatientVitals' IS present — but from `name`, not from `states.ready`
    });

    // --- Tags Handling ---

    it('joins multiple tags with spaces', () => {
        const contract = createTestContract({
            tags: ['alpha', 'beta', 'gamma'],
        });
        const text = buildEmbeddingText(contract);

        expect(text).toContain('alpha beta gamma');
    });

    it('handles a single tag without extra spaces', () => {
        const contract = createTestContract({ tags: ['solo'] });
        const text = buildEmbeddingText(contract);

        expect(text).toContain('solo');
        // No double spaces
        expect(text).not.toMatch(/  /);
    });

    // --- Props Key Extraction ---

    it('extracts prop keys from z.object() schemas', () => {
        const contract = createTestContract({
            props: z.object({
                firstName: z.string(),
                lastName: z.string(),
                age: z.number(),
            }),
        });
        const text = buildEmbeddingText(contract);

        expect(text).toContain('firstName');
        expect(text).toContain('lastName');
        expect(text).toContain('age');
    });

    it('gracefully handles non-object Zod schemas (z.string, z.array) — no prop keys', () => {
        const contractString = createTestContract({ props: z.string() });
        const textString = buildEmbeddingText(contractString);

        // z.string() has no .shape — prop keys portion is empty
        // The text should still contain all other fields
        expect(textString).toContain('PatientVitals');
        expect(textString).toContain('region');
        // No double spaces from the empty prop keys join
        expect(textString).not.toMatch(/  /);

        const contractArray = createTestContract({ props: z.array(z.string()) });
        const textArray = buildEmbeddingText(contractArray);
        expect(textArray).not.toMatch(/  /);
    });

    it('handles z.object() with no properties', () => {
        const contract = createTestContract({ props: z.object({}) });
        const text = buildEmbeddingText(contract);

        // Empty shape → no prop keys, but no double spaces
        expect(text).not.toMatch(/  /);
        expect(text).toContain('PatientVitals');
    });

    // --- Accessibility Role ---

    it('includes the accessibility role', () => {
        const contract = createTestContract({
            accessibility: { role: 'navigation', ariaLabel: 'Nav', announceOnUpdate: false },
        });
        const text = buildEmbeddingText(contract);

        expect(text).toContain('navigation');
    });

    // --- Whitespace Normalization ---

    it('trims leading and trailing whitespace', () => {
        const contract = createTestContract();
        const text = buildEmbeddingText(contract);

        expect(text).toBe(text.trim());
    });

    it('collapses multiple spaces into single spaces', () => {
        const contract = createTestContract();
        const text = buildEmbeddingText(contract);

        expect(text).not.toMatch(/  /);
    });

    // --- Determinism ---

    it('produces identical output for the same contract (deterministic)', () => {
        const contract = createTestContract();
        const text1 = buildEmbeddingText(contract);
        const text2 = buildEmbeddingText(contract);

        expect(text1).toBe(text2);
    });
});
