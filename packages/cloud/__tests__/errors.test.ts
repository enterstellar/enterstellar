/**
 * @module @enterstellar-ai/cloud/__tests__/errors.test
 * @description Tests for `CloudError` class and 6 factory functions.
 *
 * Validates:
 * - `CloudError extends EnterstellarError` instanceof chain.
 * - Factory function output: codes, modules, recoverability, Cloud metadata.
 * - `createQuotaExceededError` carries `upgradeUrl` + `retryAfterMs`.
 * - `createAnonymousModeError` includes method name in message.
 * - `createRetriesExhaustedError` includes attempt count + optional status.
 * - `toJSON()` serialization includes all Cloud-specific fields.
 *
 * @see Design Choice SD3 — throw on 429.
 * @see Design Choice SD1 — anonymous mode errors.
 */

import { describe, expect, it } from 'vitest';

import { EnterstellarError } from '@enterstellar-ai/types';

import {
    CloudError,
    createAnonymousModeError,
    createConfigError,
    createDisposedError,
    createQuotaExceededError,
    createRetriesExhaustedError,
    createUsageFetchError,
} from '../src/errors.js';

import type { CloudErrorBody } from '../src/errors.js';

// ---------------------------------------------------------------------------
// CloudError Class
// ---------------------------------------------------------------------------

describe('CloudError', () => {
    it('extends EnterstellarError', () => {
        const error = new CloudError(
            'ENS-5001',
            'ENS-5001',
            'Test error',
            false,
        );

        expect(error).toBeInstanceOf(CloudError);
        expect(error).toBeInstanceOf(EnterstellarError);
        expect(error).toBeInstanceOf(Error);
    });

    it('stores Cloud-specific metadata', () => {
        const error = new CloudError(
            'ENS-5003',
            'ENS-C4290',
            'Quota exceeded',
            true,
            {
                upgradeUrl: 'https://cloud.enterstellar.dev/billing/upgrade',
                retryAfterMs: 3600000,
                requestId: 'req_01HYX',
            },
        );

        expect(error.code).toBe('ENS-5003');
        expect(error.cloudCode).toBe('ENS-C4290');
        expect(error.module).toBe('cloud');
        expect(error.message).toBe('Quota exceeded');
        expect(error.recoverable).toBe(true);
        expect(error.upgradeUrl).toBe('https://cloud.enterstellar.dev/billing/upgrade');
        expect(error.retryAfterMs).toBe(3600000);
        expect(error.requestId).toBe('req_01HYX');
    });

    it('defaults optional metadata to undefined', () => {
        const error = new CloudError(
            'ENS-5001',
            'ENS-5001',
            'Config error',
            false,
        );

        expect(error.upgradeUrl).toBeUndefined();
        expect(error.retryAfterMs).toBeUndefined();
        expect(error.requestId).toBeUndefined();
    });

    it('serializes to JSON with Cloud-specific fields', () => {
        const error = new CloudError(
            'ENS-5003',
            'ENS-C4290',
            'Quota exceeded',
            true,
            {
                upgradeUrl: 'https://upgrade.url',
                retryAfterMs: 1000,
                requestId: 'req_abc',
            },
        );

        const json = error.toJSON();

        expect(json.name).toBe('CloudError');
        expect(json.code).toBe('ENS-5003');
        expect(json.cloudCode).toBe('ENS-C4290');
        expect(json.module).toBe('cloud');
        expect(json.message).toBe('Quota exceeded');
        expect(json.recoverable).toBe(true);
        expect(json.upgradeUrl).toBe('https://upgrade.url');
        expect(json.retryAfterMs).toBe(1000);
        expect(json.requestId).toBe('req_abc');
        expect(typeof json.timestamp).toBe('string');
    });

    it('has name property set to "CloudError"', () => {
        const error = new CloudError('ENS-5001', 'ENS-5001', 'Test', false);
        expect(error.name).toBe('CloudError');
    });
});

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

describe('createConfigError', () => {
    it('produces ENS-5001 non-recoverable error', () => {
        const error = createConfigError('apiKey');

        expect(error).toBeInstanceOf(CloudError);
        expect(error.code).toBe('ENS-5001');
        expect(error.cloudCode).toBe('ENS-5001');
        expect(error.module).toBe('cloud');
        expect(error.recoverable).toBe(false);
        expect(error.message).toContain('apiKey');
    });

    it('includes field name in message', () => {
        const error = createConfigError('baseUrl');
        expect(error.message).toContain('baseUrl');
    });
});

describe('createDisposedError', () => {
    it('produces ENS-5002 non-recoverable error', () => {
        const error = createDisposedError();

        expect(error).toBeInstanceOf(CloudError);
        expect(error.code).toBe('ENS-5002');
        expect(error.cloudCode).toBe('ENS-5002');
        expect(error.module).toBe('cloud');
        expect(error.recoverable).toBe(false);
    });

    it('message mentions createEnterstellarCloudClient()', () => {
        const error = createDisposedError();
        expect(error.message).toContain('createEnterstellarCloudClient');
    });
});

