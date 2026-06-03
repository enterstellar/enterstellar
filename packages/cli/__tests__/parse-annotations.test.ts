/**
 * @module @enterstellar-ai/cli/__tests__/parse-annotations
 * @description Unit tests for the annotation parser.
 *
 * Validates:
 * - Single-line `@enterstellar-review` annotations (has `rule=`)
 * - Single-line `@enterstellar-warn` annotations (no `rule=`, Audit E1)
 * - Multi-line annotations with `//` continuation (Audit M3)
 * - Mixed `@enterstellar-review` and `@enterstellar-warn` in the same file
 * - Malformed annotations → skipped gracefully
 * - Files with zero annotations → empty array
 * - `rule` field is absent (not undefined) for `@enterstellar-warn` (Audit M6)
 *
 * @see Audit E1 — dual-format parsing
 * @see Audit M3 — multi-line continuation algorithm
 * @see Audit M6 — `ParsedAnnotation.rule` is optional
 */

import { describe, it, expect } from 'vitest';

import { parseAnnotations } from '../src/review/parse-annotations.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Single-line @enterstellar-review annotation. */
const SINGLE_REVIEW = `
export const Button = defineContract({
    // @enterstellar-review: rule=GENERIC_TYPE field=props reason="Component has generic type parameters: <T>. Generated schema uses placeholder types."
    props: z.object({}),
});
`.trim();

/** Single-line @enterstellar-warn annotation (no rule= field). */
const SINGLE_WARN = `
export const Card = defineContract({
    // @enterstellar-warn: field=description reason="Description derived from heuristics. Review and refine."
    description: 'A card component.',
});
`.trim();

/** Multi-line @enterstellar-review with continuation lines. */
const MULTI_LINE_REVIEW = `
export const DataTable = defineContract({
    // @enterstellar-review: rule=GENERIC_TYPE field=props.data reason="Generic type parameter
    //   \`T extends Record<string, unknown>\` cannot be statically expressed as a Zod
    //   schema. \`z.array(z.record(z.unknown()))\` is a placeholder."
    props: z.object({}),
});
`.trim();

/** File with both @enterstellar-review and @enterstellar-warn annotations. */
const MIXED_ANNOTATIONS = `
export const Form = defineContract({
    // @enterstellar-review: rule=GENERIC_TYPE field=props.fields reason="z.array(z.unknown()) — replace with field schema"
    props: z.object({}),
    // @enterstellar-warn: field=description reason="Description derived from heuristics. Review and refine."
    description: 'A form component.',
    // @enterstellar-warn: field=category reason="Category derived from heuristics. Review and refine."
    category: 'form',
});
`.trim();

/** Malformed annotation — missing field= key. */
const MALFORMED = `
export const Widget = defineContract({
    // @enterstellar-review: rule=SOME_RULE reason="Missing field= key"
    props: z.object({}),
});
`.trim();

/** File with no annotations at all. */
const NO_ANNOTATIONS = `
export const SimpleButton = defineContract({
    name: 'SimpleButton',
    description: 'A simple button.',
    props: z.object({ label: z.string() }),
});
`.trim();

