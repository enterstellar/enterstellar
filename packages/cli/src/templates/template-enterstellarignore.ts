/**
 * @module @enterstellar-ai/cli/templates/template-enterstellarignore
 * @description Generates the canonical `.enterstellarignore` file for `enterstellar init`.
 *
 * The `.enterstellarignore` file follows `.gitignore`-compatible syntax and defines
 * project-wide exclusion patterns for `enterstellar migrate`. It is auto-generated
 * during `enterstellar init` with sensible defaults covering React/Next.js/Vite
 * ecosystems.
 *
 * **Canonical contents are prescribed by Correction 6, L301-354** — the
 * 26 active patterns and 2 commented optional patterns are verbatim from
 * the Migration Bible. Zero improvisation.
 *
 * **Behavior rules (Correction 6, L457-473):**
 * 1. Never overwrites an existing `.enterstellarignore`.
 * 2. Includes a documentation URL in the header comment.
 * 3. Created regardless of whether the developer migrates now or later.
 * 4. Independent of the migration prompt.
 *
 * @see Correction 6 — `.enterstellarignore` + `--exclude` (3-layer exclusion model)
 * @see Correction 6, L301-354 — Canonical default contents
 * @see Correction 6, L457-473 — `enterstellar init` auto-generation rules
 */

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates the canonical `.enterstellarignore` file contents for a new Enterstellar project.
 *
 * Returns a string containing 26 active exclusion patterns organized into
 * 8 categories, plus 2 commented optional patterns for internal/private
 * directories. The header includes a documentation URL for reference.
 *
 * **Pattern categories (8):**
 * 1. Test Files — `.test.tsx`, `.spec.tsx`, `__tests__/`, `__mocks__/`, etc.
 * 2. Storybook — `.stories.tsx`, `.storybook/`
 * 3. E2E / Integration Tests — `cypress/`, `e2e/`, `playwright/`
 * 4. Generated Code — `generated/`, `*.generated.ts`
 * 5. Configuration Files — `*.config.ts`, `*.config.js`, etc.
 * 6. Build Artifacts — `dist/`, `build/`, `.next/`, `.turbo/`
 * 7. Type Declarations — `*.d.ts`
 * 8. Internal / Private — commented optional (internal/, private/)
 *
 * @returns The `.enterstellarignore` file contents as a string (includes trailing newline).
 *
 * @example
 * ```ts
 * import { generateEnterstellarIgnore } from '../templates/template-enterstellarignore.js';
 *
 * const content = generateEnterstellarIgnore();
 * await writeFile('.enterstellarignore', content);
 * // Creates .enterstellarignore with 26 active + 2 optional exclusion patterns
 * ```
 *
 * @see Correction 6, L301-354 — verbatim canonical contents
 */
export function generateEnterstellarIgnore(): string {
    // Correction 6, L301-354: Verbatim canonical contents.
    // Every pattern below is prescribed by the Migration Bible.
    // Do NOT add, remove, or reorder patterns without updating the spec.
    return `# .enterstellarignore — Files excluded from \`enterstellar migrate\`
# Syntax: .gitignore-compatible glob patterns
# Docs: https://enterstellar.dev/docs/cli/enterstellarignore

# ── Test Files ────────────────────────────────────────────────────────
**/*.test.tsx
**/*.test.ts
**/*.spec.tsx
**/*.spec.ts
**/__tests__/**
**/__mocks__/**
**/test-utils/**
**/fixtures/**

# ── Storybook ─────────────────────────────────────────────────────────
**/*.stories.tsx
**/*.stories.ts
**/.storybook/**

# ── E2E / Integration Tests ──────────────────────────────────────────
**/cypress/**
**/e2e/**
**/playwright/**

# ── Generated Code ───────────────────────────────────────────────────
**/generated/**
**/*.generated.ts
**/*.generated.tsx

# ── Configuration Files (not components) ─────────────────────────────
*.config.ts
*.config.tsx
*.config.js
*.config.mjs

# ── Build Artifacts ──────────────────────────────────────────────────
**/dist/**
**/build/**
**/.next/**
**/.turbo/**

# ── Type Declarations (no component logic) ───────────────────────────
**/*.d.ts

# ── Internal / Private (uncomment if internal components should NOT be migrated) ──
# NOTE: Many codebases use internal/ for real components (BaseInput, BaseButton)
# that are consumed by public wrappers. Only uncomment if your internal/ directory
# contains utilities, not components.
# **/internal/**
# **/private/**
`;
}
