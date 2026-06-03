/**
 * @module @enterstellar-ai/migration/__tests__/types
 * @description Type-level tests for migration pipeline types.
 *
 * These tests validate the type system at compile time — they verify
 * that the generic `EnrichableField<T>`, `EnrichedFieldPatch` mapped type,
 * and `SemanticOverlay` shapes enforce the correct constraints.
 *
 * Runtime tests for extraction, enrichment, and assembly logic will be
 * added as those modules are implemented.
 */

import { describe, it, expect } from 'vitest';

import type {
    EnrichableField,
    EnrichedFieldPatch,
    ManifestFieldSource,
    SourceLocation,
    MigrationOutcome,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Type Smoke Tests
// ---------------------------------------------------------------------------

describe('Migration Types', () => {
    it('ManifestFieldSource — accepts all 3 valid values', () => {
        const sources: ManifestFieldSource[] = [
            'ast-determined',
            'heuristic-fallback',
            'enrichment',
        ];
        expect(sources).toHaveLength(3);
    });

    it('SourceLocation — has file and line fields', () => {
        const loc: SourceLocation = { file: 'src/Button.tsx', line: 42 };
        expect(loc.file).toBe('src/Button.tsx');
        expect(loc.line).toBe(42);
    });

    it('EnrichableField — wraps a value with source provenance', () => {
        const field: EnrichableField<string> = {
            value: 'A button component.',
            source: 'ast-determined',
            sourceLocation: { file: 'src/Button.tsx', line: 15 },
        };
        expect(field.value).toBe('A button component.');
        expect(field.source).toBe('ast-determined');
        expect(field.sourceLocation?.line).toBe(15);
    });

    it('EnrichableField — sourceLocation is optional', () => {
        const field: EnrichableField<readonly string[]> = {
            value: ['ui', 'button'],
            source: 'heuristic-fallback',
        };
        expect(field.value).toEqual(['ui', 'button']);
        expect(field.sourceLocation).toBeUndefined();
    });

    it('MigrationOutcome — accepts all 4 valid values', () => {
        const outcomes: MigrationOutcome[] = ['clean', 'warn', 'review', 'skip'];
        expect(outcomes).toHaveLength(4);
    });

    it('EnrichedFieldPatch — type-safe key/value pair', () => {
        const patch: EnrichedFieldPatch = {
            key: 'description',
            value: 'A clinical patient card.',
        };
        expect(patch.key).toBe('description');
        expect(patch.value).toBe('A clinical patient card.');
    });
});
