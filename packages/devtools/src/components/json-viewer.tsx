'use client';

/**
 * @module @enterstellar-ai/devtools/components/json-viewer
 * @description Collapsible JSON tree viewer for inspecting structured data.
 *
 * Recursively renders objects and arrays as expandable tree nodes.
 * Primitive values (string, number, boolean, null) are rendered inline
 * with syntax-highlighted colors.
 *
 * Used in the Component Inspector panel to display trace data,
 * raw/compiled props, and error details.
 *
 * Styled via centralized `styles.ts` — no external CSS.
 *
 * @see Bible §4.4 — Component Inspector tab
 *
 * @internal
 */

import { useState, useCallback } from 'react';

import type { JsonViewerProps } from '../types.js';
import { jsonViewerStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/**
 * Checks if a value is a non-null plain object (not an array).
 *
 * @param value - The value to check.
 * @returns `true` if the value is a plain object.
 *
 * @internal
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks if a value is an array.
 *
 * @param value - The value to check.
 * @returns `true` if the value is an array.
 *
 * @internal
 */
function isArray(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Primitive Renderer
// ---------------------------------------------------------------------------

/**
 * Renders a primitive JSON value with syntax-highlighted styling.
 *
 * @param value - The primitive value to render.
 * @returns A styled `<span>` element.
 *
 * @internal
 */
function renderPrimitive(value: unknown): React.JSX.Element {
    if (value === null) {
        return <span style={jsonViewerStyles['null']}>null</span>;
    }

    if (value === undefined) {
        return <span style={jsonViewerStyles['null']}>undefined</span>;
    }

    if (typeof value === 'string') {
        return <span style={jsonViewerStyles['string']}>&quot;{value}&quot;</span>;
    }

    if (typeof value === 'number') {
        return <span style={jsonViewerStyles['number']}>{String(value)}</span>;
    }

    if (typeof value === 'boolean') {
        return <span style={jsonViewerStyles['boolean']}>{String(value)}</span>;
    }

    // Fallback for symbols, bigints, functions, etc.
    // Cast to the union of types String() handles deterministically.
    // Only symbol, bigint, and function values can reach this fallback branch.
    const safeValue = value as string | number | boolean | symbol | bigint;
    return <span style={jsonViewerStyles['null']}>{typeof safeValue === 'function' ? '[function]' : String(safeValue)}</span>;
}

// ---------------------------------------------------------------------------
// Tree Node
// ---------------------------------------------------------------------------

/**
 * Props for the internal `JsonNode` component.
 *
 * @internal
 */
type JsonNodeProps = {
    /** The key name (for object properties) or index (for array items). */
    readonly label: string;
    /** The value to render. */
    readonly data: unknown;
    /** Whether this node starts expanded. */
    readonly defaultExpanded: boolean;
    /** Current nesting depth (for indentation). */
    readonly depth: number;
};

/** Maximum render depth to prevent runaway recursion. */
const MAX_DEPTH = 10;

/**
 * Recursive tree node component.
 *
 * For objects and arrays: renders a collapsible toggle with child nodes.
 * For primitives: renders the value inline with syntax highlighting.
 *
 * Enforces a maximum depth of {@link MAX_DEPTH} to prevent stack overflow
 * on deeply nested structures.
 *
 * @param props - {@link JsonNodeProps}
 * @returns A tree node element.
 *
 * @internal
 */
function JsonNode(props: JsonNodeProps): React.JSX.Element {
    const { label, data, defaultExpanded, depth } = props;

    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    const toggle = useCallback(() => {
        setIsExpanded((prev) => !prev);
    }, []);

    // Depth guard: render truncation notice
    if (depth > MAX_DEPTH) {
        return (
            <div style={jsonViewerStyles['indent']}>
                <span style={jsonViewerStyles['key']}>{label}: </span>
                <span style={jsonViewerStyles['null']}>[max depth reached]</span>
            </div>
        );
    }

    // Primitive value: render inline
    if (!isPlainObject(data) && !isArray(data)) {
        return (
            <div>
                <span style={jsonViewerStyles['key']}>{label}: </span>
                {renderPrimitive(data)}
            </div>
        );
    }

    // Object or array: render collapsible
    const entries = isArray(data)
        ? data.map((item, i) => [String(i), item] as const)
        : Object.entries(data);

    const bracketOpen = isArray(data) ? '[' : '{';
    const bracketClose = isArray(data) ? ']' : '}';
    const itemCount = entries.length;

    return (
        <div>
            <button
                type="button"
                onClick={toggle}
                style={jsonViewerStyles['toggle']}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label}`}
            >
                {isExpanded ? '▼' : '▶'}{' '}
                <span style={jsonViewerStyles['key']}>{label}</span>{' '}
                {bracketOpen}
                {!isExpanded && (
                    <span style={jsonViewerStyles['null']}>
                        {' '}{itemCount} {itemCount === 1 ? 'item' : 'items'}{' '}
                    </span>
                )}
                {!isExpanded && bracketClose}
            </button>

            {isExpanded && (
                <div style={jsonViewerStyles['indent']}>
                    {entries.map(([key, value]) => (
                        <JsonNode
                            key={key}
                            label={key}
                            data={value}
                            defaultExpanded={false}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}

            {isExpanded && (
                <span style={jsonViewerStyles['toggle']}>{bracketClose}</span>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Public Component
// ---------------------------------------------------------------------------

/**
 * Collapsible JSON tree viewer.
 *
 * Renders any `unknown` value as a navigable tree with syntax highlighting.
 * Objects and arrays are collapsible. Primitives render inline.
 *
 * @param props - {@link JsonViewerProps}
 * @returns The JSON viewer container element.
 *
 * @example
 * ```tsx
 * <JsonViewer
 *   data={{ name: "PatientVitals", props: { heartRate: 72 } }}
 *   label="compiledProps"
 *   defaultExpanded={true}
 * />
 * ```
 *
 * @internal
 */
export function JsonViewer(props: JsonViewerProps): React.JSX.Element {
    const { data, label = 'root', defaultExpanded = false } = props;

    return (
        <div
            style={jsonViewerStyles['container']}
            role="tree"
            aria-label={`JSON viewer: ${label}`}
            data-enterstellar-devtools-json=""
        >
            <JsonNode
                label={label}
                data={data}
                defaultExpanded={defaultExpanded}
                depth={0}
            />
        </div>
    );
}
