/**
 * @module @enterstellar-ai/migration/__tests__/server-extract-types
 * @description Tests for the Server-Side Extraction HTTP types and
 * Zod validation schema (Correction 4).
 *
 * Validates:
 * 1. `ServerExtractRequestSchema` — Zod schema for HTTP request body.
 *    Tests all acceptance and rejection cases for the `source` and
 *    `filename` fields.
 * 2. `ServerExtractResponse` — type-level test confirming structural
 *    identity with `ExtractResult`.
 *
 * @see Correction 4 — Server-Side Extraction (migration-04-server-extract.md)
 * @see Design Choice T7 — Zod schemas for public serialized types
 */

import { describe, it, expect } from 'vitest';

import type {
    ExtractResult,
    ServerExtractResponse,
} from '../src/types.js';

import { ServerExtractRequestSchema } from '../src/types.js';

// ---------------------------------------------------------------------------
// ServerExtractRequestSchema — Zod Validation Tests
// ---------------------------------------------------------------------------

describe('ServerExtractRequestSchema', () => {
    it('accepts a minimal valid request (source only)', () => {
        const result = ServerExtractRequestSchema.safeParse({
            source: 'const x = 1;',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.source).toBe('const x = 1;');
            // filename is omitted — extractManifest() will default to 'component.tsx'
            expect(result.data.filename).toBeUndefined();
        }
    });

    it('accepts a request with both source and filename', () => {
        const result = ServerExtractRequestSchema.safeParse({
            source: 'export function Button(props: { label: string }) { return null; }',
            filename: 'Button.tsx',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.source).toBe(
                'export function Button(props: { label: string }) { return null; }',
            );
            expect(result.data.filename).toBe('Button.tsx');
        }
    });

    it('rejects an empty source string (min(1) guard)', () => {
        const result = ServerExtractRequestSchema.safeParse({
            source: '',
        });

        expect(result.success).toBe(false);
    });

    it('rejects a missing source field', () => {
        const result = ServerExtractRequestSchema.safeParse({});

        expect(result.success).toBe(false);
    });

    it('rejects a non-string source value', () => {
        const result = ServerExtractRequestSchema.safeParse({
            source: 123,
        });

        expect(result.success).toBe(false);
    });

    it('rejects a non-string filename value', () => {
        const result = ServerExtractRequestSchema.safeParse({
            source: 'const x = 1;',
            filename: 42,
        });

        expect(result.success).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ServerExtractResponse — Type-Level Test
// ---------------------------------------------------------------------------

describe('ServerExtractResponse', () => {
    it('is structurally identical to ExtractResult', () => {
        // This test verifies at compile time that ServerExtractResponse
        // is assignable to/from ExtractResult. If the types diverge,
        // TypeScript will produce a compilation error on these assignments.
        //
        // At runtime, we verify the assignment direction is correct by
        // constructing a minimal ExtractResult and assigning it.
        const extractResult: ExtractResult = {
            manifest: {
                name: 'TestComponent',
                props: {} as ExtractResult['manifest']['props'],
                defaultProps: {},
                generics: [],
                existingZodSchemas: [],
                eventHandlers: [],
                description: { value: 'Test', source: 'heuristic-fallback' },
                tags: { value: [], source: 'heuristic-fallback' },
                category: { value: 'utility', source: 'heuristic-fallback' },
                intent: { value: 'Render TestComponent', source: 'heuristic-fallback' },
                ariaAttributes: { value: {}, source: 'heuristic-fallback' },
                designTokenRefs: { value: [], source: 'heuristic-fallback' },
                lifecycleStates: { value: [], source: 'heuristic-fallback' },
            },
            diagnostics: [],
        };

        // Bidirectional assignment — both directions must compile.
        const asResponse: ServerExtractResponse = extractResult;
        const asExtract: ExtractResult = asResponse;

        expect(asResponse).toBe(extractResult);
        expect(asExtract).toBe(extractResult);
    });
});
