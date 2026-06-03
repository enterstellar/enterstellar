/**
 * @module @enterstellar-ai/cloud/__tests__/version.test
 * @description Tests for the `CLOUD_SDK_VERSION` constant.
 *
 * Guards against accidental version string changes.
 * The version must be a valid semver string and match the
 * expected value for the current release.
 */

import { describe, expect, it } from 'vitest';

import { CLOUD_SDK_VERSION } from '../src/version.js';

describe('CLOUD_SDK_VERSION', () => {
    it('is the string "0.1.0"', () => {
        expect(CLOUD_SDK_VERSION).toBe('0.1.0');
    });

    it('matches semver pattern', () => {
        expect(CLOUD_SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is a string type', () => {
        expect(typeof CLOUD_SDK_VERSION).toBe('string');
    });
});
