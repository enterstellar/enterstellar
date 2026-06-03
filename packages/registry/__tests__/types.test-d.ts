/**
 * @module @enterstellar-ai/registry/__tests__/types
 * @description Type-level tests for registry types.
 * Uses Vitest's built-in type testing with `expectTypeOf`.
 *
 * @see Design Choice T16 — type-level tests via `expect-type`.
 */

import { describe, it, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type { ComponentContract, CompactManifestEntry, DesignTokenSet } from '@enterstellar-ai/types';

import type {
    EnterstellarRegistry,
    RegistryConfig,
    ValidationResult,
    ValidationViolation,
    PublishTarget,
    PublishResult,
    RegistryEvent,
    RegistryEventHandler,
    ComponentContractInput,
} from '../src/types.js';

// ---------------------------------------------------------------------------
// Type Assignability Tests
// ---------------------------------------------------------------------------

describe('Registry type assignability', () => {
    it('EnterstellarRegistry.get() returns ComponentContract | undefined', () => {
        expectTypeOf<EnterstellarRegistry['get']>().returns.toEqualTypeOf<ComponentContract | undefined>();
    });

    it('EnterstellarRegistry.list() returns readonly string[]', () => {
        expectTypeOf<EnterstellarRegistry['list']>().returns.toEqualTypeOf<readonly string[]>();
    });

    it('EnterstellarRegistry.getManifest() returns readonly CompactManifestEntry[]', () => {
        expectTypeOf<EnterstellarRegistry['getManifest']>().returns.toEqualTypeOf<readonly CompactManifestEntry[]>();
    });

    it('EnterstellarRegistry.getSchema() returns z.ZodType | undefined', () => {
        expectTypeOf<EnterstellarRegistry['getSchema']>().returns.toEqualTypeOf<z.ZodType | undefined>();
    });

    it('EnterstellarRegistry.getDesignTokens() returns DesignTokenSet', () => {
        expectTypeOf<EnterstellarRegistry['getDesignTokens']>().returns.toEqualTypeOf<DesignTokenSet>();
    });

    it('EnterstellarRegistry.validate() returns ValidationResult', () => {
        expectTypeOf<EnterstellarRegistry['validate']>().returns.toEqualTypeOf<ValidationResult>();
    });

    it('EnterstellarRegistry.publish() returns Promise<PublishResult>', () => {
        expectTypeOf<EnterstellarRegistry['publish']>().returns.toEqualTypeOf<Promise<PublishResult>>();
    });

    it('EnterstellarRegistry.on() returns () => void', () => {
        expectTypeOf<EnterstellarRegistry['on']>().returns.toEqualTypeOf<() => void>();
    });

    it('EnterstellarRegistry.size is number', () => {
        expectTypeOf<EnterstellarRegistry['size']>().toEqualTypeOf<number>();
    });

    it('RegistryConfig.components is readonly ComponentContract[]', () => {
        expectTypeOf<RegistryConfig['components']>().toEqualTypeOf<readonly ComponentContract[]>();
    });

    it('ValidationResult.violations is readonly ValidationViolation[]', () => {
        expectTypeOf<ValidationResult['violations']>().toEqualTypeOf<readonly ValidationViolation[]>();
    });

    it('RegistryEvent is a union of register | unregister | update', () => {
        expectTypeOf<'register'>().toMatchTypeOf<RegistryEvent>();
        expectTypeOf<'unregister'>().toMatchTypeOf<RegistryEvent>();
        expectTypeOf<'update'>().toMatchTypeOf<RegistryEvent>();
    });

    it('RegistryEventHandler accepts ComponentContract parameter', () => {
        expectTypeOf<RegistryEventHandler>().parameters.toEqualTypeOf<[ComponentContract]>();
    });

    it('ComponentContractInput omits id and _meta', () => {
        expectTypeOf<ComponentContractInput>().not.toHaveProperty('id');
        expectTypeOf<ComponentContractInput>().not.toHaveProperty('_meta');
    });

    it('PublishTarget has registryUrl and credentials', () => {
        expectTypeOf<PublishTarget>().toHaveProperty('registryUrl');
        expectTypeOf<PublishTarget>().toHaveProperty('credentials');
    });

    it('PublishResult has published and url', () => {
        expectTypeOf<PublishResult>().toHaveProperty('published');
        expectTypeOf<PublishResult>().toHaveProperty('url');
    });
});
