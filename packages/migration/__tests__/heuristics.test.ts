/**
 * @module @enterstellar-ai/migration/__tests__/heuristics
 * @description Unit tests for the heuristic fallback functions.
 *
 * Tests cover all 3 functions (`inferCategory`, `generateHeuristicIntent`,
 * `generateHeuristicDescription`) and the `KNOWN_CATEGORIES` alignment
 * with the 8 predefined `ComponentCategory` values.
 *
 * **Test methodology:** Pure function tests — no `ts-morph`, no filesystem,
 * no mocking. Inputs are strings, outputs are strings. Deterministic.
 */

import { describe, it, expect } from 'vitest';

import {
    inferCategory,
    generateHeuristicIntent,
    generateHeuristicDescription,
} from '../src/extract/heuristics.js';

// ---------------------------------------------------------------------------
// inferCategory()
// ---------------------------------------------------------------------------

describe('inferCategory', () => {
    // --- Known category matches ---

    it('matches "clinical" directory', () => {
        expect(inferCategory('src/components/clinical/PatientCard.tsx')).toBe('clinical');
    });

    it('matches "admin" directory', () => {
        expect(inferCategory('src/admin/Dashboard.tsx')).toBe('admin');
    });

    it('matches "navigation" directory', () => {
        expect(inferCategory('components/navigation/Sidebar.tsx')).toBe('navigation');
    });

    it('matches "data-display" directory (hyphenated)', () => {
        expect(inferCategory('src/data-display/Chart.tsx')).toBe('data-display');
    });

    it('matches "form" directory', () => {
        expect(inferCategory('src/components/form/TextInput.tsx')).toBe('form');
    });

    it('matches "feedback" directory', () => {
        expect(inferCategory('ui/feedback/Toast.tsx')).toBe('feedback');
    });

    it('matches "layout" directory', () => {
        expect(inferCategory('src/layout/Grid.tsx')).toBe('layout');
    });

    it('matches "utility" directory explicitly', () => {
        expect(inferCategory('src/utility/Spacer.tsx')).toBe('utility');
    });

    // --- Case insensitivity ---

    it('matches case-insensitively — uppercase', () => {
        expect(inferCategory('src/CLINICAL/PatientCard.tsx')).toBe('clinical');
    });

    it('matches case-insensitively — mixed case', () => {
        expect(inferCategory('src/Feedback/Alert.tsx')).toBe('feedback');
    });

    it('matches case-insensitively — all caps hyphenated', () => {
        expect(inferCategory('src/DATA-DISPLAY/Table.tsx')).toBe('data-display');
    });

    // --- Fallback to utility ---

    it('falls back to "utility" for generic path — components/', () => {
        expect(inferCategory('src/components/Button.tsx')).toBe('utility');
    });

    it('falls back to "utility" for generic path — ui/', () => {
        expect(inferCategory('src/ui/Card.tsx')).toBe('utility');
    });

    it('falls back to "utility" for generic path — shared/', () => {
        expect(inferCategory('lib/shared/Tooltip.tsx')).toBe('utility');
    });

    it('falls back to "utility" for root-level file', () => {
        expect(inferCategory('Button.tsx')).toBe('utility');
    });

    // --- Priority (leftmost match wins) ---

    it('returns the leftmost match when path contains multiple categories', () => {
        // clinical/ is before form/ — clinical wins
        expect(inferCategory('src/clinical/form/PatientForm.tsx')).toBe('clinical');
    });

    it('returns the leftmost match — reversed order', () => {
        // form/ is before clinical/ — form wins
        expect(inferCategory('src/form/clinical/WeirdComponent.tsx')).toBe('form');
    });

    // --- Windows paths ---

    it('handles Windows-style backslash separators', () => {
        expect(inferCategory('src\\feedback\\Toast.tsx')).toBe('feedback');
    });

    it('handles mixed separators', () => {
        expect(inferCategory('src/components\\clinical\\PatientCard.tsx')).toBe('clinical');
    });

    // --- Edge cases ---

    it('ignores filename even if it contains a category name', () => {
        // The filename is "clinical.tsx" but the directory is "components/"
        // — should NOT match clinical from the filename
        expect(inferCategory('src/components/clinical.tsx')).toBe('utility');
    });

    it('handles empty path string', () => {
        expect(inferCategory('')).toBe('utility');
    });

    it('handles path with only filename', () => {
        expect(inferCategory('Component.tsx')).toBe('utility');
    });

    it('handles deeply nested path with match', () => {
        expect(inferCategory('packages/app/src/features/admin/users/UserList.tsx')).toBe('admin');
    });
});

// ---------------------------------------------------------------------------
// generateHeuristicIntent()
// ---------------------------------------------------------------------------

describe('generateHeuristicIntent', () => {
    it('generates "Render {name}" for a standard component', () => {
        expect(generateHeuristicIntent('PatientCard')).toBe('Render PatientCard');
    });

    it('generates "Render {name}" for a single-word component', () => {
        expect(generateHeuristicIntent('Button')).toBe('Render Button');
    });

    it('generates "Render {name}" for a multi-word component', () => {
        expect(generateHeuristicIntent('NavigationSidebarMenu')).toBe('Render NavigationSidebarMenu');
    });

    it('handles short component name', () => {
        expect(generateHeuristicIntent('A')).toBe('Render A');
    });
});

// ---------------------------------------------------------------------------
// generateHeuristicDescription()
// ---------------------------------------------------------------------------

describe('generateHeuristicDescription', () => {
    it('returns TODO placeholder when no deprecation', () => {
        expect(generateHeuristicDescription('Button')).toBe('TODO: Add description');
    });

    it('includes deprecation notice when deprecated is provided', () => {
        expect(generateHeuristicDescription('OldWidget', 'Use NewWidget instead')).toBe(
            'TODO: Add description (note: component is @deprecated — Use NewWidget instead)',
        );
    });

    it('includes deprecation notice even when deprecated text is short', () => {
        expect(generateHeuristicDescription('Legacy', 'v2')).toBe(
            'TODO: Add description (note: component is @deprecated — v2)',
        );
    });

    it('returns TODO placeholder when deprecated is undefined (explicit)', () => {
        expect(generateHeuristicDescription('Card', undefined)).toBe('TODO: Add description');
    });

    it('returns consistent output regardless of component name', () => {
        // v1 does not use the component name in the description
        expect(generateHeuristicDescription('Foo')).toBe(generateHeuristicDescription('Bar'));
    });
});
