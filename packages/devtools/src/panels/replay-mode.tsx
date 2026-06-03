'use client';

/**
 * @module @enterstellar-ai/devtools/panels/replay-mode
 * @description P2 Tab — Step-by-step pipeline replay log viewer.
 *
 * The Replay Mode panel renders a vertical stepper UI that walks through
 * the 6 stages of the Enterstellar compilation pipeline for a selected trace.
 * Each step displays data extracted from `ZoneTrace` fields, rendered
 * as expandable sections with status indicators.
 *
 * This is a **log viewer** (DT6), not a visual DOM replay. It shows
 * what happened at each pipeline stage, with structured JSON data
 * viewable via `JsonViewer`.
 *
 * Data flow:
 * ```
 * selectedTrace → deriveReplaySteps(trace) → vertical stepper UI
 *                                             ↑ step navigation
 *                                             ↑ expand/collapse
 * ```
 *
 * Current limitation: Step 2 (Component Resolved) uses `provenance`
 * data as a proxy. Full resolution details (`strategy`, `candidates`)
 * require `AgentTrace.resolution` — future enhancement.
 *
 * @see Design Choice DT6 — log viewer, step-by-step replay
 * @see Bible §4.4 — Replay Mode tab
 * @see Design Choice DT4 — P2 tab
 *
 * @internal
 */

import { useState, useMemo, useCallback } from 'react';

import type { ZoneTrace } from '@enterstellar-ai/types';

