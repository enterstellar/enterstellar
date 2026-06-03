/**
 * @module @enterstellar-ai/cli/utils/write-file
 * @description Safe file writer with automatic parent directory creation.
 *
 * Used by both `enterstellar init` and `enterstellar add component` to write scaffolded files.
 * Wraps filesystem errors in `EnterstellarError` (ENS-9006) with cause chaining so
 * the CLI can display a clean, actionable error message.
 *
 * @see Coding Rules — Error Handling
 * @see Implementation Bible §4.17
 */

import { mkdir, writeFile as fsWriteFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createFileWriteError } from './errors.js';

// ---------------------------------------------------------------------------
// Write File
// ---------------------------------------------------------------------------

/**
 * Safely writes content to a file, creating parent directories as needed.
 *
 * Behavior:
 * - Creates the full parent directory tree if it doesn't exist (`recursive: true`).
 * - If the file already exists and `overwrite` is `false` (default), skips the write
 *   and returns `false` — no error, no data loss.
 * - If the file already exists and `overwrite` is `true`, replaces the file silently.
 * - Wraps all filesystem errors in `EnterstellarError` (ENS-9006) with the original
 *   error as `cause` for debugging.
 *
 * @param filePath - Absolute path to the file to write.
 * @param content - The string content to write to the file.
 * @param overwrite - Whether to overwrite an existing file. Default: `false`.
 * @returns `true` if the file was written, `false` if it was skipped (already exists).
 * @throws {EnterstellarError} `ENS-9006` if the write fails due to permissions, disk space, etc.
 *
 * @example
 * ```ts
 * // Write a new file (safe — won't overwrite)
 * const written = await safeWriteFile('/path/to/project/src/index.ts', content);
 * if (!written) {
 *   console.log('File already exists, skipped.');
 * }
 *
 * // Force overwrite an existing file
 * await safeWriteFile('/path/to/project/src/index.ts', content, true);
 * ```
 */
export async function safeWriteFile(
    filePath: string,
    content: string,
    overwrite: boolean = false,
): Promise<boolean> {
    // Check if file already exists when overwrite is disabled
    if (!overwrite) {
        const exists = await fileExists(filePath);
        if (exists) {
            return false;
        }
    }

    try {
        // Create parent directories recursively
        const parentDir = dirname(filePath);
        await mkdir(parentDir, { recursive: true });

        // Write the file with UTF-8 encoding
        await fsWriteFile(filePath, content, 'utf-8');
        return true;
    } catch (error: unknown) {
        throw createFileWriteError(filePath, error);
    }
}

// ---------------------------------------------------------------------------
// File Existence Check
// ---------------------------------------------------------------------------

/**
 * Checks whether a file exists at the given path.
 *
 * Uses `fs.access` instead of the deprecated `fs.exists`. Returns `false`
 * for any access error (permission denied, not found, etc.) — the caller
 * treats all access failures as "file does not exist" for scaffolding purposes.
 *
 * @param filePath - Absolute path to check.
 * @returns `true` if the file exists and is accessible, `false` otherwise.
 *
 * @example
 * ```ts
 * const exists = await fileExists('/path/to/file.ts');
 * ```
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}
