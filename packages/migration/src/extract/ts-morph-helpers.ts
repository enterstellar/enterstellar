/**
 * @module @enterstellar-ai/migration/extract/ts-morph-helpers
 * @description AST traversal utilities for `ts-morph`.
 *
 * Provides focused helper functions for common AST operations used by
 * `extractManifest()`:
 *
 * - **Component detection:** Finding named/default exports that are
 *   React function components (including `forwardRef` wrappers).
 * - **Props extraction:** Resolving the props type parameter from the
 *   component's function signature or `forwardRef<Ref, Props>` generic.
 * - **JSDoc extraction:** Reading `@description`, `@tags`, `@deprecated`
 *   annotations from the component's JSDoc block.
 * - **Event handler detection:** Scanning JSX for `onClick`, `onSubmit`,
 *   etc. event handler props.
 * - **ARIA attribute extraction:** Scanning JSX for `role` and `aria-*`
 *   attributes.
 * - **Design token detection:** Scanning for CSS variable usage matching
 *   `--enterstellar-*` or `var(--*)` patterns.
 * - **Lifecycle state detection:** Detecting conditional rendering patterns
 *   (`if (loading)`, `if (error)`, etc.).
 *
 * All helpers operate on `ts-morph` AST nodes and return primitive data.
 * They do NOT construct `EnrichableField` wrappers — that's the
 * responsibility of `extractManifest()`.
 *
 * **L15 compliance:** Zero framework imports. `ts-morph` only.
 *
 * @see Correction 2 — AST-Determined vs. Heuristic-Fallback decision rules
 */

import {
    type CallExpression,
    type FunctionDeclaration,
    type JSDoc,
    type Node,
    type SourceFile,
    type Type,
    type VariableDeclaration,
    SyntaxKind,
} from 'ts-morph';

import type { GenericParam } from '../types.js';

// ---------------------------------------------------------------------------
// Internal Types (T11 — standalone named types, not exported from barrel)
// ---------------------------------------------------------------------------

/**
 * Result of `findComponentExport()` — identifies the primary component
 * export in a source file.
 *
 * Contains the component name, the AST declaration node, the resolved
 * props `Type` (for `typeToZodSchema()`), and any generic type parameters.
 *
 * @see Correction 1 — SKIP Cases: returns `undefined` when no component found
 */
export type ComponentExportInfo = {
    /** PascalCase component name from the export declaration. */
    readonly name: string;
    /** The AST node of the component declaration. */
    readonly declaration: FunctionDeclaration | VariableDeclaration | Node;
    /**
     * The resolved props `Type` for the component.
     * `undefined` for zero-props components (e.g., `<Spacer />`).
     */
    readonly propsType: Type | undefined;
    /** Generic type parameters, if the component is generic. */
    readonly generics: readonly GenericParam[];
};

/**
 * Result of `extractJsDoc()` — parsed JSDoc annotations.
 *
 * All fields are `undefined` when the corresponding annotation is absent.
 * The caller uses this to decide `ast-determined` vs `heuristic-fallback`.
 */
export type JsDocInfo = {
    /** The `@description` tag text, or the first JSDoc paragraph. */
    readonly description: string | undefined;
    /** The `@tags` annotation values (custom JSDoc tag). */
    readonly tags: readonly string[] | undefined;
    /** The `@deprecated` annotation text. */
    readonly deprecated: string | undefined;
    /** 1-indexed line number of the JSDoc block, if found. */
    readonly line: number | undefined;
};

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a string is PascalCase (starts with uppercase letter).
 * React components must be PascalCase by convention.
 */
function isPascalCase(name: string): boolean {
    return name.length > 0 && name[0] === name[0]?.toUpperCase() && /^[A-Z]/.test(name);
}

/**
 * Extracts the props `Type` from a component declaration.
 *
 * **Internal helper** — called by `findComponentExport()` to populate
 * `ComponentExportInfo.propsType`. Not exported from the barrel.
 *
 * Resolution order:
 * 1. `forwardRef<Ref, Props>` → second type argument (`Props`)
 * 2. Function first parameter type annotation → that type
 * 3. No parameter / no annotation → `undefined` (zero-props component)
 *
 * @param declaration - The component's AST declaration node.
 * @param callExpr - If the component is wrapped in `forwardRef`/`memo`,
 *   the wrapping `CallExpression` node.
 * @returns The resolved props `Type`, or `undefined` for zero-props components.
 */
