/**
 * Enterstellar Monorepo — Vitest Workspace Configuration
 *
 * Uses the `projects` field in the root Vitest config to discover
 * all package-level Vitest configs across the workspace.
 *
 * @see https://vitest.dev/guide/workspace
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: ['packages/*/vitest.config.ts'],
    },
});
