/**
 * @module @enterstellar-ai/migration/__tests__/build-prompt
 * @description Unit tests for the Phase 2 enrichment prompt builder.
 *
 * Tests the `buildEnrichmentPrompt()` function in isolation — no HTTP
 * calls, no LLM interactions. Verifies prompt content, structural
 * context inclusion, source truncation, category constraints, and
 * edge cases.
 *
 * @see Correction 3 — BYOKeyEnrichmentProvider spec
 * @see Audit M4 — called inside BYO-key provider, not orchestrator
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import { buildEnrichmentPrompt } from '../src/enrichment/build-prompt.js';
import type { StructuralManifest, EnrichableFieldKey } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Fixture Factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal `StructuralManifest` for testing.
 *
 * All enrichable fields default to `heuristic-fallback` so they're
 * candidates for enrichment. Override specific fields via `overrides`.
 */
function createTestManifest(
    overrides?: Partial<StructuralManifest>,
): StructuralManifest {
    return {
        name: 'TestComponent',
        props: z.object({ label: z.string(), count: z.number() }),
        defaultProps: {},
        generics: [],
        existingZodSchemas: [],
        eventHandlers: [],
        description: {
            value: 'TODO: Add description',
            source: 'heuristic-fallback',
        },
        tags: {
            value: [],
            source: 'heuristic-fallback',
        },
        category: {
            value: 'utility',
            source: 'heuristic-fallback',
        },
        intent: {
            value: 'Render TestComponent',
            source: 'heuristic-fallback',
        },
        ariaAttributes: {
            value: {},
            source: 'heuristic-fallback',
        },
        designTokenRefs: {
            value: [],
            source: 'heuristic-fallback',
        },
        lifecycleStates: {
            value: [],
            source: 'heuristic-fallback',
        },
        ...overrides,
    };
}

const SAMPLE_SOURCE = `
import React from 'react';

type Props = {
    label: string;
    count: number;
};

export function TestComponent({ label, count }: Props) {
    return <div>{label}: {count}</div>;
}
`.trim();

// ---------------------------------------------------------------------------
// Basic Prompt Structure
// ---------------------------------------------------------------------------

describe('buildEnrichmentPrompt — basic structure', () => {
    it('returns { system, user } with non-empty strings', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt).toHaveProperty('system');
        expect(prompt).toHaveProperty('user');
        expect(prompt.system.length).toBeGreaterThan(0);
        expect(prompt.user.length).toBeGreaterThan(0);
    });

    it('system prompt mentions Enterstellar context', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.system).toContain('Enterstellar');
        expect(prompt.system).toContain('component analysis');
    });

    it('system prompt specifies JSON output format', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.system).toContain('"fields"');
        expect(prompt.system).toContain('"key"');
        expect(prompt.system).toContain('"value"');
    });
});

// ---------------------------------------------------------------------------
// Field Inclusion
// ---------------------------------------------------------------------------

describe('buildEnrichmentPrompt — field inclusion', () => {
    it('includes only requested fields in system prompt', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description', 'tags']);

        // Requested fields should appear
        expect(prompt.system).toContain('description');
        expect(prompt.system).toContain('tags');

        // The user prompt should list only requested fields
        expect(prompt.user).toContain('- description');
        expect(prompt.user).toContain('- tags');
    });

    it('includes all 7 fields when all are requested', () => {
        const manifest = createTestManifest();
        const allFields: readonly EnrichableFieldKey[] = [
            'description', 'tags', 'category', 'intent',
            'ariaAttributes', 'designTokenRefs', 'lifecycleStates',
        ];
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, allFields);

        for (const field of allFields) {
            expect(prompt.user).toContain(`- ${field}`);
        }
    });

    it('handles single field request', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['intent']);

        expect(prompt.user).toContain('- intent');
        // Should not list other fields
        expect(prompt.user).not.toContain('- description');
        expect(prompt.user).not.toContain('- tags');
    });
});

// ---------------------------------------------------------------------------
// Source Truncation
// ---------------------------------------------------------------------------

