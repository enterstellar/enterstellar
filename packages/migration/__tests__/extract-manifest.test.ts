/**
 * @module @enterstellar-ai/migration/__tests__/extract-manifest
 * @description Integration tests for the Phase 1 orchestrator.
 *
 * Tests the full `extractManifest()` pipeline end-to-end using fixture
 * component source strings. Verifies all 13 manifest fields, provenance
 * tagging, SKIP cases, and diagnostic emission.
 */

import { describe, it, expect } from 'vitest';

import { extractManifest } from '../src/extract/extract-manifest.js';
import { Project } from 'ts-morph';

// ---------------------------------------------------------------------------
// Basic Extraction
// ---------------------------------------------------------------------------

describe('extractManifest — basic extraction', () => {
    it('extracts a simple named function component', () => {
        const source = `
            export function Button(props: { label: string; disabled?: boolean }) {
                return <button disabled={props.disabled}>{props.label}</button>;
            }
        `;
        const result = extractManifest(source, 'components/Button.tsx');

        expect(result.manifest.name).toBe('Button');
        expect(result.manifest.defaultProps).toEqual({});
        expect(result.manifest.generics).toEqual([]);
        expect(result.manifest.existingZodSchemas).toEqual([]);
    });

    it('extracts a component with destructured defaults', () => {
        const source = `
            type Props = { size: string; count: number };
            export function Chip({ size = 'md', count = 0 }: Props) {
                return <span>{size} {count}</span>;
            }
        `;
        const result = extractManifest(source, 'Chip.tsx');

        expect(result.manifest.name).toBe('Chip');
        expect(result.manifest.defaultProps).toEqual({ size: 'md', count: 0 });
    });

    it('extracts a zero-props component', () => {
        const source = `
            export function Spacer() {
                return <div style={{ height: 16 }} />;
            }
        `;
        const result = extractManifest(source, 'Spacer.tsx');

        expect(result.manifest.name).toBe('Spacer');
        // Zero-props → z.object({}) — validates empty objects
        expect(result.manifest.props.parse({})).toEqual({});
    });

    it('extracts a default export component', () => {
        const source = `
            export default function Card(props: { title: string }) {
                return <div>{props.title}</div>;
            }
        `;
        const result = extractManifest(source, 'Card.tsx');
        expect(result.manifest.name).toBe('Card');
    });
});

// ---------------------------------------------------------------------------
// SKIP Cases
// ---------------------------------------------------------------------------

describe('extractManifest — SKIP cases', () => {
    it('throws for file with no exports', () => {
        const source = `function helper() { return 42; }`;
        expect(() => extractManifest(source, 'helper.ts')).toThrow('SKIP');
    });

    it('throws for non-component exports', () => {
        const source = `export function formatDate(date: Date): string { return date.toISOString(); }`;
        expect(() => extractManifest(source, 'utils.ts')).toThrow('SKIP');
    });

    it('throws for empty source', () => {
        expect(() => extractManifest('', 'empty.tsx')).toThrow('SKIP');
    });
});

// ---------------------------------------------------------------------------
// Provenance Tagging (Correction 2)
// ---------------------------------------------------------------------------

