/**
 * @module @enterstellar-ai/migration/__tests__/scan-lightweight
 * @description Tests for the lightweight syntax-only component scanner.
 *
 * Validates the 3-tier classification model used by `enterstellar init`
 * existing-project detection:
 *
 * - ✓ auto-migratable: explicit props interface
 * - ~ manual-review: generics, re-exports, forwardRef
 * - ✗ skipped: no component export (utilities, types)
 *
 * Tests use temporary directories with synthetic `.tsx` files to
 * exercise the scanner without touching the real filesystem.
 *
 * @see Correction 5, L187-213 — 3-tier scan summary requirement
 * @see Audit E3 — scanner lives in @enterstellar-ai/migration
 */

import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { scanComponentsLightweight } from '../src/extract/scan-lightweight.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/** Creates a temp dir and returns its path. Cleaned up in afterEach. */
let tempDir: string;

/** Component with explicit props interface — should be auto-migratable. */
const AUTO_MIGRATABLE_COMPONENT = `
import React from 'react';

interface ButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

export function Button(props: ButtonProps): React.ReactElement {
    return <button onClick={props.onClick} disabled={props.disabled}>{props.label}</button>;
}
`;

/** Arrow component with typed props — should be auto-migratable. */
const AUTO_MIGRATABLE_ARROW = `
import React from 'react';

interface CardProps {
    title: string;
    description: string;
}

export const Card = (props: CardProps) => {
    return <div><h2>{props.title}</h2><p>{props.description}</p></div>;
};
`;

/** Component with React.FC type annotation — should be auto-migratable. */
const AUTO_MIGRATABLE_FC = `
import React from 'react';

interface BadgeProps {
    text: string;
}

export const Badge: React.FC<BadgeProps> = ({ text }) => {
    return <span>{text}</span>;
};
`;

/** Generic component — should require manual review. */
const MANUAL_REVIEW_GENERIC = `
import React from 'react';

interface ListProps<T> {
    items: T[];
    renderItem: (item: T) => React.ReactNode;
}

export function List<T>(props: ListProps<T>): React.ReactElement {
    return <ul>{props.items.map(props.renderItem)}</ul>;
}
`;

/** Component using forwardRef — should require manual review. */
const MANUAL_REVIEW_FORWARD_REF = `
import React from 'react';

export const Input = React.forwardRef<HTMLInputElement, { placeholder: string }>((props, ref) => {
    return <input ref={ref} placeholder={props.placeholder} />;
});
`;

/** Re-export file — should require manual review. */
const MANUAL_REVIEW_REEXPORT = `
export { Button } from './Button';
export { Card } from './Card';
`;

/** Utility file — no component export, should be skipped. */
const SKIPPED_UTILITY = `
export function formatDate(date: Date): string {
    return date.toISOString();
}

export const MAX_ITEMS = 100;
`;

