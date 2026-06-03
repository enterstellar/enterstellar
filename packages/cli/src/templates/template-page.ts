/**
 * @module @enterstellar-ai/cli/templates/template-page
 * @description Generates the main application page with an Zone example.
 *
 * Produces a page component that demonstrates the core Enterstellar integration:
 * - `Provider` wrapping the application with registry, compiler, and store
 * - `Zone` rendering AI-driven components with a fallback UI
 * - Determinism configuration and zone-level settings
 *
 * Template-specific behavior:
 * - `nextjs`: Outputs `src/app/page.tsx` with `'use client'` directive
 * - `vite-react`, `minimal`, `full`: Outputs `src/App.tsx` (standard React)
 *
 * @see Implementation Bible §4.17 — "Single Zone example"
 * @see Design Choice RE1, RE2 — Provider and Zone
 */

import type { ProjectTemplate } from './template-package-json.js';

// ---------------------------------------------------------------------------
// Page Path Resolution
// ---------------------------------------------------------------------------

/**
 * Returns the correct file path for the page component based on template.
 *
 * - `nextjs`: `src/app/page.tsx` (App Router convention)
 * - All others: `src/App.tsx` (standard React entry point)
 *
 * @param template - The chosen project template variant.
 * @returns The relative file path within the scaffolded project.
 *
 * @example
 * ```ts
 * getPagePath('nextjs');      // 'src/app/page.tsx'
 * getPagePath('vite-react');  // 'src/App.tsx'
 * ```
 */
export function getPagePath(template: ProjectTemplate): string {
    switch (template) {
        case 'nextjs': {
            return 'src/app/page.tsx';
        }
        case 'vite-react':
        case 'minimal':
        case 'full': {
            return 'src/App.tsx';
        }
    }
}

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates the main page/app component content for a scaffolded Enterstellar project.
 *
 * The generated file demonstrates:
 * 1. Importing and configuring `Provider` with the project registry.
 * 2. Placing an `Zone` with determinism settings and a fallback UI.
 * 3. Proper type annotations and JSDoc comments.
 *
 * @param template - The chosen project template variant.
 * @returns A TypeScript/TSX source string for the page component.
 *
 * @example
 * ```ts
 * const content = generatePage('nextjs');
 * await writeFile('my-app/src/app/page.tsx', content);
 * ```
 */
export function generatePage(template: ProjectTemplate): string {
    const useClientDirective = template === 'nextjs' ? "'use client';\n\n" : '';
    const exportStyle = template === 'nextjs' ? 'export default' : 'export';
    const functionName = template === 'nextjs' ? 'HomePage' : 'App';
    const globalsCssPath = template === 'nextjs' ? '../globals.css' : './globals.css';

    return `${useClientDirective}/**
 * ${functionName} — Enterstellar Zone Example
 *
 * This page demonstrates a basic Enterstellar integration with:
 * - An Provider wrapping the application with the component registry
 * - An Zone configured for hybrid rendering (determinism: 0.5)
 * - A fallback UI shown while the AI agent is processing
 *
 * Provider auto-creates the compiler, store, and telemetry with
 * sensible defaults (RE1, RE2). No manual configuration required.
 *
 * @see https://enterstellar.dev/docs/getting-started
 */

import '${globalsCssPath}';

import React from 'react';
import { Provider, Zone } from '@enterstellar-ai/react';

import { registry } from '${template === 'nextjs' ? '../enterstellar/registry.js' : './enterstellar/registry.js'}';

/**
 * Fallback UI displayed while the Zone is loading
 * or when no intent has been received yet.
 */
function LoadingFallback(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--spacing-3xl)',
        color: 'var(--color-text-muted)',
        fontFamily: 'var(--font-family-sans)',
        fontSize: 'var(--font-size-base)',
      }}
    >
      Waiting for AI agent...
    </div>
  );
}

/**
 * Main application component with Enterstellar integration.
 *
 * The Provider makes the registry, compiler, and store available
 * to all Zones in the component tree. Compiler, store, and
 * telemetry are auto-created with sensible defaults (RE1, RE2).
 * Each Zone independently resolves and renders AI-generated
 * components.
 */
${exportStyle} function ${functionName}(): React.ReactElement {
  return (
    <Provider registry={registry}>
      <main
        style={{
          maxWidth: '800px',
          margin: '0 auto',
          padding: 'var(--spacing-xl)',
          fontFamily: 'var(--font-family-sans)',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-text-primary)',
            marginBottom: 'var(--spacing-xl)',
          }}
        >
          Enterstellar Demo
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-base)',
            lineHeight: 'var(--font-lineHeight-relaxed)',
            marginBottom: 'var(--spacing-2xl)',
          }}
        >
          This zone will render AI-generated components from your registry.
          Connect an AI agent to start sending intents.
        </p>

        {/* 
          Zone — the core rendering surface.
          - name: unique zone identifier for tracing
          - determinism: 0.5 = hybrid mode (mix of cached and generated)
          - fallback: shown while loading or when no intent received
        */}
        <Zone
          name="demo-zone"
          determinism={0.5}
          fallback={<LoadingFallback />}
        />
      </main>
    </Provider>
  );
}
`;
}
