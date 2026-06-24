# @enterstellar-ai/docs

> Official documentation, technical specifications, architecture blueprints, and interactive API references for the Enterstellar OS ecosystem.

## Purpose

`@enterstellar-ai/docs` is the developer portal and official specification hub for the Enterstellar OS. It operates entirely on the **Core UI** engine (formerly Fumadocs) and compiles human-readable Markdown/MDX into a fast, searchable web interface hosted on Vercel.

Beyond serving standard documentation, this application uniquely hosts **interactive Component Sandboxes** that live-demonstrate the Enterstellar Compiler pipeline. Users can witness strict Zod schema validation, deterministic coercion, and 3-tier self-correction cascading in real-time natively in the browser.

---

## Architectural Pipeline

The documentation is statically generated at build time using a highly optimized MDX pipeline that separates AST transformation from React component rendering.

### 1. MDX Transformation Pipeline (`source.config.ts`)

The pipeline runs synchronously for standard processing but uses dynamic async imports for heavy Node.js packages to prevent bundling them into Vercel's runtime.

| Stage      | Transformer / Plugin           | Function                                                                   |
| :--------- | :----------------------------- | :------------------------------------------------------------------------- |
| **Remark** | `remarkSteps`                  | Converts step-by-step numbered sections into structural UI elements.       |
| **Remark** | `remarkMath`                   | Parses KaTeX math notation.                                                |
| **Remark** | `remarkFeedbackBlock`          | Injects inline GitHub Discussions feedback widgets.                        |
| **Remark** | `remarkAutoTypeTable`          | Auto-generates TypeScript prop tables from exported types.                 |
| **Remark** | `remarkTypeScriptToJavaScript` | Transpiles TS code tabs into equivalent JS tabs on the fly.                |
| **Rehype** | `rehypeKatex`                  | Renders KaTeX into final HTML nodes (runs before syntax highlighting).     |
| **Rehype** | `rehypeCode`                   | Integrates Shiki for syntax highlighting (`catppuccin` themes).            |
| **Shiki**  | `transformerTwoslash`          | Injects inline TypeScript type annotations on hover using FS-cached types. |
| **Shiki**  | `transformerEscape`            | Unescapes `[\!code` notation back to `[!code` for meta-documentation.      |

### 2. Component Overrides (`page.tsx`)

At runtime, the AST is rendered with **14 strict component overrides** to enforce the Enterstellar design system and inject custom logic:

| Override        | Target Component           | Purpose                                                             |
| :-------------- | :------------------------- | :------------------------------------------------------------------ |
| `a`             | `HoverCard` + `Link`       | Displays cross-reference page descriptions on hover.                |
| `blockquote`    | `Callout`                  | Upgrades standard blockquotes into styled info/warn/error callouts. |
| `Banner`        | Core UI `Banner`           | Global page-level announcement banners.                             |
| `Mermaid`       | `@/components/mdx/mermaid` | Native Mermaid diagram rendering.                                   |
| `FeedbackBlock` | `FeedbackBlock`            | Wires up inline user feedback to GitHub Discussions.                |
| `TypeTable`     | Core UI `TypeTable`        | Displays the auto-generated prop interfaces.                        |
| `...Twoslash`   | Core Twoslash UI           | Interactive type definitions via Shiki.                             |

### 3. Pre-Rendering Strategy

All pages are pre-rendered at build time via `generateStaticParams()`. This delegates to the core source API which generates slug arrays for every page in the content tree. Server-side rendering (SSR) is strictly avoided to guarantee instantaneous Edge delivery.

---

## Interactive Preview System

The application features a unique preview system mapped via the `preview` frontmatter key in `source.config.ts`. These previews (located in `src/components/preview/index.tsx`) act as live functional demonstrations of the **Enterstellar Pipeline**:

- **Component Contracts**: Demonstrating the declaration of intent, design tokens, and lifecycle state hooks.
- **Compilation Pipeline**: Visualizing the execution of the Compiler against a payload (`"status": "corrected"`).
- **Self-Correction Tiers**: Documenting the fallback mechanisms (Tier 1 Coercion, Tier 2 Examples, Tier 3 LLM callbacks).
- **Verification Harness**: Showing the testing workflow with `createTestHarness` and Vitest matchers.

---

## Execution Modes

| Mode            | Trigger      | Behavior                                                                                                                                         |
| :-------------- | :----------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Production**  | `pnpm build` | Full pipeline execution. Generates JSON Schemas, extracts `git log` timestamps for `lastModified`, runs Twoslash parsing, and emits static HTML. |
| **Development** | `pnpm dev`   | Live reloading via Next.js middleware.                                                                                                           |
| **Lint Mode**   | `LINT=1`     | Skips all expensive Shiki/Twoslash processing. Only extracts element IDs for `next-validate-link` CI validation.                                 |

---

## Configuration Map

The application's strict boundaries are maintained across three core configuration files:

### 1. `source.config.ts`

Manages the MDX content ingestion. Extends the frontmatter schema with:

- `preview`: `z.string().optional()` — Maps to a preview component key.
- `index`: `z.boolean().default(false)` — Flag to render sibling category navigation cards.
- `method`: `z.string().optional()` — HTTP method badges for API routes.

### 2. `next.config.ts`

Orchestrates the Next.js bundle:

- **`withMDX`**: Wraps the config to inject the Core MDX pipeline.
- **`reactCompiler: true`**: Ahead-of-time React memoization.
- **`@next/bundle-analyzer`**: Conditional bundle analysis (`ANALYZE=true`).
- **ESM Transpilation**: Forces transpilation of internal `@enterstellar-ai/*` packages.

---

## See Also

- [Implementation Bible §4.2](../../agent/03-enterstellar-implementation-bible.md) — Documentation rendering specs and error codes.
- [Design Choices — Module 4](../../agent/04-enterstellar-design-choices.md) — Unified styling token mappings.
- [Coding Rules](../../agent/05-enterstellar-coding-rules.md) — Module standard layouts and contributor workflows.