describe('buildEnrichmentPrompt — source truncation', () => {
    it('includes full source when under limit', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain(SAMPLE_SOURCE);
        expect(prompt.user).not.toContain('[truncated');
    });

    it('truncates source when over limit', () => {
        const manifest = createTestManifest();
        const longSource = 'x'.repeat(200);
        const prompt = buildEnrichmentPrompt(manifest, longSource, ['description'], 50);

        // Should contain truncation marker
        expect(prompt.user).toContain('[truncated');
        // Should contain the remaining count
        expect(prompt.user).toContain('150 chars omitted');
    });

    it('respects custom maxSourceChars', () => {
        const manifest = createTestManifest();
        const source = 'a'.repeat(100);
        const prompt = buildEnrichmentPrompt(manifest, source, ['description'], 30);

        expect(prompt.user).toContain('[truncated');
        // First 30 chars should be present
        expect(prompt.user).toContain('a'.repeat(30));
    });

    it('does not truncate when source exactly matches limit', () => {
        const manifest = createTestManifest();
        const source = 'b'.repeat(50);
        const prompt = buildEnrichmentPrompt(manifest, source, ['description'], 50);

        expect(prompt.user).not.toContain('[truncated');
        expect(prompt.user).toContain(source);
    });
});

// ---------------------------------------------------------------------------
// Structural Context
// ---------------------------------------------------------------------------

describe('buildEnrichmentPrompt — structural context', () => {
    it('includes component name', () => {
        const manifest = createTestManifest({ name: 'PatientCard' });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain('PatientCard');
    });

    it('extracts and includes prop names from ZodObject', () => {
        const manifest = createTestManifest({
            props: z.object({ title: z.string(), onClick: z.function() }),
        });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain('title');
        expect(prompt.user).toContain('onClick');
    });

    it('handles non-inspectable props schema gracefully', () => {
        const manifest = createTestManifest({
            props: z.unknown() as z.ZodType,
        });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        // Should indicate non-inspectable, not crash
        expect(prompt.user).toContain('non-inspectable');
    });

    it('includes event handlers when present', () => {
        const manifest = createTestManifest({
            eventHandlers: ['click', 'submit', 'change'],
        });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain('click');
        expect(prompt.user).toContain('submit');
        expect(prompt.user).toContain('change');
    });

    it('omits event handlers section when none present', () => {
        const manifest = createTestManifest({ eventHandlers: [] });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).not.toContain('Event Handlers');
    });

    it('includes existing Zod schemas when present', () => {
        const manifest = createTestManifest({
            existingZodSchemas: ['UserSchema', 'FormSchema'],
        });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain('UserSchema');
        expect(prompt.user).toContain('FormSchema');
    });

    it('includes generic parameters when present', () => {
        const manifest = createTestManifest({
            generics: [
                { name: 'T', constraint: 'Record<string, unknown>' },
                { name: 'U' },
            ],
        });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain('T extends Record<string, unknown>');
        expect(prompt.user).toContain('U');
    });

    it('includes default props when present', () => {
        const manifest = createTestManifest({
            defaultProps: { size: 'md', count: 0, disabled: false },
        });
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain('size=');
        expect(prompt.user).toContain('"md"');
        expect(prompt.user).toContain('count=');
    });
});

// ---------------------------------------------------------------------------
// Category Constraint
// ---------------------------------------------------------------------------

describe('buildEnrichmentPrompt — category constraint', () => {
    it('includes category values when category is in fieldsToEnrich', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['category']);

        expect(prompt.system).toContain('"clinical"');
        expect(prompt.system).toContain('"admin"');
        expect(prompt.system).toContain('"navigation"');
        expect(prompt.system).toContain('"data-display"');
        expect(prompt.system).toContain('"form"');
        expect(prompt.system).toContain('"feedback"');
        expect(prompt.system).toContain('"layout"');
        expect(prompt.system).toContain('"utility"');
    });

    it('does not include category values when category is not in fieldsToEnrich', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description', 'tags']);

        // The system prompt should not contain the category constraint block
        expect(prompt.system).not.toContain('MUST be one of these exact values');
    });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('buildEnrichmentPrompt — edge cases', () => {
    it('handles empty fieldsToEnrich', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, []);

        // Should still return valid prompt structure
        expect(prompt.system.length).toBeGreaterThan(0);
        expect(prompt.user.length).toBeGreaterThan(0);
    });

    it('handles empty source code', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, '', ['description']);

        // Should not crash — empty source is valid (component might be minimal)
        expect(prompt.user).toContain('```tsx');
        expect(prompt.user).toContain('```');
    });

    it('wraps source in tsx code fence', () => {
        const manifest = createTestManifest();
        const prompt = buildEnrichmentPrompt(manifest, SAMPLE_SOURCE, ['description']);

        expect(prompt.user).toContain('```tsx');
        // Should end with closing fence
        expect(prompt.user).toMatch(/```$/);
    });
});
