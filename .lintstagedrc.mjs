/**
 * Enterstellar Monorepo — lint-staged Configuration
 *
 * Runs ESLint + Prettier on staged TypeScript files only.
 * Triggered by Husky pre-commit hook for fast, focused commits.
 *
 * @see agent/06-enterstellar-setup.md — DX Tooling Chain
 */
export default {
    '*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
    '*.{json,md,yaml,yml}': ['prettier --write'],
};
