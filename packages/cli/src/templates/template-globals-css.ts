/**
 * @module @enterstellar-ai/cli/templates/template-globals-css
 * @description Generates `src/globals.css` — CSS custom properties from design tokens.
 *
 * Maps the `DesignTokenSet` dot-notation paths to CSS custom properties
 * in a `:root` block, making token values available to component render
 * functions via `var(--token-path)`.
 *
 * The mapping is mechanical and 1:1:
 * - Token path `color.primary.base` → CSS custom property `--color-primary-base`
 * - Token path `spacing.lg` → CSS custom property `--spacing-lg`
 *
 * All values MUST exactly match those in `template-tokens.ts` to ensure
 * visual consistency between the JS token object and the CSS runtime layer.
 *
 * @see Principle L9 — Design Tokens as Firmware
 * @see Implementation Bible §4.17 — scaffolded project structure
 */

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates the `src/globals.css` file content for a scaffolded Enterstellar project.
 *
 * The generated file contains a single `:root` block with CSS custom properties
 * for every design token defined in the companion `tokens.ts` file. This ensures
 * that all `var(--*)` references in scaffolded component render functions
 * (e.g., `var(--color-primary-base)`, `var(--spacing-lg)`) resolve correctly.
 *
 * Token categories covered:
 * 1. **Colors** — primary, secondary, neutral, semantic, background, text
 * 2. **Spacing** — 4px base scale (xs through 3xl)
 * 3. **Typography** — font families, sizes, weights, line heights
 * 4. **Border Radii** — none through full
 * 5. **Shadows** — elevation system (none through 2xl)
 *
 * @returns A CSS source string for `src/globals.css`.
 *
 * @example
 * ```ts
 * const content = generateGlobalsCss();
 * await writeFile('my-app/src/globals.css', content);
 * ```
 */
export function generateGlobalsCss(): string {
    return `/**
 * Enterstellar Design Token — CSS Custom Properties
 *
 * Auto-generated alongside the DesignTokenSet in tokens.ts.
 * Maps token paths (e.g., 'color.neutral.200') to CSS custom properties
 * (e.g., --color-neutral-200) for use in component render functions.
 *
 * All values match those exported in src/enterstellar/tokens.ts exactly.
 * Adjust both files together when customizing your brand.
 *
 * @see https://enterstellar.dev/docs/design-tokens
 */

:root {
  /* =========================================================================
   * Colors — Primary
   * ========================================================================= */
  --color-primary-base: #6366F1;
  --color-primary-hover: #4F46E5;
  --color-primary-active: #4338CA;
  --color-primary-light: #E0E7FF;
  --color-primary-contrast: #FFFFFF;

  /* =========================================================================
   * Colors — Secondary
   * ========================================================================= */
  --color-secondary-base: #8B5CF6;
  --color-secondary-hover: #7C3AED;
  --color-secondary-active: #6D28D9;
  --color-secondary-light: #EDE9FE;
  --color-secondary-contrast: #FFFFFF;

  /* =========================================================================
   * Colors — Neutral
   * ========================================================================= */
  --color-neutral-50: #F8FAFC;
  --color-neutral-100: #F1F5F9;
  --color-neutral-200: #E2E8F0;
  --color-neutral-300: #CBD5E1;
  --color-neutral-400: #94A3B8;
  --color-neutral-500: #64748B;
  --color-neutral-600: #475569;
  --color-neutral-700: #334155;
  --color-neutral-800: #1E293B;
  --color-neutral-900: #0F172A;

  /* =========================================================================
   * Colors — Semantic
   * ========================================================================= */
  --color-success-base: #10B981;
  --color-success-light: #D1FAE5;
  --color-success-contrast: #FFFFFF;

  --color-warning-base: #F59E0B;
  --color-warning-light: #FEF3C7;
  --color-warning-contrast: #1E293B;

  --color-error-base: #EF4444;
  --color-error-light: #FEE2E2;
  --color-error-contrast: #FFFFFF;

  --color-info-base: #3B82F6;
  --color-info-light: #DBEAFE;
  --color-info-contrast: #FFFFFF;

  /* =========================================================================
   * Colors — Background
   * ========================================================================= */
  --color-background-page: #FFFFFF;
  --color-background-surface: #F8FAFC;
  --color-background-elevated: #FFFFFF;

  /* =========================================================================
   * Colors — Text
   * ========================================================================= */
  --color-text-primary: #0F172A;
  --color-text-secondary: #475569;
  --color-text-muted: #94A3B8;
  --color-text-inverse: #FFFFFF;

  /* =========================================================================
   * Spacing (4px base scale)
   * ========================================================================= */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;
  --spacing-3xl: 48px;

  /* =========================================================================
   * Typography — Font Families
   * ========================================================================= */
  --font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

  /* =========================================================================
   * Typography — Font Sizes
   * ========================================================================= */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;

  /* =========================================================================
   * Typography — Font Weights
   * ========================================================================= */
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* =========================================================================
   * Typography — Line Heights
   * ========================================================================= */
  --font-lineHeight-tight: 1.25;
  --font-lineHeight-normal: 1.5;
  --font-lineHeight-relaxed: 1.75;

  /* =========================================================================
   * Border Radii
   * ========================================================================= */
  --radius-none: 0px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* =========================================================================
   * Shadows (elevation system)
   * ========================================================================= */
  --shadow-none: none;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
}
`;
}
