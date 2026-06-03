# playground

> Enterstellar Playground marketing site and Compiler Playground — the primary acquisition funnel for Enterstellar Playground.

## Purpose

`playground` is the Enterstellar Playground marketing site served at `enterstellar.dev`. It is the catch-all Worker for the `enterstellar.dev` domain — all paths not matched by more specific Workers (`/blog/*`, `/docs/*`) route here.

Most importantly, this application houses the **Enterstellar Compiler Playground** (`/playground`), a live GenUI engineering environment where users can submit natural-language intents to an LLM via the Vercel AI SDK and witness the strict `@enterstellar-ai/compiler` independently intercept, validate, self-correct, and render UI natively in the browser.

This Worker also serves the domain's `robots.txt` — the **sole mechanism for cross-Worker sitemap discovery** across all `enterstellar.dev` subpath Workers.

---

## Quick Start

```bash
# 1. Provide API Keys (Create .env in apps/playground)
GROQ_API_KEY=gsk_your_key_here
GOOGLE_GENERATIVE_AI_API_KEY=AIza_your_key_here

# 2. Development server
pnpm --filter playground dev

# 3. Type checking
pnpm --filter playground typecheck

# 4. Production build (OpenNext configuration)
pnpm turbo run build --filter=playground

# 5. Deploy to Cloudflare Workers
pnpm --filter playground deploy
```

---

## API Reference & Application Architecture

Since this is an application rather than a published Engine Package, its architecture relies on bridging LLM reasoning onto internal Enterstellar ecosystem packages.

### Playground Core Modules

| Path                                    | Description                                                                                                                                                          |
| :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/src/app/api/playground/route.ts`      | The Next.js API Route. Processes `intent`, `scene`, and `mode`. Injects strict domain data contexts (`/src/enterstellar/data-contexts/`) into the prompt.            |
| `/src/components/playground/`           | The visual orchestrators. Features the inverted layout with sticky-bottom controls, and the `EducationalTraceConsole` for Master-Detail step-by-step trace analysis. |
| `/src/enterstellar/agent-connection.ts` | The bridge. Unites browser `fetch()` and Vercel AI SDK responses with Enterstellar's `EnterstellarAgentConnection` internal event emitter protocol.                  |
| `/src/enterstellar/registry.tsx`        | Production UI components paired with strict Zod schemas across 5 domains (Finance, Medical, Commerce, SaaS, Education), encompassing 39 robust component contracts.  |
| `/src/enterstellar/scenes/`             | Universal `PlaygroundScene` structures bridging atomic components ("Quick Demos") up to 9-zone enterprise dashboards ("Domain Demos").                               |

### Playground Execution Modes

The playground API routes requests via three configurable, visually distinct operation modes designed to prove the compiler's resilience and Enterstellar's strategic moats:

| Mode              | Theme     | What It Does                                                                                                                                                                                                                                                                                                                         |
| :---------------- | :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Healthy**       | Green     | Standard pipeline. Intentionally flawless prompt constraints bypass validation traps smoothly, demonstrating high-performance native rendering.                                                                                                                                                                                      |
| **Hallucinating** | Red/Amber | Dual-grid adversarial mode ("The Moat"). `route.ts` fires a sabotaged prompt entirely missing the Zod schema manifest alongside a healthy prompt. The `SceneGrid` renders a 65% "Enterstellar Protected" view vs a 35% "Without Enterstellar" view to visually prove the necessity of the compiler intercepting `[ENS-3004]` errors. |
| **Cloud**         | Purple    | Simulation mode intercepting failed registry matches and demonstrating the impending LocalForge/CloudForge fallback capabilities.                                                                                                                                                                                                    |

### Application-Level Compiler Interventions

Unlike pure Engine logic, this app actively intervenes on Engine rules to handle external network payloads cleanly.

| Intercept                        | How It Works                                                                                                                                                                                                              |
| :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Data Context Injection**       | Real-world data sets (`medical.md`, `finance.md`, etc.) are injected directly into the LLM system prompt, forcing deterministic extraction and avoiding random "lorem ipsum" generation.                                  |
| **Synchronous Trace Validation** | The `PlaygroundShell` directly runs the Zod `safeParse` against the `playgroundContracts` to guarantee the global trace store and the UI rendering pipeline are always perfectly synchronized (`[ENS-2001]` exact paths). |

---

## SEO Infrastructure

### Sitemap (`sitemap.ts`)

Static sitemap listing all marketing pages with fixed `LAST_UPDATED` date constant. Does NOT use `new Date()` — Google warns that inaccurate `lastModified` values reduce sitemap trustworthiness.

| Page          | Priority | Change Frequency |
| :------------ | :------- | :--------------- |
| `/` (root)    | `1.0`    | `weekly`         |
| `/playground` | `0.9`    | `monthly`        |
| `/pricing`    | `0.8`    | `monthly`        |
| `/enterprise` | `0.7`    | `monthly`        |
| `/about`      | `0.6`    | `monthly`        |

### Robots (`robots.ts`)

Serves `robots.txt` via Next.js Metadata API. Declares all three sitemaps on the `enterstellar.dev` domain:

```
Sitemap: https://enterstellar.dev/sitemap.xml          # This Worker (marketing)
Sitemap: https://enterstellar.dev/blog/sitemap.xml     # compiler-blog Worker
Sitemap: https://enterstellar.dev/docs/sitemap.xml     # compiler-docs Worker (in this repo)
```

All crawlers (including AI crawlers — GPTBot, ClaudeBot, PerplexityBot) are allowed unrestricted access.

---

## Configuration

### Wrangler (`wrangler.jsonc`)

| Field                 | Value                                                   |
| :-------------------- | :------------------------------------------------------ |
| `name`                | `playground`                                            |
| `main`                | `.open-next/worker.js`                                  |
| `compatibility_date`  | `2025-09-27`                                            |
| `compatibility_flags` | `nodejs_compat`, `global_fetch_strictly_public`         |
| Route                 | `enterstellar.dev/*` (catch-all, lowest priority — WP5) |

### Environment Variables

| Variable                       | Required | Default | Description                                                            |
| :----------------------------- | :------- | :------ | :--------------------------------------------------------------------- |
| `GROQ_API_KEY`                 | **Yes**  | —       | Powers the primary `gpt-oss-120b` (Groq/Llama-3-70b) reasoning engine. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No       | —       | Generative AI keys serving the Gemini Flash 3.0 fallback lane.         |

### Design Tokens

Imports `@enterstellar-web/tokens/base.css` (shared foundation) and `@enterstellar-web/tokens/cloud.css` (enterprise blue accent) via `globals.css`. Playground specifically utilizes `.enterstellar-scene-{theme}` string scoping to dynamically override these global variants.

---

## See Also

- [Implementation Bible §4.5](../../agent/03-enterstellar-implementation-bible.md)
- [Design Choices — Module 3](../../agent/04-enterstellar-design-choices.md)
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md)
