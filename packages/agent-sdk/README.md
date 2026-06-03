# @enterstellar-ai/agent-sdk

> AI agent SDK with embedded MCP server — exposes Enterstellar as 7 composable tools so any AI agent (Claude, GPT, Gemini, custom) can search components, compose UI, validate specs, analyze traces, forge components, inspect schemas, and build complete UIs in a single call.

The Agent SDK bridges Enterstellar's engine modules (registry, compiler, semantic index, forge, store) and AI agents via the Model Context Protocol (MCP). It provides both typed method access (`sdk.search()`, `sdk.compose()`, etc.) and a tool-call dispatch layer (`createMCPServer()`) for agent integration. All 7 tools enforce L3 (compiler never bypassed), return structured `EnterstellarError` codes for self-correction, and produce provenance-tracked results.

## Quick Start

```ts
import { createAgentSDK, createMCPServer } from '@enterstellar-ai/agent-sdk';

// 1. Create the SDK with required + optional dependencies
const sdk = createAgentSDK({
  registry, // required — component lookup
  compiler, // required — L3 validation
  semanticIndex, // required — search
  forge, // optional — runtime generation
  store, // optional — trace analysis
});

// 2. Use typed methods directly
const results = await sdk.search('show patient vitals', 5);
const spec = await sdk.compose([
  { name: 'main', component: 'PatientVitals', props: { patientId: '123' }, determinism: 0.5 },
]);
const validation = await sdk.validate(spec);

// 3. Or expose as MCP server for agent integration
const server = createMCPServer(sdk);
const tools = server.listTools();
const result = await server.handleToolCall('enterstellar_search_components', {
  query: 'show patient vitals',
  topK: 5,
});
```

## API Reference

### Factory Functions

| Function                 | Returns                 | Description                                                           |
| :----------------------- | :---------------------- | :-------------------------------------------------------------------- |
| `createAgentSDK(config)` | `EnterstellarAgentSDK`  | Creates the SDK. Returns frozen plain object with closures (AS4, R4). |
| `createMCPServer(sdk)`   | `EnterstellarMCPServer` | Creates embedded MCP server wrapping the SDK (AS1).                   |

### `EnterstellarAgentSDK` Interface

| Method                                 | Returns                           | Description                                                                             |
| :------------------------------------- | :-------------------------------- | :-------------------------------------------------------------------------------------- |
| `search(query, topK?)`                 | `Promise<SemanticSearchResult[]>` | Semantic component search. topK clamped [1–20], default 5 (SI5).                        |
| `compose(zones, layout?)`              | `Promise<UISpec>`                 | Assembles UI spec from zone assignments. Validates component existence + determinism.   |
| `validate(spec)`                       | `Promise<CompilationResult>`      | Validates spec through compiler (L3). Multi-zone aggregation.                           |
| `analyzeTraces(timeRange, groupBy)`    | `Promise<TraceAnalysis>`          | Trace analytics from EnterstellarStore (AS5). Groups by component/zone/status/strategy. |
| `forgeComponent(intent, constraints?)` | `Promise<ForgeResult>`            | Runtime component generation via forge. F9 safety net.                                  |
| `getComponentSchema(name)`             | `ComponentSchemaResult`           | Synchronous JSON Schema lookup from registry.                                           |
| `buildUI(query, zones)`                | `Promise<BuildUIResult>`          | Composite: search → compose → validate (AS2). Auto-fills empty component fields.        |
| `tools`                                | `readonly MCPToolDefinition[]`    | All 7 MCP tool definitions for server registration.                                     |

### `EnterstellarMCPServer` Interface

| Method                       | Returns                        | Description                                                                                |
| :--------------------------- | :----------------------------- | :----------------------------------------------------------------------------------------- |
| `listTools()`                | `readonly MCPToolDefinition[]` | Returns all 7 tool definitions for agent introspection.                                    |
| `handleToolCall(name, args)` | `Promise<MCPCallResult>`       | Dispatches tool call by name. Returns `{ success, data }` or `{ success, code, message }`. |

### MCP Tools (7 total)

| Tool Name                           | Type      | Description                                            |
| :---------------------------------- | :-------- | :----------------------------------------------------- |
| `enterstellar_search_components`    | Atomic    | Semantic search. Returns `SemanticSearchResult[]`.     |
| `enterstellar_compose_ui`           | Atomic    | Assembles `UISpec` from zone specs.                    |
| `enterstellar_validate_spec`        | Atomic    | Compiler validation (L3). Returns `CompilationResult`. |
| `enterstellar_analyze_traces`       | Atomic    | Trace aggregation analytics (AS5).                     |
| `enterstellar_forge_component`      | Atomic    | Runtime component generation via forge.                |
| `enterstellar_get_component_schema` | Atomic    | JSON Schema for component props.                       |
| `enterstellar_build_ui`             | Composite | search → compose → validate in one call (AS2).         |

### Error Codes

| Code       | Scenario                                                | Recoverable |
| :--------- | :------------------------------------------------------ | :---------- |
| `ENS-8001` | SDK initialization failed (missing required dep)        | ❌ No       |
| `ENS-8002` | Search failed (semantic index error)                    | ✅ Yes      |
| `ENS-8003` | Compose failed (unknown component, invalid determinism) | ✅ Yes      |
| `ENS-8004` | Component schema not found in registry                  | ✅ Yes      |
| `ENS-8005` | Trace analysis invalid (bad groupBy, missing store)     | ✅ Yes      |

