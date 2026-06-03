/**
 * @module @enterstellar-ai/forge/__tests__/local-forge
 * @description Unit tests for LocalForge — template-based contract generation.
 *
 * Verifies category matching, slot-to-prop extraction, default values for
 * missing required slots, `__forged_` naming (F13), metadata flags, and
 * null returns when no template matches.
 *
 * @see Design Choice F1 — templates are JSON schemas.
 * @see Design Choice F2 — category-based matching.
 * @see Design Choice F13 — `__forged_` naming convention.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { ComponentIntent } from '@enterstellar-ai/types';

import { forgeLocal } from '../src/local-forge.js';
import { createTemplateRegistry } from '../src/templates/registry.js';

import type { TemplateRegistry } from '../src/templates/registry.js';
import type { ForgeConstraints } from '../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal `ComponentIntent` for testing.
 */
function createIntent(overrides: Partial<ComponentIntent> = {}): ComponentIntent {
    return {
        component: 'PatientVitals',
        props: {},
        confidence: 0.5,
        ...overrides,
    };
}

/**
 * Creates default `ForgeConstraints` with all 7 patterns allowed.
 */
function createConstraints(overrides: Partial<ForgeConstraints> = {}): ForgeConstraints {
    return {
        designTokens: {},
        componentPatterns: ['card', 'list', 'table', 'chart', 'form', 'detail', 'badge'],
        maxComplexity: 5,
        requiredStates: ['loading', 'error', 'empty', 'ready'],
        accessibility: 'WCAG-AA',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('forgeLocal', () => {
    let registry: TemplateRegistry;
    let constraints: ForgeConstraints;

    beforeEach(() => {
        registry = createTemplateRegistry();
        constraints = createConstraints();
    });

    // -----------------------------------------------------------------------
    // Successful generation
    // -----------------------------------------------------------------------

    describe('successful generation', () => {
        it('generates a ComponentContract from a matching template', () => {
            const intent = createIntent({ component: 'PatientSummary' });
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract).not.toBeNull();
            expect(contract?.name).toMatch(/^__forged_/);
        });

        it('sets _meta.forged to true', () => {
            const intent = createIntent({ component: 'PatientSummary' });
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?._meta?.forged).toBe(true);
        });

        it('uses __forged_{slug}_{8hex} naming convention (F13)', () => {
            const intent = createIntent({ component: 'Show Treatment' });
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?.name).toMatch(/^__forged_[a-z0-9-]+_[0-9a-f]{8}$/);
        });

        it('sets the category from the provided category parameter', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?.category).toBe('data-display');
        });

        it('includes "forged" tag', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?.tags).toContain('forged');
        });

        it('includes the template name in tags', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            // 'data-display' maps to 'card' template (first match)
            expect(contract?.tags).toContain('card');
        });

        it('returns a frozen contract', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract).not.toBeNull();
            if (contract !== null) {
                expect(Object.isFrozen(contract)).toBe(true);
            }
        });

        it('generates an id field', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?.id).toBeDefined();
            expect(contract?.id).toBe(contract?.name);
        });
    });

    // -----------------------------------------------------------------------
    // Slot-to-prop extraction
    // -----------------------------------------------------------------------

    describe('slot extraction', () => {
        it('extracts intent props that match template slots', () => {
            const intent = createIntent({
                component: 'PatientCard',
                props: { title: 'John Doe', subtitle: 'Room 302' },
            });
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract).not.toBeNull();
            // The contract should have an example with the extracted props
            const example = contract?.examples?.[0];
            expect(example?.props).toHaveProperty('title', 'John Doe');
            expect(example?.props).toHaveProperty('subtitle', 'Room 302');
        });

        it('provides default values for missing required slots', () => {
            const intent = createIntent({
                component: 'PatientCard',
                props: {}, // No title provided, but title is required
            });
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract).not.toBeNull();
            // Required slot 'title' should get a default value (empty string)
            const example = contract?.examples?.[0];
            expect(example?.props).toHaveProperty('title', '');
        });

        it('discards intent props not defined in template slots', () => {
            const intent = createIntent({
                component: 'PatientCard',
                props: { title: 'John', unknownProp: 'should be discarded' },
            });
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            const example = contract?.examples?.[0];
            expect(example?.props).not.toHaveProperty('unknownProp');
        });
    });

    // -----------------------------------------------------------------------
    // Template matching
    // -----------------------------------------------------------------------

    describe('template matching', () => {
        it('matches "form" category to form template', () => {
            const intent = createIntent({ component: 'PatientForm' });
            const contract = forgeLocal(intent, registry, constraints, 'form');

            expect(contract).not.toBeNull();
            expect(contract?.tags).toContain('form');
        });

        it('matches "feedback" category to badge template', () => {
            const intent = createIntent({ component: 'StatusBadge' });
            const contract = forgeLocal(intent, registry, constraints, 'feedback');

            expect(contract).not.toBeNull();
            expect(contract?.tags).toContain('badge');
        });

        it('defaults to "data-display" category when no explicit category provided', () => {
            const intent = createIntent({ component: 'SomeComponent' });
            const contract = forgeLocal(intent, registry, constraints);

            expect(contract).not.toBeNull();
            expect(contract?.category).toBe('data-display');
        });
    });

    // -----------------------------------------------------------------------
    // Null returns (no match or disallowed pattern)
    // -----------------------------------------------------------------------

    describe('null returns', () => {
        it('returns null when no template matches the category', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'custom:nonexistent');

            expect(contract).toBeNull();
        });

        it('returns null when matched template is not in allowed patterns', () => {
            const restrictedConstraints = createConstraints({
                componentPatterns: ['list', 'table'], // 'card' not allowed
            });

            const intent = createIntent();
            const contract = forgeLocal(intent, registry, restrictedConstraints, 'data-display');

            // 'data-display' matches 'card', but 'card' is not in allowed patterns
            expect(contract).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Tokens and accessibility
    // -----------------------------------------------------------------------

    describe('tokens and accessibility', () => {
        it('copies template tokens to the generated contract', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?.tokens).toBeDefined();
            // Card template has token:surface as background
            expect(contract?.tokens['background']).toBe('token:surface');
        });

        it('resolves {name} placeholder in ariaLabel', () => {
            const intent = createIntent({ component: 'PatientCard' });
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?.accessibility.ariaLabel).toContain('PatientCard');
        });

        it('copies template states to the generated contract', () => {
            const intent = createIntent();
            const contract = forgeLocal(intent, registry, constraints, 'data-display');

            expect(contract?.states.loading).toBeTruthy();
            expect(contract?.states.error).toBeTruthy();
            expect(contract?.states.empty).toBeTruthy();
            expect(contract?.states.ready).toBeTruthy();
        });
    });
});
