/**
 * @module @enterstellar-ai/global-index/publishing/badge-service.test
 * @description Unit tests for the certification and badge utility functions.
 *
 * Tests cover:
 * - `isCertified()` — true/false cases, defensive dual-check
 * - `isIndexed()` — indexed vs certified tier
 * - `getCertificationTier()` — direct accessor for both tiers
 * - `getScreenshotUrl()` — present, undefined, and empty string
 * - `hasScreenshot()` — boolean guard with edge cases
 * - `getRelevanceScore()` — present, undefined (safe default 0)
 *
 * No mocks needed — all functions are pure.
 */

import { describe, expect, it } from 'vitest';

import type { GlobalSearchResult } from '../../src/types.js';

import {
    getCertificationTier,
    getRelevanceScore,
    getScreenshotUrl,
    hasScreenshot,
    isCertified,
    isIndexed,
} from '../../src/publishing/badge-service.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * Creates a `GlobalSearchResult` with configurable certification fields.
 * Defaults to a certified contract with all optional fields present.
 */
function createResult(overrides?: Partial<GlobalSearchResult>): GlobalSearchResult {
    return {
        contract: {
            name: 'TestComponent',
            id: 'test-id',
            description: 'A test component.',
            category: 'data-display',
            tags: ['test'],
            props: { type: 'object' },
            tokens: { primary: 'token:brand-primary' },
            accessibility: {
                role: 'region',
                ariaLabel: 'Test',
                announceOnUpdate: false,
            },
            states: {
                loading: 'Loading...',
                error: 'Error.',
                empty: 'Empty.',
                ready: 'Ready.',
            },
            examples: [{ intent: 'test', props: {} }],
            _meta: { forged: false, version: '1.0.0', createdAt: '2026-01-01T00:00:00Z' },
        } as unknown as GlobalSearchResult['contract'],
        registryUrl: 'https://registry.example.com',
        publisher: 'Test Publisher',
        stars: 10,
        usageCount: 100,
        certified: true,
        certificationTier: 'certified',
        score: 0.85,
        screenshotUrl: 'https://cdn.enterstellar.dev/screenshots/test.png',
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// isCertified()
// ---------------------------------------------------------------------------

describe('isCertified', () => {
    it('returns true when certified=true AND certificationTier=certified', () => {
        const result = createResult({ certified: true, certificationTier: 'certified' });
        expect(isCertified(result)).toBe(true);
    });

    it('returns false when certified=false AND certificationTier=indexed', () => {
        const result = createResult({ certified: false, certificationTier: 'indexed' });
        expect(isCertified(result)).toBe(false);
    });

    it('returns false when certified=true BUT certificationTier=indexed (defensive)', () => {
        const result = createResult({ certified: true, certificationTier: 'indexed' });
        expect(isCertified(result)).toBe(false);
    });

    it('returns false when certified=false BUT certificationTier=certified (defensive)', () => {
        const result = createResult({ certified: false, certificationTier: 'certified' });
        expect(isCertified(result)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isIndexed()
// ---------------------------------------------------------------------------

describe('isIndexed', () => {
    it('returns true when certificationTier=indexed', () => {
        const result = createResult({ certificationTier: 'indexed' });
        expect(isIndexed(result)).toBe(true);
    });

    it('returns false when certificationTier=certified', () => {
        const result = createResult({ certificationTier: 'certified' });
        expect(isIndexed(result)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getCertificationTier()
// ---------------------------------------------------------------------------

describe('getCertificationTier', () => {
    it('returns "indexed" for indexed contracts', () => {
        const result = createResult({ certificationTier: 'indexed' });
        expect(getCertificationTier(result)).toBe('indexed');
    });

    it('returns "certified" for certified contracts', () => {
        const result = createResult({ certificationTier: 'certified' });
        expect(getCertificationTier(result)).toBe('certified');
    });
});

// ---------------------------------------------------------------------------
// getScreenshotUrl()
// ---------------------------------------------------------------------------

describe('getScreenshotUrl', () => {
    it('returns the screenshot URL when present', () => {
        const result = createResult({
            screenshotUrl: 'https://cdn.enterstellar.dev/screenshots/test.png',
        });
        expect(getScreenshotUrl(result)).toBe('https://cdn.enterstellar.dev/screenshots/test.png');
    });

    it('returns undefined when screenshotUrl is not set', () => {
        const result = createResult({ screenshotUrl: undefined });
        expect(getScreenshotUrl(result)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// hasScreenshot()
// ---------------------------------------------------------------------------

describe('hasScreenshot', () => {
    it('returns true when screenshotUrl is present', () => {
        const result = createResult({
            screenshotUrl: 'https://cdn.enterstellar.dev/screenshots/test.png',
        });
        expect(hasScreenshot(result)).toBe(true);
    });

    it('returns false when screenshotUrl is undefined', () => {
        const result = createResult({ screenshotUrl: undefined });
        expect(hasScreenshot(result)).toBe(false);
    });

    it('returns false when screenshotUrl is empty string', () => {
        const result = createResult({ screenshotUrl: '' });
        expect(hasScreenshot(result)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getRelevanceScore()
// ---------------------------------------------------------------------------

describe('getRelevanceScore', () => {
    it('returns the score when present', () => {
        const result = createResult({ score: 0.92 });
        expect(getRelevanceScore(result)).toBe(0.92);
    });

    it('returns 0 when score is undefined (safe default)', () => {
        const result = createResult({ score: undefined });
        expect(getRelevanceScore(result)).toBe(0);
    });

    it('returns 0 when score is exactly 0', () => {
        const result = createResult({ score: 0 });
        expect(getRelevanceScore(result)).toBe(0);
    });

    it('returns 1 when score is exactly 1', () => {
        const result = createResult({ score: 1 });
        expect(getRelevanceScore(result)).toBe(1);
    });
});
