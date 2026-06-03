/**
 * @module @enterstellar-ai/forge/__tests__/errors
 * @description Unit tests for the 5 forge error factory functions (ENS-4001–ENS-4005).
 *
 * Verifies each factory produces an `EnterstellarError` with the correct code,
 * module, message, and recoverability flag.
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '@enterstellar-ai/types';

import {
    forgeGenerationFailedError,
    templateNotFoundError,
    cloudForgeNetworkError,
    forgeCompilationFailedError,
    templateValidationError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// ENS-4001: Forge Generation Failed
// ---------------------------------------------------------------------------

describe('forgeGenerationFailedError (ENS-4001)', () => {
    it('produces an EnterstellarError with code ENS-4001', () => {
        const error = forgeGenerationFailedError('PatientVitals', 'No template match');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-4001');
    });

    it('sets module to "forge"', () => {
        const error = forgeGenerationFailedError('PatientVitals', 'No template match');
        expect(error.module).toBe('forge');
    });

    it('is recoverable (fallback component)', () => {
        const error = forgeGenerationFailedError('PatientVitals', 'No template match');
        expect(error.recoverable).toBe(true);
    });

    it('includes the intent component name in the message', () => {
        const error = forgeGenerationFailedError('PatientVitals', 'No template match');
        expect(error.message).toContain('PatientVitals');
    });

    it('includes the reason in the message', () => {
        const error = forgeGenerationFailedError('PatientVitals', 'No template match');
        expect(error.message).toContain('No template match');
    });
});

// ---------------------------------------------------------------------------
// ENS-4002: Template Not Found
// ---------------------------------------------------------------------------

describe('templateNotFoundError (ENS-4002)', () => {
    it('produces an EnterstellarError with code ENS-4002', () => {
        const error = templateNotFoundError('clinical');
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-4002');
    });

    it('sets module to "forge" and is recoverable', () => {
        const error = templateNotFoundError('clinical');
        expect(error.module).toBe('forge');
        expect(error.recoverable).toBe(true);
    });

    it('includes the category in the message', () => {
        const error = templateNotFoundError('clinical');
        expect(error.message).toContain('clinical');
    });
});

// ---------------------------------------------------------------------------
// ENS-4003: CloudForge Network Error
// ---------------------------------------------------------------------------

describe('cloudForgeNetworkError (ENS-4003)', () => {
    it('produces an EnterstellarError with code ENS-4003', () => {
        const error = cloudForgeNetworkError(new Error('Connection refused'));
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-4003');
    });

    it('sets module to "forge" and is recoverable', () => {
        const error = cloudForgeNetworkError(new Error('Connection refused'));
        expect(error.module).toBe('forge');
        expect(error.recoverable).toBe(true);
    });

    it('extracts message from Error objects', () => {
        const error = cloudForgeNetworkError(new Error('Connection refused'));
        expect(error.message).toContain('Connection refused');
    });

    it('handles non-Error cause values', () => {
        const error = cloudForgeNetworkError('Timeout');
        expect(error.message).toContain('Timeout');
    });

    it('preserves the original cause', () => {
        const cause = new Error('Connection refused');
        const error = cloudForgeNetworkError(cause);
        expect(error.cause).toBe(cause);
    });
});

// ---------------------------------------------------------------------------
// ENS-4004: Forged Contract Compilation Failed
// ---------------------------------------------------------------------------

describe('forgeCompilationFailedError (ENS-4004)', () => {
    it('produces an EnterstellarError with code ENS-4004', () => {
        const error = forgeCompilationFailedError('__forged_vitals_a1b2c3d4', 3);
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-4004');
    });

    it('sets module to "forge" and is recoverable', () => {
        const error = forgeCompilationFailedError('__forged_vitals_a1b2c3d4', 3);
        expect(error.module).toBe('forge');
        expect(error.recoverable).toBe(true);
    });

    it('includes the forged name in the message', () => {
        const error = forgeCompilationFailedError('__forged_vitals_a1b2c3d4', 3);
        expect(error.message).toContain('__forged_vitals_a1b2c3d4');
    });

    it('includes the error count in the message', () => {
        const error = forgeCompilationFailedError('__forged_vitals_a1b2c3d4', 3);
        expect(error.message).toContain('3');
    });
});

// ---------------------------------------------------------------------------
// ENS-4005: Custom Template Validation Failed
// ---------------------------------------------------------------------------

describe('templateValidationError (ENS-4005)', () => {
    it('produces an EnterstellarError with code ENS-4005', () => {
        const error = templateValidationError('custom-timeline', ['Missing name field']);
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error.code).toBe('ENS-4005');
    });

    it('sets module to "forge"', () => {
        const error = templateValidationError('custom-timeline', ['Missing name field']);
        expect(error.module).toBe('forge');
    });

    it('is NOT recoverable (developer error)', () => {
        const error = templateValidationError('custom-timeline', ['Missing name field']);
        expect(error.recoverable).toBe(false);
    });

    it('includes the template name in the message', () => {
        const error = templateValidationError('custom-timeline', ['Missing name field']);
        expect(error.message).toContain('custom-timeline');
    });

    it('joins multiple violations in the message', () => {
        const violations = ['Missing name', 'Invalid tokens', 'Empty slots'];
        const error = templateValidationError('custom-timeline', violations);
        expect(error.message).toContain('Missing name');
        expect(error.message).toContain('Invalid tokens');
        expect(error.message).toContain('Empty slots');
    });
});
