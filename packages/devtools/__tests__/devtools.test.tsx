/**
 * @module @enterstellar-ai/devtools/__tests__/enterstellar-devtools
 * @description Unit tests for the root `<EnterstellarDevTools />` component.
 *
 * Tests cover:
 * - Production guard — returns null in production
 * - Toggle button rendering
 * - Panel open/close via toggle button
 * - Tab bar rendering with all 6 tabs
 * - Tab navigation between P0 tabs
 * - All 6 tabs are navigable (no deferred stubs)
 * - Panel header with close button
 * - Default configuration resolution
 *
 * @see Bible §4.4 — DevTools module specification
 * @see Design Choices DT1–DT4
 */

/// <reference path="../env.d.ts" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ZoneTrace } from '@enterstellar-ai/types';
import { EnterstellarDevTools } from '../src/devtools.js';
import { createEnterstellarContextWrapper } from './helpers/context-wrapper.js';

// ---------------------------------------------------------------------------
// Mock @enterstellar-ai/react
// ---------------------------------------------------------------------------

let mockStoreTraces: ZoneTrace[] = [];

vi.mock('@enterstellar-ai/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@enterstellar-ai/react')>();
    return {
        ...actual,
        useEnterstellarStore: (selector: (state: Record<string, unknown>) => unknown) => {
            return selector({ traces: mockStoreTraces });
        },
    };
});

/**
 * Renders a component wrapped in `EnterstellarContext.Provider` with the mock store.
 */
function renderWithEnterstellar(ui: React.ReactElement) {
    const { wrapper } = createEnterstellarContextWrapper(mockStoreTraces);
    return render(ui, { wrapper });
}

// ---------------------------------------------------------------------------
// Environment Helpers
// ---------------------------------------------------------------------------

const originalNodeEnv = process.env['NODE_ENV'];

function setNodeEnv(value: string): void {
    // Cast to mutable record — test-only helper for DT3 production guard tests.
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = value;
}

function restoreNodeEnv(): void {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = originalNodeEnv;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnterstellarDevTools', () => {
    beforeEach(() => {
        mockStoreTraces = [];
        setNodeEnv('development');
    });

    afterEach(() => {
        restoreNodeEnv();
    });

    // -------------------------------------------------------------------
    // Production Guard (DT3)
    // -------------------------------------------------------------------

    it('returns null when NODE_ENV is production', () => {
        setNodeEnv('production');
        const { container } = renderWithEnterstellar(<EnterstellarDevTools />);
        expect(container.innerHTML).toBe('');
    });

    it('renders in development mode', () => {
        renderWithEnterstellar(<EnterstellarDevTools />);
        // Should render the toggle button
        expect(screen.getByRole('button', { name: /enterstellar devtools/i })).toBeDefined();
    });

    // -------------------------------------------------------------------
    // Toggle Button
    // -------------------------------------------------------------------

    it('renders the ⚡ toggle button', () => {
        renderWithEnterstellar(<EnterstellarDevTools />);
        const button = screen.getByRole('button', { name: /enterstellar devtools/i });
        expect(button).toBeDefined();
        expect(button.textContent).toContain('⚡');
    });

    it('opens panel when toggle button is clicked', () => {
        renderWithEnterstellar(<EnterstellarDevTools />);
        const toggleButton = screen.getByRole('button', { name: /open enterstellar devtools/i });
        fireEvent.click(toggleButton);
        expect(screen.getByText('⚡ Enterstellar DevTools')).toBeDefined();
    });

    // -------------------------------------------------------------------
    // Panel Header
    // -------------------------------------------------------------------

    it('renders panel header with title when open', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByText('⚡ Enterstellar DevTools')).toBeDefined();
    });

    it('renders close button in panel header', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByLabelText('Close DevTools panel')).toBeDefined();
    });

    it('closes panel when close button is clicked', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const closeButton = screen.getByLabelText('Close DevTools panel');
        fireEvent.click(closeButton);
        // Panel header should no longer be visible
        expect(screen.queryByText('⚡ Enterstellar DevTools')).toBeNull();
    });

    // -------------------------------------------------------------------
    // Tab Bar
    // -------------------------------------------------------------------

    it('renders all 6 tab buttons when panel is open', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const tablist = screen.getByRole('tablist');
        const tabs = within(tablist).getAllByRole('tab');
        expect(tabs).toHaveLength(6);
    });

    it('renders P0 tab labels', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByRole('tab', { name: 'Timeline' })).toBeDefined();
        expect(screen.getByRole('tab', { name: 'Inspector' })).toBeDefined();
        expect(screen.getByRole('tab', { name: 'Validation' })).toBeDefined();
    });

    it('renders deferred tab labels', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByRole('tab', { name: 'Cache' })).toBeDefined();
        expect(screen.getByRole('tab', { name: 'Performance' })).toBeDefined();
        expect(screen.getByRole('tab', { name: 'Replay' })).toBeDefined();
    });

    it('marks Timeline tab as active by default', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const timelineTab = screen.getByRole('tab', { name: 'Timeline' });
        expect(timelineTab.getAttribute('aria-selected')).toBe('true');
    });

    it('marks all implemented tabs as enabled', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const cacheTab = screen.getByRole('tab', { name: 'Cache' });
        expect(cacheTab.getAttribute('aria-disabled')).toBe('false');
    });

    // -------------------------------------------------------------------
    // Tab Navigation
    // -------------------------------------------------------------------

    it('switches to Inspector tab when clicked', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const inspectorTab = screen.getByRole('tab', { name: 'Inspector' });
        fireEvent.click(inspectorTab);
        expect(inspectorTab.getAttribute('aria-selected')).toBe('true');
    });

    it('switches to Validation tab when clicked', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const validationTab = screen.getByRole('tab', { name: 'Validation' });
        fireEvent.click(validationTab);
        expect(validationTab.getAttribute('aria-selected')).toBe('true');
    });

    it('switches to Cache tab when clicked', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const cacheTab = screen.getByRole('tab', { name: 'Cache' });
        fireEvent.click(cacheTab);
        // Cache tab should now be active
        expect(cacheTab.getAttribute('aria-selected')).toBe('true');
    });

    // -------------------------------------------------------------------
    // Panel Content
    // -------------------------------------------------------------------

    it('renders Trace Timeline panel by default', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        // Timeline shows "No traces yet" empty state
        expect(screen.getByText(/no traces yet/i)).toBeDefined();
    });

    it('renders Component Inspector empty state when tab is selected', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const inspectorTab = screen.getByRole('tab', { name: 'Inspector' });
        fireEvent.click(inspectorTab);
        expect(screen.getByText(/select a trace/i)).toBeDefined();
    });

    // -------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------

    it('respects defaultOpen=true config', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByText('⚡ Enterstellar DevTools')).toBeDefined();
    });

    it('starts closed by default', () => {
        renderWithEnterstellar(<EnterstellarDevTools />);
        expect(screen.queryByText('⚡ Enterstellar DevTools')).toBeNull();
    });

    // -------------------------------------------------------------------
    // Accessibility
    // -------------------------------------------------------------------

    it('has complementary role for the panel', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByRole('complementary')).toBeDefined();
    });

    it('has aria-label on the panel', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        const panel = screen.getByRole('complementary');
        expect(panel.getAttribute('aria-label')).toBe('Enterstellar DevTools');
    });

    it('has tablist role for tab bar', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByRole('tablist')).toBeDefined();
    });

    it('has tabpanel role for content area', () => {
        renderWithEnterstellar(<EnterstellarDevTools config={{ defaultOpen: true }} />);
        expect(screen.getByRole('tabpanel')).toBeDefined();
    });
});