describe('createUsageFetchError', () => {
    it('produces ENS-5003 recoverable error with status', () => {
        const error = createUsageFetchError(500);

        expect(error).toBeInstanceOf(CloudError);
        expect(error.code).toBe('ENS-5003');
        expect(error.cloudCode).toBe('ENS-5003');
        expect(error.module).toBe('cloud');
        expect(error.recoverable).toBe(true);
        expect(error.message).toContain('500');
    });

    it('handles undefined status', () => {
        const error = createUsageFetchError(undefined);

        expect(error.code).toBe('ENS-5003');
        expect(error.recoverable).toBe(true);
    });
});

describe('createAnonymousModeError', () => {
    it('produces ENS-5004 non-recoverable error', () => {
        const error = createAnonymousModeError('forge');

        expect(error).toBeInstanceOf(CloudError);
        expect(error.code).toBe('ENS-5004');
        expect(error.cloudCode).toBe('ENS-5004');
        expect(error.module).toBe('cloud');
        expect(error.recoverable).toBe(false);
    });

    it('includes method name in message', () => {
        const error = createAnonymousModeError('forge');
        expect(error.message).toContain('forge');
    });

    it('includes different method names', () => {
        const error = createAnonymousModeError('search');
        expect(error.message).toContain('search');
    });

    it('mentions pk_anon in message', () => {
        const error = createAnonymousModeError('route');
        expect(error.message).toMatch(/pk_anon|anonymous/i);
    });
});

describe('createRetriesExhaustedError', () => {
    it('produces ENS-5005 recoverable error', () => {
        const error = createRetriesExhaustedError(3);

        expect(error).toBeInstanceOf(CloudError);
        expect(error.code).toBe('ENS-5005');
        expect(error.cloudCode).toBe('ENS-5005');
        expect(error.module).toBe('cloud');
        expect(error.recoverable).toBe(true);
    });

    it('includes attempt count in message', () => {
        const error = createRetriesExhaustedError(3);
        expect(error.message).toContain('3');
    });

    it('includes last status code when provided', () => {
        const error = createRetriesExhaustedError(3, 502);
        expect(error.message).toContain('502');
    });

    it('includes requestId when provided', () => {
        const error = createRetriesExhaustedError(3, 500, 'req_xyz');
        expect(error.requestId).toBe('req_xyz');
    });

    it('handles undefined status and requestId', () => {
        const error = createRetriesExhaustedError(3, undefined, undefined);

        expect(error.code).toBe('ENS-5005');
        expect(error.requestId).toBeUndefined();
    });
});

describe('createQuotaExceededError', () => {
    it('produces ENS-C4290 recoverable error', () => {
        const body: CloudErrorBody = {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
        };

        const error = createQuotaExceededError(body);

        expect(error).toBeInstanceOf(CloudError);
        expect(error.code).toBe('ENS-5003');
        expect(error.cloudCode).toBe('ENS-C4290');
        expect(error.module).toBe('cloud');
        expect(error.recoverable).toBe(true);
    });

    it('carries upgradeUrl from body', () => {
        const body: CloudErrorBody = {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
            upgradeUrl: 'https://cloud.enterstellar.dev/billing/upgrade',
        };

        const error = createQuotaExceededError(body);
        expect(error.upgradeUrl).toBe('https://cloud.enterstellar.dev/billing/upgrade');
    });

    it('carries retryAfterMs from body', () => {
        const body: CloudErrorBody = {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
            retryAfterMs: 3600000,
        };

        const error = createQuotaExceededError(body);
        expect(error.retryAfterMs).toBe(3600000);
    });

    it('carries both upgradeUrl and retryAfterMs', () => {
        const body: CloudErrorBody = {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
            upgradeUrl: 'https://cloud.enterstellar.dev/billing/upgrade',
            retryAfterMs: 1800000,
        };

        const error = createQuotaExceededError(body);
        expect(error.upgradeUrl).toBe('https://cloud.enterstellar.dev/billing/upgrade');
        expect(error.retryAfterMs).toBe(1800000);
    });

    it('handles missing optional fields in body', () => {
        const body: CloudErrorBody = {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
        };

        const error = createQuotaExceededError(body);
        expect(error.upgradeUrl).toBeUndefined();
        expect(error.retryAfterMs).toBeUndefined();
    });

    it('includes requestId when provided', () => {
        const body: CloudErrorBody = {
            code: 'ENS-C4290',
            message: 'IPU quota exceeded',
        };

        const error = createQuotaExceededError(body, 'req_456');
        expect(error.requestId).toBe('req_456');
    });
});
