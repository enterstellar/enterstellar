/**
 * @module @enterstellar-ai/cli/templates/template-tokens
 * @description Generates `src/enterstellar/tokens.ts` — an example design token set.
 *
 * Produces a complete design token set covering all five categories
 * required by Enterstellar's design firmware layer (L9):
 *
 * 1. **Colors** — primary, secondary, neutral, semantic (success/warning/error/info)
 * 2. **Spacing** — 4px base scale (xs through 3xl)
 * 3. **Typography** — font families, sizes, weights, line heights
 * 4. **Radii** — border radius scale (none through full)
 * 5. **Shadows** — elevation system (none through 2xl)
 *
 * Token paths follow the W3C Design Tokens Community Group (DTCG) format.
 * All values are production-quality — developers can adjust for their brand.
 *
 * @see Principle L9 — Design Tokens as Firmware
 * @see Implementation Bible §4.17
 */

// ---------------------------------------------------------------------------
// Template Generator
// ---------------------------------------------------------------------------

/**
 * Generates the `src/enterstellar/tokens.ts` file content for a scaffolded project.
 *
 * The generated file exports a `designTokens` object conforming to
 * `DesignTokenSet` from `@enterstellar-ai/types`. It includes comprehensive tokens
 * for a modern, accessible design system with both light and dark variants.
 *
 * @returns A TypeScript source string for `src/enterstellar/tokens.ts`.
 *
 * @example
 * ```ts
 * const content = generateTokens();
 * await writeFile('my-app/src/enterstellar/tokens.ts', content);
 * ```
 */
export function generateTokens(): string {
    return `/**
 * Enterstellar Design Token Set
 *
 * These tokens form the visual "firmware" of your Enterstellar application.
 * Every AI-generated component is constrained to use only these values,
 * ensuring visual consistency across all generated UI.
 *
 * Token paths follow the W3C Design Tokens Community Group (DTCG) format.
 * Adjust these values to match your brand identity.
 *
 * @see https://enterstellar.dev/docs/design-tokens
 */

import type { DesignTokenSet } from '@enterstellar-ai/types';

/**
 * The application's shared design token set.
 * Pass this to \`createRegistry({ designSystem: designTokens })\`.
 */
export const designTokens: DesignTokenSet = {
  // =========================================================================
  // Colors
  // =========================================================================
  'color.primary.base': '#6366F1',
  'color.primary.hover': '#4F46E5',
  'color.primary.active': '#4338CA',
  'color.primary.light': '#E0E7FF',
  'color.primary.contrast': '#FFFFFF',

  'color.secondary.base': '#8B5CF6',
  'color.secondary.hover': '#7C3AED',
  'color.secondary.active': '#6D28D9',
  'color.secondary.light': '#EDE9FE',
  'color.secondary.contrast': '#FFFFFF',

  'color.neutral.50': '#F8FAFC',
  'color.neutral.100': '#F1F5F9',
  'color.neutral.200': '#E2E8F0',
  'color.neutral.300': '#CBD5E1',
  'color.neutral.400': '#94A3B8',
  'color.neutral.500': '#64748B',
  'color.neutral.600': '#475569',
  'color.neutral.700': '#334155',
  'color.neutral.800': '#1E293B',
  'color.neutral.900': '#0F172A',

  'color.success.base': '#10B981',
  'color.success.light': '#D1FAE5',
  'color.success.contrast': '#FFFFFF',

  'color.warning.base': '#F59E0B',
  'color.warning.light': '#FEF3C7',
  'color.warning.contrast': '#1E293B',

  'color.error.base': '#EF4444',
  'color.error.light': '#FEE2E2',
  'color.error.contrast': '#FFFFFF',

  'color.info.base': '#3B82F6',
  'color.info.light': '#DBEAFE',
  'color.info.contrast': '#FFFFFF',

  'color.background.page': '#FFFFFF',
  'color.background.surface': '#F8FAFC',
  'color.background.elevated': '#FFFFFF',

  'color.text.primary': '#0F172A',
  'color.text.secondary': '#475569',
  'color.text.muted': '#94A3B8',
  'color.text.inverse': '#FFFFFF',

  // =========================================================================
  // Spacing (4px base scale)
  // =========================================================================
  'spacing.xs': '4px',
  'spacing.sm': '8px',
  'spacing.md': '12px',
  'spacing.lg': '16px',
  'spacing.xl': '24px',
  'spacing.2xl': '32px',
  'spacing.3xl': '48px',

  // =========================================================================
  // Typography
  // =========================================================================
  'font.family.sans': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  'font.family.mono': "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",

  'font.size.xs': '0.75rem',
  'font.size.sm': '0.875rem',
  'font.size.base': '1rem',
  'font.size.lg': '1.125rem',
  'font.size.xl': '1.25rem',
  'font.size.2xl': '1.5rem',
  'font.size.3xl': '1.875rem',

  'font.weight.normal': '400',
  'font.weight.medium': '500',
  'font.weight.semibold': '600',
  'font.weight.bold': '700',

  'font.lineHeight.tight': '1.25',
  'font.lineHeight.normal': '1.5',
  'font.lineHeight.relaxed': '1.75',

  // =========================================================================
  // Border Radii
  // =========================================================================
  'radius.none': '0px',
  'radius.sm': '4px',
  'radius.md': '8px',
  'radius.lg': '12px',
  'radius.xl': '16px',
  'radius.full': '9999px',

  // =========================================================================
  // Shadows (elevation system)
  // =========================================================================
  'shadow.none': 'none',
  'shadow.sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  'shadow.md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  'shadow.lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  'shadow.xl': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  'shadow.2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
};
`;
}
