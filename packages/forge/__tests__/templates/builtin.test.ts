/**
 * @module @enterstellar-ai/forge/__tests__/templates/builtin
 * @description Unit tests for the 7 built-in LocalForge template schemas.
 *
 * Verifies that all templates:
 * - Parse against `ForgeTemplateSchema` without errors.
 * - Contain all required fields (slots, tokens, states, accessibility).
 * - Have token values starting with `token:` (R6).
 * - Have all 4 lifecycle states declared (L9).
 * - Are present in the `BUILTIN_TEMPLATE_NAMES` set.
 *
 * @see Design Choice F2 — 7 pre-approved patterns.
 * @see Design Choice F4 — shipped inside `@enterstellar-ai/forge`.
 */

import { describe, it, expect } from 'vitest';

import { BUILTIN_TEMPLATES, BUILTIN_TEMPLATE_NAMES } from '../../src/templates/builtin.js';
import { ForgeTemplateSchema } from '../../src/templates/types.js';

// ---------------------------------------------------------------------------
// Expected template names (F2)
// ---------------------------------------------------------------------------

const EXPECTED_NAMES = ['card', 'list', 'table', 'chart', 'form', 'detail', 'badge'] as const;

// ---------------------------------------------------------------------------
// Collection-level validations
// ---------------------------------------------------------------------------

describe('BUILTIN_TEMPLATES', () => {
    it('contains exactly 7 templates', () => {
        expect(BUILTIN_TEMPLATES).toHaveLength(7);
    });

    it('contains all 7 expected pattern names', () => {
        const names = BUILTIN_TEMPLATES.map((t) => t.name);
        for (const expected of EXPECTED_NAMES) {
            expect(names).toContain(expected);
        }
    });

    it('has unique template names (no duplicates)', () => {
        const names = BUILTIN_TEMPLATES.map((t) => t.name);
        const unique = new Set(names);
        expect(unique.size).toBe(names.length);
    });
});

// ---------------------------------------------------------------------------
// BUILTIN_TEMPLATE_NAMES set
// ---------------------------------------------------------------------------

describe('BUILTIN_TEMPLATE_NAMES', () => {
    it('contains all 7 template names', () => {
        for (const name of EXPECTED_NAMES) {
            expect(BUILTIN_TEMPLATE_NAMES.has(name)).toBe(true);
        }
    });

    it('does not contain unknown names', () => {
        expect(BUILTIN_TEMPLATE_NAMES.has('unknown-template')).toBe(false);
    });

    it('has the same size as BUILTIN_TEMPLATES', () => {
        expect(BUILTIN_TEMPLATE_NAMES.size).toBe(BUILTIN_TEMPLATES.length);
    });
});

// ---------------------------------------------------------------------------
// Per-template Zod schema validation
// ---------------------------------------------------------------------------

describe('ForgeTemplateSchema validation', () => {
    it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t]))(
        'template "%s" passes ForgeTemplateSchema validation',
        (_name, template) => {
            const result = ForgeTemplateSchema.safeParse(template);
            expect(result.success).toBe(true);
        },
    );
});

// ---------------------------------------------------------------------------
// Per-template structural checks
// ---------------------------------------------------------------------------

describe('template structural requirements', () => {
    it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t]))(
        'template "%s" has at least one category',
        (_name, template) => {
            expect(template.categories.length).toBeGreaterThanOrEqual(1);
        },
    );

    it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t]))(
        'template "%s" has a non-empty description ≤120 chars',
        (_name, template) => {
            expect(template.description.length).toBeGreaterThan(0);
            expect(template.description.length).toBeLessThanOrEqual(120);
        },
    );

    it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t]))(
        'template "%s" has at least one slot',
        (_name, template) => {
            expect(template.slots.length).toBeGreaterThanOrEqual(1);
        },
    );
});

// ---------------------------------------------------------------------------
// Token prefix enforcement (R6)
// ---------------------------------------------------------------------------

describe('token prefix enforcement (R6)', () => {
    it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t]))(
        'template "%s" — all token values start with "token:"',
        (_name, template) => {
            for (const [key, value] of Object.entries(template.tokens)) {
                expect(value, `Token "${key}" should start with "token:"`).toMatch(/^token:/);
            }
        },
    );
});

// ---------------------------------------------------------------------------
// Lifecycle states (L9)
// ---------------------------------------------------------------------------

describe('lifecycle states (L9)', () => {
    const REQUIRED_STATES = ['loading', 'error', 'empty', 'ready'] as const;

    it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t]))(
        'template "%s" has all 4 lifecycle states',
        (_name, template) => {
            for (const state of REQUIRED_STATES) {
                expect(template.states[state], `State "${state}" should be non-empty`).toBeTruthy();
            }
        },
    );
});

// ---------------------------------------------------------------------------
// Accessibility (C10)
// ---------------------------------------------------------------------------

describe('accessibility (C10)', () => {
    it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t]))(
        'template "%s" has role and ariaLabel',
        (_name, template) => {
            expect(template.accessibility.role).toBeTruthy();
            expect(template.accessibility.ariaLabel).toBeTruthy();
            expect(typeof template.accessibility.announceOnUpdate).toBe('boolean');
        },
    );
});
