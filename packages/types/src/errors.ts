/**
 * @module @enterstellar-ai/types/errors
 * @description Enterstellar error class and error code taxonomy.
 *
 * All Enterstellar errors extend `EnterstellarError`, carrying a machine-readable `code`,
 * the originating `module`, and whether the error is `recoverable`.
 *
 * Error code ranges:
 * - `ENS-1xxx` — Registry errors
 * - `ENS-2xxx` — Compiler errors
 * - `ENS-3xxx` — Lifecycle / Zone errors
 * - `ENS-4xxx` — Forge / State errors
 * - `ENS-5xxx` — Cloud / Index errors
 * - `ENS-6xxx` — Normalizer errors
 * - `ENS-7xxx` — Adapter errors
 * - `ENS-8xxx` — Agent SDK errors
 * - `ENS-9xxx` — CLI errors
 *
 * @see Coding Rules — Error Taxonomy
 * @see Design Choice C14
 */

// ---------------------------------------------------------------------------
// Error Code Type
// ---------------------------------------------------------------------------

/**
 * Machine-readable error code following the `ENS-XXXX` convention.
 * Each code maps to documentation at `enterstellar.dev/errors/ENS-XXXX`.
 */
export type EnterstellarErrorCode =
    // Registry (1xxx)
    | 'ENS-1001'
    | 'ENS-1002'
    | 'ENS-1003'
    | 'ENS-1004'
    | 'ENS-1005'
    | 'ENS-1006'
    | 'ENS-1007'
    | 'ENS-1008'
    | 'ENS-1009'
    | 'ENS-1010'
    // Compiler (2xxx)
    | 'ENS-2001'
    | 'ENS-2002'
    | 'ENS-2003'
    | 'ENS-2004'
    | 'ENS-2005'
    | 'ENS-2006'
    | 'ENS-2007'
    | 'ENS-2008'
    | 'ENS-2009'
    | 'ENS-2010'
    // Lifecycle / Zone (3xxx)
    | 'ENS-3001'
    | 'ENS-3002'
    | 'ENS-3003'
    | 'ENS-3004'
    | 'ENS-3005'
    | 'ENS-3010'
    // Forge / State (4xxx)
    | 'ENS-4001'
    | 'ENS-4002'
    | 'ENS-4003'
    | 'ENS-4004'
    | 'ENS-4005'
    | 'ENS-4006'
    | 'ENS-4007'
    // Cloud / Index / Test (5xxx)
    | 'ENS-5001'
    | 'ENS-5002'
    | 'ENS-5003'
    | 'ENS-5004'
    | 'ENS-5005'
    | 'ENS-5006'
    | 'ENS-5007'
    | 'ENS-5008'
    | 'ENS-5009'
    | 'ENS-5010'
    // Semantic Index (5020–5025)
    | 'ENS-5020'
    | 'ENS-5021'
    | 'ENS-5022'
    | 'ENS-5023'
    | 'ENS-5024'
    | 'ENS-5025'
    // Normalizer (6xxx)
    | 'ENS-6001'
    | 'ENS-6002'
    | 'ENS-6003'
    | 'ENS-6004'
    | 'ENS-6005'
    // Adapters (7xxx)
    | 'ENS-7001'
    | 'ENS-7002'
    | 'ENS-7003'
    | 'ENS-7004'
    | 'ENS-7005'
    // Agent SDK (8xxx)
    | 'ENS-8001'
    | 'ENS-8002'
    | 'ENS-8003'
    | 'ENS-8004'
    | 'ENS-8005'
    // CLI (9xxx)
    | 'ENS-9001'
    | 'ENS-9002'
    | 'ENS-9003'
    | 'ENS-9004'
    | 'ENS-9005'
    | 'ENS-9006'
    // Global Index (5030–5039)
    | 'ENS-5030'
    | 'ENS-5031'
    | 'ENS-5032'
    | 'ENS-5033'
    | 'ENS-5034'
    | 'ENS-5035';

// ---------------------------------------------------------------------------
// Error Module Type
// ---------------------------------------------------------------------------

/** The Enterstellar module that originated the error. */
export type EnterstellarErrorModule =
    | 'types'
    | 'registry'
    | 'compiler'
    | 'state'
    | 'telemetry'
    | 'react'
    | 'connection'
    | 'lifecycle'
    | 'normalizer'
    | 'forge'
    | 'cache'
    | 'semantic-index'
    | 'cloud'
    | 'global-index'
    | 'agent-sdk'
    | 'devtools'
    | 'test'
    | 'cli'
    | 'adapters';

// ---------------------------------------------------------------------------
// EnterstellarError Class
// ---------------------------------------------------------------------------

/**
 * Base error class for all Enterstellar errors.
 *
 * Extends the native `Error` with structured metadata for observability,
 * DevTools integration, and programmatic error handling.
 *
 * @example
 * ```ts
 * throw new EnterstellarError(
 *   'ENS-1001',
 *   'registry',
 *   'Component "Foo" is already registered.',
 *   true, // recoverable
 * );
 * ```
 */
export class EnterstellarError extends Error {
    /**
     * Machine-readable error code.
     * Maps to documentation at `enterstellar.dev/errors/{code}`.
     */
    public readonly code: EnterstellarErrorCode;

    /** The Enterstellar module that originated this error. */
    public readonly module: EnterstellarErrorModule;

    /**
     * Whether the error is recoverable.
     * Recoverable errors can be retried or handled gracefully.
     * Non-recoverable errors indicate fatal conditions.
     */
    public readonly recoverable: boolean;

    /**
     * ISO 8601 timestamp of when the error was created.
     * Useful for trace correlation and debugging.
     */
    public readonly timestamp: string;

    /**
     * Creates a new `EnterstellarError`.
     *
     * @param code - Machine-readable error code (e.g., `'ENS-1001'`).
     * @param module - The Enterstellar module that originated the error.
     * @param message - Human-readable error message.
     * @param recoverable - Whether the error can be retried or handled gracefully.
     * @param cause - Optional underlying error that caused this error.
     */
    constructor(
        code: EnterstellarErrorCode,
        module: EnterstellarErrorModule,
        message: string,
        recoverable: boolean = false,
        cause?: unknown,
    ) {
        super(message, { cause });
        this.name = 'EnterstellarError';
        this.code = code;
        this.module = module;
        this.recoverable = recoverable;
        this.timestamp = new Date().toISOString();

        // Preserve proper stack trace in V8 environments
        if ('captureStackTrace' in Error) {
            (Error as unknown as { captureStackTrace: (target: object, ctor: (...args: unknown[]) => unknown) => void }).captureStackTrace(this, EnterstellarError as unknown as (...args: unknown[]) => unknown);
        }
    }

    /**
     * Serializes the error to a plain object for logging, telemetry, or DevTools.
     *
     * @returns A plain object representation of the error.
     */
    public toJSON(): {
        name: string;
        code: EnterstellarErrorCode;
        module: EnterstellarErrorModule;
        message: string;
        recoverable: boolean;
        timestamp: string;
        stack: string | undefined;
    } {
        return {
            name: this.name,
            code: this.code,
            module: this.module,
            message: this.message,
            recoverable: this.recoverable,
            timestamp: this.timestamp,
            stack: this.stack,
        };
    }
}
