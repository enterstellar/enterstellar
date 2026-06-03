'use client';

/**
 * @module @enterstellar-ai/devtools/enterstellar-devtools
 * @description Root `<EnterstellarDevTools />` component — the public entry point.
 *
 * This is the primary interface consumers embed in their React tree
 * to access Enterstellar DevTools functionality. It orchestrates:
 *
 * 1. **Production guard** — returns `null` when `NODE_ENV === 'production'` (DT3)
 * 2. **Toggle mechanism** — floating ⚡ button + keyboard shortcut (DT2)
 * 3. **Tab bar** — renders all 6 functional tabs (DT4)
 * 4. **Panel routing** — renders the active tab's panel content
 * 5. **State management** — open/closed, active tab, selected trace, filter state
 *
 * Usage:
 * ```tsx
 * import { EnterstellarDevTools } from '@enterstellar-ai/devtools';
 * import { createRenderCache } from '@enterstellar-ai/cache';
 *
 * const cache = createRenderCache({ maxEntries: 100 });
 *
 * function App() {
 *   return (
 *     <Provider store={store}>
 *       <EnterstellarDevTools cache={cache} />
 *     </Provider>
 *   );
 * }
 * ```
 *
 * @see Bible §4.4 — DevTools module specification
 * @see Design Choices DT1–DT8 — locked decisions
 */

import { useState, useCallback, useMemo } from 'react';

import type { ZoneTrace } from '@enterstellar-ai/types';

import type { DevToolsConfig, DevToolsTab, DevToolsCacheAdapter } from './types.js';
import {
    DEVTOOLS_MAX_TRACES,
    DEVTOOLS_DEFAULT_SHORTCUT,
    ALL_TABS,
    TAB_LABELS,
    DEFERRED_TABS,
} from './constants.js';
import { useKeyboardShortcut } from './use-keyboard-shortcut.js';
import { ToggleButton } from './components/toggle-button.js';
import { TraceTimeline } from './panels/trace-timeline.js';
import { ComponentInspector } from './panels/component-inspector.js';
import { ValidationLog } from './panels/validation-log.js';
import { PerformanceProfiler } from './panels/performance-profiler.js';
import { CacheDashboard } from './panels/cache-dashboard.js';
import { ReplayMode } from './panels/replay-mode.js';
import { PanelStub } from './panels/panel-stub.js';
import { panelStyles, tabBarStyles } from './styles.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Props for the `<EnterstellarDevTools />` component.
 *
 * All configuration is optional — sensible defaults are applied
 * per locked design choices DT2 and DT5.
 */
type EnterstellarDevToolsProps = {
    /**
     * Optional configuration overrides.
     * @see {@link DevToolsConfig}
     */
    readonly config?: DevToolsConfig;

    /**
     * Optional cache adapter for the Cache Dashboard tab.
     * When provided, the Cache Dashboard shows live hit/miss statistics.
     * When omitted, the Cache Dashboard shows an instructional empty state.
     *
     * Accepts any object satisfying the `DevToolsCacheAdapter` protocol,
     * including the real `RenderCache` from `@enterstellar-ai/cache` (L5).
     *
     * @see {@link DevToolsCacheAdapter}
     * @see Bible §4.4 — Cache Dashboard tab
     */
    readonly cache?: DevToolsCacheAdapter;
};

// ---------------------------------------------------------------------------
// (isP0Tab removed — all 6 tabs are now functional)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Root `<EnterstellarDevTools />` component.
 *
 * Embedded browser DevTools for inspecting, debugging, and profiling
 * Enterstellar UI pipelines. Renders a floating toggle button and a slide-out
 * panel with tabbed navigation.
 *
 * **Production guard:** Returns `null` when `process.env.NODE_ENV`
 * equals `'production'`, ensuring zero runtime bytes in prod bundles
 * when tree-shaken (DT3).
 *
 * @param props - {@link EnterstellarDevToolsProps}
 * @returns The DevTools UI, or `null` in production.
 *
 * @see Bible §4.4 — DevTools module specification
 * @see Design Choice DT1 — embedded panel is P0
 * @see Design Choice DT2 — toggle via Ctrl+Shift+A and ⚡ button
 * @see Design Choice DT3 — tree-shakeable, zero prod bytes
 * @see Design Choice DT4 — P0/P1/P2 tab phasing
 */
