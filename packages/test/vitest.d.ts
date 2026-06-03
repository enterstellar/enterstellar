/**
 * @module @enterstellar-ai/test/vitest
 * @description Vitest type augmentation for Enterstellar custom matchers.
 *
 * Add this file to your test tsconfig to get full TypeScript support
 * for `.toResolveToComponent()`, `.toPassValidation()`, etc.
 *
 * ## Setup
 *
 * **Option A — triple-slash reference** (in `vitest.setup.ts` or any test file):
 * ```ts
 * /// <reference path="./node_modules/@enterstellar-ai/test/vitest.d.ts" />
 * ```
 *
 * **Option B — tsconfig include** (in your test-specific `tsconfig.json`):
 * ```json
 * { "include": ["node_modules/@enterstellar-ai/test/vitest.d.ts"] }
 * ```
 *
 * Then register the matchers:
 * ```ts
 * import { enterstellarMatchers } from '@enterstellar-ai/test';
 * import { expect } from 'vitest';
 * expect.extend(enterstellarMatchers);
 * ```
 *
 * @see Design Choice TE4 — broad Vitest matcher set.
 */

/* eslint-disable @typescript-eslint/no-empty-object-type */

import 'vitest';

declare module 'vitest' {
    interface Assertion {
        /** Asserts the AgentTrace resolved to the named component. */
        toResolveToComponent(componentName: string): void;
        /** Asserts the CompilationResult has status 'pass'. */
        toPassValidation(): void;
        /** Asserts no design token violations in the CompilationResult. */
        toBeTokenCompliant(): void;
        /** Asserts total latency is below the given threshold. */
        toHaveLatencyBelow(maxMs: number): void;
        /** Asserts no accessibility violations in the CompilationResult. */
        toPassAccessibility(): void;
    }
}
