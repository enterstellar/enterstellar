/**
 * @module @enterstellar-ai/react/__tests__/provenance-badge.test
 * @description Unit tests for `<ProvenanceBadge>`.
 *
 * Covers:
 * - Renders badge when `visible={true}`.
 * - Returns null when `visible={false}`.
 * - Displays agent name and compile time.
 * - Renders status indicator dot.
 * - Has correct data attribute and aria attributes.
 * - Shows forge mode info in title when available.
 *
 * @see Design Choice RE7 — absolute-positioned trust indicator
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ProvenanceBadge } from '../src/provenance-badge.js';
import type { CompilationProvenance } from '@enterstellar-ai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvenance(overrides?: Partial<CompilationProvenance>): CompilationProvenance {
    return {
        agent: 'gpt-4o',
        registry: 'main',
        compiledAt: '2026-02-20T12:00:00.000Z',
        compilerVersion: '0.1.0',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('<ProvenanceBadge>', () => {
    it('renders nothing when visible={false}', () => {
        const { container } = render(
            <ProvenanceBadge provenance={makeProvenance()} visible={false} />,
        );

        expect(container.innerHTML).toBe('');
    });

    it('renders badge when visible={true}', () => {
        const { container } = render(
            <ProvenanceBadge provenance={makeProvenance()} visible={true} />,
        );

        const badge = container.querySelector('[data-enterstellar-provenance]');
        expect(badge).not.toBeNull();
    });

    it('displays the agent name', () => {
        const { container } = render(
            <ProvenanceBadge
                provenance={makeProvenance({ agent: 'claude-sonnet' })}
                visible={true}
            />,
        );

        expect(container.textContent).toContain('claude-sonnet');
    });

    it('has aria-hidden="true" (decorative element)', () => {
        const { container } = render(
            <ProvenanceBadge provenance={makeProvenance()} visible={true} />,
        );

        const badge = container.querySelector('[data-enterstellar-provenance]');
        expect(badge?.getAttribute('aria-hidden')).toBe('true');
    });

    it('has title attribute with full provenance info', () => {
        const { container } = render(
            <ProvenanceBadge
                provenance={makeProvenance({ agent: 'gpt-4o', registry: 'main' })}
                visible={true}
            />,
        );

        const badge = container.querySelector('[data-enterstellar-provenance]');
        const title = badge?.getAttribute('title') ?? '';

        expect(title).toContain('Agent: gpt-4o');
        expect(title).toContain('Registry: main');
        expect(title).toContain('Compiled:');
    });

    it('shows forge mode in title when present', () => {
        const { container } = render(
            <ProvenanceBadge
                provenance={makeProvenance({ forgeMode: 'local' })}
                visible={true}
            />,
        );

        const badge = container.querySelector('[data-enterstellar-provenance]');
        const title = badge?.getAttribute('title') ?? '';

        expect(title).toContain('local');
    });

    it('renders status indicator dot', () => {
        const { container } = render(
            <ProvenanceBadge provenance={makeProvenance()} visible={true} />,
        );

        // The status dot is a <span> inside the badge
        const badge = container.querySelector('[data-enterstellar-provenance]');
        const innerSpans = badge?.querySelectorAll('span');

        // Should have at least 1 inner span (the dot)
        expect(innerSpans?.length).toBeGreaterThanOrEqual(1);
    });

    it('has position:absolute and pointer-events:none', () => {
        const { container } = render(
            <ProvenanceBadge provenance={makeProvenance()} visible={true} />,
        );

        const badge = container.querySelector('[data-enterstellar-provenance]') as HTMLElement;
        expect(badge.style.position).toBe('absolute');
        expect(badge.style.pointerEvents).toBe('none');
    });
});