### Types

| Type                    | Description                                                                  |
| :---------------------- | :--------------------------------------------------------------------------- |
| `EnterstellarAgentSDK`  | Full SDK interface (all methods + tools array).                              |
| `AgentSDKConfig`        | Config: `registry`, `compiler`, `semanticIndex`, `forge?`, `store?`.         |
| `ZoneSpec`              | Zone assignment: `name`, `component`, `props`, `determinism`.                |
| `UISpec`                | Flat list of zone assignments (AS3).                                         |
| `TraceAnalysis`         | Aggregated trace analytics: `timeRange`, `groupBy`, `totalTraces`, `groups`. |
| `TraceAnalysisGroup`    | Per-group metrics: `key`, `count`, `avgLatencyMs`, `successRate`.            |
| `BuildUIResult`         | Composite result: `searchResults`, `spec`, `validation`.                     |
| `ComponentSchemaResult` | Schema lookup result: `componentName`, `schema`.                             |
| `MCPToolDefinition`     | Tool definition: `name`, `description`, `inputSchema`, `handler`.            |
| `EnterstellarMCPServer` | MCP server interface: `listTools()`, `handleToolCall()`.                     |
| `MCPCallResult`         | Union: `MCPToolResponse \| MCPToolErrorResponse`.                            |

### Structural Dependency Interfaces

| Interface               | Description                                                                  |
| :---------------------- | :--------------------------------------------------------------------------- |
| `AgentSDKRegistry`      | `get(name)`, `list()` — subset of `EnterstellarRegistry`.                    |
| `AgentSDKCompiler`      | `compile(intent, opts?)`, `lint(intent)` — subset of `EnterstellarCompiler`. |
| `AgentSDKSemanticIndex` | `search(intent, opts?)` — subset of `SemanticIndex`.                         |
| `AgentSDKForge`         | `forge(intent)` — subset of `ComponentForge`.                                |
| `AgentSDKStore`         | `get(key)` — subset of `EnterstellarStore`.                                  |

## Design Choices Applied

| Decision | Summary                                                                                      |
| :------- | :------------------------------------------------------------------------------------------- |
| **AS1**  | Embedded MCP server — same process, no IPC, no HTTP.                                         |
| **AS2**  | 6 atomic + 1 composite tool. `enterstellar_build_ui` saves 2 round-trips.                    |
| **AS3**  | `UISpec` is a flat list of zone assignments, referenced by name. Determinism per zone.       |
| **AS4**  | Factory pattern — `createAgentSDK()` returns frozen plain object with closures.              |
| **AS5**  | `enterstellar_analyze_traces` queries local `EnterstellarStore.get('traces')`, no cloud API. |
| **L3**   | Compiler never bypassed — `enterstellar_validate_spec` enforces L3 at SDK level.             |
| **L15**  | Zero framework imports. Pure TypeScript. Structural typing for all deps.                     |
| **R4**   | `Object.freeze()` on returned SDK and MCP server objects.                                    |
| **T14**  | `AGENT_SDK_VERSION` exported for runtime compatibility checks.                               |
| **C12**  | Agent identifier (`'agent-sdk'`) passed to compiler for provenance.                          |
| **F9**   | Forge never hard-fails — `enterstellar_forge_component` wraps unexpected errors.             |
| **SI5**  | Default topK: 5, max: 20. Clamped, not errored.                                              |

## Configuration

### `AgentSDKConfig` Options

| Option          | Type                    | Required | Description                                                                                              |
| :-------------- | :---------------------- | :------- | :------------------------------------------------------------------------------------------------------- |
| `registry`      | `AgentSDKRegistry`      | Yes      | Component registry for lookup and validation.                                                            |
| `compiler`      | `AgentSDKCompiler`      | Yes      | Enterstellar compiler for spec validation (L3).                                                          |
| `semanticIndex` | `AgentSDKSemanticIndex` | Yes      | Semantic index for intent-based search.                                                                  |
| `forge`         | `AgentSDKForge`         | No       | Component forge for runtime generation. `enterstellar_forge_component` returns ENS-8002 if not provided. |
| `store`         | `AgentSDKStore`         | No       | Enterstellar store for trace analysis. `enterstellar_analyze_traces` returns ENS-8005 if not provided.   |

### Build Configuration

| File               | Purpose                                                                               |
| :----------------- | :------------------------------------------------------------------------------------ |
| `tsconfig.json`    | Extends `tsconfig.base.json` — strict mode. `composite: false`, `incremental: false`. |
| `tsup.config.ts`   | Builds ESM + CJS + DTS.                                                               |
| `vitest.config.ts` | Test runner with 90% coverage thresholds.                                             |

**Peer dependencies:** `@enterstellar-ai/types`, `@enterstellar-ai/registry`, `@enterstellar-ai/compiler`, `@enterstellar-ai/semantic-index`, `@enterstellar-ai/forge`, `@enterstellar-ai/state`, `zod`

## See Also

- [Implementation Bible §4.16](../../agent/03-enterstellar-implementation-bible.md) — agent-sdk module specification.
- [Design Choices — AS1–AS6](../../agent/04-enterstellar-design-choices.md) — locked decisions.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — naming conventions, strictness requirements.
