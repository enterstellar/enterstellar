/**
 * @module @enterstellar-ai/test/__tests__/fixtures
 * @description Unit tests for VCR-style fixture save/load utilities.
 *
 * Verifies:
 * - saveFixtures() creates directory and writes JSON
 * - loadFixtures() reads and parses JSON
 * - Round-trip save → load returns identical data
 * - loadFixtures() throws ENS-5008 for missing files
 * - listFixtureFiles() returns JSON file paths
 * - Empty fixture arrays are handled correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EnterstellarError } from '@enterstellar-ai/types';

import { saveFixtures, loadFixtures, listFixtureFiles } from '../src/fixtures.js';
import type { FixtureEntry } from '../src/types.js';

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

let testDir: string;

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'enterstellar-test-fixtures-'));
});

afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test Fixtures (data)
// ---------------------------------------------------------------------------

function sampleFixtures(): readonly FixtureEntry[] {
    return [
        {
            intent: 'show patient vitals',
            response: {
                component: 'PatientVitals',
                props: { patientId: 'P-001', riskLevel: 'high' },
                confidence: 1.0,
            },
            recordedAt: Date.now(),
        },
        {
            intent: 'display alert banner',
            response: {
                component: 'AlertBanner',
                props: { severity: 'critical', message: 'System failure' },
                confidence: 0.95,
            },
            recordedAt: Date.now(),
        },
    ];
}

// ---------------------------------------------------------------------------
// saveFixtures
// ---------------------------------------------------------------------------

describe('saveFixtures()', () => {
    it('creates directory and writes fixtures as JSON', async () => {
        const subDir = join(testDir, 'nested', 'deep');
        await saveFixtures(sampleFixtures(), subDir);

        // Verify file exists by loading it back
        const loaded = await loadFixtures(subDir);
        expect(loaded).toHaveLength(2);
    });

    it('saves empty fixture array', async () => {
        await saveFixtures([], testDir);

        const loaded = await loadFixtures(testDir);
        expect(loaded).toHaveLength(0);
    });

    it('overwrites existing fixture file', async () => {
        // Save initial fixtures
        await saveFixtures(sampleFixtures(), testDir);

        // Overwrite with different data
        const updated: readonly FixtureEntry[] = [
            {
                intent: 'new intent',
                response: {
                    component: 'NewComponent',
                    props: { key: 'value' },
                    confidence: 1.0,
                },
                recordedAt: Date.now(),
            },
        ];
        await saveFixtures(updated, testDir);

        const loaded = await loadFixtures(testDir);
        expect(loaded).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// loadFixtures
// ---------------------------------------------------------------------------

describe('loadFixtures()', () => {
    it('loads and parses fixtures from a directory', async () => {
        await saveFixtures(sampleFixtures(), testDir);

        const loaded = await loadFixtures(testDir);

        expect(loaded).toHaveLength(2);
        expect(loaded[0]).toEqual(expect.objectContaining({
            intent: 'show patient vitals',
        }));
        expect(loaded[1]).toEqual(expect.objectContaining({
            intent: 'display alert banner',
        }));
    });

    it('preserves all fixture entry fields on round-trip', async () => {
        const original = sampleFixtures();
        await saveFixtures(original, testDir);

        const loaded = await loadFixtures(testDir);

        expect(loaded).toEqual(original);
    });

    it('throws EnterstellarError ENS-5008 for non-existent directory', async () => {
        const badDir = join(testDir, 'non-existent');

        await expect(loadFixtures(badDir)).rejects.toThrow(EnterstellarError);

        try {
            await loadFixtures(badDir);
        } catch (error: unknown) {
            expect((error as EnterstellarError).code).toBe('ENS-5008');
        }
    });

    it('throws EnterstellarError ENS-5008 for corrupted JSON', async () => {
        // Write invalid JSON directly
        await mkdir(join(testDir, 'corrupt'), { recursive: true });
        await writeFile(
            join(testDir, 'corrupt', 'enterstellar-fixtures.json'),
            '{ INVALID JSON }}}}',
            'utf-8',
        );

        await expect(
            loadFixtures(join(testDir, 'corrupt')),
        ).rejects.toThrow(EnterstellarError);
    });

    it('throws EnterstellarError ENS-5008 for non-array JSON', async () => {
        // Write valid JSON that is not an array
        await writeFile(
            join(testDir, 'enterstellar-fixtures.json'),
            JSON.stringify({ notAnArray: true }),
            'utf-8',
        );

        await expect(loadFixtures(testDir)).rejects.toThrow(EnterstellarError);
        await expect(loadFixtures(testDir)).rejects.toThrow(/does not contain an array/);
    });

    it('error includes helpful recovery message', async () => {
        const badDir = join(testDir, 'missing');

        try {
            await loadFixtures(badDir);
            expect.fail('Expected EnterstellarError');
        } catch (error: unknown) {
            expect(error).toBeInstanceOf(EnterstellarError);
            const enterstellarErr = error as EnterstellarError;
            expect(enterstellarErr.message).toContain('record mode');
            expect(enterstellarErr.module).toBe('test');
        }
    });
});

// ---------------------------------------------------------------------------
// listFixtureFiles
// ---------------------------------------------------------------------------

describe('listFixtureFiles()', () => {
    it('returns JSON file paths from a directory', async () => {
        // Create multiple JSON files
        await writeFile(join(testDir, 'fixtures-1.json'), '[]', 'utf-8');
        await writeFile(join(testDir, 'fixtures-2.json'), '[]', 'utf-8');

        const files = await listFixtureFiles(testDir);

        expect(files).toHaveLength(2);
        expect(files[0]).toContain('.json');
        expect(files[1]).toContain('.json');
    });

    it('excludes non-JSON files', async () => {
        await writeFile(join(testDir, 'readme.md'), '# Fixtures', 'utf-8');
        await writeFile(join(testDir, 'data.json'), '[]', 'utf-8');
        await writeFile(join(testDir, 'notes.txt'), 'notes', 'utf-8');

        const files = await listFixtureFiles(testDir);

        expect(files).toHaveLength(1);
        expect(files[0]).toContain('data.json');
    });

    it('returns empty array for directory with no JSON files', async () => {
        await writeFile(join(testDir, 'readme.md'), '# No JSON here', 'utf-8');

        const files = await listFixtureFiles(testDir);

        expect(files).toHaveLength(0);
    });

    it('throws EnterstellarError ENS-5008 for non-existent directory', async () => {
        const badDir = join(testDir, 'ghost');

        await expect(listFixtureFiles(badDir)).rejects.toThrow(EnterstellarError);
    });
});