export function EnterstellarDevTools(props: EnterstellarDevToolsProps): React.JSX.Element | null {
    const { config, cache } = props;

    // -----------------------------------------------------------------------
    // Production Guard (DT3)
    // -----------------------------------------------------------------------

    if (process.env['NODE_ENV'] === 'production') {
        return null;
    }

    // -----------------------------------------------------------------------
    // Configuration Resolution
    // -----------------------------------------------------------------------

    const maxTraces = config?.maxTraces ?? DEVTOOLS_MAX_TRACES;
    const shortcut = config?.shortcut ?? DEVTOOLS_DEFAULT_SHORTCUT;
    const position = config?.position ?? 'bottom-right';
    const defaultOpen = config?.defaultOpen ?? false;

    // -----------------------------------------------------------------------
    // Internal State
    // -----------------------------------------------------------------------

    /** Panel open/closed state. */
    const [isOpen, setIsOpen] = useState(defaultOpen);

    /** Currently active tab. */
    const [activeTab, setActiveTab] = useState<DevToolsTab>('trace-timeline');

    /** Currently selected trace (shared between Timeline and Inspector). */
    const [selectedTrace, setSelectedTrace] = useState<ZoneTrace | null>(null);

    // -----------------------------------------------------------------------
    // Handlers
    // -----------------------------------------------------------------------

    /**
     * Toggles the panel open/closed state.
     */
    const handleToggle = useCallback(() => {
        setIsOpen((prev) => !prev);
    }, []);

    /**
     * Handles tab selection. All tabs are navigable.
     * Deferred tabs (if any future tabs exist) are guarded by DEFERRED_TABS.
     */
    const handleTabClick = useCallback((tab: DevToolsTab) => {
        if (DEFERRED_TABS.has(tab)) {
            return;
        }
        setActiveTab(tab);
    }, []);

    /**
     * Handles trace selection from Timeline or Validation Log.
     * When a trace is selected, automatically switches to the Inspector tab.
     * When deselected (null), stays on current tab.
     */
    const handleSelectTrace = useCallback((trace: ZoneTrace | null) => {
        setSelectedTrace(trace);
        if (trace !== null) {
            setActiveTab('component-inspector');
        }
    }, []);

    /**
     * Closes the panel via the close button.
     */
    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    // -----------------------------------------------------------------------
    // Keyboard Shortcut (DT2)
    // -----------------------------------------------------------------------

    useKeyboardShortcut(shortcut, handleToggle);

    // -----------------------------------------------------------------------
    // Memoized Tab Bar
    // -----------------------------------------------------------------------

    /**
     * Pre-compute the selected trace ID for the Timeline's selected state.
     */
    const selectedTraceId = useMemo(
        (): string | null => selectedTrace?.id ?? null,
        [selectedTrace],
    );

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <>
            {/* Floating Toggle Button (⚡) — always visible */}
            <ToggleButton
                isOpen={isOpen}
                onToggle={handleToggle}
                position={position}
            />

            {/* Slide-Out Panel — visible only when open */}
            {isOpen && (
                <div
                    style={panelStyles['container']}
                    data-enterstellar-devtools="panel"
                    role="complementary"
                    aria-label="Enterstellar DevTools"
                >
                    {/* ─── Panel Header ─────────────────────────── */}
                    <div style={panelStyles['header']}>
                        <span style={panelStyles['headerTitle']}>
                            ⚡ Enterstellar DevTools
                        </span>
                        <button
                            type="button"
                            style={panelStyles['closeButton']}
                            onClick={handleClose}
                            aria-label="Close DevTools panel"
                        >
                            ✕
                        </button>
                    </div>

                    {/* ─── Tab Bar ──────────────────────────────── */}
                    <div
                        style={tabBarStyles['container']}
                        role="tablist"
                        aria-label="DevTools tabs"
                    >
                        {ALL_TABS.map((tab) => {
                            const isActive = tab === activeTab;
                            const isDeferred = DEFERRED_TABS.has(tab);

                            return (
                                <button
                                    key={tab}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    aria-disabled={isDeferred}
                                    style={{
                                        ...tabBarStyles['tab'],
                                        ...(isActive ? tabBarStyles['tabActive'] : {}),
                                        ...(isDeferred ? tabBarStyles['tabDisabled'] : {}),
                                    }}
                                    onClick={() => { handleTabClick(tab); }}
                                    tabIndex={isActive ? 0 : -1}
                                >
                                    {TAB_LABELS[tab]}
                                </button>
                            );
                        })}
                    </div>

                    {/* ─── Tab Content ──────────────────────────── */}
                    <div
                        style={panelStyles['content']}
                        role="tabpanel"
                        aria-label={TAB_LABELS[activeTab]}
                    >
                        {activeTab === 'trace-timeline' && (
                            <TraceTimeline
                                maxTraces={maxTraces}
                                onSelectTrace={handleSelectTrace}
                                selectedTraceId={selectedTraceId}
                            />
                        )}

                        {activeTab === 'component-inspector' && (
                            <ComponentInspector
                                selectedTrace={selectedTrace}
                            />
                        )}

                        {activeTab === 'validation-log' && (
                            <ValidationLog
                                maxTraces={maxTraces}
                                onSelectTrace={handleSelectTrace}
                            />
                        )}

                        {activeTab === 'cache-dashboard' && (
                            <CacheDashboard
                                cache={cache ?? null}
                            />
                        )}

                        {activeTab === 'performance-profiler' && (
                            <PerformanceProfiler
                                maxTraces={maxTraces}
                                onSelectTrace={handleSelectTrace}
                                selectedTraceId={selectedTraceId}
                            />
                        )}

                        {activeTab === 'replay-mode' && (
                            <ReplayMode
                                selectedTrace={selectedTrace}
                            />
                        )}

                        {DEFERRED_TABS.has(activeTab) && (
                            <PanelStub tab={activeTab} />
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
