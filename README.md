<div align="center">
  <img src="./media/enterstellar.jpg" alt="Enterstellar — The TypeScript of Generative UI" width="100%" />
</div>

<div align="center">

# Enterstellar

**The TypeScript of Generative UI.**

[![npm](https://img.shields.io/npm/v/@enterstellar-ai/react?style=flat-square&color=0f172a&labelColor=0f172a&logo=npm&logoColor=white)](https://www.npmjs.com/package/@enterstellar-ai/react)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white&labelColor=0f172a)](https://www.typescriptlang.org)
[![License](https://img.shields.io/github/license/enterstellar/enterstellar?style=flat-square&color=0f172a&labelColor=0f172a)](./LICENSE)

[Documentation](https://enterstellar.dev/docs) · [Issues](https://github.com/enterstellar/enterstellar/issues) · [Changelog](./CHANGELOG.md)

</div>

---

## The Problem

AI agents that generate interfaces have no compiler.

The LLM picks component names you never defined. It sends `color: '#ff0000'` when your design system says `token:danger`. It passes a string where a number is required, skips required accessibility attributes, and nests components 12 levels deep. Your app renders it all — or crashes. There is no validation layer between the brain and the pixel.

TypeScript didn't fix JavaScript by replacing it. It added a compiler.
**Enterstellar is that compiler — for Generative UI.**

---

## What It Does

Enterstellar sits between your AI agent and your renderer. Every component intent — regardless of which LLM, protocol, or agent framework produced it — passes through the **UI Compiler** before a single pixel renders.

The compiler validates props against a Zod schema, enforces design tokens, audits accessibility attributes, and runs a three-tier self-correction loop when something is wrong: deterministic coercion first, contract examples second, LLM callback last. If all three fail, a safe fallback renders. Your app never crashes from a hallucinated prop.

The components the AI is allowed to render are defined in a **Component Registry** — a typed, validated, frozen set of contracts that act as the LLM's vocabulary. The LLM doesn't generate UI. It selects from a constrained, audited set of components and supplies validated props. You stay in control of every pixel.

---

## Quick Start

The fastest way to get started is the Enterstellar CLI, which scaffolds a complete app with a registry, token set, and test harness in seconds:

```bash
npx create-enterstellar-app my-app
```

Alternatively, you can install manually into an existing app:

```bash
npm install @enterstellar-ai/react @enterstellar-ai/registry
```

> All engine packages are bundled as dependencies of `@enterstellar-ai/react`. You do not need to install them separately.

**Step 1 — Define a component contract:**

```tsx
import { defineComponent } from '@enterstellar-ai/react';
import { z } from 'zod';

// defineComponent validates immediately and freezes the contract.
// The LLM can only render components that are registered here.
const { contract } = defineComponent({
  contract: {
    name: 'PatientVitals',
    description: 'Displays real-time patient vital signs with risk stratification.',
    category: 'clinical',
    tags: ['patient', 'vitals', 'monitoring'],
    props: z.object({
      patientId: z.string().uuid(),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    }),
    tokens: { statusColor: 'token:danger', cardBg: 'token:card-bg' },
    accessibility: { role: 'region', ariaLabel: 'Patient vitals' },
    states: {
      loading: 'VitalsLoading',
      error: 'VitalsError',
      empty: 'VitalsEmpty',
      ready: 'PatientVitals',
    },
  },
  render: ({ patientId, riskLevel }) => (
    <div data-risk={riskLevel}>
      Vitals for {patientId} — {riskLevel.toUpperCase()} risk
    </div>
  ),
});
```

**Step 2 — Create a registry and wrap your app:**

```tsx
import { Provider, Zone } from '@enterstellar-ai/react';
import { createRegistry } from '@enterstellar-ai/registry';
import { createAgentConnection } from '@enterstellar-ai/connection';

const registry = createRegistry({ components: [contract] });
const connection = createAgentConnection({ url: 'wss://agent.example.com' });

export default function App() {
  return (
    // Provider auto-creates the compiler, store, and telemetry collector.
    <Provider registry={registry} connection={connection}>
      <YourExistingApp />
    </Provider>
  );
}
```

**Step 3 — Drop a Zone wherever you want AI-driven content:**

```tsx
import { Zone } from '@enterstellar-ai/react';

// Zone is the boundary between your static UI and AI-generated content.
// determinism={1.0} means fully locked — always the same component for the same intent.
// determinism={0.3} means generative — the AI selects the best component per context.
function Dashboard() {
  return (
    <Zone name="main-dashboard" determinism={1.0} fallback={<GenericCard title="Loading..." />} />
  );
}
```

The AI sends an intent. The compiler validates it. The renderer displays it. That's the entire pipeline.

---

## How It Works

```
 Your AI Agent
      │
      │  ComponentIntent { component, props, confidence }
      ▼
 ┌─────────────────────────────────────────────────────────┐
 │                  Enterstellar Compiler                  │
 │                                                         │
 │  1. Schema validation    — Zod parse against contract   │
 │  2. Token enforcement    — token:* references only      │
 │  3. Accessibility audit  — role, aria-* injection       │
 │  4. Self-correction      — 3-tier: coerce → example → LLM│
 │  5. Trace emission       — ForgeSignal for observability │
 └─────────────────────────────────────────────────────────┘
      │
      │  CompilationResult { status, props, errors, provenance }
      ▼
 Your Renderer  (React, React Native, Tauri — engine is agnostic)
```

**The compiler is not optional.** There is no fast path, no escape hatch, no `dangerouslyRenderRaw`. Every intent compiles. This is the guarantee that makes Enterstellar deployable in regulated environments.

---

## Why Enterstellar

**The Compiler is non-bypassable.**
Every component intent passes through schema validation, design token enforcement, and accessibility auditing before the renderer sees it. L3 is not a configuration flag. It is the architecture.

**Design System as Firmware.**
Components declare `token:danger`, not `#ff0000`. Token values are resolved by the renderer at render time against the active theme. Hardcoded visual values are compilation errors. A theme change propagates everywhere with zero component edits.

**Zero framework lock-in.**
The engine — compiler, registry, state, telemetry, forge, semantic index — is pure TypeScript with zero framework imports. React, React Native, and Tauri are adapters. The same contracts compile on all three.

**The Forge self-improves.**
Every failed resolution emits a `ForgeSignal`. The cold path clusters these signals, generates new contracts, and routes them through a human-in-the-loop review pipeline. Your registry grows automatically from real usage.

**Production-ready on day one.**
The three-tier self-correction loop (deterministic coercion → contract examples → LLM callback), the fallback component system, the per-zone error boundary, the VCR-style test fixtures — these are not future features. They ship now.

---

## The Ecosystem

| Package                                                              | Description                                                                                                           |
| :------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| [`@enterstellar-ai/react`](./packages/react)                         | React integration — Provider, Zone, lifecycle management, render cache, and hooks                                     |
| [`@enterstellar-ai/registry`](./packages/registry)                   | Component contract registry — `defineComponent()`, `createRegistry()`, and validation rules                           |
| [`@enterstellar-ai/compiler`](./packages/compiler)                   | Deterministic GenUI compiler — schema validation, design token enforcement, accessibility audits, and self-correction |
| [`@enterstellar-ai/types`](./packages/types)                         | Shared type definitions, Zod schemas, and type guards for the Enterstellar ecosystem                                  |
| [`@enterstellar-ai/state`](./packages/state)                         | Framework-agnostic persistent state — snapshot/restore, cross-device sync, migrations                                 |
| [`@enterstellar-ai/forge`](./packages/forge)                         | Component forge — LocalForge (templates) and CloudForge (LLM) contract generation                                     |
| [`@enterstellar-ai/test`](./packages/test)                           | Intent-based testing framework — deterministic harness, assertion helpers, VCR fixtures                               |
| [`@enterstellar-ai/devtools`](./packages/devtools)                   | Embedded DevTools panel — trace inspector, component inspector, cache dashboard, replay                               |
| [`@enterstellar-ai/agent-sdk`](./packages/agent-sdk)                 | AI agent SDK — MCP server with tools for component search, forge, validate, and analyze                               |
| [`@enterstellar-ai/connection`](./packages/connection)               | Agent connection factory — WebSocket/SSE/polling with auto-reconnect and backpressure                                 |
| [`@enterstellar-ai/normalizer`](./packages/normalizer)               | Protocol normalizer — converts AG-UI, A2UI, MCP, and custom events to `ComponentIntent`                               |
| [`@enterstellar-ai/semantic-index`](./packages/semantic-index)       | Semantic component search — embedding-based retrieval via cloud, local, or hybrid provider                            |
| [`@enterstellar-ai/telemetry`](./packages/telemetry)                 | ForgeSignal collection and upload — zero-PII telemetry for the Forge training corpus                                  |
| [`@enterstellar-ai/lifecycle`](./packages/lifecycle)                 | Component lifecycle state machine — loading, streaming, ready, error, and empty states                                |
| [`@enterstellar-ai/cache`](./packages/cache)                         | LRU render cache for compiled intents — deterministic zone acceleration                                               |
| [`@enterstellar-ai/adapters`](./packages/adapters)                   | Infrastructure adapter interfaces — auth, data, error handling, and analytics contracts                               |
| [`@enterstellar-ai/adapter-supabase`](./packages/adapter-supabase)   | Supabase adapter — Auth and Data adapter implementations for Supabase                                                 |
| [`@enterstellar-ai/adapter-firebase`](./packages/adapter-firebase)   | Firebase adapter — Auth and Data adapter implementations for Firebase                                                 |
| [`@enterstellar-ai/contracts-shadcn`](./packages/contracts-shadcn)   | shadcn/ui component contracts — pre-built `ComponentContract`s for shadcn/ui components                               |
| [`@enterstellar-ai/migration`](./packages/migration)                 | Component migration pipeline — AST extraction, LLM enrichment, and contract assembly                                  |
| [`@enterstellar-ai/global-index`](./packages/global-index)           | Federated contract registry — discover and publish `ComponentContract`s globally                                      |
| [`@enterstellar-ai/contract-protocol`](./packages/contract-protocol) | JSON Schema protocol spec — language-agnostic definitions for non-TypeScript renderers                                |
| [`@enterstellar-ai/cloud`](./packages/cloud)                         | Enterstellar Cloud SDK — IPU metering, trace aggregation, and CloudForge relay                                        |
| [`@enterstellar-ai/cli`](./packages/cli)                             | Enterstellar CLI — project scaffolding (`enterstellar init`) and component generation                                 |

---

## Roadmap

| Status         | Item                                                                                      |
| :------------- | :---------------------------------------------------------------------------------------- |
| ✅ Released    | `@enterstellar-ai/types`, `@enterstellar-ai/registry`, `@enterstellar-ai/compiler`        |
| ✅ Released    | `@enterstellar-ai/react`, `@enterstellar-ai/state`, `@enterstellar-ai/telemetry`          |
| ✅ Released    | `@enterstellar-ai/forge`, `@enterstellar-ai/lifecycle`, `@enterstellar-ai/cache`          |
| ✅ Released    | `@enterstellar-ai/connection`, `@enterstellar-ai/normalizer`, `@enterstellar-ai/adapters` |
| ✅ Released    | `@enterstellar-ai/test`, `@enterstellar-ai/devtools`, `@enterstellar-ai/agent-sdk`        |
| ✅ Released    | `@enterstellar-ai/contracts-shadcn`, `@enterstellar-ai/migration`, `@enterstellar-ai/cli` |
| 🔵 In progress | Tauri renderer (`@enterstellar-ai/tauri`)                                                 |
| 🔵 In progress | Expo/React Native renderer (`@enterstellar-ai/native`)                                    |
| 🔵 In progress | Enterstellar Cloud (hosted ForgeSignal corpus + semantic index)                           |
| 🗓 Planned     | VS Code extension — contract authoring, intent preview, DevTools                          |
| 🗓 Planned     | Storybook integration — contract browser with live intent testing                         |

---

## License

Enterstellar is Apache 2.0 licensed and open to contributions — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Copyright 2026 Enterstellar · [enterstellar.dev](https://enterstellar.dev)
