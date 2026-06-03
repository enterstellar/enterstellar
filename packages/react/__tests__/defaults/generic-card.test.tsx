/**
 * @module @enterstellar-ai/react/__tests__/defaults/generic-card.test
 * @description Unit tests for the `GenericCard` fallback component.
 *
 * Validates:
 * - Renders the component name and "Fallback" badge.
 * - Displays compilation errors with codes and messages.
 * - Shows a fallback message when errors array is empty.
 * - Collapsible original props section.
 * - Handles circular references in props gracefully.
 * - All visual elements have correct `data-enterstellar-*` attributes.
 *
 * @see Design Choice RE1 — concrete `GenericCard` fallback.
 * @see Design Choice C6 — receives error details as props.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CompilationError } from '@enterstellar-ai/types';
import { GenericCard } from '../../src/defaults/generic-card.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Standard compilation errors used across test cases.
 * Mirrors the `CompilationError` shape from `@enterstellar-ai/types/compiler.ts`.
 */
const MOCK_ERRORS: readonly CompilationError[] = [
    {
        code: 'ENS-2001',
        path: 'props.riskLevel',
        message: 'Expected enum value (low | medium | high | critical), received "extreme".',
        received: 'extreme',
        expected: 'low | medium | high | critical',
    },
    {
        code: 'ENS-2003',
        path: 'props.patientId',
        message: 'Expected string (UUID format), received number.',
        received: 12345,
        expected: 'string (UUID)',
    },
] as const;

/**
 * Mock original props — the props that were intended for the component.
 */
const MOCK_PROPS: Readonly<Record<string, unknown>> = {
    patientId: 12345,
    riskLevel: 'extreme',
    showHistory: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenericCard', () => {
    it('renders the component name', () => {
        render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        expect(screen.getByText('PatientRiskPanel')).toBeDefined();
    });

    it('renders the "Fallback" badge', () => {
        render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        expect(screen.getByText('Fallback')).toBeDefined();
    });

    it('renders error codes as badges', () => {
        render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        expect(screen.getByText('ENS-2001')).toBeDefined();
        expect(screen.getByText('ENS-2003')).toBeDefined();
    });

    it('renders error messages with field paths', () => {
        render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        // Error messages should be present
        expect(
            screen.getByText(
                /Expected enum value.*received "extreme"/,
            ),
        ).toBeDefined();
    });

    it('renders fallback message when errors array is empty', () => {
        render(
            <GenericCard
                originalComponent="UnknownWidget"
                errors={[]}
                originalProps={{}}
            />,
        );

        expect(
            screen.getByText(/Compilation failed — no error details available/),
        ).toBeDefined();
    });

    it('has correct data-enterstellar attributes', () => {
        const { container } = render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        const card = container.querySelector('[data-enterstellar-generic-card]');
        expect(card).not.toBeNull();
        expect(card?.getAttribute('data-enterstellar-fallback-for')).toBe('PatientRiskPanel');
    });

    it('has role="alert" for accessibility', () => {
        render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        expect(screen.getByRole('alert')).toBeDefined();
    });

    it('toggles original props visibility', () => {
        const { container } = render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        // Props should be hidden initially
        expect(container.querySelector('[data-enterstellar-props-detail]')).toBeNull();

        // Click "Show original props" toggle
        const toggle = screen.getByText(/Show original props/);
        fireEvent.click(toggle);

        // Props should now be visible
        const propsBlock = container.querySelector('[data-enterstellar-props-detail]');
        expect(propsBlock).not.toBeNull();
        expect(propsBlock?.textContent).toContain('"patientId": 12345');
        expect(propsBlock?.textContent).toContain('"riskLevel": "extreme"');

        // Click again to hide
        fireEvent.click(screen.getByText(/Hide original props/));
        expect(container.querySelector('[data-enterstellar-props-detail]')).toBeNull();
    });

    it('hides props toggle when originalProps is empty', () => {
        render(
            <GenericCard
                originalComponent="EmptyComponent"
                errors={MOCK_ERRORS}
                originalProps={{}}
            />,
        );

        // No toggle should be present for empty props
        expect(screen.queryByText(/original props/)).toBeNull();
    });

    it('handles circular references in props gracefully', () => {
        // Create a circular reference
        const circular: Record<string, unknown> = { name: 'test' };
        circular['self'] = circular;

        const { container } = render(
            <GenericCard
                originalComponent="CircularComponent"
                errors={[]}
                originalProps={circular}
            />,
        );

        // Toggle props open
        fireEvent.click(screen.getByText(/Show original props/));

        const propsBlock = container.querySelector('[data-enterstellar-props-detail]');
        expect(propsBlock).not.toBeNull();
        expect(propsBlock?.textContent).toContain('circular reference');
    });

    it('renders error list with correct aria-label', () => {
        render(
            <GenericCard
                originalComponent="PatientRiskPanel"
                errors={MOCK_ERRORS}
                originalProps={MOCK_PROPS}
            />,
        );

        expect(screen.getByLabelText('Compilation errors')).toBeDefined();
    });
});