function extractPropsType(
    declaration: Node,
    callExpr?: CallExpression,
): Type | undefined {
    // 1. forwardRef<Ref, Props> — extract Props (second type argument)
    if (callExpr !== undefined) {
        const typeArgs = callExpr.getTypeArguments();
        const propsTypeNode = typeArgs[1];
        if (propsTypeNode !== undefined) {
            return propsTypeNode.getType();
        }
    }

    // 2. Function/arrow — first parameter's type
    let params: Node[] = [];
    if (declaration.isKind(SyntaxKind.FunctionDeclaration)) {
        params = declaration.getParameters();
    } else if (declaration.isKind(SyntaxKind.ArrowFunction)) {
        params = declaration.getParameters();
    }

    const firstParam = params[0];
    if (firstParam?.isKind(SyntaxKind.Parameter)) {
        const typeNode = firstParam.getTypeNode();
        if (typeNode !== undefined) {
            return typeNode.getType();
        }
        // Destructured without explicit type — infer from the parameter type
        return firstParam.getType();
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Component Detection
// ---------------------------------------------------------------------------

/**
 * Finds the primary component export in a source file.
 *
 * Searches exported declarations for React function component patterns:
 * - Named export: `export function Button(props: ButtonProps) { ... }`
 * - Arrow export: `export const Button = (props: ButtonProps) => ...`
 * - `forwardRef`: `export const Button = forwardRef<Ref, Props>(...)`
 * - `memo`: `export const Button = memo(function Button(props) { ... })`
 * - Default export: `export default function Button(...) { ... }`
 *
 * **SKIP cases** (returns `undefined`):
 * - No exported declarations
 * - Re-exports (`export { X } from '...'`)
 * - Class components without typed props
 * - Non-component exports (utility functions, constants)
 *
 * **Priority:** Default export takes precedence. Among named exports,
 * the first PascalCase-named export wins.
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @returns Component info, or `undefined` if no component export found (SKIP).
 *
 * @see Correction 1 — SKIP Cases: The Hard Boundary
 */
export function findComponentExport(
    sourceFile: SourceFile,
): ComponentExportInfo | undefined {
    const exportedDecls = sourceFile.getExportedDeclarations();

    // 1. Check default export first (highest priority)
    const defaultDecls = exportedDecls.get('default');
    if (defaultDecls !== undefined) {
        const defaultDecl = defaultDecls[0];
        if (defaultDecl !== undefined) {
            const result = tryResolveComponent(defaultDecl, 'default');
            if (result !== undefined) {
                return result;
            }
        }
    }

    // 2. Check named exports — first PascalCase match wins
    for (const [name, decls] of exportedDecls) {
        if (name === 'default') continue;
        if (!isPascalCase(name)) continue;

        const decl = decls[0];
        if (decl === undefined) continue;

        const result = tryResolveComponent(decl, name);
        if (result !== undefined) {
            return result;
        }
    }

    return undefined;
}

/**
 * Attempts to resolve an exported declaration as a React component.
 *
 * Handles function declarations, variable declarations (arrow functions),
 * and call expression wrappers (`forwardRef`, `memo`).
 */
function tryResolveComponent(
    decl: Node,
    name: string,
): ComponentExportInfo | undefined {
    // --- Function declaration ---
    if (decl.isKind(SyntaxKind.FunctionDeclaration)) {
        const resolvedName = decl.getName() ?? name;
        if (!isPascalCase(resolvedName)) return undefined;

        return {
            name: resolvedName,
            declaration: decl,
            propsType: extractPropsType(decl),
            generics: extractGenerics(decl),
        };
    }

    // --- Variable declaration (arrow function or call expression) ---
    if (decl.isKind(SyntaxKind.VariableDeclaration)) {
        const varName = decl.getName();
        if (!isPascalCase(varName)) return undefined;

        const initializer = decl.getInitializer();
        if (initializer === undefined) return undefined;

        // Check for forwardRef/memo wrapper
        if (initializer.isKind(SyntaxKind.CallExpression)) {
            return tryResolveCallExpression(initializer, varName, decl);
        }

        // Plain arrow function
        if (initializer.isKind(SyntaxKind.ArrowFunction)) {
            return {
                name: varName,
                declaration: decl,
                propsType: extractPropsType(initializer),
                generics: extractGenericParams(initializer),
            };
        }
    }

    return undefined;
}

/**
 * Resolves a `CallExpression` wrapper like `forwardRef(...)` or `memo(...)`.
 */
function tryResolveCallExpression(
    callExpr: CallExpression,
    name: string,
    parentDecl: VariableDeclaration,
): ComponentExportInfo | undefined {
    const exprText = callExpr.getExpression().getText();
    const isForwardRef = exprText === 'forwardRef' || exprText === 'React.forwardRef';
    const isMemo = exprText === 'memo' || exprText === 'React.memo';

    if (!isForwardRef && !isMemo) return undefined;

    const args = callExpr.getArguments();
    const innerArg = args[0];
    if (innerArg === undefined) return undefined;

    // memo(forwardRef(...)) — nested wrapping
    if (isMemo && innerArg.isKind(SyntaxKind.CallExpression)) {
        const innerText = innerArg.getExpression().getText();
        if (innerText === 'forwardRef' || innerText === 'React.forwardRef') {
            const innerInnerArgs = innerArg.getArguments();
            const component = innerInnerArgs[0];
            if (component !== undefined) {
                return {
                    name,
                    declaration: parentDecl,
                    propsType: extractPropsType(component, innerArg),
                    generics: extractGenericParams(component),
                };
            }
        }
    }

    // forwardRef(function/arrow) or memo(function/arrow)
    if (innerArg.isKind(SyntaxKind.ArrowFunction) || innerArg.isKind(SyntaxKind.FunctionExpression)) {
        return {
            name,
            declaration: parentDecl,
            propsType: extractPropsType(innerArg, isForwardRef ? callExpr : undefined),
            generics: extractGenericParams(innerArg),
        };
    }

    return undefined;
}

// ---------------------------------------------------------------------------
// Generic Type Parameters
// ---------------------------------------------------------------------------

/**
 * Extracts generic type parameters from a function declaration.
 *
 * Captures the parameter name and optional constraint text. Used by
 * `findComponentExport()` to populate `ComponentExportInfo.generics`.
 *
 * @param declaration - A function declaration node.
 * @returns Array of `GenericParam` objects, or `[]` if non-generic.
 *
 * @see Correction 1 — Generics: The Primary Source of REVIEW Annotations
 */
export function extractGenerics(declaration: FunctionDeclaration): readonly GenericParam[] {
    const typeParams = declaration.getTypeParameters();
    return typeParams.map((tp): GenericParam => {
        const constraint = tp.getConstraint();
        return {
            name: tp.getName(),
            ...(constraint !== undefined ? { constraint: constraint.getText() } : {}),
        };
    });
}

/**
 * Extracts generic type parameters from any node that may have type params.
 *
 * Variant of `extractGenerics` for arrow functions and function expressions
 * which are `Node` types rather than `FunctionDeclaration`.
 *
 * @param node - The AST node to inspect.
 * @returns Array of `GenericParam` objects, or `[]`.
 */
function extractGenericParams(node: Node): readonly GenericParam[] {
    if (node.isKind(SyntaxKind.FunctionDeclaration)) {
        return extractGenerics(node);
    }
    if (node.isKind(SyntaxKind.ArrowFunction) || node.isKind(SyntaxKind.FunctionExpression)) {
        const typeParams = node.getTypeParameters();
        return typeParams.map((tp): GenericParam => {
            const constraint = tp.getConstraint();
            return {
                name: tp.getName(),
                ...(constraint !== undefined ? { constraint: constraint.getText() } : {}),
            };
        });
    }
    return [];
}

// ---------------------------------------------------------------------------
// Default Props Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts default prop values from a component's source file.
 *
 * Searches two patterns:
 * 1. **Destructured defaults:** `function Foo({ size = 'md' }: Props)`
 * 2. **Static `.defaultProps`:** `Foo.defaultProps = { size: 'md' }`
 *
 * Only **literal** defaults are extracted (strings, numbers, booleans, null).
 * Computed defaults (`size = getSize()`) are skipped — they can't be
 * serialized to contract examples.
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @param componentName - PascalCase name to find `.defaultProps` for.
 * @returns A record of default prop values. Empty `{}` if none found.
 */
export function extractDefaultProps(
    sourceFile: SourceFile,
    componentName: string,
): Readonly<Record<string, unknown>> {
    const defaults: Record<string, unknown> = {};

    // 1. Scan for destructured defaults in function parameters
    const functions = sourceFile.getFunctions();
    for (const fn of functions) {
        if (fn.getName() !== componentName) continue;
        const firstParam = fn.getParameters()[0];
        if (firstParam === undefined) continue;

        // Check for object binding pattern: ({ size = 'md', disabled = false })
        const bindingPattern = firstParam.getChildrenOfKind(SyntaxKind.ObjectBindingPattern)[0];
        if (bindingPattern !== undefined) {
            for (const element of bindingPattern.getElements()) {
                const initializer = element.getInitializer();
                if (initializer === undefined) continue;

                const name = element.getName();
                const literal = extractLiteralValue(initializer);
                if (literal !== undefined) {
                    defaults[name] = literal;
                }
            }
        }
    }

    // 2. Scan for Foo.defaultProps = { ... }
    const statements = sourceFile.getStatements();
    for (const stmt of statements) {
        if (!stmt.isKind(SyntaxKind.ExpressionStatement)) continue;
        const expr = stmt.getExpression();
        if (!expr.isKind(SyntaxKind.BinaryExpression)) continue;

        const left = expr.getLeft();
        if (!left.isKind(SyntaxKind.PropertyAccessExpression)) continue;

        const obj = left.getExpression();
        const prop = left.getName();
        if (obj.getText() !== componentName || prop !== 'defaultProps') continue;

        const right = expr.getRight();
        if (!right.isKind(SyntaxKind.ObjectLiteralExpression)) continue;

        for (const property of right.getProperties()) {
            if (!property.isKind(SyntaxKind.PropertyAssignment)) continue;
            const initializer = property.getInitializer();
            if (initializer === undefined) continue;

            const name = property.getName();
            const literal = extractLiteralValue(initializer);
            if (literal !== undefined) {
                defaults[name] = literal;
            }
        }
    }

    return defaults;
}

/**
 * Extracts a literal value from an AST node.
 * Returns `undefined` for non-literal (computed) values.
 */
function extractLiteralValue(node: Node): string | number | boolean | null | undefined {
    if (node.isKind(SyntaxKind.StringLiteral)) return node.getLiteralValue();
    if (node.isKind(SyntaxKind.NumericLiteral)) return node.getLiteralValue();
    if (node.isKind(SyntaxKind.TrueKeyword)) return true;
    if (node.isKind(SyntaxKind.FalseKeyword)) return false;
    if (node.isKind(SyntaxKind.NullKeyword)) return null;
    return undefined;
}

// ---------------------------------------------------------------------------
// Existing Zod Schema Detection
// ---------------------------------------------------------------------------

/**
 * Detects existing Zod schema variable names in a source file.
 *
 * Scans for:
 * 1. An import of `z` from `'zod'`
 * 2. Variable declarations whose initializer calls `z.*()` methods
 *
 * Returns **variable names** (e.g., `['UserSchema', 'AddressSchema']`),
 * NOT runtime `z.ZodType` instances — those are not extractable from AST.
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @returns Array of schema variable names. Empty `[]` if no Zod usage found.
 */
export function detectExistingZodSchemas(sourceFile: SourceFile): readonly string[] {
    // 1. Check for zod import
    const zodImport = sourceFile.getImportDeclarations().find(
        (imp) => imp.getModuleSpecifierValue() === 'zod',
    );
    if (zodImport === undefined) return [];

    // 2. Find variable declarations using z.*()
    const schemas: string[] = [];
    const variables = sourceFile.getVariableDeclarations();
    for (const variable of variables) {
        const initializer = variable.getInitializer();
        if (initializer === undefined) continue;

        const text = initializer.getText();
        if (/\bz\.\w+\(/.test(text)) {
            schemas.push(variable.getName());
        }
    }

    return schemas;
}

// ---------------------------------------------------------------------------
// Event Handler Detection
// ---------------------------------------------------------------------------

/**
 * Detects event handler types from JSX attributes.
 *
 * Scans JSX elements for attributes matching the `on${Event}` pattern
 * (e.g., `onClick`, `onSubmit`, `onChange`). Returns deduplicated,
 * lowercase event names with the `on` prefix stripped.
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @returns Array of event names (e.g., `['click', 'submit', 'change']`).
 *   Empty `[]` if no event handlers found.
 */
export function detectEventHandlers(sourceFile: SourceFile): readonly string[] {
    const events = new Set<string>();

    const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
    for (const attr of jsxAttributes) {
        const name = attr.getNameNode().getText();
        // Match on* pattern: onClick, onSubmit, onChange, etc.
        if (/^on[A-Z]/.test(name)) {
            // Strip 'on' prefix and lowercase: 'onClick' → 'click'
            const eventName = name.slice(2, 3).toLowerCase() + name.slice(3);
            events.add(eventName);
        }
    }

    return [...events];
}

// ---------------------------------------------------------------------------
// JSDoc Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts JSDoc annotations from a component's declaration.
 *
 * Parses the JSDoc block attached to the named component export for:
 * - `@description` tag text (or the first paragraph if no explicit tag)
 * - `@tags` custom annotation (comma-separated list)
 * - `@deprecated` annotation with optional reason text
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @param componentName - PascalCase name to find JSDoc for.
 * @returns A `JsDocInfo` object with parsed annotations.
 *   All fields are `undefined` when the annotation is absent.
 */
export function extractJsDoc(
    sourceFile: SourceFile,
    componentName: string,
): JsDocInfo {
    const result: JsDocInfo = {
        description: undefined,
        tags: undefined,
        deprecated: undefined,
        line: undefined,
    };

    // Find the function/variable declaration matching the component name
    const fn = sourceFile.getFunction(componentName);
    const jsDocs = fn !== undefined
        ? fn.getJsDocs()
        : findVariableJsDocs(sourceFile, componentName);

    if (jsDocs.length === 0) return result;

    const jsDoc = jsDocs[0];
    if (jsDoc === undefined) return result;

    // Description: @description tag or first paragraph
    let description: string | undefined;
    const descTag = jsDoc.getTags().find((t) => t.getTagName() === 'description');
    if (descTag !== undefined) {
        description = descTag.getCommentText()?.trim();
    } else {
        const mainComment = jsDoc.getCommentText()?.trim();
        if (mainComment !== undefined && mainComment.length > 0) {
            description = mainComment;
        }
    }

    // Tags: @tags annotation (comma-separated)
    let tags: readonly string[] | undefined;
    const tagsTag = jsDoc.getTags().find((t) => t.getTagName() === 'tags');
    if (tagsTag !== undefined) {
        const tagText = tagsTag.getCommentText()?.trim();
        if (tagText !== undefined && tagText.length > 0) {
            tags = tagText.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
        }
    }

    // Deprecated: @deprecated annotation
    let deprecated: string | undefined;
    const deprecatedTag = jsDoc.getTags().find((t) => t.getTagName() === 'deprecated');
    if (deprecatedTag !== undefined) {
        deprecated = deprecatedTag.getCommentText()?.trim() ?? '';
    }

    return {
        description,
        tags,
        deprecated,
        line: jsDoc.getStartLineNumber(),
    };
}

/**
 * Finds JSDoc blocks for a variable declaration (arrow function components).
 */
function findVariableJsDocs(sourceFile: SourceFile, name: string): JSDoc[] {
    const varStmts = sourceFile.getVariableStatements();
    for (const stmt of varStmts) {
        const decl = stmt.getDeclarations().find((d) => d.getName() === name);
        if (decl !== undefined) {
            return stmt.getJsDocs();
        }
    }
    return [];
}

// ---------------------------------------------------------------------------
// ARIA Attribute Detection
// ---------------------------------------------------------------------------

/**
 * Detects ARIA attributes and `role` from JSX elements.
 *
 * Scans JSX elements for `role="..."` and `aria-*="..."` attributes.
 * Only extracts **static string values** — dynamic expressions are
 * skipped (they can't be represented as static metadata).
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @returns An object with `attrs` (name → value record) and `firstLine`
 *   (1-indexed line of the first ARIA attribute, or `undefined` if none).
 */
export function detectAriaAttributes(
    sourceFile: SourceFile,
): { readonly attrs: Readonly<Record<string, string>>; readonly firstLine: number | undefined } {
    const attrs: Record<string, string> = {};
    let firstLine: number | undefined;

    const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
    for (const attr of jsxAttributes) {
        const name = attr.getNameNode().getText();
        if (name !== 'role' && !name.startsWith('aria-')) continue;

        // Extract static string value only
        const initializer = attr.getInitializer();
        if (initializer?.isKind(SyntaxKind.StringLiteral)) {
            attrs[name] = initializer.getLiteralValue();
            firstLine ??= attr.getStartLineNumber();
        }
    }

    return { attrs, firstLine };
}

// ---------------------------------------------------------------------------
// Design Token Reference Detection
// ---------------------------------------------------------------------------

/**
 * Detects CSS custom property / design token references in source code.
 *
 * Scans string literals and template literals for patterns:
 * - `var(--enterstellar-*)` — CSS variable function calls
 * - `var(--*)` — any CSS variable reference
 * - `--enterstellar-*` — bare Enterstellar token references
 *
 * Returns deduplicated token reference strings (the full `var(--*)`
 * or `--enterstellar-*` match).
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @returns An object with `tokens` (deduplicated array) and `firstLine`
 *   (1-indexed line of the first token reference, or `undefined` if none).
 */
export function detectDesignTokenRefs(
    sourceFile: SourceFile,
): { readonly tokens: readonly string[]; readonly firstLine: number | undefined } {
    const tokenSet = new Set<string>();
    let firstLine: number | undefined;

    // Pattern: var(--anything) or bare --enterstellar-anything
    const cssVarPattern = /var\(--[\w-]+\)|--enterstellar-[\w-]+/g;

    // Scan string literals
    const strings = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral);
    for (const str of strings) {
        const value = str.getLiteralValue();
        const matches = value.match(cssVarPattern);
        if (matches !== null) {
            for (const match of matches) {
                tokenSet.add(match);
            }
            firstLine ??= str.getStartLineNumber();
        }
    }

    // Scan template literal spans
    const templates = sourceFile.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral);
    for (const tmpl of templates) {
        const value = tmpl.getLiteralValue();
        const matches = value.match(cssVarPattern);
        if (matches !== null) {
            for (const match of matches) {
                tokenSet.add(match);
            }
            firstLine ??= tmpl.getStartLineNumber();
        }
    }

    return { tokens: [...tokenSet], firstLine };
}

// ---------------------------------------------------------------------------
// Lifecycle State Detection
// ---------------------------------------------------------------------------

/**
 * Detects conditional rendering patterns indicating lifecycle states.
 *
 * Scans for identifier patterns commonly used in conditional rendering,
 * but **only within conditional contexts** to avoid false positives:
 * - `IfStatement` conditions
 * - `ConditionalExpression` (ternary) conditions
 * - `BinaryExpression` with `&&` operator (short-circuit rendering)
 *
 * Patterns detected:
 * - `loading` / `isLoading` → `'loading'`
 * - `error` / `isError` → `'error'`
 * - `isEmpty` / `empty` → `'empty'`
 *
 * @param sourceFile - The `ts-morph` `SourceFile` to analyze.
 * @returns An object with `states` (lifecycle state names) and `firstLine`
 *   (1-indexed line of the first matching conditional, or `undefined`).
 */
export function detectLifecycleStates(
    sourceFile: SourceFile,
): { readonly states: readonly string[]; readonly firstLine: number | undefined } {
    const stateSet = new Set<string>();
    let firstLine: number | undefined;

    /**
     * Map of identifier text → lifecycle state name.
     * Only identifiers in this map trigger detection.
     */
    const identifierMap: Readonly<Record<string, string>> = {
        loading: 'loading',
        isLoading: 'loading',
        error: 'error',
        isError: 'error',
        isEmpty: 'empty',
        empty: 'empty',
    };

    /**
     * Checks all identifiers within a given AST node against the
     * lifecycle identifier map. Tracks line of first match.
     */
    function scanNodeForLifecycleIdentifiers(node: Node): void {
        // getDescendantsOfKind excludes the node itself — check it manually
        // when the expression is a bare identifier (e.g., `if (loading)`)
        const candidates = node.isKind(SyntaxKind.Identifier)
            ? [node, ...node.getDescendantsOfKind(SyntaxKind.Identifier)]
            : node.getDescendantsOfKind(SyntaxKind.Identifier);
        for (const id of candidates) {
            const text = id.getText();
            const mapped = identifierMap[text];
            if (mapped !== undefined) {
                stateSet.add(mapped);
                firstLine ??= id.getStartLineNumber();
            }
        }
    }

    // Scan 1: IfStatement conditions — `if (loading) return <Spinner />;`
    const ifStatements = sourceFile.getDescendantsOfKind(SyntaxKind.IfStatement);
    for (const ifStmt of ifStatements) {
        scanNodeForLifecycleIdentifiers(ifStmt.getExpression());
    }

    // Scan 2: ConditionalExpression conditions — `loading ? <Spinner /> : <Content />`
    const ternaries = sourceFile.getDescendantsOfKind(SyntaxKind.ConditionalExpression);
    for (const ternary of ternaries) {
        scanNodeForLifecycleIdentifiers(ternary.getCondition());
    }

    // Scan 3: BinaryExpression with && — `loading && <Spinner />`
    const binaryExprs = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    for (const binExpr of binaryExprs) {
        const opToken = binExpr.getOperatorToken();
        if (opToken.isKind(SyntaxKind.AmpersandAmpersandToken)) {
            scanNodeForLifecycleIdentifiers(binExpr.getLeft());
        }
    }

    return { states: [...stateSet], firstLine };
}
