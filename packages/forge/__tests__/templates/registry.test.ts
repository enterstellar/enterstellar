/**
 * @module @enterstellar-ai/forge/__tests__/templates/registry
 * @description Unit tests for the internal template registry.
 *
 * Verifies template storage, lookup, custom registration with Zod validation,
 * category-based matching (decision tree), and built-in pre-loading.
 *
 * @see Design Choice F2 — category-based decision tree.
 * @see Design Choice F3 — custom templates pass structural validation.
 * @see Design Choice F4 — built-in templates pre-loaded.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import { createTemplateRegistry } from '../../src/templates/registry.js';

import type { TemplateRegistry } from '../../src/templates/registry.js';
import type { ForgeTemplate } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a valid custom `ForgeTemplate` for testing.
 */
function createCustomTemplate(
    name: string,
    categories: readonly string[] = ['custom:test'],
): ForgeTemplate {
    return {
        name,
        categories: categories as ForgeTemplate['categories'],
        description: `Custom ${name} template for testing.`,
        slots: [
            { name: 'title', type: 'string', required: true, description: 'Title slot.' },
        ],
        tokens: {
            background: 'token:surface',
            textColor: 'token:text-primary',
        },
        states: {
            loading: `${name}Loading`,
            error: `${name}Error`,
            empty: `${name}Empty`,
            ready: name,
        },
        accessibility: {
            role: 'region',
            ariaLabel: `{name} ${name}`,
            announceOnUpdate: false,
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTemplateRegistry', () => {
    let registry: TemplateRegistry;

    beforeEach(() => {
        registry = createTemplateRegistry();
    });

    // -----------------------------------------------------------------------
    // Initialization / Pre-loading (F4)
    // -----------------------------------------------------------------------

    describe('initialization', () => {
        it('pre-loads 7 built-in templates', () => {
            expect(registry.size).toBe(7);
        });

        it('lists all 7 built-in template names', () => {
            const names = registry.listTemplates();
            expect(names).toContain('card');
            expect(names).toContain('list');
            expect(names).toContain('table');
            expect(names).toContain('chart');
            expect(names).toContain('form');
            expect(names).toContain('detail');
            expect(names).toContain('badge');
        });
    });

    // -----------------------------------------------------------------------
    // getTemplate
    // -----------------------------------------------------------------------

    describe('getTemplate', () => {
        it('returns a built-in template by name', () => {
            const card = registry.getTemplate('card');
            expect(card).toBeDefined();
            expect(card?.name).toBe('card');
        });

        it('returns undefined for unknown template name', () => {
            expect(registry.getTemplate('nonexistent')).toBeUndefined();
        });
    });

    // -----------------------------------------------------------------------
    // registerTemplate (F3)
    // -----------------------------------------------------------------------

    describe('registerTemplate', () => {
        it('registers a valid custom template', () => {
            const template = createCustomTemplate('timeline');
            registry.registerTemplate('timeline', template);

            expect(registry.getTemplate('timeline')).toBeDefined();
            expect(registry.size).toBe(8);
        });

        it('rejects duplicate names with ENS-4005', () => {
            const template = createCustomTemplate('card');
            expect(() => registry.registerTemplate('card', template)).toThrow(EnterstellarError);

            try {
                registry.registerTemplate('card', template);
            } catch (e: unknown) {
                expect(e).toBeInstanceOf(EnterstellarError);
                expect((e as EnterstellarError).code).toBe('ENS-4005');
            }
        });

        it('rejects name mismatch with ENS-4005', () => {
            const template = createCustomTemplate('timeline');
            expect(() => registry.registerTemplate('wrong-name', template)).toThrow(EnterstellarError);
        });

        it('rejects invalid template structure with ENS-4005', () => {
            const invalid = {
                name: 'bad-template',
                // Missing required fields: categories, description, slots, tokens, states, accessibility
            } as unknown as ForgeTemplate;

            expect(() => registry.registerTemplate('bad-template', invalid)).toThrow(EnterstellarError);
        });

        it('rejects template with invalid token values (no token: prefix)', () => {
            const template = {
                ...createCustomTemplate('bad-tokens'),
                tokens: { background: '#ff0000' }, // Raw CSS — violates R6
            };
            expect(() => registry.registerTemplate('bad-tokens', template)).toThrow(EnterstellarError);
        });

        it('includes Zod violations in the error message', () => {
            const invalid = {
                name: 'invalid',
                categories: [],
                description: '',
                slots: [],
                tokens: {},
                states: { loading: '', error: '', empty: '', ready: '' },
                accessibility: { role: '', ariaLabel: '', announceOnUpdate: false },
            } as unknown as ForgeTemplate;

            try {
                registry.registerTemplate('invalid', invalid);
            } catch (e: unknown) {
                expect(e).toBeInstanceOf(EnterstellarError);
                expect((e as EnterstellarError).message).toBeTruthy();
            }
        });
    });

    // -----------------------------------------------------------------------
    // matchTemplate (F2 — decision tree)
    // -----------------------------------------------------------------------

    describe('matchTemplate', () => {
        it('matches "data-display" category to the card template (first match)', () => {
            const matched = registry.matchTemplate('data-display');
            expect(matched).toBeDefined();
            // Card is listed first in builtin.ts, categories include 'data-display'
            expect(matched?.name).toBe('card');
        });

        it('matches "form" category to the form template', () => {
            const matched = registry.matchTemplate('form');
            expect(matched).toBeDefined();
            expect(matched?.name).toBe('form');
        });

        it('matches "feedback" category to the badge template', () => {
            const matched = registry.matchTemplate('feedback');
            expect(matched).toBeDefined();
            expect(matched?.name).toBe('badge');
        });

        it('matches "navigation" category to the list template', () => {
            const matched = registry.matchTemplate('navigation');
            expect(matched).toBeDefined();
            expect(matched?.name).toBe('list');
        });

        it('matches "admin" category to the table template', () => {
            const matched = registry.matchTemplate('admin');
            expect(matched).toBeDefined();
            // Table lists 'admin' in its categories
            expect(matched?.name).toBe('table');
        });

        it('returns undefined for unknown category', () => {
            const matched = registry.matchTemplate('custom:nonexistent');
            expect(matched).toBeUndefined();
        });

        it('matches custom template after registration', () => {
            const template = createCustomTemplate('timeline', ['custom:timeline']);
            registry.registerTemplate('timeline', template);

            const matched = registry.matchTemplate('custom:timeline');
            expect(matched).toBeDefined();
            expect(matched?.name).toBe('timeline');
        });

        it('built-in templates have priority over custom for shared categories', () => {
            // Register a custom template that also serves 'data-display'
            const template = createCustomTemplate('custom-display', ['data-display']);
            registry.registerTemplate('custom-display', template);

            // Built-in 'card' should still match first (insertion order priority)
            const matched = registry.matchTemplate('data-display');
            expect(matched?.name).toBe('card');
        });
    });

    // -----------------------------------------------------------------------
    // listTemplates
    // -----------------------------------------------------------------------

    describe('listTemplates', () => {
        it('returns all registered template names', () => {
            const names = registry.listTemplates();
            expect(names).toHaveLength(7);
        });

        it('includes custom templates after registration', () => {
            const template = createCustomTemplate('timeline');
            registry.registerTemplate('timeline', template);

            const names = registry.listTemplates();
            expect(names).toContain('timeline');
            expect(names).toHaveLength(8);
        });
    });
});
