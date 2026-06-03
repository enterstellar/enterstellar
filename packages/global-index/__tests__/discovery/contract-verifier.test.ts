/**
 * @module @enterstellar-ai/global-index/discovery/contract-verifier.test
 * @description Unit tests for the client-side contract verification utility.
 *
 * Tests cover:
 * - Valid contracts pass verification
 * - Invalid contracts fail with correct issue mapping
 * - Zod path → dot-path formatting
 * - Edge cases: empty objects, null input, missing nested fields
 * - `isValidContract()` boolean type guard
 * - Return object immutability (frozen)
 */

import { describe, expect, it } from 'vitest';

import { verifyContract, isValidContract } from '../../src/discovery/contract-verifier.js';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

/**
 * A valid, minimal `ComponentContract` data object that passes
 * `ComponentContractSchema` validation.
 *
 * All required fields are present. Optional fields (`dataSource`, `auth`,
 * `origin`) are omitted — they should not cause validation failure.
 */
function createValidContract(): Record<string, unknown> {
    return {
        name: 'TestComponent',
        id: 'test-component-id',
        description: 'A test component for verification.',
        category: 'data-display',
        tags: ['test', 'example'],
        props: { type: 'object' },
        tokens: { primary: 'token:brand-primary' },
        accessibility: {
            role: 'region',
            ariaLabel: 'Test component',
            announceOnUpdate: false,
        },
        states: {
            loading: 'Loading...',
            error: 'Error occurred.',
            empty: 'No data.',
            ready: 'Ready.',
        },
        examples: [
            {
                intent: 'Show test data',
                props: { title: 'Test' },
            },
        ],
        _meta: {
            forged: false,
            version: '1.0.0',
            createdAt: '2026-01-01T00:00:00.000Z',
        },
    };
}

/**
 * A valid `ComponentContract` with all optional fields populated.
 */
function createFullContract(): Record<string, unknown> {
    return {
        ...createValidContract(),
        dataSource: {
            adapter: 'supabase',
            resource: 'patients',
            params: { limit: 10 },
        },
        auth: {
            required: true,
            roles: ['admin', 'clinician'],
        },
        origin: {
            registryUrl: 'https://registry.acme.health',
            publisher: 'ACME Clinical',
            verifiedAt: '2026-02-01T00:00:00.000Z',
        },
    };
}

// ---------------------------------------------------------------------------
// verifyContract() — Valid Contracts
// ---------------------------------------------------------------------------

describe('verifyContract — valid contracts', () => {
    it('passes a minimal valid contract (required fields only)', () => {
        const result = verifyContract(createValidContract());
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it('passes a full contract with all optional fields', () => {
        const result = verifyContract(createFullContract());
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it('passes a contract with origin but no dataSource or auth', () => {
        const contract = {
            ...createValidContract(),
            origin: {
                registryUrl: 'https://registry.example.com',
                publisher: 'Example Corp',
            },
        };
        const result = verifyContract(contract);
        expect(result.valid).toBe(true);
    });

    it('returns a frozen result object', () => {
        const result = verifyContract(createValidContract());
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.issues)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// verifyContract() — Invalid Contracts (Missing Fields)
// ---------------------------------------------------------------------------

describe('verifyContract — missing required fields', () => {
    it('fails when name is missing', () => {
        const contract = createValidContract();
        delete contract['name'];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'name')).toBe(true);
    });

    it('fails when description is missing', () => {
        const contract = createValidContract();
        delete contract['description'];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'description')).toBe(true);
    });

    it('fails when tags is empty array', () => {
        const contract = createValidContract();
        contract['tags'] = [];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'tags')).toBe(true);
    });

    it('fails when _meta is missing', () => {
        const contract = createValidContract();
        delete contract['_meta'];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === '_meta')).toBe(true);
    });

    it('fails when accessibility is missing', () => {
        const contract = createValidContract();
        delete contract['accessibility'];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'accessibility')).toBe(true);
    });

    it('fails when states is missing', () => {
        const contract = createValidContract();
        delete contract['states'];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'states')).toBe(true);
    });

    it('fails when examples is missing', () => {
        const contract = createValidContract();
        delete contract['examples'];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'examples')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// verifyContract() — Invalid Nested Fields (Dot-Path Mapping)
// ---------------------------------------------------------------------------

describe('verifyContract — nested field validation (dot-path)', () => {
    it('maps nested accessibility.role error to dot-path', () => {
        const contract = createValidContract();
        (contract['accessibility'] as Record<string, unknown>)['role'] = '';
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'accessibility.role')).toBe(true);
    });

    it('maps nested accessibility.ariaLabel error to dot-path', () => {
        const contract = createValidContract();
        (contract['accessibility'] as Record<string, unknown>)['ariaLabel'] = '';
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'accessibility.ariaLabel')).toBe(true);
    });

    it('maps nested states.loading error to dot-path', () => {
        const contract = createValidContract();
        (contract['states'] as Record<string, unknown>)['loading'] = '';
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'states.loading')).toBe(true);
    });

    it('maps nested _meta.version error to dot-path', () => {
        const contract = createValidContract();
        (contract['_meta'] as Record<string, unknown>)['version'] = '';
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === '_meta.version')).toBe(true);
    });

    it('reports multiple issues for multiple invalid fields', () => {
        const contract = createValidContract();
        delete contract['name'];
        delete contract['description'];
        delete contract['category'];
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.length).toBeGreaterThanOrEqual(3);
    });
});

