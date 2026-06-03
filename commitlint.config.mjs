/**
 * Enterstellar Monorepo — commitlint Configuration
 *
 * Enforces conventional commit messages with Enterstellar-specific types.
 * Validates commit messages via Husky commit-msg hook.
 *
 * Allowed types: feat, fix, chore, breaking, docs, test, refactor, perf
 *
 * @see agent/05-enterstellar-coding-rules.md — Commit Convention
 */
export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            ['feat', 'fix', 'chore', 'breaking', 'docs', 'test', 'refactor', 'perf'],
        ],
        'subject-case': [2, 'always', 'lower-case'],
        'header-max-length': [2, 'always', 100],
        'body-max-line-length': [1, 'always', 200],
    },
};
