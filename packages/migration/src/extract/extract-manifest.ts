/**
 * @module @enterstellar-ai/migration/extract/extract-manifest
 * @description Phase 1 entry point — extracts a `StructuralManifest` from
 * a single component source string using `ts-morph` AST analysis.
 *
 * This is THE shared function mandated by Correction 4: importable by both
 * `@enterstellar-ai/cli` (local `enterstellar migrate`) and `@enterstellar-ai/cloud` (server endpoint
 * at `POST /api/v1/migrate/extract`).
 *
 * **Critical design decision (Correction 4, L145-146):**
 * `extractManifest()` takes a `source: string`, NOT a file path. The CLI
 * reads the file from disk and passes the string. The server receives the
 * string from the HTTP body. The function itself never touches the
 * filesystem — it creates an in-memory `ts-morph` `Project` with a
 * virtual source file.
 *
 * **Pipeline:**
 * 1. Create (or reuse) a `ts-morph` `Project` with an in-memory source file.
 * 2. Locate the component export (named or default with type annotation).
 * 3. Extract structural fields: `name`, `props`, `defaultProps`, `generics`,
 *    `existingZodSchemas`, `eventHandlers`.
 * 4. Extract enrichable fields: `description`, `tags`, `category`, `intent`,
 *    `ariaAttributes`, `designTokenRefs`, `lifecycleStates`.
 * 5. Apply deterministic decision rules for `ManifestFieldSource` assignment
 *    (AST-determined vs. heuristic-fallback).
 * 6. Return `ExtractResult` with the manifest and any diagnostics.
 *
 * **SKIP cases:** If no component export is found, no props interface exists,
 * or the file has syntax errors, the function throws indicating a SKIP outcome.
 *
 * **Synchronous:** All `ts-morph` operations are synchronous. This function
 * does not return a `Promise` — it returns `ExtractResult` directly.
 *
 * **L15 compliance:** Zero framework imports. Uses `ts-morph` for AST only.
 *
 * @see Correction 2 — Binary Source Model (StructuralManifest)
 * @see Correction 4 — Server-Side Extraction
 */

import { Project } from 'ts-morph';
import { z } from 'zod';

import type {
    EnrichableField,
    ExtractDiagnostic,
    ExtractResult,
    StructuralManifest,
} from '../types.js';

import {
    inferCategory,
    generateHeuristicIntent,
    generateHeuristicDescription,
} from './heuristics.js';

import {
    findComponentExport,
    extractDefaultProps,
    detectExistingZodSchemas,
    detectEventHandlers,
    extractJsDoc,
    detectAriaAttributes,
    detectDesignTokenRefs,
    detectLifecycleStates,
} from './ts-morph-helpers.js';

import { typeToZodSchema } from './zod-inference.js';

// ---------------------------------------------------------------------------
// Project Factory (for CLI batch reuse)
// ---------------------------------------------------------------------------

/**
 * Creates a `ts-morph` `Project` configured for in-memory extraction.
 *
 * Exported so the CLI can create ONE shared project for batch performance
 * without directly depending on `ts-morph`. The CLI dynamically imports
 * this factory alongside `extractManifest()`:
 *
 * ```ts
 * const { extractManifest, createExtractionProject } = await import('@enterstellar-ai/migration');
 * const project = createExtractionProject();
 * for (const file of files) {
 *     extractManifest(source, filename, project);
 * }
 * ```
 *
 * **Why a factory?** `ts-morph` (~2MB) lives in `@enterstellar-ai/migration`'s
 * dependency tree. If the CLI imported `Project` directly, `ts-morph`
 * would be in the CLI's dependency tree too — increasing install size
 * for ALL CLI commands (`enterstellar init`, `enterstellar add`), not just `enterstellar migrate`.
 *
 * @returns A new `ts-morph` `Project` with `useInMemoryFileSystem: true`.
 *
 * @see Mid-Session Decision #7 — ts-morph out of CLI cold-start path
 */
