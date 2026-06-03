/**
 * Enterstellar Docs — Shiki Syntax Highlighting Configuration
 *
 * Default Shiki theme configuration for code blocks throughout the
 * documentation. Uses `github-light` and `vesper` for light/dark modes.
 *
 * @see source.config.ts — Where Shiki options are consumed by the MDX pipeline
 *
 * @module
 */

/**
 * Default Shiki theme options for dual-theme code highlighting.
 *
 * Applied to both the Fumadocs MDX pipeline (via `source.config.ts`)
 * and any runtime `DynamicCodeBlock` instances.
 */
export const defaultShikiOptions = {
  themes: {
    /** Light mode theme. */
    light: 'github-light',
    /** Dark mode theme. */
    dark: 'vesper',
  },
} as const;
