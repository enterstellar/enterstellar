'use client';

/**
 * @module @enterstellar-ai/devtools/panels/panel-stub
 * @description Stub component for deferred DevTools tabs.
 *
 * Renders a "Coming in a future release" placeholder for tabs that
 * are not yet implemented (P1/P2 per DT4):
 * - Cache Dashboard (P1)
 * - Performance Profiler (P1)
 * - Replay Mode (P2)
 *
 * Maintains type safety by accepting a `DevToolsTab` and resolving
 * the human-readable label from the `TAB_LABELS` constant.
 *
 * @see Design Choice DT4 — tab phasing (P0/P1/P2)
 *
 * @internal
 */

import type { DevToolsTab } from '../types.js';
import { TAB_LABELS } from '../constants.js';
import { panelStubStyles } from '../styles.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `PanelStub` component.
 *
 * @internal
 */
type PanelStubProps = {
    /** The deferred tab to render a stub for. */
    readonly tab: DevToolsTab;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Placeholder panel for tabs not yet implemented.
 *
 * Renders a centered icon, tab name, and informational message.
 * Purely presentational — no state, no side effects.
 *
 * @param props - {@link PanelStubProps}
 * @returns The stub panel element.
 *
 * @see Design Choice DT4 — deferred tabs
 *
 * @internal
 */
export function PanelStub(props: PanelStubProps): React.JSX.Element {
    const { tab } = props;
    const label = TAB_LABELS[tab];

    return (
        <div
            style={panelStubStyles['container']}
            data-enterstellar-devtools-panel={tab}
            role="status"
            aria-label={`${label} — coming soon`}
        >
            <span style={panelStubStyles['icon']} aria-hidden="true">
                🚧
            </span>
            <span style={panelStubStyles['title']}>
                {label}
            </span>
            <span style={panelStubStyles['subtitle']}>
                Coming in a future release.
            </span>
        </div>
    );
}