import type { ReplayStep } from '../types.js';
import { JsonViewer } from '../components/json-viewer.js';
import { replayModeStyles as styles, sharedPanelStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `ReplayMode` panel.
 *
 * @internal
 */
type ReplayModeProps = {
    /**
     * The currently selected trace to replay, or `null` if none selected.
     * Passed from the parent `<EnterstellarDevTools />` component.
     */
    readonly selectedTrace: ZoneTrace | null;
};

// ---------------------------------------------------------------------------
// Step Derivation
// ---------------------------------------------------------------------------

/**
 * Derives the 6 pipeline replay steps from a `ZoneTrace`.
 *
 * Each step maps a trace field to a human-readable label, status, and
 * data payload. Steps are ordered to mirror the actual pipeline sequence:
 * Intent → Resolution → Compilation → Validation → Output → Performance.
 *
 * @param trace - The trace to derive steps from.
 * @returns Array of 6 `ReplayStep` objects.
 *
 * @see {@link ReplayStep} — step shape
 * @internal
 */
function deriveReplaySteps(trace: ZoneTrace): readonly ReplayStep[] {
    const compilationStatus = trace.compilation.status;
    const hasErrors = trace.compilation.errors.length > 0;

    return [
        // Step 1: Intent Received
        {
            name: 'intent',
            label: 'Intent Received',
            data: {
                component: trace.intent.component,
                confidence: trace.intent.confidence,
                props: trace.intent.props,
            },
            status: 'completed',
        },
        // Step 2: Component Resolved (via provenance — AgentTrace.resolution future)
        {
            name: 'resolution',
            label: 'Component Resolved',
            data: {
                agent: trace.provenance.agent,
                registry: trace.provenance.registry,
                compiledAt: trace.provenance.compiledAt,
                compilerVersion: trace.provenance.compilerVersion,
                note: 'Full resolution details (strategy, candidates) require AgentTrace.',
            },
            status: 'completed',
        },
        // Step 3: Compilation
        {
            name: 'compilation',
            label: 'Compilation',
            data: {
                status: compilationStatus,
                selfCorrectionAttempts: trace.compilation.selfCorrectionAttempts,
            },
            status: compilationStatus === 'fail' ? 'failed' : 'completed',
        },
        // Step 4: Validation
        {
            name: 'validation',
            label: 'Validation',
            data: {
                errorCount: trace.compilation.errors.length,
                errors: trace.compilation.errors,
            },
            status: hasErrors ? 'failed' : 'completed',
        },
        // Step 5: Final Output
        {
            name: 'output',
            label: 'Final Output',
            data: {
                component: trace.intent.component,
                compilationStatus,
                compiledAt: trace.provenance.compiledAt,
            },
            status: 'completed',
        },
        // Step 6: Performance
        {
            name: 'performance',
            label: 'Performance',
            data: {
                totalMs: trace.metrics.totalMs,
                retryAttempt: trace.metrics.retryAttempt,
                note: 'Per-stage breakdown (resolutionMs, compilationMs, renderMs) requires AgentTrace.',
            },
            status: 'completed',
        },
    ];
}

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

/**
 * Returns the step indicator character based on status.
 *
 * @param status - The step status.
 * @returns A single character: ● (completed), ✕ (failed), ○ (skipped).
 *
 * @internal
 */
function getStepIndicator(status: ReplayStep['status']): string {
    switch (status) {
        case 'completed':
            return '●';
        case 'failed':
            return '✕';
        case 'skipped':
            return '○';
    }
}

/**
 * Returns the style key for the step indicator based on status.
 *
 * @param status - The step status.
 * @returns Style object key from `replayModeStyles`.
 *
 * @internal
 */
function getIndicatorStyle(status: ReplayStep['status']): string {
    switch (status) {
        case 'completed':
            return 'stepCompleted';
        case 'failed':
            return 'stepFailed';
        case 'skipped':
            return 'stepSkipped';
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Replay Mode panel — P2 Tab.
 *
 * Renders:
 * 1. Vertical stepper with 6 pipeline stages
 * 2. Step indicators (●/✕/○) with status colors
 * 3. Expandable step bodies via `JsonViewer`
 * 4. Previous/Next navigation buttons
 * 5. Empty state when no trace is selected
 *
 * @param props - {@link ReplayModeProps}
 * @returns The replay mode panel element.
 *
 * @see Design Choice DT6 — log viewer, step-by-step replay
 * @see Bible §4.4 — Replay Mode specification
 *
 * @internal
 */
export function ReplayMode(props: ReplayModeProps): React.JSX.Element {
    const { selectedTrace } = props;

    // -----------------------------------------------------------------------
    // State: Active Step Index
    // -----------------------------------------------------------------------

    const [activeStep, setActiveStep] = useState(0);

    // -----------------------------------------------------------------------
    // Derived: Pipeline Steps
    // -----------------------------------------------------------------------

    const steps: readonly ReplayStep[] = useMemo(
        () => selectedTrace !== null ? deriveReplaySteps(selectedTrace) : [],
        [selectedTrace],
    );

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    /** Navigates to the previous step. */
    const handlePrevious = useCallback(() => {
        setActiveStep((prev) => Math.max(0, prev - 1));
    }, []);

    /** Navigates to the next step. */
    const handleNext = useCallback(() => {
        setActiveStep((prev) => Math.min(steps.length - 1, prev + 1));
    }, [steps.length]);

    /** Toggles a step's expanded state by clicking its header. */
    const handleStepClick = useCallback((index: number) => {
        setActiveStep(index);
    }, []);

    // -----------------------------------------------------------------------
    // Render: Empty State
    // -----------------------------------------------------------------------

    if (selectedTrace === null) {
        return (
            <div
                style={sharedPanelStyles['panelRoot']}
                data-enterstellar-devtools-panel="replay-mode"
            >
                <div style={styles['emptyState']}>
                    <span style={styles['emptyIcon']} role="img" aria-label="No trace selected">
                        🔄
                    </span>
                    <span>
                        Select a trace from the Timeline to replay its pipeline.
                    </span>
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Render: Pipeline Stepper
    // -----------------------------------------------------------------------

    return (
        <div
            style={sharedPanelStyles['panelRoot']}
            data-enterstellar-devtools-panel="replay-mode"
        >
            {/* Header */}
            <div style={sharedPanelStyles['header']}>
                <span style={sharedPanelStyles['headerMeta']}>
                    Replay: {selectedTrace.intent.component}
                </span>
            </div>

            {/* Step List */}
            <div
                style={styles['stepList']}
                role="list"
                aria-label="Pipeline replay steps"
            >
                {steps.map((step, index) => (
                    <div
                        key={step.name}
                        style={styles['step']}
                        role="listitem"
                    >
                        {/* Step Indicator */}
                        <div
                            style={{
                                ...styles['stepIndicator'],
                                ...styles[getIndicatorStyle(step.status)],
                            }}
                            aria-hidden="true"
                        >
                            {getStepIndicator(step.status)}
                        </div>

                        {/* Step Header */}
                        <div
                            style={styles['stepHeader']}
                            onClick={() => { handleStepClick(index); }}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleStepClick(index);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            aria-expanded={index === activeStep}
                            aria-label={`Step ${String(index + 1)}: ${step.label} — ${step.status}`}
                        >
                            <span style={styles['stepLabel']}>
                                {step.label}
                            </span>
                            <span style={styles['stepStatus']}>
                                {step.status}
                            </span>
                        </div>

                        {/* Step Body (expanded) */}
                        {index === activeStep && (
                            <div style={styles['stepBody']}>
                                <JsonViewer
                                    data={step.data}
                                    label={step.label}
                                    defaultExpanded={true}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Navigation */}
            <div style={styles['navigation']}>
                <button
                    type="button"
                    onClick={handlePrevious}
                    disabled={activeStep === 0}
                    style={{
                        ...styles['navButton'],
                        ...(activeStep === 0 ? styles['navButtonDisabled'] : undefined),
                    }}
                    aria-label="Previous step"
                >
                    ← Previous
                </button>
                <span style={styles['stepCounter']}>
                    Step {activeStep + 1} / {steps.length}
                </span>
                <button
                    type="button"
                    onClick={handleNext}
                    disabled={activeStep === steps.length - 1}
                    style={{
                        ...styles['navButton'],
                        ...(activeStep === steps.length - 1 ? styles['navButtonDisabled'] : undefined),
                    }}
                    aria-label="Next step"
                >
                    Next →
                </button>
            </div>
        </div>
    );
}