// ---------------------------------------------------------------------------
// verifyContract() — Edge Cases
// ---------------------------------------------------------------------------

describe('verifyContract — edge cases', () => {
    it('fails gracefully on null input (does not throw)', () => {
        const result = verifyContract(null);
        expect(result.valid).toBe(false);
        expect(result.issues.length).toBeGreaterThan(0);
    });

    it('fails gracefully on undefined input', () => {
        const result = verifyContract(undefined);
        expect(result.valid).toBe(false);
    });

    it('fails on empty object', () => {
        const result = verifyContract({});
        expect(result.valid).toBe(false);
        expect(result.issues.length).toBeGreaterThan(0);
    });

    it('fails on primitive input (string)', () => {
        const result = verifyContract('not a contract');
        expect(result.valid).toBe(false);
    });

    it('fails on primitive input (number)', () => {
        const result = verifyContract(42);
        expect(result.valid).toBe(false);
    });

    it('passes with extra unknown fields (Zod strip mode)', () => {
        const contract = {
            ...createValidContract(),
            extraField: 'should be ignored',
            anotherExtra: 123,
        };
        const result = verifyContract(contract);
        // Zod in strip mode passes — extra fields are ignored
        expect(result.valid).toBe(true);
    });

    it('returns frozen issues array on failure', () => {
        const result = verifyContract({});
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.issues)).toBe(true);
    });

    it('each issue has both path and message', () => {
        const result = verifyContract({});
        for (const issue of result.issues) {
            expect(typeof issue.path).toBe('string');
            expect(issue.path.length).toBeGreaterThan(0);
            expect(typeof issue.message).toBe('string');
            expect(issue.message.length).toBeGreaterThan(0);
        }
    });

    it('description exceeding 120 chars fails', () => {
        const contract = createValidContract();
        contract['description'] = 'x'.repeat(121);
        const result = verifyContract(contract);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.path === 'description')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// isValidContract()
// ---------------------------------------------------------------------------

describe('isValidContract — type guard', () => {
    it('returns true for a valid contract', () => {
        expect(isValidContract(createValidContract())).toBe(true);
    });

    it('returns true for a full contract with optional fields', () => {
        expect(isValidContract(createFullContract())).toBe(true);
    });

    it('returns false for an empty object', () => {
        expect(isValidContract({})).toBe(false);
    });

    it('returns false for null', () => {
        expect(isValidContract(null)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(isValidContract(undefined)).toBe(false);
    });

    it('returns false for a string', () => {
        expect(isValidContract('not a contract')).toBe(false);
    });

    it('returns false when required field is missing', () => {
        const contract = createValidContract();
        delete contract['name'];
        expect(isValidContract(contract)).toBe(false);
    });
});
