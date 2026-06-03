/**
 * @module @enterstellar-ai/test/fixtures
 * @description VCR-style fixture save/load utilities for integration tests.
 *
 * Fixtures capture intent → response mappings as JSON files in a directory
 * (conventionally `.enterstellar-fixtures/`). They enable deterministic replay of
 * integration test scenarios without requiring live LLM connections.
 *
 * ## Workflow
 *
 * 1. **Record:** Run tests with a live agent, call `saveFixtures()` with results.
 * 2. **Replay:** Call `loadFixtures()` and pass entries to `createTestHarness()`.
 *
 * ```ts
 * // Record mode
 * const entries: FixtureEntry[] = [...]; // captured from live run
 * await saveFixtures(entries, '.enterstellar-fixtures');
 *
 * // Replay mode
 * const fixtures = await loadFixtures('.enterstellar-fixtures');
 * const mockResponses: Record<string, ComponentIntent> = {};
 * for (const f of fixtures) { mockResponses[f.intent] = f.response; }
 * const harness = createTestHarness({ registry, mockResponses });
 * ```
 *
 * @see Design Choice TE1 — VCR fixtures for integration tests.
 * @see Design Choice TE7 — regression mode replays VCR fixtures.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { EnterstellarError, ComponentIntentSchema } from '@enterstellar-ai/types';
import { z } from 'zod';

import type { FixtureEntry } from './types.js';

// ---------------------------------------------------------------------------
// Zod Schema for Runtime Validation
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating `FixtureEntry` data loaded from disk.
 *
 * Uses `ComponentIntentSchema` from `@enterstellar-ai/types` to validate the nested
 * `response` field. This ensures loaded fixtures conform to the expected
 * shape and prevents corrupt or tampered fixture files from silently
 * passing through.
 *
 * @see Design Choice L8 — Zod for runtime validation.
 */
const FixtureEntrySchema = z.object({
    intent: z.string(),
    response: ComponentIntentSchema,
    recordedAt: z.number(),
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default filename for the fixture bundle. */
const FIXTURE_FILENAME = 'enterstellar-fixtures.json';

// ---------------------------------------------------------------------------
// saveFixtures
// ---------------------------------------------------------------------------

/**
 * Saves fixture entries to a directory as a JSON file.
 *
 * Creates the directory recursively if it does not exist. Writes all entries
 * to a single `enterstellar-fixtures.json` file within the directory.
 *
 * @param fixtures - Array of fixture entries to persist.
 * @param directory - Absolute or relative path to the fixtures directory.
 * @throws {EnterstellarError} Code `ENS-5007` if the write operation fails.
 *
 * @example
 * ```ts
 * await saveFixtures(entries, '.enterstellar-fixtures');
 * // Creates .enterstellar-fixtures/enterstellar-fixtures.json
 * ```
 */
export async function saveFixtures(
    fixtures: readonly FixtureEntry[],
    directory: string,
): Promise<void> {
    try {
        // Create directory recursively if it does not exist.
        await mkdir(directory, { recursive: true });

        const filePath = join(directory, FIXTURE_FILENAME);
        const content = JSON.stringify(fixtures, null, 2);

        await writeFile(filePath, content, 'utf-8');
    } catch (error: unknown) {
        throw new EnterstellarError(
            'ENS-5007',
            'test',
            `Failed to save fixtures to "${directory}": ${error instanceof Error ? error.message : String(error)
            }`,
            true, // Recoverable — retry may succeed (e.g., permissions fixed)
            error,
        );
    }
}

// ---------------------------------------------------------------------------
// loadFixtures
// ---------------------------------------------------------------------------

/**
 * Loads fixture entries from a directory.
 *
 * Reads the `enterstellar-fixtures.json` file within the given directory and
 * parses it as an array of `FixtureEntry` objects.
 *
 * @param directory - Absolute or relative path to the fixtures directory.
 * @returns Array of fixture entries loaded from disk.
 * @throws {EnterstellarError} Code `ENS-5008` if the file does not exist or cannot be parsed.
 *
 * @example
 * ```ts
 * const fixtures = await loadFixtures('.enterstellar-fixtures');
 * // fixtures: FixtureEntry[]
 * ```
 */
export async function loadFixtures(
    directory: string,
): Promise<readonly FixtureEntry[]> {
    const filePath = join(directory, FIXTURE_FILENAME);

    let content: string;

    try {
        content = await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
        throw new EnterstellarError(
            'ENS-5008',
            'test',
            `Failed to read fixtures from "${filePath}": ${error instanceof Error ? error.message : String(error)
            }. Run tests in record mode first to create fixtures.`,
            false,
            error,
        );
    }

    try {
        const parsed: unknown = JSON.parse(content);

        // Validate that the parsed content is an array.
        if (!Array.isArray(parsed)) {
            throw new EnterstellarError(
                'ENS-5008',
                'test',
                `Fixture file "${filePath}" does not contain an array. ` +
                `Expected FixtureEntry[], got ${typeof parsed}.`,
                false,
            );
        }

        // Validate each element against the FixtureEntry Zod schema.
        // This ensures loaded fixtures conform to the expected shape
        // and catches corrupt or tampered fixture files early (L8).
        const validated = z.array(FixtureEntrySchema).parse(parsed);

        return validated as readonly FixtureEntry[];
    } catch (error: unknown) {
        // Re-throw EnterstellarErrors from the array check above.
        if (error instanceof EnterstellarError) {
            throw error;
        }

        // Wrap Zod validation errors and JSON parse errors in EnterstellarError.
        throw new EnterstellarError(
            'ENS-5008',
            'test',
            `Failed to parse fixtures from "${filePath}": ${error instanceof Error ? error.message : String(error)
            }. File may be corrupted.`,
            false,
            error,
        );
    }
}

// ---------------------------------------------------------------------------
// listFixtureFiles (utility)
// ---------------------------------------------------------------------------

/**
 * Lists all fixture JSON files in a directory.
 *
 * Useful for discovering fixture sets in environments with multiple
 * fixture directories.
 *
 * @param directory - Path to scan for fixture files.
 * @returns Array of absolute file paths ending in `.json`.
 * @throws {EnterstellarError} Code `ENS-5008` if the directory cannot be read.
 */
export async function listFixtureFiles(
    directory: string,
): Promise<readonly string[]> {
    try {
        const entries = await readdir(directory);
        return entries
            .filter((entry) => entry.endsWith('.json'))
            .map((entry) => join(directory, entry));
    } catch (error: unknown) {
        throw new EnterstellarError(
            'ENS-5008',
            'test',
            `Failed to list fixture files in "${directory}": ${error instanceof Error ? error.message : String(error)
            }`,
            false,
            error,
        );
    }
}