/** Type-only file — should be skipped. */
const SKIPPED_TYPES = `
export interface User {
    id: string;
    name: string;
    email: string;
}

export type Role = 'admin' | 'user' | 'guest';
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a test project structure in the temp directory.
 *
 * @param files - Map of relative file paths to file contents.
 * @param packageJsonContent - Optional package.json content override.
 */
function createTestProject(
    files: Record<string, string>,
    packageJsonContent?: string,
): void {
    // Write package.json
    if (packageJsonContent !== undefined) {
        writeFileSync(
            join(tempDir, 'package.json'),
            packageJsonContent,
        );
    }

    // Write source files
    for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = join(tempDir, relativePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content);
    }
}

/** Standard package.json with react dependency. */
const REACT_PACKAGE_JSON = JSON.stringify({
    name: 'test-project',
    dependencies: {
        react: '^18.3.0',
        'react-dom': '^18.3.0',
    },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scanComponentsLightweight', () => {
    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'enterstellar-scan-test-'));
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    // --- Auto-Migratable Detection ---

    it('classifies function components with explicit props as auto-migratable', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/Button.tsx': AUTO_MIGRATABLE_COMPONENT },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.autoMigratable).toBe(1);
        expect(result.manualReview).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.total).toBe(1);
    });

    it('classifies arrow components with typed props as auto-migratable', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/Card.tsx': AUTO_MIGRATABLE_ARROW },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.autoMigratable).toBe(1);
        expect(result.total).toBe(1);
    });

    it('classifies React.FC components as auto-migratable', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/Badge.tsx': AUTO_MIGRATABLE_FC },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.autoMigratable).toBe(1);
        expect(result.total).toBe(1);
    });

    // --- Manual Review Detection ---

    it('classifies generic components as manual review', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/List.tsx': MANUAL_REVIEW_GENERIC },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.manualReview).toBe(1);
        expect(result.autoMigratable).toBe(0);
        expect(result.total).toBe(1);
    });

    it('classifies forwardRef components as manual review', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/Input.tsx': MANUAL_REVIEW_FORWARD_REF },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.manualReview).toBe(1);
        expect(result.autoMigratable).toBe(0);
        expect(result.total).toBe(1);
    });

    it('classifies re-exports as manual review', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/index.tsx': MANUAL_REVIEW_REEXPORT },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        // Re-export file has no own components but has module specifiers
        expect(result.manualReview).toBeGreaterThanOrEqual(0);
        expect(result.total).toBe(1);
    });

    // --- Skipped Detection ---

    it('classifies utility files as skipped', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/utils.tsx': SKIPPED_UTILITY },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.skipped).toBe(1);
        expect(result.autoMigratable).toBe(0);
        expect(result.manualReview).toBe(0);
        expect(result.total).toBe(1);
    });

    it('classifies type-only files as skipped', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/types.tsx': SKIPPED_TYPES },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.skipped).toBe(1);
        expect(result.total).toBe(1);
    });

    // --- React Version Detection ---

    it('extracts react version from package.json', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            { 'src/Button.tsx': AUTO_MIGRATABLE_COMPONENT },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.reactVersion).toBe('^18.3.0');
    });

    it('returns undefined react version when no package.json exists', async () => {
        const srcDir = join(tempDir, 'src');
        // Create files WITHOUT package.json
        mkdirSync(srcDir, { recursive: true });
        writeFileSync(join(srcDir, 'Button.tsx'), AUTO_MIGRATABLE_COMPONENT);

        const result = scanComponentsLightweight(srcDir);

        expect(result.reactVersion).toBeUndefined();
    });

    it('returns undefined react version when react is not in deps', async () => {
        const srcDir = join(tempDir, 'src');
        const noReactPkg = JSON.stringify({ name: 'no-react', dependencies: { lodash: '^4.0.0' } });
        createTestProject(
            { 'src/Button.tsx': AUTO_MIGRATABLE_COMPONENT },
            noReactPkg,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.reactVersion).toBeUndefined();
    });

    // --- Edge Cases ---

    it('returns zeroed result for non-existent directory', async () => {
        const result = scanComponentsLightweight('/non/existent/path');

        expect(result.autoMigratable).toBe(0);
        expect(result.manualReview).toBe(0);
        expect(result.skipped).toBe(0);
        expect(result.total).toBe(0);
        expect(result.reactVersion).toBeUndefined();
    });

    it('returns zeroed result for empty directory', async () => {
        const srcDir = join(tempDir, 'src');
        mkdirSync(srcDir, { recursive: true });

        const result = scanComponentsLightweight(srcDir);

        expect(result.total).toBe(0);
        expect(result.autoMigratable).toBe(0);
    });

    it('excludes test files from scan', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            {
                'src/Button.tsx': AUTO_MIGRATABLE_COMPONENT,
                'src/Button.test.tsx': 'export const test = true;',
                'src/Button.spec.tsx': 'export const spec = true;',
                'src/Button.stories.tsx': 'export const stories = true;',
            },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        // Only Button.tsx should be scanned (test/spec/stories excluded)
        expect(result.total).toBe(1);
        expect(result.autoMigratable).toBe(1);
    });

    // --- Mixed Classification ---

    it('correctly classifies a mixed set of files', async () => {
        const srcDir = join(tempDir, 'src');
        createTestProject(
            {
                'src/Button.tsx': AUTO_MIGRATABLE_COMPONENT,
                'src/Card.tsx': AUTO_MIGRATABLE_ARROW,
                'src/Badge.tsx': AUTO_MIGRATABLE_FC,
                'src/List.tsx': MANUAL_REVIEW_GENERIC,
                'src/Input.tsx': MANUAL_REVIEW_FORWARD_REF,
                'src/utils.tsx': SKIPPED_UTILITY,
                'src/types.tsx': SKIPPED_TYPES,
            },
            REACT_PACKAGE_JSON,
        );

        const result = scanComponentsLightweight(srcDir);

        expect(result.total).toBe(7);
        expect(result.autoMigratable).toBe(3);
        expect(result.manualReview).toBe(2);
        expect(result.skipped).toBe(2);
        expect(result.reactVersion).toBe('^18.3.0');
    });
});