describe('extractManifest — provenance tagging', () => {
    it('tags description as ast-determined when JSDoc exists', () => {
        const source = `
            /** A primary action button. */
            export function Button() { return <button />; }
        `;
        const result = extractManifest(source, 'Button.tsx');

        expect(result.manifest.description.source).toBe('ast-determined');
        expect(result.manifest.description.value).toBe('A primary action button.');
        expect(result.manifest.description.sourceLocation).toBeDefined();
    });

    it('tags description as heuristic-fallback when no JSDoc', () => {
        const source = `export function Bare() { return <div />; }`;
        const result = extractManifest(source, 'Bare.tsx');

        expect(result.manifest.description.source).toBe('heuristic-fallback');
        expect(result.manifest.description.value).toBe('TODO: Add description');
    });

    it('intent is ALWAYS heuristic-fallback', () => {
        const source = `
            /** @description Well documented */
            export function Button() { return <button />; }
        `;
        const result = extractManifest(source, 'Button.tsx');

        expect(result.manifest.intent.source).toBe('heuristic-fallback');
        expect(result.manifest.intent.value).toBe('Render Button');
    });

    it('tags category as ast-determined for known path', () => {
        const source = `export function Toast() { return <div />; }`;
        const result = extractManifest(source, 'src/feedback/Toast.tsx');

        expect(result.manifest.category.source).toBe('ast-determined');
        expect(result.manifest.category.value).toBe('feedback');
    });

    it('tags category as heuristic-fallback for generic path', () => {
        const source = `export function Widget() { return <div />; }`;
        const result = extractManifest(source, 'src/components/Widget.tsx');

        expect(result.manifest.category.source).toBe('heuristic-fallback');
        expect(result.manifest.category.value).toBe('utility');
    });

    it('tags tags as heuristic-fallback when no @tags JSDoc', () => {
        const source = `export function Tag() { return <span />; }`;
        const result = extractManifest(source, 'Tag.tsx');

        expect(result.manifest.tags.source).toBe('heuristic-fallback');
        expect(result.manifest.tags.value).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Enrichable Field Detection
// ---------------------------------------------------------------------------

describe('extractManifest — enrichable field detection', () => {
    it('detects ARIA attributes as ast-determined', () => {
        const source = `
            export function Nav() {
                return <nav role="navigation" aria-label="Main"><a href="/">Home</a></nav>;
            }
        `;
        const result = extractManifest(source, 'Nav.tsx');

        expect(result.manifest.ariaAttributes.source).toBe('ast-determined');
        expect(result.manifest.ariaAttributes.value).toHaveProperty('role', 'navigation');
    });

    it('detects design tokens as ast-determined', () => {
        const source = `
            export function Themed() {
                return <div style={{ color: 'var(--enterstellar-primary)' }} />;
            }
        `;
        const result = extractManifest(source, 'Themed.tsx');

        expect(result.manifest.designTokenRefs.source).toBe('ast-determined');
        expect(result.manifest.designTokenRefs.value).toContain('var(--enterstellar-primary)');
    });

    it('detects lifecycle states as ast-determined', () => {
        const source = `
            export function DataView({ loading }: { loading: boolean }) {
                if (loading) return <div>Loading...</div>;
                return <div>Data</div>;
            }
        `;
        const result = extractManifest(source, 'DataView.tsx');

        expect(result.manifest.lifecycleStates.source).toBe('ast-determined');
        expect(result.manifest.lifecycleStates.value).toContain('loading');
    });

    it('uses heuristic-fallback for absent enrichable fields', () => {
        const source = `export function Plain() { return <div>Hello</div>; }`;
        const result = extractManifest(source, 'Plain.tsx');

        expect(result.manifest.ariaAttributes.source).toBe('heuristic-fallback');
        expect(result.manifest.designTokenRefs.source).toBe('heuristic-fallback');
        expect(result.manifest.lifecycleStates.source).toBe('heuristic-fallback');
    });
});

// ---------------------------------------------------------------------------
// Structural Fields
// ---------------------------------------------------------------------------

describe('extractManifest — structural fields', () => {
    it('detects event handlers', () => {
        const source = `
            export function Form() {
                return <form onSubmit={() => {}}><button onClick={() => {}}>Go</button></form>;
            }
        `;
        const result = extractManifest(source, 'Form.tsx');

        expect(result.manifest.eventHandlers).toContain('click');
        expect(result.manifest.eventHandlers).toContain('submit');
    });

    it('detects existing Zod schemas', () => {
        const source = `
            import { z } from 'zod';
            const UserSchema = z.object({ name: z.string() });
            export function UserCard(props: { name: string }) { return <div>{props.name}</div>; }
        `;
        const result = extractManifest(source, 'UserCard.tsx');

        expect(result.manifest.existingZodSchemas).toContain('UserSchema');
    });
});

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

describe('extractManifest — diagnostics', () => {
    it('emits info diagnostic for generic components', () => {
        const source = `
            export function List<T>(props: { items: T[] }) {
                return <ul>{props.items.map(() => <li />)}</ul>;
            }
        `;
        const result = extractManifest(source, 'List.tsx');

        expect(result.manifest.generics).toHaveLength(1);
        const genericDiag = result.diagnostics.find(
            (d) => d.level === 'info' && d.message.includes('generic type parameter'),
        );
        expect(genericDiag).toBeDefined();
    });

    it('emits info diagnostic for existing Zod schemas', () => {
        const source = `
            import { z } from 'zod';
            const Schema = z.object({ x: z.number() });
            export function Widget(props: { x: number }) { return <div />; }
        `;
        const result = extractManifest(source, 'Widget.tsx');

        const schemaDiag = result.diagnostics.find(
            (d) => d.message.includes('Existing Zod schemas'),
        );
        expect(schemaDiag).toBeDefined();
    });

    it('returns empty diagnostics for clean extraction', () => {
        const source = `export function Simple() { return <div />; }`;
        const result = extractManifest(source, 'Simple.tsx');

        expect(result.diagnostics).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Project Reuse (CLI Batch Mode)
// ---------------------------------------------------------------------------

describe('extractManifest — project reuse', () => {
    it('accepts an external Project for batch reuse', () => {
        const sharedProject = new Project({ useInMemoryFileSystem: true });

        const r1 = extractManifest(
            `export function A() { return <div />; }`,
            'A.tsx',
            sharedProject,
        );
        const r2 = extractManifest(
            `export function B() { return <span />; }`,
            'B.tsx',
            sharedProject,
        );

        expect(r1.manifest.name).toBe('A');
        expect(r2.manifest.name).toBe('B');
    });

    it('creates internal project when none provided (server mode)', () => {
        // No project arg — should work without throwing
        const result = extractManifest(
            `export function Solo() { return <div />; }`,
            'Solo.tsx',
        );
        expect(result.manifest.name).toBe('Solo');
    });
});
