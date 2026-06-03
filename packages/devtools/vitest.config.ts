/**
 * @module @enterstellar-ai/devtools/vitest.config
 * @description Vitest configuration for the `@enterstellar-ai/devtools` package.
 *
 * Aligned with `@enterstellar-ai/react` vitest.config.ts:
 * - jsdom environment for DOM-based tests
 * - globals enabled for Vitest API
 * - v8 coverage provider with 90% thresholds
 *
 * @internal
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        include: [
            '__tests__/**/*.test.ts',
            '__tests__/**/*.test.tsx',
        ],
        setupFiles: ['__tests__/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts', 'src/**/*.tsx'],
            exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/index.ts'],
            thresholds: {
                lines: 90,
                functions: 90,
                branches: 90,
                statements: 90,
            },
        },
    },
});