/** Multiple @enterstellar-warn annotations. */
const MULTIPLE_WARNS = `
export const Header = defineContract({
    // @enterstellar-warn: field=description reason="Description derived from heuristics. Review and refine."
    description: 'A header.',
    // @enterstellar-warn: field=tags reason="No tags detected — auto-generated from category. Add semantic tags."
    tags: ['layout'],
    // @enterstellar-warn: field=tokens reason="Detected CSS variable references: var(--enterstellar-primary). Map to token:* format manually."
    tokens: {},
});
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseAnnotations', () => {
    it('parses a single-line @enterstellar-review annotation', () => {
        const result = parseAnnotations(SINGLE_REVIEW, 'Button.contract.ts');

        expect(result.filePath).toBe('Button.contract.ts');
        expect(result.annotations).toHaveLength(1);

        const ann = result.annotations[0];
        expect(ann).toBeDefined();
        expect(ann!.type).toBe('review');
        expect(ann!.rule).toBe('GENERIC_TYPE');
        expect(ann!.field).toBe('props');
        expect(ann!.reason).toBe(
            'Component has generic type parameters: <T>. Generated schema uses placeholder types.',
        );
        expect(ann!.line).toBe(2); // 1-indexed, annotation is on line 2 of trimmed content
    });

    it('parses a single-line @enterstellar-warn annotation (no rule= field, Audit E1)', () => {
        const result = parseAnnotations(SINGLE_WARN, 'Card.contract.ts');

        expect(result.annotations).toHaveLength(1);

        const ann = result.annotations[0];
        expect(ann).toBeDefined();
        expect(ann!.type).toBe('warn');
        expect(ann!.field).toBe('description');
        expect(ann!.reason).toBe(
            'Description derived from heuristics. Review and refine.',
        );

        // Audit M6: rule is absent (not undefined) for @enterstellar-warn.
        // With exactOptionalPropertyTypes, checking 'rule' in ann
        // verifies absence vs. explicit undefined.
        expect('rule' in ann!).toBe(false);
    });

    it('parses a multi-line @enterstellar-review annotation with // continuation (Audit M3)', () => {
        const result = parseAnnotations(MULTI_LINE_REVIEW, 'DataTable.contract.ts');

        expect(result.annotations).toHaveLength(1);

        const ann = result.annotations[0];
        expect(ann).toBeDefined();
        expect(ann!.type).toBe('review');
        expect(ann!.rule).toBe('GENERIC_TYPE');
        expect(ann!.field).toBe('props.data');
        // Multi-line reason is joined with spaces.
        expect(ann!.reason).toContain('Generic type parameter');
        expect(ann!.reason).toContain('cannot be statically expressed');
        expect(ann!.reason).toContain('placeholder.');
    });

    it('parses mixed @enterstellar-review and @enterstellar-warn annotations in one file', () => {
        const result = parseAnnotations(MIXED_ANNOTATIONS, 'Form.contract.ts');

        expect(result.annotations).toHaveLength(3);

        // First: @enterstellar-review
        const review = result.annotations[0];
        expect(review).toBeDefined();
        expect(review!.type).toBe('review');
        expect(review!.rule).toBe('GENERIC_TYPE');
        expect(review!.field).toBe('props.fields');

        // Second: @enterstellar-warn (description)
        const warn1 = result.annotations[1];
        expect(warn1).toBeDefined();
        expect(warn1!.type).toBe('warn');
        expect(warn1!.field).toBe('description');
        expect('rule' in warn1!).toBe(false);

        // Third: @enterstellar-warn (category)
        const warn2 = result.annotations[2];
        expect(warn2).toBeDefined();
        expect(warn2!.type).toBe('warn');
        expect(warn2!.field).toBe('category');
    });

    it('skips malformed annotations gracefully (missing field= key)', () => {
        const result = parseAnnotations(MALFORMED, 'Widget.contract.ts');

        // The malformed annotation (missing field=) should be skipped.
        expect(result.annotations).toHaveLength(0);
    });

    it('returns empty annotations array for files with no annotations', () => {
        const result = parseAnnotations(NO_ANNOTATIONS, 'SimpleButton.contract.ts');

        expect(result.filePath).toBe('SimpleButton.contract.ts');
        expect(result.annotations).toHaveLength(0);
    });

    it('parses multiple @enterstellar-warn annotations correctly', () => {
        const result = parseAnnotations(MULTIPLE_WARNS, 'Header.contract.ts');

        expect(result.annotations).toHaveLength(3);

        // All should be 'warn' type with no rule.
        for (const ann of result.annotations) {
            expect(ann.type).toBe('warn');
            expect('rule' in ann).toBe(false);
        }

        // Verify field paths.
        expect(result.annotations[0]!.field).toBe('description');
        expect(result.annotations[1]!.field).toBe('tags');
        expect(result.annotations[2]!.field).toBe('tokens');
    });
});
