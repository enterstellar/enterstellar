'use client';

/**
 * @module @enterstellar-ai/devtools/panels/component-inspector
 * @description P0 Tab 2 — Detailed inspection of a selected trace.
 *
 * The Component Inspector shows the full pipeline record for a single
 * trace selected in the Trace Timeline. It renders structured sections
 * for each pipeline stage:
 *
 * 1. **Intent** — Raw intent string, resolved component, confidence
 * 2. **Compilation** — Status, error count, corrections, token/a11y validation
 * 3. **Provenance** — Agent, registry, compiler version, compile timestamp
 * 4. **Performance** — Total latency, retry attempts
 *
 * Each section uses the {@link JsonViewer} for expandable structured data
 * and inline key-value fields for scalar values.
 *
 * When no trace is selected, renders an empty state prompting the user
 * to click a trace in the Timeline.
 *
 * @see Bible §4.4 — Component Inspector tab
 * @see Design Choice DT4 — P0 tab
 *
 * @internal
 */

import type { ZoneTrace } from '@enterstellar-ai/types';

import { JsonViewer } from '../components/json-viewer.js';
import { StatusBadge } from '../components/status-badge.js';
import { inspectorStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `ComponentInspector` panel.
 *
 * @internal
 */
type ComponentInspectorProps = {
    /**
     * The currently selected trace to inspect.
     * `null` when no trace is selected — renders empty state.
     */
    readonly selectedTrace: ZoneTrace | null;
};

// ---------------------------------------------------------------------------
// Section Component
// ---------------------------------------------------------------------------

/**
 * Props for the internal `InspectorSection` component.
 *
 * @internal
 */
type InspectorSectionProps = {
    /** Section title displayed in the header. */
    readonly title: string;
    /** Section content. */
    readonly children: React.ReactNode;
};

/**
 * Renders a titled section with a header bar and body.
 *
 * @param props - {@link InspectorSectionProps}
 * @returns A section element with header and content.
 *
 * @internal
 */
function InspectorSection(props: InspectorSectionProps): React.JSX.Element {
    const { title, children } = props;

    return (
        <div style={inspectorStyles['section']}>
            <div style={inspectorStyles['sectionHeader']}>
                {title}
            </div>
            <div style={inspectorStyles['sectionBody']}>
                {children}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Field Component
// ---------------------------------------------------------------------------

/**
 * Renders a single key-value field in the inspector.
 *
 * @internal
 */
function InspectorField(props: {
    readonly label: string;
    readonly value: string | number | boolean;
}): React.JSX.Element {
    const { label, value } = props;

    return (
        <div style={inspectorStyles['field']}>
            <span style={inspectorStyles['fieldLabel']}>{label}</span>
            <span style={inspectorStyles['fieldValue']}>{String(value)}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Component Inspector panel — P0 Tab 2.
 *
 * Renders detailed inspection of a selected trace's pipeline stages.
 * Shows empty state when no trace is selected.
 *
 * @param props - {@link ComponentInspectorProps}
 * @returns The inspector panel element.
 *
 * @see Bible §4.4 — Component Inspector specification
 *
 * @internal
 */
export function ComponentInspector(props: ComponentInspectorProps): React.JSX.Element {
    const { selectedTrace } = props;

    // -----------------------------------------------------------------------
    // Empty State
    // -----------------------------------------------------------------------

    if (selectedTrace === null) {
        return (
            <div
                style={inspectorStyles['emptyState']}
                data-enterstellar-devtools-panel="component-inspector"
            >
                Select a trace in the Timeline to inspect its pipeline.
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Populated State
    // -----------------------------------------------------------------------

    const { intent, compilation, provenance, metrics } = selectedTrace;

    return (
        <div
            style={inspectorStyles['container']}
            data-enterstellar-devtools-panel="component-inspector"
        >
            {/* ─── Trace Header ─────────────────────────────────── */}
            <InspectorSection title="Trace">
                <InspectorField label="ID" value={selectedTrace.id} />
                <InspectorField label="Timestamp" value={selectedTrace.timestamp} />
            </InspectorSection>

            {/* ─── Intent ───────────────────────────────────────── */}
            <InspectorSection title="Intent">
                <InspectorField label="Component" value={intent.component} />
                <InspectorField label="Confidence" value={intent.confidence} />
                {intent.mode !== undefined && (
                    <InspectorField label="Mode" value={intent.mode} />
                )}
                {intent.interaction !== undefined && (
                    <InspectorField label="Interaction" value={intent.interaction} />
                )}
                <div style={{ marginTop: 8 }}>
                    <JsonViewer
                        data={intent.props}
                        label="props"
                        defaultExpanded={true}
                    />
                </div>
            </InspectorSection>

            {/* ─── Compilation ──────────────────────────────────── */}
            <InspectorSection title="Compilation">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={inspectorStyles['fieldLabel']}>Status</span>
                    <StatusBadge status={compilation.status} />
                </div>
                <InspectorField label="Error Count" value={compilation.errors.length} />
                <InspectorField
                    label="Self-Correction Attempts"
                    value={compilation.selfCorrectionAttempts}
                />
                {compilation.errors.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                        <JsonViewer
                            data={compilation.errors}
                            label="errors"
                            defaultExpanded={true}
                        />
                    </div>
                )}
            </InspectorSection>

            {/* ─── Provenance ──────────────────────────────────── */}
            <InspectorSection title="Provenance">
                <InspectorField label="Agent" value={provenance.agent} />
                <InspectorField label="Registry" value={provenance.registry} />
                <InspectorField label="Compiler Version" value={provenance.compilerVersion} />
                <InspectorField label="Compiled At" value={provenance.compiledAt} />
                {provenance.forgeMode !== undefined && (
                    <InspectorField label="Forge Mode" value={provenance.forgeMode} />
                )}
            </InspectorSection>

            {/* ─── Performance ─────────────────────────────────── */}
            <InspectorSection title="Performance">
                <InspectorField label="Total Latency" value={`${String(metrics.totalMs)}ms`} />
                <InspectorField label="Retry Attempt" value={metrics.retryAttempt} />
            </InspectorSection>

            {/* ─── Full Trace (Raw JSON) ──────────────────────── */}
            <InspectorSection title="Full Trace (JSON)">
                <JsonViewer
                    data={selectedTrace}
                    label="trace"
                    defaultExpanded={false}
                />
            </InspectorSection>
        </div>
    );
}