export function createExtractionProject(): Project {
    return new Project({ useInMemoryFileSystem: true });
}

// ---------------------------------------------------------------------------
// Phase 1 Entry Point
// ---------------------------------------------------------------------------

/**
 * Extracts a `StructuralManifest` from a component source string.
 *
 * This function performs a full AST analysis of the given source code
 * using `ts-morph`. It extracts all structural and enrichable fields,
 * applying deterministic decision rules for source provenance tagging.
 *
 * **Correction 4 compliance:** Accepts source CODE as a string, not a
 * file path. This enables code sharing between CLI (reads file from disk,
 * passes string) and Cloud (receives string from HTTP body).
 *
 * @param source - The component source code as a string.
 * @param filename - Optional filename for diagnostics and file extension
 *   detection. Defaults to `'component.tsx'` when omitted.
 * @param project - Optional `ts-morph` `Project` instance for batch reuse.
 *   When omitted, an in-memory project is created internally. CLI callers
 *   SHOULD pass a shared project for batch performance. Server callers
 *   SHOULD omit this (each request is independent).
 * @returns An `ExtractResult` containing the `StructuralManifest` and
 *   extraction diagnostics.
 * @throws {Error} If the source cannot be parsed (syntax error) or does
 *   not contain a recognizable component export (SKIP case).
 *
 * @example
 * ```ts
 * import { extractManifest } from '@enterstellar-ai/migration';
 *
 * // Server usage (Correction 4 — source string from HTTP body):
 * const result = extractManifest(sourceCode, 'Button.tsx');
 * console.log(result.manifest.name); // 'Button'
 *
 * // CLI batch usage (reuse project for performance):
 * import { Project } from 'ts-morph';
 * const project = new Project({ useInMemoryFileSystem: true });
 * for (const file of files) {
 *     const source = fs.readFileSync(file, 'utf-8');
 *     const result = extractManifest(source, file, project);
 * }
 * ```
 *
 * @see Correction 4 — shared between CLI and Cloud
 */
