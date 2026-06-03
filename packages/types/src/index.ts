/**
 * @module @enterstellar-ai/types
 * @description Shared type definitions, Zod schemas, and type guards for the Enterstellar ecosystem.
 *
 * This barrel file re-exports all domain modules. Consumers import from
 * `@enterstellar-ai/types` — internal modules can import from specific files for
 * faster builds.
 *
 * @see Design Choice T6 — split by domain, re-exported from index.ts.
 * @see Design Choice T8 — only domain types, Zod schemas, type guards, branded ID helpers.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
export { ENTERSTELLAR_TYPES_VERSION } from './version.js';

// ---------------------------------------------------------------------------
// Branded Types & Constructors
// ---------------------------------------------------------------------------
export type { ComponentId, ZoneId, TraceId } from './brands.js';
export { createComponentId, createZoneId, createTraceId } from './brands.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export { EnterstellarError } from './errors.js';
export type { EnterstellarErrorCode, EnterstellarErrorModule } from './errors.js';

// ---------------------------------------------------------------------------
// Contract (§3.1)
// ---------------------------------------------------------------------------
export type {
    ComponentContract,
    ComponentCategory,
    ContractOrigin,
    ContractMeta,
    ComponentAccessibility,
    ComponentDataSource,
    ComponentAuth,
    ComponentExample,
    ComponentStates,
} from './contract.js';
export { ComponentContractSchema } from './contract.js';

// ---------------------------------------------------------------------------
// Design Tokens (§3.1b)
// ---------------------------------------------------------------------------
export type {
    DesignTokenSet,
    TokenResolverContext,
} from './token.js';
export type { TokenResolver } from './token.js';
export { DesignTokenSetSchema } from './token.js';

// ---------------------------------------------------------------------------
// Intent (§3.2)
// ---------------------------------------------------------------------------
export type {
    ComponentIntent,
    IntentSource,
    IntentProtocol,
    IntentLayout,
    IntentInteraction,
} from './intent.js';
export { ComponentIntentSchema } from './intent.js';

// ---------------------------------------------------------------------------
// Compiler (§3.3)
// ---------------------------------------------------------------------------
export type {
    CompilationResult,
    CompilationError,
    CompilationProvenance,
    CompilationFix,
    CompilationStatus,
} from './compiler.js';
export { CompilationResultSchema, CompilationErrorSchema } from './compiler.js';

// ---------------------------------------------------------------------------
// Trace (§3.4)
// ---------------------------------------------------------------------------
export type {
    AgentTrace,
    ZoneTrace,
    TraceIntent,
    TraceResolution,
    TraceCompilation,
    TraceDeterminism,
    TraceMetrics,
    TraceConsent,
} from './trace.js';
export { AgentTraceSchema, ZoneTraceSchema } from './trace.js';

// ---------------------------------------------------------------------------
// Config (§3.5)
// ---------------------------------------------------------------------------
export type {
    ZoneConfig,
    ZoneCacheConfig,
} from './config.js';
export { ZoneConfigSchema } from './config.js';

// ---------------------------------------------------------------------------
// Adapters (§3.6)
// ---------------------------------------------------------------------------
export type {
    AuthAdapter,
    DataAdapter,
    ErrorAdapter,
    AnalyticsAdapter,
} from './adapters.js';

// ---------------------------------------------------------------------------
// Telemetry (§3.7)
// ---------------------------------------------------------------------------
export type {
    ForgeSignal,
    IntentCategory,
    ForgeMode,
    SignalPlatform,
} from './telemetry.js';
export { ForgeSignalSchema } from './telemetry.js';

// ---------------------------------------------------------------------------
// State (§3.8)
// ---------------------------------------------------------------------------
export type {
    ZoneState,
    SessionState,
    SerializedState,
    MigrationConfig,
    PersistenceStrategy,
    SyncConfig,
} from './state.js';
export type { EnterstellarStore } from './state.js';
export {
    ZoneStateSchema,
    SessionStateSchema,
    SerializedStateSchema,
} from './state.js';

// ---------------------------------------------------------------------------
// Connection (§3.9–3.10)
// ---------------------------------------------------------------------------
export type {
    UserSignal,
    UserSignalType,
    AgentEventType,
} from './connection.js';
export type { EnterstellarAgentConnection } from './connection.js';
export { UserSignalSchema } from './connection.js';

// ---------------------------------------------------------------------------
// Spatial Context (P13)
// ---------------------------------------------------------------------------
export type {
    SpatialContext,
    SpatialContextSnapshot,
} from './spatial.js';

// ---------------------------------------------------------------------------
// Manifest (§4.1)
// ---------------------------------------------------------------------------
export type { CompactManifestEntry } from './manifest.js';

// ---------------------------------------------------------------------------
// Semantic Index (§4.7)
// ---------------------------------------------------------------------------
export type { SemanticSearchResult } from './semantic-index.js';
export { SemanticSearchResultSchema } from './semantic-index.js';

// ---------------------------------------------------------------------------
// Forge (§4.10)
// ---------------------------------------------------------------------------
export type {
    ForgeResult,
    ForgeTraceRecord,
    ColdPathConfig,
} from './forge.js';
export { ForgeResultSchema, ForgeTraceRecordSchema } from './forge.js';

// ---------------------------------------------------------------------------
// Type Guards (T17)
// ---------------------------------------------------------------------------
export {
    isComponentId,
    isZoneId,
    isTraceId,
    isForgeSignal,
    isCompilationResult,
    isComponentIntent,
    isAgentTrace,
    isUserSignal,
} from './guards.js';
