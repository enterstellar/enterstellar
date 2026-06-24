/**
 * Enterstellar Monorepo — ESLint Flat Configuration
 *
 * Production-grade linting with:
 * - TypeScript strict type-checked rules
 * - `@typescript-eslint/no-explicit-any` → error (Coding Rules: "No `any`")
 * - L15 enforcement: engine packages cannot import React or any framework
 *
 * @see agent/05-enterstellar-coding-rules.md — Dependency Rules
 * @see agent/06-enterstellar-setup.md — DX Tooling Chain
 */
import eslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';

/** Engine packages that must NEVER import framework dependencies (L15). */
const ENGINE_PACKAGES = [
    'packages/types',
    'packages/registry',
    'packages/compiler',
    'packages/state',
    'packages/telemetry',
    'packages/cache',
    'packages/semantic-index',
    'packages/lifecycle',
    'packages/normalizer',
    'packages/forge',
    'packages/adapters',
    'packages/agent-sdk',
    'packages/connection',
    'packages/cloud',
    'packages/global-index',
    'packages/contract-protocol',
];

/** Framework imports forbidden in engine packages. */
const FORBIDDEN_FRAMEWORK_IMPORTS = [
    { name: 'react', message: 'L15 violation: engine packages must not import React.' },
    { name: 'react-dom', message: 'L15 violation: engine packages must not import react-dom.' },
    {
        name: 'react-dom/client',
        message: 'L15 violation: engine packages must not import react-dom/client.',
    },
    {
        name: 'react-native',
        message: 'L15 violation: engine packages must not import react-native.',
    },
];

