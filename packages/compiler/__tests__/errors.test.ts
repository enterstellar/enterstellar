/**
 * @module @enterstellar-ai/compiler/__tests__/errors
 * @description Unit tests for all 10 compiler error factory functions (ENS-2001–2010).
 *
 * Verifies each factory produces a correctly shaped `CompilationError` with
 * the right code, path, message, and fix suggestion.
 */

import { describe, it, expect } from 'vitest';

import {
    schemaParseError,
    invalidTokenError,
    missingAccessibilityError,
    unknownComponentError,
    selfCorrectionExhaustedError,
    fallbackRenderedError,
    tokenCoercionWarning,
    propsStrippedWarning,
    correctionCallbackError,
    maxNestingDepthError,
} from '../src/errors.js';

// ---------------------------------------------------------------------------
// ENS-2001: Schema Parse Error
// ---------------------------------------------------------------------------

describe('schemaParseError (ENS-2001)', () => {
    it('produces error with correct code and path', () => {
        const error = schemaParseError('props.riskLevel', 'high', 'number');
        expect(error.code).toBe('ENS-2001');
        expect(error.path).toBe('props.riskLevel');
        expect(error.received).toBe('high');
        expect(error.expected).toBe('number');
    });

    it('includes fix suggestion when provided', () => {
        const fix = { field: 'props.riskLevel', was: 'high', shouldBe: 3 };
        const error = schemaParseError('props.riskLevel', 'high', 'number', fix);
        expect(error.fix).toEqual(fix);
    });

    it('omits fix when not provided', () => {
        const error = schemaParseError('props.riskLevel', 'high', 'number');
        expect(error.fix).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// ENS-2002: Invalid Token
// ---------------------------------------------------------------------------

describe('invalidTokenError (ENS-2002)', () => {
    it('produces error with correct code', () => {
        const error = invalidTokenError('props.color', '#ff0000');
        expect(error.code).toBe('ENS-2002');
        expect(error.path).toBe('props.color');
        expect(error.received).toBe('#ff0000');
    });

    it('includes fix suggestion when token alternative provided', () => {
        const error = invalidTokenError('props.color', '#ff0000', 'token:danger');
        expect(error.fix).toEqual({
            field: 'props.color',
            was: '#ff0000',
            shouldBe: 'token:danger',
        });
    });

    it('message suggests alternative when provided', () => {
        const error = invalidTokenError('props.color', '#ff0000', 'token:danger');
        expect(error.message).toContain("Use 'token:danger' instead");
    });
});

// ---------------------------------------------------------------------------
// ENS-2003: Missing Accessibility
// ---------------------------------------------------------------------------

describe('missingAccessibilityError (ENS-2003)', () => {
    it('produces error with correct code and path', () => {
        const error = missingAccessibilityError('aria-label', 'PatientVitals');
        expect(error.code).toBe('ENS-2003');
        expect(error.path).toBe('accessibility.aria-label');
        expect(error.message).toContain('PatientVitals');
    });

    it('includes fix suggestion', () => {
        const error = missingAccessibilityError('role', 'PatientVitals');
        expect(error.fix).toBeDefined();
        expect(error.fix?.field).toBe('accessibility.role');
    });
});

// ---------------------------------------------------------------------------
// ENS-2004: Unknown Component
// ---------------------------------------------------------------------------

describe('unknownComponentError (ENS-2004)', () => {
    it('produces error with correct code', () => {
        const error = unknownComponentError('NonExistent');
        expect(error.code).toBe('ENS-2004');
        expect(error.path).toBe('component');
        expect(error.received).toBe('NonExistent');
        expect(error.message).toContain('NonExistent');
    });
});

// ---------------------------------------------------------------------------
// ENS-2005: Self-Correction Exhausted
// ---------------------------------------------------------------------------

describe('selfCorrectionExhaustedError (ENS-2005)', () => {
    it('includes attempt count in message', () => {
        const error = selfCorrectionExhaustedError(2, 2);
        expect(error.code).toBe('ENS-2005');
        expect(error.received).toBe(2);
        expect(error.message).toContain('2/2');
    });
});

// ---------------------------------------------------------------------------
// ENS-2006: Fallback Rendered
// ---------------------------------------------------------------------------

describe('fallbackRenderedError (ENS-2006)', () => {
    it('includes both component names', () => {
        const error = fallbackRenderedError('PatientVitals', 'GenericCard');
        expect(error.code).toBe('ENS-2006');
        expect(error.message).toContain('PatientVitals');
        expect(error.message).toContain('GenericCard');
    });
});

// ---------------------------------------------------------------------------
// ENS-2007: Token Coercion Warning
// ---------------------------------------------------------------------------

describe('tokenCoercionWarning (ENS-2007)', () => {
    it('includes coercion details in fix', () => {
        const error = tokenCoercionWarning('props.color', '#ff0000', 'token:danger');
        expect(error.code).toBe('ENS-2007');
        expect(error.fix).toEqual({
            field: 'props.color',
            was: '#ff0000',
            shouldBe: 'token:danger',
        });
    });
});

// ---------------------------------------------------------------------------
// ENS-2008: Props Stripped Warning
// ---------------------------------------------------------------------------

describe('propsStrippedWarning (ENS-2008)', () => {
    it('lists stripped field names', () => {
        const error = propsStrippedWarning(['foo', 'bar', 'baz']);
        expect(error.code).toBe('ENS-2008');
        expect(error.message).toContain('foo');
        expect(error.message).toContain('bar');
        expect(error.message).toContain('baz');
    });
});

// ---------------------------------------------------------------------------
// ENS-2009: Correction Callback Error
// ---------------------------------------------------------------------------

describe('correctionCallbackError (ENS-2009)', () => {
    it('includes cause in message', () => {
        const error = correctionCallbackError('Network timeout');
        expect(error.code).toBe('ENS-2009');
        expect(error.message).toContain('Network timeout');
    });
});

// ---------------------------------------------------------------------------
// ENS-2010: Max Nesting Depth
// ---------------------------------------------------------------------------

describe('maxNestingDepthError (ENS-2010)', () => {
    it('includes depth and limit in message', () => {
        const error = maxNestingDepthError(15, 10);
        expect(error.code).toBe('ENS-2010');
        expect(error.received).toBe(15);
        expect(error.message).toContain('15');
        expect(error.message).toContain('10');
    });

    it('includes fix suggestion', () => {
        const error = maxNestingDepthError(15, 10);
        expect(error.fix).toBeDefined();
        expect(error.fix?.was).toBe(15);
    });
});
