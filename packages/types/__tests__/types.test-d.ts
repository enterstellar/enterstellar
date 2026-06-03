/**
 * @module @enterstellar-ai/types/__tests__/types.test-d
 * @description Type-level tests using expect-type (T16).
 *
 * Verifies type assignability, branded type constraints, and interface
 * conformance at compile time — NOT runtime. These tests catch type
 * regressions when types are refactored.
 *
 * @see Design Choice T16
 */

import { expectTypeOf } from 'expect-type';
import type {
    ComponentId,
    ZoneId,
    TraceId,
    ComponentContract,
    ComponentIntent,
    CompilationResult,
    AgentTrace,
    ForgeSignal,
    UserSignal,
    ZoneConfig,
    SerializedState,
    EnterstellarStore,
    EnterstellarAgentConnection,
    TokenResolver,
    AuthAdapter,
    DataAdapter,
    ErrorAdapter,
    AnalyticsAdapter,
    CompactManifestEntry,
    IntentCategory,
    IntentInteraction,
    CompilationStatus,
    ForgeResult,
    SpatialContext,
    SpatialContextSnapshot,
} from '../src/index.js';
import {
    createComponentId,
    createZoneId,
    createTraceId,
    ENTERSTELLAR_TYPES_VERSION,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// Branded Types
// ---------------------------------------------------------------------------

// Branded types should be assignable to string but NOT vice versa
expectTypeOf<ComponentId>().toMatchTypeOf<string>();
expectTypeOf<ZoneId>().toMatchTypeOf<string>();
expectTypeOf<TraceId>().toMatchTypeOf<string>();

// Plain strings should NOT be directly assignable to branded types
expectTypeOf<string>().not.toMatchTypeOf<ComponentId>();
expectTypeOf<string>().not.toMatchTypeOf<ZoneId>();
expectTypeOf<string>().not.toMatchTypeOf<TraceId>();

// Constructors return the correct branded type
expectTypeOf(createComponentId).returns.toEqualTypeOf<ComponentId>();
expectTypeOf(createZoneId).returns.toEqualTypeOf<ZoneId>();
expectTypeOf(createTraceId).returns.toEqualTypeOf<TraceId>();

// ---------------------------------------------------------------------------
// Version Constant
// ---------------------------------------------------------------------------

expectTypeOf(ENTERSTELLAR_TYPES_VERSION).toEqualTypeOf<'0.1.0'>();

// ---------------------------------------------------------------------------
// Data Types (types, not interfaces)
// ---------------------------------------------------------------------------

// ComponentContract is a type (data shape, not interface — T1)
expectTypeOf<ComponentContract>().toHaveProperty('name');
expectTypeOf<ComponentContract>().toHaveProperty('id');
expectTypeOf<ComponentContract>().toHaveProperty('description');
expectTypeOf<ComponentContract>().toHaveProperty('category');
expectTypeOf<ComponentContract>().toHaveProperty('tags');
expectTypeOf<ComponentContract>().toHaveProperty('props');
expectTypeOf<ComponentContract>().toHaveProperty('tokens');
expectTypeOf<ComponentContract>().toHaveProperty('accessibility');
expectTypeOf<ComponentContract>().toHaveProperty('states');
expectTypeOf<ComponentContract>().toHaveProperty('_meta');

// ComponentContract.id is ComponentId branded type
expectTypeOf<ComponentContract['id']>().toEqualTypeOf<ComponentId>();

// ComponentIntent is a type (data shape — T1)
expectTypeOf<ComponentIntent>().toHaveProperty('component');
expectTypeOf<ComponentIntent>().toHaveProperty('props');
expectTypeOf<ComponentIntent>().toHaveProperty('confidence');

// CompilationResult is a type (data shape — T1)
expectTypeOf<CompilationResult>().toHaveProperty('componentName');
expectTypeOf<CompilationResult>().toHaveProperty('status');
expectTypeOf<CompilationResult>().toHaveProperty('provenance');

// AgentTrace has TraceId branded type for id
expectTypeOf<AgentTrace['id']>().toEqualTypeOf<TraceId>();

// ZoneConfig has ZoneId branded type for id
expectTypeOf<ZoneConfig['id']>().toEqualTypeOf<ZoneId>();

// ---------------------------------------------------------------------------
// String Union Types
// ---------------------------------------------------------------------------

// IntentCategory is a string union (T12)
expectTypeOf<IntentCategory>().toMatchTypeOf<string>();

// IntentInteraction is a closed enum of 3 values (P8)
expectTypeOf<'read-only'>().toMatchTypeOf<IntentInteraction>();
expectTypeOf<'editable'>().toMatchTypeOf<IntentInteraction>();
expectTypeOf<'actionable'>().toMatchTypeOf<IntentInteraction>();

// CompilationStatus is a closed enum
expectTypeOf<'pass'>().toMatchTypeOf<CompilationStatus>();
expectTypeOf<'fail'>().toMatchTypeOf<CompilationStatus>();
expectTypeOf<'corrected'>().toMatchTypeOf<CompilationStatus>();

// ---------------------------------------------------------------------------
// Interfaces (objects with methods — T1)
// ---------------------------------------------------------------------------

// EnterstellarStore is an interface with methods
expectTypeOf<EnterstellarStore>().toHaveProperty('get');
expectTypeOf<EnterstellarStore>().toHaveProperty('set');
expectTypeOf<EnterstellarStore>().toHaveProperty('subscribe');
expectTypeOf<EnterstellarStore>().toHaveProperty('snapshot');
expectTypeOf<EnterstellarStore>().toHaveProperty('restore');
expectTypeOf<EnterstellarStore>().toHaveProperty('extend');
expectTypeOf<EnterstellarStore>().toHaveProperty('destroy');

// EnterstellarAgentConnection is an interface with methods
expectTypeOf<EnterstellarAgentConnection>().toHaveProperty('dispatch');
expectTypeOf<EnterstellarAgentConnection>().toHaveProperty('on');
expectTypeOf<EnterstellarAgentConnection>().toHaveProperty('onRawEvent');
expectTypeOf<EnterstellarAgentConnection>().toHaveProperty('connected');
expectTypeOf<EnterstellarAgentConnection>().toHaveProperty('disconnect');

// TokenResolver is an interface with resolve + validate
expectTypeOf<TokenResolver>().toHaveProperty('resolve');
expectTypeOf<TokenResolver>().toHaveProperty('validate');

// Adapter interfaces have methods
expectTypeOf<AuthAdapter>().toHaveProperty('getSession');
expectTypeOf<AuthAdapter>().toHaveProperty('hasRole');
expectTypeOf<AuthAdapter>().toHaveProperty('onAuthChange');
expectTypeOf<DataAdapter>().toHaveProperty('query');
expectTypeOf<DataAdapter>().toHaveProperty('mutate');
expectTypeOf<DataAdapter>().toHaveProperty('subscribe');
expectTypeOf<ErrorAdapter>().toHaveProperty('report');
expectTypeOf<ErrorAdapter>().toHaveProperty('shouldRetry');
expectTypeOf<ErrorAdapter>().toHaveProperty('sanitize');
expectTypeOf<AnalyticsAdapter>().toHaveProperty('track');
expectTypeOf<AnalyticsAdapter>().toHaveProperty('identify');

// ---------------------------------------------------------------------------
// Return Types
// ---------------------------------------------------------------------------

// EnterstellarStore.snapshot returns SerializedState
expectTypeOf<EnterstellarStore['snapshot']>().returns.toEqualTypeOf<SerializedState>();

// EnterstellarStore.subscribe returns an unsubscribe function
expectTypeOf<EnterstellarStore['subscribe']>().returns.toEqualTypeOf<() => void>();

// EnterstellarAgentConnection.dispatch returns Promise<void>
expectTypeOf<EnterstellarAgentConnection['dispatch']>().returns.toEqualTypeOf<Promise<void>>();

// ---------------------------------------------------------------------------
// Manifest + Forge
// ---------------------------------------------------------------------------

// CompactManifestEntry is a data type
expectTypeOf<CompactManifestEntry>().toHaveProperty('name');
expectTypeOf<CompactManifestEntry>().toHaveProperty('description');
expectTypeOf<CompactManifestEntry>().toHaveProperty('category');
expectTypeOf<CompactManifestEntry>().toHaveProperty('props');

// ForgeResult is a data type
expectTypeOf<ForgeResult>().toHaveProperty('success');
expectTypeOf<ForgeResult>().toHaveProperty('forgeMode');

// ---------------------------------------------------------------------------
// Spatial Context (P13)
// ---------------------------------------------------------------------------

// SpatialContext has DOM-awareness properties
expectTypeOf<SpatialContext>().toHaveProperty('zone');
expectTypeOf<SpatialContext>().toHaveProperty('width');
expectTypeOf<SpatialContext>().toHaveProperty('height');
expectTypeOf<SpatialContext>().toHaveProperty('isVisible');
expectTypeOf<SpatialContext>().toHaveProperty('captureContext');

// captureContext returns a SpatialContextSnapshot
expectTypeOf<SpatialContext['captureContext']>().returns.toEqualTypeOf<SpatialContextSnapshot>();