export function extractManifest(
    source: string,
    filename?: string,
    project?: Project,
): ExtractResult {
    const resolvedFilename = filename ?? 'component.tsx';
    const diagnostics: ExtractDiagnostic[] = [];

    // --- Step 1: Resolve project and create in-memory source file ---
    const resolvedProject = project ?? new Project({ useInMemoryFileSystem: true });
    const sourceFile = resolvedProject.createSourceFile(
        resolvedFilename,
        source,
        { overwrite: true },
    );

    // --- Step 2: Find component export (SKIP if not found) ---
    const componentExport = findComponentExport(sourceFile);
    if (componentExport === undefined) {
        throw new Error(
            `SKIP: No component export found in "${resolvedFilename}". ` +
            'File must export a PascalCase function component (named or default).',
        );
    }

    const { name, propsType, generics } = componentExport;

    // --- Step 3: Extract structural fields ---

    // 3a. Props → Zod schema
    const props: z.ZodType = propsType !== undefined
        ? typeToZodSchema(propsType, diagnostics)
        : z.object({});

    // 3b. Default props
    const defaultProps = extractDefaultProps(sourceFile, name);

    // 3c. Existing Zod schemas (variable names — E2 fix)
    const existingZodSchemas = detectExistingZodSchemas(sourceFile);

    // 3d. Event handlers
    const eventHandlers = detectEventHandlers(sourceFile);

    // --- Step 4: Extract enrichable fields ---

    // 4a. JSDoc → description, tags, deprecated
    const jsDoc = extractJsDoc(sourceFile, name);

    // 4b. ARIA attributes
    const ariaResult = detectAriaAttributes(sourceFile);
    const hasAriaAttrs = Object.keys(ariaResult.attrs).length > 0;

    // 4c. Design token references
    const tokenResult = detectDesignTokenRefs(sourceFile);

    // 4d. Lifecycle states
    const lifecycleResult = detectLifecycleStates(sourceFile);

    // 4e. Category (from filename path)
    const inferredCategory = inferCategory(resolvedFilename);
    // 'utility' is the default fallback — only non-default matches are ast-determined
    const categoryIsAstDetermined = inferredCategory !== 'utility'
        || resolvedFilename.toLowerCase().includes('utility');

    // --- Step 5: Apply Correction 2 provenance decision rules ---
    // M1 fix: use actual AST node line numbers instead of hardcoded line: 1

    const description: EnrichableField<string> = jsDoc.description !== undefined
        ? {
            value: jsDoc.description,
            source: 'ast-determined',
            sourceLocation: { file: resolvedFilename, line: jsDoc.line ?? 1 },
        }
        : {
            value: generateHeuristicDescription(name, jsDoc.deprecated),
            source: 'heuristic-fallback',
        };

    const tags: EnrichableField<readonly string[]> = jsDoc.tags !== undefined
        ? {
            value: jsDoc.tags,
            source: 'ast-determined',
            sourceLocation: { file: resolvedFilename, line: jsDoc.line ?? 1 },
        }
        : {
            value: [],
            source: 'heuristic-fallback',
        };

    const category: EnrichableField<string> = categoryIsAstDetermined
        ? {
            value: inferredCategory,
            source: 'ast-determined',
            // Category is path-derived — line 1 is the correct semantic location
            sourceLocation: { file: resolvedFilename, line: 1 },
        }
        : {
            value: inferredCategory,
            source: 'heuristic-fallback',
        };

    // Intent is NEVER ast-determined — always heuristic-fallback
    const intent: EnrichableField<string> = {
        value: generateHeuristicIntent(name),
        source: 'heuristic-fallback',
    };

    const ariaAttributes: EnrichableField<Readonly<Record<string, string>>> = hasAriaAttrs
        ? {
            value: ariaResult.attrs,
            source: 'ast-determined',
            sourceLocation: { file: resolvedFilename, line: ariaResult.firstLine ?? 1 },
        }
        : {
            value: {},
            source: 'heuristic-fallback',
        };

    const designTokenRefsField: EnrichableField<readonly string[]> = tokenResult.tokens.length > 0
        ? {
            value: tokenResult.tokens,
            source: 'ast-determined',
            sourceLocation: { file: resolvedFilename, line: tokenResult.firstLine ?? 1 },
        }
        : {
            value: [],
            source: 'heuristic-fallback',
        };

    const lifecycleStatesField: EnrichableField<readonly string[]> = lifecycleResult.states.length > 0
        ? {
            value: lifecycleResult.states,
            source: 'ast-determined',
            sourceLocation: { file: resolvedFilename, line: lifecycleResult.firstLine ?? 1 },
        }
        : {
            value: [],
            source: 'heuristic-fallback',
        };

    // --- Step 6: Assemble StructuralManifest ---

    const manifest: StructuralManifest = {
        // Structural (bare values, always AST-determined)
        name,
        props,
        defaultProps,
        generics,
        existingZodSchemas,
        eventHandlers,

        // Enrichable (wrapped with provenance)
        description,
        tags,
        category,
        intent,
        ariaAttributes,
        designTokenRefs: designTokenRefsField,
        lifecycleStates: lifecycleStatesField,
    };

    // --- Step 7: Add informational diagnostics ---

    if (generics.length > 0) {
        diagnostics.push({
            level: 'info',
            message: `Component "${name}" has ${String(generics.length)} generic type parameter(s). Contract will include REVIEW annotations.`,
        });
    }

    if (existingZodSchemas.length > 0) {
        diagnostics.push({
            level: 'info',
            message: `Existing Zod schemas detected: ${existingZodSchemas.join(', ')}. Phase 3 will add a provenance comment.`,
        });
    }

    return { manifest, diagnostics };
}