export default [
    // ==========================================
    // Global ignores
    // ==========================================
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/coverage/**',
            '**/.turbo/**',
            '**/.next/**',
            '**/.changeset/**',
            'storybook-static/**',
            '**/next-env.d.ts',
        ],
    },

    // ==========================================
    // TypeScript source files — all packages
    // ==========================================
    {
        files: [
            'packages/*/src/**/*.ts',
            'packages/*/src/**/*.tsx',
            'packages/*/__tests__/**/*.ts',
            'packages/*/vitest.config.ts',
            'packages/*/tsup.config.ts',
            'apps/*/src/**/*.ts',
            'apps/*/src/**/*.tsx',
            'apps/*/next.config.ts',
            'apps/*/source.config.ts',
            'examples/*/src/**/*.ts',
            'examples/*/src/**/*.tsx',
        ],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.ts', 'packages/*/*.ts', 'examples/*/*.ts'],
                    defaultProject: 'tsconfig.base.json'
                },
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.node,
                ...globals.es2022,
            },
        },
        plugins: {
            '@typescript-eslint': eslint,
            'unused-imports': unusedImports,
        },
        rules: {
            // ── Strict TypeScript rules ──────────────────────────────
            ...eslint.configs['strict-type-checked']?.rules,

            // No `any` — ever. Not explicit, not implicit.
            // See: 05-enterstellar-coding-rules.md § "Strict Types at All Times"
            '@typescript-eslint/no-explicit-any': 'error',

            // Enforce consistent type imports for tree-shaking.
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],

            // Require return types on exported functions for API stability.
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                {
                    allowExpressions: true,
                    allowTypedFunctionExpressions: true,
                    allowHigherOrderFunctions: true,
                },
            ],

            // Enforce exhaustive switch statements — aligns with noFallthroughCasesInSwitch.
            '@typescript-eslint/switch-exhaustiveness-check': 'error',

            // Prefer nullish coalescing for safer undefined/null handling.
            '@typescript-eslint/prefer-nullish-coalescing': 'error',

            // Prefer optional chaining for cleaner code.
            '@typescript-eslint/prefer-optional-chain': 'error',

            // No floating promises — all async must be awaited or explicitly voided.
            '@typescript-eslint/no-floating-promises': 'error',

            // No misused promises (e.g., passing async to non-async callback).
            '@typescript-eslint/no-misused-promises': 'error',

            // Override strict-type-checked's no-unused-vars to respect `_` prefix
            // convention for intentionally unused params (e.g., `_state` in memory.ts).
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                },
            ],

            // ── Unused Imports ───────────────────────────────────────
            // Catches and auto-fixes unused imports (both value and type).
            // tsc's noUnusedLocals only catches value imports; this plugin
            // also catches unused `import type` statements.
            // Auto-fixable: `eslint --fix` removes dead imports.
            'unused-imports/no-unused-imports': 'error',

            // Complement the above with unused-vars detection.
            // Respects `_` prefix convention for intentionally unused params
            // (e.g., `_state` in memory adapter's save() method).
            'unused-imports/no-unused-vars': [
                'warn',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                },
            ],
        },
    },

    // ==========================================
    // L15 Enforcement — Engine packages: zero framework imports
    // CI must fail if any engine package imports react/react-dom/react-native.
    // See: 05-enterstellar-coding-rules.md § "Dependency Rules"
    // ==========================================
    {
        files: ENGINE_PACKAGES.map((pkg) => `${pkg}/src/**/*.ts`),
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: FORBIDDEN_FRAMEWORK_IMPORTS,
                    patterns: [
                        {
                            group: ['react*', 'react-dom*', 'react-native*'],
                            message: 'L15 violation: engine packages must not import framework dependencies.',
                        },
                    ],
                },
            ],
        },
    },

    // ==========================================
    // Next.js App Router — Docs app
    //
    // The docs app uses Next.js 16 App Router (RSC) which has patterns
    // incompatible with some strict-type-checked rules:
    // - Default exports (required by Next.js pages/layouts)
    // - Async components (RSC pattern returns Promise<JSX.Element>)
    //
    // @see archive/WEB/enterstellar-web-implementation-plan.md
    // @see archive/WEB/enterstellar-web-presence-appendix.md — WP3
    // ==========================================
    {
        files: ['apps/*/src/**/*.ts', 'apps/*/src/**/*.tsx'],
        rules: {
            // Next.js pages/layouts require default exports
            '@typescript-eslint/no-restricted-exports': 'off',

            // Next.js RSC pages are async functions returning JSX — the
            // misused-promises rule false-positives on these.
            '@typescript-eslint/no-misused-promises': [
                'error',
                { checksVoidReturn: { attributes: false } },
            ],
        },
    },

    // ==========================================
    // Playground app — shadcn/ui generated components (third-party code)
    //
    // Playground app contains shadcn/ui generated component files,
    // hooks, and utilities without explicit return types or strict
    // lint compliance.
    //
    // Relaxed rules:
    // - explicit-function-return-type: shadcn functions use inference
    // - restrict-template-expressions: template literals in hooks
    // - no-confusing-void-expression: void arrow returns in hooks
    // - prefer-nullish-coalescing: uses || for className composition
    //
    // @see https://ui.shadcn.com — component source
    // ==========================================
    {
        files: [
            'apps/playground/src/components/**/*.ts',
            'apps/playground/src/components/**/*.tsx',
            'apps/playground/src/hooks/**/*.ts',
            'apps/playground/src/lib/utils.ts',
        ],
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/no-unnecessary-type-arguments': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
        },
    },

    // ==========================================
    // Docs app — shadcn/fumadocs generated components (third-party code)
    //
    // shadcn/fumadocs generate ~55 component files, hooks, and utilities
    // without explicit return types or strict lint compliance. These
    // are upstream-generated files, not hand-written Enterstellar code.
    //
    // Relaxed rules:
    // - explicit-function-return-type: shadcn functions use inference
    // - restrict-template-expressions: use-mobile.ts template literals
    // - no-confusing-void-expression: use-mobile.ts void arrow returns
    // - prefer-nullish-coalescing: toggle-group.tsx uses || for className
    //
    // @see https://ui.shadcn.com — component source
    // ==========================================
    {
        files: [
            'apps/docs/src/components/ui/**/*.ts',
            'apps/docs/src/components/ui/**/*.tsx',
            'apps/docs/src/hooks/**/*.ts',
            'apps/docs/src/lib/metadata.ts',
        ],
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/no-confusing-void-expression': 'off',
            '@typescript-eslint/prefer-nullish-coalescing': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/no-unnecessary-type-arguments': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
        },
    },

    // ==========================================
    // Test files — relaxed rules
    // ==========================================
    {
        files: ['**/*.test.ts', '**/*.test-d.ts', '**/__tests__/**/*.ts'],
        rules: {
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
        },
    },
];
