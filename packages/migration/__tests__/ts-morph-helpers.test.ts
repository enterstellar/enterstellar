/**
 * @module @enterstellar-ai/migration/__tests__/ts-morph-helpers
 * @description Unit tests for the ts-morph AST traversal helpers.
 *
 * Uses in-memory `ts-morph` `Project` instances with fixture source
 * strings — no filesystem, no mocking.
 */

import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';

import {
    findComponentExport,
    extractGenerics,
    extractDefaultProps,
    detectExistingZodSchemas,
    detectEventHandlers,
    extractJsDoc,
    detectAriaAttributes,
    detectDesignTokenRefs,
    detectLifecycleStates,
} from '../src/extract/ts-morph-helpers.js';

/** Helper: create a SourceFile from fixture source string. */
function createSourceFile(source: string, filename = 'Component.tsx') {
    const project = new Project({ useInMemoryFileSystem: true });
    return project.createSourceFile(filename, source);
}

// ---------------------------------------------------------------------------
// findComponentExport
// ---------------------------------------------------------------------------

describe('findComponentExport', () => {
    it('finds a named function component export', () => {
        const sf = createSourceFile(`
            export function Button(props: { label: string }) {
                return <button>{props.label}</button>;
            }
        `);
        const result = findComponentExport(sf);
        expect(result).toBeDefined();
        expect(result?.name).toBe('Button');
        expect(result?.propsType).toBeDefined();
    });

    it('finds a default function component export', () => {
        const sf = createSourceFile(`
            export default function Card(props: { title: string }) {
                return <div>{props.title}</div>;
            }
        `);
        const result = findComponentExport(sf);
        expect(result).toBeDefined();
        expect(result?.name).toBe('Card');
    });

    it('finds an arrow function component export', () => {
        const sf = createSourceFile(`
            export const Chip = (props: { text: string }) => <span>{props.text}</span>;
        `);
        const result = findComponentExport(sf);
        expect(result).toBeDefined();
        expect(result?.name).toBe('Chip');
    });

    it('detects forwardRef wrapper', () => {
        const sf = createSourceFile(`
            import { forwardRef } from 'react';
            type Props = { label: string };
            export const Input = forwardRef<HTMLInputElement, Props>((props, ref) => {
                return <input ref={ref} />;
            });
        `);
        const result = findComponentExport(sf);
        expect(result).toBeDefined();
        expect(result?.name).toBe('Input');
    });

    it('detects memo wrapper', () => {
        const sf = createSourceFile(`
            import { memo } from 'react';
            export const Badge = memo(function Badge(props: { count: number }) {
                return <span>{props.count}</span>;
            });
        `);
        const result = findComponentExport(sf);
        expect(result).toBeDefined();
        expect(result?.name).toBe('Badge');
    });

    it('returns undefined for re-exports (SKIP)', () => {
        const sf = createSourceFile(`
            export { Button } from './Button';
        `);
        const result = findComponentExport(sf);
        expect(result).toBeUndefined();
    });

    it('returns undefined for non-PascalCase exports (SKIP)', () => {
        const sf = createSourceFile(`
            export function formatDate(date: Date): string {
                return date.toISOString();
            }
        `);
        const result = findComponentExport(sf);
        expect(result).toBeUndefined();
    });

    it('handles zero-props component', () => {
        const sf = createSourceFile(`
            export function Spacer() {
                return <div style={{ height: 16 }} />;
            }
        `);
        const result = findComponentExport(sf);
        expect(result).toBeDefined();
        expect(result?.name).toBe('Spacer');
        expect(result?.propsType).toBeUndefined();
    });

    it('prefers default export over named exports', () => {
        const sf = createSourceFile(`
            export function Helper(props: { x: number }) { return <div />; }
            export default function Main(props: { y: number }) { return <div />; }
        `);
        const result = findComponentExport(sf);
        expect(result?.name).toBe('Main');
    });

    it('returns undefined for empty file (SKIP)', () => {
        const sf = createSourceFile('');
        const result = findComponentExport(sf);
        expect(result).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// extractDefaultProps
// ---------------------------------------------------------------------------

describe('extractDefaultProps', () => {
    it('extracts destructured literal defaults', () => {
        const sf = createSourceFile(`
            type Props = { size: string; disabled: boolean; count: number };
            export function Button({ size = 'md', disabled = false, count = 0 }: Props) {
                return <button />;
            }
        `);
        const defaults = extractDefaultProps(sf, 'Button');
        expect(defaults).toEqual({ size: 'md', disabled: false, count: 0 });
    });

    it('extracts .defaultProps assignment', () => {
        const sf = createSourceFile(`
            export function Card(props: { variant: string }) { return <div />; }
            Card.defaultProps = { variant: 'outlined' };
        `);
        const defaults = extractDefaultProps(sf, 'Card');
        expect(defaults).toEqual({ variant: 'outlined' });
    });

    it('returns empty object for no defaults', () => {
        const sf = createSourceFile(`
            export function Tag(props: { label: string }) { return <span />; }
        `);
        const defaults = extractDefaultProps(sf, 'Tag');
        expect(defaults).toEqual({});
    });

    it('skips computed defaults', () => {
        const sf = createSourceFile(`
            const getSize = () => 'md';
            export function Chip({ size = getSize() }: { size: string }) { return <span />; }
        `);
        const defaults = extractDefaultProps(sf, 'Chip');
        expect(defaults).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// extractGenerics
// ---------------------------------------------------------------------------

describe('extractGenerics', () => {
    it('extracts generic params with constraints', () => {
        const sf = createSourceFile(`
            export function List<T extends Record<string, unknown>>(props: { items: T[] }) { return <ul />; }
        `);
        const fn = sf.getFunction('List');
        expect(fn).toBeDefined();
        const generics = extractGenerics(fn!);
        expect(generics).toHaveLength(1);
        expect(generics[0]?.name).toBe('T');
        expect(generics[0]?.constraint).toBe('Record<string, unknown>');
    });

    it('extracts generic params without constraints', () => {
        const sf = createSourceFile(`
            export function Container<T>(props: { data: T }) { return <div />; }
        `);
        const fn = sf.getFunction('Container');
        const generics = extractGenerics(fn!);
        expect(generics).toHaveLength(1);
        expect(generics[0]?.name).toBe('T');
        expect(generics[0]).not.toHaveProperty('constraint');
    });

    it('returns empty array for non-generic function', () => {
        const sf = createSourceFile(`
            export function Button(props: { label: string }) { return <button />; }
        `);
        const fn = sf.getFunction('Button');
        const generics = extractGenerics(fn!);
        expect(generics).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// detectExistingZodSchemas
// ---------------------------------------------------------------------------

describe('detectExistingZodSchemas', () => {
    it('detects z.object() schema variables', () => {
        const sf = createSourceFile(`
            import { z } from 'zod';
            const UserSchema = z.object({ name: z.string() });
            const AddressSchema = z.object({ city: z.string() });
        `);
        const schemas = detectExistingZodSchemas(sf);
        expect(schemas).toEqual(['UserSchema', 'AddressSchema']);
    });

    it('returns empty for no zod import', () => {
        const sf = createSourceFile(`
            const schema = { name: 'test' };
        `);
        expect(detectExistingZodSchemas(sf)).toEqual([]);
    });

    it('returns empty for zod import but no schema usage', () => {
        const sf = createSourceFile(`
            import { z } from 'zod';
            const x = 42;
        `);
        expect(detectExistingZodSchemas(sf)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// detectEventHandlers
// ---------------------------------------------------------------------------

describe('detectEventHandlers', () => {
    it('detects onClick and onSubmit handlers', () => {
        const sf = createSourceFile(`
            export function Form() {
                return (
                    <form onSubmit={() => {}}>
                        <button onClick={() => {}}>Submit</button>
                    </form>
                );
            }
        `);
        const events = detectEventHandlers(sf);
        expect(events).toContain('click');
        expect(events).toContain('submit');
    });

    it('deduplicates event handlers', () => {
        const sf = createSourceFile(`
            export function Buttons() {
                return (
                    <div>
                        <button onClick={() => {}}>A</button>
                        <button onClick={() => {}}>B</button>
                    </div>
                );
            }
        `);
        const events = detectEventHandlers(sf);
        const clickCount = events.filter((e) => e === 'click').length;
        expect(clickCount).toBe(1);
    });

    it('returns empty for no event handlers', () => {
        const sf = createSourceFile(`
            export function Static() { return <div>Hello</div>; }
        `);
        expect(detectEventHandlers(sf)).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// extractJsDoc
// ---------------------------------------------------------------------------

describe('extractJsDoc', () => {
    it('extracts @description tag', () => {
        const sf = createSourceFile(`
            /** @description A primary action button. */
            export function Button() { return <button />; }
        `);
        const jsDoc = extractJsDoc(sf, 'Button');
        expect(jsDoc.description).toBe('A primary action button.');
    });

    it('extracts first paragraph as description when no @description tag', () => {
        const sf = createSourceFile(`
            /** A simple card component. */
            export function Card() { return <div />; }
        `);
        const jsDoc = extractJsDoc(sf, 'Card');
        expect(jsDoc.description).toBe('A simple card component.');
    });

    it('extracts @deprecated tag', () => {
        const sf = createSourceFile(`
            /** @deprecated Use NewButton instead. */
            export function OldButton() { return <button />; }
        `);
        const jsDoc = extractJsDoc(sf, 'OldButton');
        expect(jsDoc.deprecated).toBe('Use NewButton instead.');
    });

    it('extracts @tags annotation', () => {
        const sf = createSourceFile(`
            /** @tags ui, interactive, primary */
            export function Button() { return <button />; }
        `);
        const jsDoc = extractJsDoc(sf, 'Button');
        expect(jsDoc.tags).toEqual(['ui', 'interactive', 'primary']);
    });

    it('returns all undefined for no JSDoc', () => {
        const sf = createSourceFile(`
            export function Bare() { return <div />; }
        `);
        const jsDoc = extractJsDoc(sf, 'Bare');
        expect(jsDoc.description).toBeUndefined();
        expect(jsDoc.tags).toBeUndefined();
        expect(jsDoc.deprecated).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// detectAriaAttributes
// ---------------------------------------------------------------------------

describe('detectAriaAttributes', () => {
    it('detects role and aria-* attributes', () => {
        const sf = createSourceFile(`
            export function Nav() {
                return <nav role="navigation" aria-label="Main navigation"><a href="/">Home</a></nav>;
            }
        `);
        const { attrs, firstLine } = detectAriaAttributes(sf);
        expect(attrs).toHaveProperty('role', 'navigation');
        expect(attrs).toHaveProperty('aria-label', 'Main navigation');
        expect(firstLine).toBeGreaterThan(0);
    });

    it('returns empty for no ARIA attributes', () => {
        const sf = createSourceFile(`
            export function Div() { return <div>Hello</div>; }
        `);
        const { attrs, firstLine } = detectAriaAttributes(sf);
        expect(attrs).toEqual({});
        expect(firstLine).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// detectDesignTokenRefs
// ---------------------------------------------------------------------------

describe('detectDesignTokenRefs', () => {
    it('detects var(--*) and --enterstellar-* patterns', () => {
        const sf = createSourceFile(`
            export function Themed() {
                return <div style={{ color: 'var(--enterstellar-primary)', padding: 'var(--spacing-md)' }} />;
            }
        `);
        const { tokens, firstLine } = detectDesignTokenRefs(sf);
        expect(tokens).toContain('var(--enterstellar-primary)');
        expect(tokens).toContain('var(--spacing-md)');
        expect(firstLine).toBeGreaterThan(0);
    });

    it('returns empty for no token refs', () => {
        const sf = createSourceFile(`
            export function Plain() { return <div style={{ color: 'red' }} />; }
        `);
        const { tokens, firstLine } = detectDesignTokenRefs(sf);
        expect(tokens).toEqual([]);
        expect(firstLine).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// detectLifecycleStates
// ---------------------------------------------------------------------------

describe('detectLifecycleStates', () => {
    it('detects loading and error states in if conditions', () => {
        const sf = createSourceFile(`
            export function DataView({ loading, error }: { loading: boolean; error: boolean }) {
                if (loading) return <div>Loading...</div>;
                if (error) return <div>Error!</div>;
                return <div>Data</div>;
            }
        `);
        const { states, firstLine } = detectLifecycleStates(sf);
        expect(states).toContain('loading');
        expect(states).toContain('error');
        expect(firstLine).toBeGreaterThan(0);
    });

    it('detects isLoading pattern in if condition', () => {
        const sf = createSourceFile(`
            export function View({ isLoading }: { isLoading: boolean }) {
                if (isLoading) return <span>Wait...</span>;
                return <span>Done</span>;
            }
        `);
        expect(detectLifecycleStates(sf).states).toContain('loading');
    });

    it('detects empty state via isEmpty in if condition', () => {
        const sf = createSourceFile(`
            export function List({ isEmpty }: { isEmpty: boolean }) {
                if (isEmpty) return <div>No items</div>;
                return <ul />;
            }
        `);
        expect(detectLifecycleStates(sf).states).toContain('empty');
    });

    it('detects loading in ternary expression', () => {
        const sf = createSourceFile(`
            export function View({ loading }: { loading: boolean }) {
                return loading ? <span>Wait...</span> : <span>Done</span>;
            }
        `);
        expect(detectLifecycleStates(sf).states).toContain('loading');
    });

    it('detects loading in && short-circuit', () => {
        const sf = createSourceFile(`
            export function View({ loading }: { loading: boolean }) {
                return <div>{loading && <span>Loading...</span>}</div>;
            }
        `);
        expect(detectLifecycleStates(sf).states).toContain('loading');
    });

    it('does NOT false-positive on loading variable outside conditionals (M2 regression)', () => {
        const sf = createSourceFile(`
            export function Helper() {
                const loading = fetchData();
                console.log(loading);
                return <div>No conditional rendering here</div>;
            }
        `);
        expect(detectLifecycleStates(sf).states).toEqual([]);
    });

    it('does NOT false-positive on error in type annotations', () => {
        const sf = createSourceFile(`
            type Props = { error: string };
            export function Display(props: Props) {
                return <div>{props.error}</div>;
            }
        `);
        expect(detectLifecycleStates(sf).states).toEqual([]);
    });

    it('returns empty for no lifecycle patterns', () => {
        const sf = createSourceFile(`
            export function Static() { return <div>Hello</div>; }
        `);
        expect(detectLifecycleStates(sf).states).toEqual([]);
    });
});

