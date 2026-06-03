/**
 * @module @enterstellar-ai/devtools/__tests__/setup
 * @description Test setup file for `@enterstellar-ai/devtools`.
 *
 * Registers `@testing-library/jest-dom` matchers (e.g., `toHaveAttribute`,
 * `toHaveTextContent`) with Vitest's `expect`.
 *
 * @internal
 */

/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
