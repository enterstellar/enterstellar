/**
 * @module @enterstellar-ai/compiler/__tests__/nesting
 * @description Unit tests for the max nesting depth validator.
 *
 * Verifies correct depth counting for flat props, nested intent-like
 * structures, arrays of intents, and the depth limit enforcement.
 */

import { describe, it, expect } from 'vitest';

import { validateNestingDepth } from '../src/nesting.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateNestingDepth', () => {
    describe('flat props', () => {
        it('returns valid for props with no nested intents', () => {
            const props = { riskLevel: 3, patientId: 'p-123' };
            const result = validateNestingDepth(props, 10);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(1);
            expect(result.error).toBeUndefined();
        });

        it('returns valid for empty props', () => {
            const result = validateNestingDepth({}, 10);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(1);
        });
    });

    describe('nested intent-like structures', () => {
        it('counts single-level nesting correctly', () => {
            const props = {
                header: {
                    component: 'Header',
                    props: { title: 'Test' },
                },
            };
            const result = validateNestingDepth(props, 10);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(2);
        });

        it('counts deep nesting correctly', () => {
            const props = {
                child: {
                    component: 'Level2',
                    props: {
                        child: {
                            component: 'Level3',
                            props: {
                                child: {
                                    component: 'Level4',
                                    props: { text: 'deep' },
                                },
                            },
                        },
                    },
                },
            };
            const result = validateNestingDepth(props, 10);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(4);
        });

        it('rejects nesting exceeding the limit', () => {
            // Build a 5-level deep tree
            const props = {
                child: {
                    component: 'L2',
                    props: {
                        child: {
                            component: 'L3',
                            props: {
                                child: {
                                    component: 'L4',
                                    props: { text: 'deep' },
                                },
                            },
                        },
                    },
                },
            };
            const result = validateNestingDepth(props, 3);
            expect(result.valid).toBe(false);
            expect(result.maxDepthFound).toBe(4);
            expect(result.error).toBeDefined();
            expect(result.error?.code).toBe('ENS-2010');
        });
    });

    describe('arrays of intents', () => {
        it('traverses array elements for nested intents', () => {
            const props = {
                children: [
                    { component: 'Card', props: { title: 'A' } },
                    { component: 'Card', props: { title: 'B' } },
                ],
            };
            const result = validateNestingDepth(props, 10);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(2);
        });

        it('finds deepest branch in array', () => {
            const props = {
                children: [
                    { component: 'Card', props: { title: 'shallow' } },
                    {
                        component: 'Container',
                        props: {
                            child: { component: 'Deep', props: { x: 1 } },
                        },
                    },
                ],
            };
            const result = validateNestingDepth(props, 10);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(3);
        });
    });

    describe('non-intent objects', () => {
        it('ignores plain objects without component/props shape', () => {
            const props = {
                config: { theme: 'dark', locale: 'en' },
                data: { values: [1, 2, 3] },
            };
            const result = validateNestingDepth(props, 10);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(1);
        });
    });

    describe('boundary values', () => {
        it('passes at exactly the max depth', () => {
            const props = {
                child: {
                    component: 'L2',
                    props: {
                        child: { component: 'L3', props: { x: 1 } },
                    },
                },
            };
            const result = validateNestingDepth(props, 3);
            expect(result.valid).toBe(true);
            expect(result.maxDepthFound).toBe(3);
        });

        it('fails at max depth + 1', () => {
            const props = {
                child: {
                    component: 'L2',
                    props: {
                        child: {
                            component: 'L3',
                            props: {
                                child: { component: 'L4', props: {} },
                            },
                        },
                    },
                },
            };
            const result = validateNestingDepth(props, 3);
            expect(result.valid).toBe(false);
            expect(result.maxDepthFound).toBe(4);
        });
    });
});
