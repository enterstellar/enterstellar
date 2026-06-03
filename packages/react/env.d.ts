/**
 * @module @enterstellar-ai/react/env
 * @description Ambient type declarations for `process.env` access.
 *
 * `Provider` references `process.env.NODE_ENV` for the DevTools hook
 * production guard (DT3). This file declares the minimal global shape
 * required for TypeScript to recognize `process.env` without depending
 * on the full `@types/node`.
 *
 * @internal
 */

declare const process: {
    readonly env: Readonly<Record<string, string | undefined>>;
};
