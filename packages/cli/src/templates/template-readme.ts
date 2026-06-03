/**
 * @module @enterstellar-ai/cli/templates/template-readme
 * @description Generates a `README.md` getting-started guide for the scaffolded project.
 *
 * Produces a comprehensive README covering the 5-step onboarding path
 * defined in Tasks M3.4:
 *
 * 1. Install dependencies
 * 2. Register a component
 * 3. Add an Zone
 * 4. Run tests
 * 5. Open DevTools
 *
 * The README uses the project name and detected package manager
 * to produce contextually accurate commands.
 *
 * @see Tasks M3.4 — "Include README with getting started guide"
 * @see Implementation Bible §4.17
 */

import type { PackageManager } from '../utils/detect-package-manager.js';

// ---------------------------------------------------------------------------
// Run Command Helper
// ---------------------------------------------------------------------------

/**
 * Returns the correct `run` command prefix for a given package manager.
 *
 * - `npm` → `npm run`
 * - `pnpm` → `pnpm`
 * - `yarn` → `yarn`
 * - `bun` → `bun run`
 *
 * @param pm - The package manager.
 * @returns Command prefix for `run` scripts.
 */
function getRunPrefix(pm: PackageManager): string {
    switch (pm) {
        case 'npm': {
            return 'npm run';
        }
        case 'pnpm': {
            return 'pnpm';
        }
        case 'yarn': {
            return 'yarn';
        }
        case 'bun': {
            return 'bun run';
        }
    }
}

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates a `README.md` for a scaffolded Enterstellar project.
 *
 * The README is tailored to the project name and package manager,
 * producing accurate commands the developer can copy-paste immediately.
 *
 * @param projectName - The project name (kebab-case).
 * @param packageManager - The detected or chosen package manager.
 * @returns A Markdown string for the project's `README.md`.
 *
 * @example
 * ```ts
 * const content = generateReadme('my-enterstellar-app', 'pnpm');
 * await writeFile('my-enterstellar-app/README.md', content);
 * ```
 */
export function generateReadme(
    projectName: string,
    packageManager: PackageManager,
): string {
    const run = getRunPrefix(packageManager);

    return `# ${projectName}

An Enterstellar-powered application with AI-driven generative UI.

## Quick Start

\`\`\`bash
# Install dependencies
${packageManager} install

# Start the development server
${run} dev

# Run tests
${run} test

# Type check
${run} typecheck
\`\`\`

## Project Structure

\`\`\`
${projectName}/
├── src/
│   ├── enterstellar/
│   │   ├── registry.ts          # Component registry (5 example components)
│   │   ├── tokens.ts            # Design token set (colors, spacing, typography)
│   │   └── components/
│   │       ├── ExampleCard.tsx   # Summary card component
│   │       ├── ExampleList.tsx   # Filterable list component
│   │       ├── ExampleChart.tsx  # Bar chart component
│   │       ├── ExampleForm.tsx   # Input form component
│   │       └── ExampleDetail.tsx # Key-value detail view
│   ├── app/
│   │   └── page.tsx             # Main page with Zone
│   └── tests/
│       └── enterstellar.test.ts         # Intent-based tests
├── package.json
├── tsconfig.json
└── README.md
\`\`\`

## How It Works

### 1. Register Components

Components are defined with \`defineComponent()\` and registered in \`src/enterstellar/registry.ts\`.
Each component has a **contract** — a Zod schema that the AI must satisfy:

\`\`\`typescript
import { defineComponent } from '@enterstellar-ai/registry';
import { z } from 'zod';

const MyComponentContract = defineComponent({
  name: 'MyComponent',
  description: 'A brief description of what this component displays.',
  category: 'data-display',
  tags: ['example'],
  props: z.object({
    title: z.string(),
  }),
  // ... semantics, tokens, states, accessibility, render
});
\`\`\`

### 2. Add an Zone

An \`Zone\` is a rendering surface where AI-generated components appear:

\`\`\`tsx
import { Provider, Zone } from '@enterstellar-ai/react';

<Provider registry={registry}>
  <Zone
    name="my-zone"
    determinism={0.5}
    fallback={<div>Loading...</div>}
  />
</Provider>
\`\`\`

### 3. Run Tests

Write intent-based tests to verify your components resolve correctly:

\`\`\`bash
${run} test
\`\`\`

### 4. Add a New Component

Use the Enterstellar CLI to scaffold a new component with all boilerplate:

\`\`\`bash
npx @enterstellar-ai/cli add component MyNewComponent
\`\`\`

This creates:
- \`MyNewComponent.contract.ts\` — Zod schema + defineComponent()
- \`MyNewComponent.tsx\` — React render function
- \`MyNewComponent.test.ts\` — Intent test with mock harness
- \`MyNewComponent.fixture.json\` — Example props

## Learn More

- [Enterstellar Documentation](https://enterstellar.dev/docs)
- [Component Contracts](https://enterstellar.dev/docs/contracts)
- [Design Tokens](https://enterstellar.dev/docs/design-tokens)
- [Intent Testing](https://enterstellar.dev/docs/testing)
- [DevTools](https://enterstellar.dev/docs/devtools)
`;
}
