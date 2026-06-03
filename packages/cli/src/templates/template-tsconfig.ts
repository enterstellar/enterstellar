/**
 * @module @enterstellar-ai/cli/templates/template-tsconfig
 * @description Generates a `tsconfig.json` for the scaffolded Enterstellar project.
 *
 * Embeds Enterstellar's full 15-flag ultra-strict TypeScript configuration inline
 * so the scaffolded project is self-contained — no dependency on an external
 * `tsconfig.base.json` that the user doesn't have.
 *
 * Template-specific adjustments:
 * - `nextjs`: `jsx: "preserve"`, Next.js compiler plugin, path aliases.
 * - `vite-react`, `minimal`, `full`: `jsx: "react-jsx"`, standard config.
 *
 * @see Setup Guide — TypeScript Strictness (3 tiers, 15 flags)
 * @see Implementation Bible §4.17
 */

import type { ProjectTemplate } from './template-package-json.js';

// ---------------------------------------------------------------------------
// Shared Strict Config
// ---------------------------------------------------------------------------

/**
 * Enterstellar's 15-flag ultra-strict TypeScript compiler options.
 *
 * Three tiers:
 * - Tier 1 — Core Strict (5 flags)
 * - Tier 2 — Extended / Enterprise-Grade (5 flags)
 * - Tier 3 — Ultra-Strict / Compiler-Grade (5 flags)
 *
 * Plus build flags for ESM support.
 */
const STRICT_COMPILER_OPTIONS = {
    /* Tier 1 — Core Strict */
    strict: true,
    strictNullChecks: true,
    strictBindCallApply: true,
    strictFunctionTypes: true,
    strictPropertyInitialization: true,

    /* Tier 2 — Extended (Enterprise-Grade) */
    noImplicitAny: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    noUnusedParameters: true,

    /* Tier 3 — Ultra-Strict (Compiler-Grade) */
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noPropertyAccessFromIndexSignature: true,
    noFallthroughCasesInSwitch: true,
    useUnknownInCatchVariables: true,

    /* Build flags */
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    isolatedModules: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    declaration: true,
    sourceMap: true,
} as const;

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates a `tsconfig.json` string for a scaffolded Enterstellar project.
 *
 * All templates receive Enterstellar's full 15-flag ultra-strict configuration.
 * The `jsx` mode and additional settings vary by template:
 *
 * - `nextjs`: `jsx: "preserve"`, Next.js plugin, path alias `@/*`.
 * - All others: `jsx: "react-jsx"`.
 *
 * @param template - The chosen project template variant.
 * @returns A JSON string (2-space indented) representing `tsconfig.json`.
 *
 * @example
 * ```ts
 * const json = generateTsconfig('nextjs');
 * await writeFile('my-app/tsconfig.json', json);
 * ```
 */
export function generateTsconfig(template: ProjectTemplate): string {
    const tsconfig = buildTsconfigObject(template);
    return JSON.stringify(tsconfig, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the tsconfig object for a given template.
 * Exhaustive switch — every template variant is handled.
 */
function buildTsconfigObject(
    template: ProjectTemplate,
): Record<string, unknown> {
    switch (template) {
        case 'nextjs': {
            return {
                compilerOptions: {
                    ...STRICT_COMPILER_OPTIONS,
                    jsx: 'preserve',
                    lib: ['dom', 'dom.iterable', 'esnext'],
                    allowJs: true,
                    incremental: true,
                    plugins: [{ name: 'next' }],
                    paths: {
                        '@/*': ['./src/*'],
                    },
                },
                include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
                exclude: ['node_modules'],
            };
        }
        case 'vite-react': {
            return {
                compilerOptions: {
                    ...STRICT_COMPILER_OPTIONS,
                    jsx: 'react-jsx',
                    lib: ['dom', 'dom.iterable', 'esnext'],
                },
                include: ['src'],
                exclude: ['node_modules'],
            };
        }
        case 'minimal': {
            return {
                compilerOptions: {
                    ...STRICT_COMPILER_OPTIONS,
                    jsx: 'react-jsx',
                    lib: ['dom', 'dom.iterable', 'esnext'],
                },
                include: ['src'],
                exclude: ['node_modules'],
            };
        }
        case 'full': {
            return {
                compilerOptions: {
                    ...STRICT_COMPILER_OPTIONS,
                    jsx: 'react-jsx',
                    lib: ['dom', 'dom.iterable', 'esnext'],
                },
                include: ['src'],
                exclude: ['node_modules'],
            };
        }
    }
}
