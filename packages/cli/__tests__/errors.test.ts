/**
 * @module @enterstellar-ai/cli/__tests__/errors
 * @description Tests for CLI error factories (ENS-9001 through ENS-9006).
 *
 * Verifies that each factory produces a correctly configured `EnterstellarError`
 * with the expected code, module, message, recoverable flag, and cause chain.
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import {
    createInvalidProjectNameError,
    createInvalidComponentNameError,
    createDirectoryExistsError,
    createProjectNotFoundError,
    createInstallFailedError,
    createFileWriteError,
} from '../src/utils/errors.js';

// ---------------------------------------------------------------------------
// Shared Assertions
// ---------------------------------------------------------------------------

/**
 * Asserts common properties shared by all CLI error factories.
 */
function assertCliError(
    error: EnterstellarError,
    expectedCode: string,
    recoverable: boolean,
): void {
    expect(error).toBeInstanceOf(EnterstellarError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(expectedCode);
    expect(error.module).toBe('cli');
    expect(error.recoverable).toBe(recoverable);
    expect(error.name).toBe('EnterstellarError');
    expect(error.timestamp).toBeDefined();
    expect(typeof error.timestamp).toBe('string');
}

// ---------------------------------------------------------------------------
// ENS-9001 — Invalid Project Name
// ---------------------------------------------------------------------------

describe('createInvalidProjectNameError (ENS-9001)', () => {
    it('creates an EnterstellarError with code ENS-9001', () => {
        const error = createInvalidProjectNameError('My App!!');

        assertCliError(error, 'ENS-9001', false);
    });

    it('embeds the invalid name in the message', () => {
        const error = createInvalidProjectNameError('BAD_NAME');

        expect(error.message).toContain('BAD_NAME');
        expect(error.message).toContain('ENS-9001');
        expect(error.message).toContain('kebab-case');
    });

    it('is not recoverable (user must fix input)', () => {
        const error = createInvalidProjectNameError('x');

        expect(error.recoverable).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ENS-9002 — Invalid Component Name
// ---------------------------------------------------------------------------

describe('createInvalidComponentNameError (ENS-9002)', () => {
    it('creates an EnterstellarError with code ENS-9002', () => {
        const error = createInvalidComponentNameError('patient-vitals');

        assertCliError(error, 'ENS-9002', false);
    });

    it('embeds the invalid name in the message', () => {
        const error = createInvalidComponentNameError('bad_name');

        expect(error.message).toContain('bad_name');
        expect(error.message).toContain('ENS-9002');
        expect(error.message).toContain('PascalCase');
    });

    it('is not recoverable (user must fix input)', () => {
        const error = createInvalidComponentNameError('lowercase');

        expect(error.recoverable).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ENS-9003 — Directory Already Exists
// ---------------------------------------------------------------------------

describe('createDirectoryExistsError (ENS-9003)', () => {
    it('creates an EnterstellarError with code ENS-9003', () => {
        const error = createDirectoryExistsError('/Users/dev/my-app');

        assertCliError(error, 'ENS-9003', false);
    });

    it('embeds the directory path in the message', () => {
        const error = createDirectoryExistsError('/tmp/existing-project');

        expect(error.message).toContain('/tmp/existing-project');
        expect(error.message).toContain('ENS-9003');
        expect(error.message).toContain('not empty');
    });

    it('is not recoverable (user must choose a different name)', () => {
        const error = createDirectoryExistsError('/any/path');

        expect(error.recoverable).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ENS-9004 — Enterstellar Project Not Found
// ---------------------------------------------------------------------------

describe('createProjectNotFoundError (ENS-9004)', () => {
    it('creates an EnterstellarError with code ENS-9004', () => {
        const error = createProjectNotFoundError('/Users/dev/plain-app');

        assertCliError(error, 'ENS-9004', false);
    });

    it('embeds the directory path in the message', () => {
        const error = createProjectNotFoundError('/home/user/project');

        expect(error.message).toContain('/home/user/project');
        expect(error.message).toContain('ENS-9004');
        expect(error.message).toContain('@enterstellar-ai/registry');
    });

    it('is not recoverable', () => {
        const error = createProjectNotFoundError('/any/path');

        expect(error.recoverable).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// ENS-9005 — Install Failed
// ---------------------------------------------------------------------------

describe('createInstallFailedError (ENS-9005)', () => {
    it('creates an EnterstellarError with code ENS-9005', () => {
        const error = createInstallFailedError('pnpm');

        assertCliError(error, 'ENS-9005', true);
    });

    it('embeds the package manager name in the message', () => {
        const error = createInstallFailedError('npm');

        expect(error.message).toContain('npm');
        expect(error.message).toContain('ENS-9005');
        expect(error.message).toContain('install');
    });

    it('is recoverable (user can manually run install)', () => {
        const error = createInstallFailedError('yarn');

        expect(error.recoverable).toBe(true);
    });

    it('chains the underlying cause when provided', () => {
        const cause = new Error('EACCES: permission denied');
        const error = createInstallFailedError('pnpm', cause);

        expect(error.cause).toBe(cause);
    });

    it('has undefined cause when not provided', () => {
        const error = createInstallFailedError('bun');

        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-9006 — File Write Failed
// ---------------------------------------------------------------------------

describe('createFileWriteError (ENS-9006)', () => {
    it('creates an EnterstellarError with code ENS-9006', () => {
        const error = createFileWriteError('/path/to/file.ts');

        assertCliError(error, 'ENS-9006', true);
    });

    it('embeds the file path in the message', () => {
        const error = createFileWriteError('/my/project/src/index.ts');

        expect(error.message).toContain('/my/project/src/index.ts');
        expect(error.message).toContain('ENS-9006');
        expect(error.message).toContain('write');
    });

    it('is recoverable (user can fix permissions or disk space)', () => {
        const error = createFileWriteError('/any/path');

        expect(error.recoverable).toBe(true);
    });

    it('chains the underlying cause when provided', () => {
        const cause = new Error('ENOSPC: no space left on device');
        const error = createFileWriteError('/path/to/file.ts', cause);

        expect(error.cause).toBe(cause);
    });

    it('has undefined cause when not provided', () => {
        const error = createFileWriteError('/path/to/file.ts');

        expect(error.cause).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Serialization (toJSON)
// ---------------------------------------------------------------------------

describe('EnterstellarError serialization', () => {
    it('serializes to a plain object via toJSON()', () => {
        const error = createInvalidProjectNameError('test');
        const json = error.toJSON();

        expect(json.name).toBe('EnterstellarError');
        expect(json.code).toBe('ENS-9001');
        expect(json.module).toBe('cli');
        expect(json.recoverable).toBe(false);
        expect(json.message).toContain('test');
        expect(typeof json.timestamp).toBe('string');
        expect(json.stack).toBeDefined();
    });
});
