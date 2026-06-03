/**
 * @module @enterstellar-ai/types/__tests__/brands
 * @description Unit tests for branded type constructors and validation.
 */

import { describe, it, expect } from 'vitest';
import { EnterstellarError } from '../src/errors.js';
import {
    createComponentId,
    createZoneId,
    createTraceId,
    type ComponentId,
    type ZoneId,
    type TraceId,
} from '../src/index.js';

describe('brands', () => {
    // -------------------------------------------------------------------------
    // ComponentId
    // -------------------------------------------------------------------------
    describe('createComponentId', () => {
        it('should create a ComponentId from a valid PascalCase name', () => {
            const id: ComponentId = createComponentId('PatientVitals');
            expect(id).toBe('PatientVitals');
            expect(typeof id).toBe('string');
        });

        it('should create a ComponentId from any non-empty string', () => {
            const id: ComponentId = createComponentId('my-component');
            expect(id).toBe('my-component');
        });

        it('should throw ENS-1009 on empty string', () => {
            expect(() => createComponentId('')).toThrow(EnterstellarError);
            expect(() => createComponentId('')).toThrow(
                'ComponentId name must be a non-empty string.',
            );
        });

        it('should throw ENS-1009 on whitespace-only string', () => {
            expect(() => createComponentId('   ')).toThrow(EnterstellarError);
            expect(() => createComponentId('   ')).toThrow(
                'ComponentId name must be a non-empty string.',
            );
        });
    });

    // -------------------------------------------------------------------------
    // ZoneId
    // -------------------------------------------------------------------------
    describe('createZoneId', () => {
        it('should create a ZoneId from a valid name', () => {
            const id: ZoneId = createZoneId('patient-sidebar');
            expect(id).toBe('patient-sidebar');
            expect(typeof id).toBe('string');
        });

        it('should throw ENS-1009 on empty string', () => {
            expect(() => createZoneId('')).toThrow(EnterstellarError);
            expect(() => createZoneId('')).toThrow(
                'ZoneId name must be a non-empty string.',
            );
        });

        it('should throw ENS-1009 on whitespace-only string', () => {
            expect(() => createZoneId('  ')).toThrow(EnterstellarError);
            expect(() => createZoneId('  ')).toThrow(
                'ZoneId name must be a non-empty string.',
            );
        });
    });

    // -------------------------------------------------------------------------
    // TraceId
    // -------------------------------------------------------------------------
    describe('createTraceId', () => {
        it('should create a TraceId as a UUID string', () => {
            const id: TraceId = createTraceId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
            // UUID v4 format: 8-4-4-4-12 hex chars
            expect(id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            );
        });

        it('should produce unique IDs on each call', () => {
            const id1 = createTraceId();
            const id2 = createTraceId();
            expect(id1).not.toBe(id2);
        });
    });
});
