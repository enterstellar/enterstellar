/**
 * @module playground/app/api/playground/route
 * @description Multi-zone AI endpoint for the Enterstellar Playground.
 *
 * POST `/api/playground` — receives `{ intent, scene, mode }`, calls the
 * LLM with the appropriate system prompt, and returns zone intents.
 *
 * **Three modes:**
 * - `'healthy'` / `'cloud'` — single `streamText()` call with full manifest.
 *   Returns a Vercel AI SDK data stream for real-time visual feedback.
 * - `'hallucinating'` — dual concurrent `generateText()` calls. One with
 *   the correct prompt, one with the sabotaged prompt. Returns JSON:
 *   `{ healthy: string, hallucinated: string }` for side-by-side comparison.
 *
 * **Data Context Layer (DataAdapter simulation):**
 * For domain scenes, the route loads a pre-authored Markdown dataset from
 * `src/enterstellar/data-contexts/{theme}.md` and injects it into the system prompt.
 * This simulates the `@enterstellar-ai/adapters DataAdapter.query()` pipeline — the
 * LLM receives a pre-queried dataset as ground truth instead of
 * hallucinating domain-specific values (names, amounts, statuses).
 *
 * **Provider cascade:** Groq (primary) → Google AI (fallback).
 * On primary failure, falls back automatically.
 *
 * @see implementation_plan.md §3.3 — AI Agent Backend
 * @see implementation_plan.md §3.5 — System Prompt Design
 * @see implementation_plan.md §2.4 — Realistic Data Contexts
 * @see apps/docs/src/app/api/chat/route.ts — reference pattern
 */

import { generateText, streamText } from 'ai';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { generateManifest } from '@enterstellar-ai/registry';
import { groq, google, PRIMARY_MODEL, FALLBACK_MODEL } from '@/lib/ai-client';
import { buildSystemPrompt } from '@/enterstellar/system-prompt';
import { playgroundContracts } from '@/enterstellar/registry';

import type { PlaygroundScene } from '@/enterstellar/scenes/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of the POST request body.
 */
interface PlaygroundRequest {
  /** The user's natural-language intent. */
  readonly intent: string;
  /** The active PlaygroundScene definition. */
  readonly scene: PlaygroundScene;
  /** The playground mode. */
  readonly mode: 'healthy' | 'hallucinating' | 'cloud';
}

/**
 * Structured error response — follows the EnterstellarError pattern.
 * @see Coding Rules §Error Handling — ENS-5xxx codes
 */
interface PlaygroundErrorResponse {
  /** Enterstellar error code (e.g., 'ENS-5101') */
  readonly code: string;
  /** Module that originated the error */
  readonly module: string;
  /** Whether the client can retry the request */
  readonly recoverable: boolean;
  /** Human-readable error description */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Error Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a structured JSON error response following the EnterstellarError pattern.
 *
 * @param status - HTTP status code.
 * @param error - Structured error payload.
 * @returns A `Response` with JSON body and appropriate headers.
 *
 * @internal
 */
function errorResponse(status: number, error: PlaygroundErrorResponse): Response {
  return new Response(JSON.stringify(error), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Rate Limiter (identical pattern to apps/docs)
// ---------------------------------------------------------------------------

/**
 * In-memory sliding window rate limiter.
 *
 * Window: 60 seconds. Max: 20 requests per IP per window.
 * On Vercel, the Map resets on cold start — acceptable
 * for v1 burst protection without external infrastructure.
 *
 * @internal
 */
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipWindows = new Map<string, number[]>();

/**
 * Extracts the client IP address from the request.
 * Uses `x-forwarded-for` header (Vercel/proxy) with fallback.
 *
 * @internal
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded !== null) {
    const firstIp = forwarded.split(',')[0];
    if (firstIp !== undefined) return firstIp.trim();
  }
  return 'unknown';
}

/**
 * Checks if the given IP has exceeded the rate limit.
 *
 * @internal
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = ipWindows.get(ip);
  if (timestamps === undefined) {
    timestamps = [];
    ipWindows.set(ip, timestamps);
  }

  const filtered = timestamps.filter((ts) => ts > windowStart);
  ipWindows.set(ip, filtered);

  if (filtered.length >= RATE_LIMIT_MAX) {
    return false;
  }

  filtered.push(now);
  return true;
}

// ---------------------------------------------------------------------------
// Compact Manifest (generated once at module load)
// ---------------------------------------------------------------------------

/**
 * Pre-generated compact manifest for the LLM system prompt.
 *
 * Generated from the 8 playground component contracts via
 * `generateManifest()`. This is a module-level constant because
 * the registry doesn't change at runtime.
 *
 * @see Design Choice R8 — compact JSON format for token efficiency
 */
const manifest = generateManifest(playgroundContracts);

// ---------------------------------------------------------------------------
// Data Context Loader (DataAdapter Simulation)
// ---------------------------------------------------------------------------

/**
 * Resolves the filesystem path to a domain's data context file.
 *
 * The scene's `theme` field maps directly to the file name:
 * - `'finance'` → `data-contexts/finance.md`
 * - `'medical'` → `data-contexts/medical.md`
 * - `'commerce'` → `data-contexts/commerce.md`
 * - `'saas'` → `data-contexts/saas.md`
 * - `'education'` → `data-contexts/education.md`
 *
 * Quick scenes use `theme: 'enterstellar'` which has no data context file.
 *
 * @internal
 */
const DATA_CONTEXT_DIR = join(process.cwd(), 'src', 'enterstellar', 'data-contexts');

/** Set of themes that have corresponding data context files. */
const DATA_CONTEXT_THEMES: ReadonlySet<string> = new Set([
  'finance',
  'medical',
  'commerce',
  'saas',
  'education',
]);

/**
 * Loads the data context file for a scene's domain theme.
 *
 * **Production simulation:** This function mirrors how a real
 * `@enterstellar-ai/adapters DataAdapter.query()` call would work in production:
 *
 * 1. The API route identifies the domain from the scene definition.
 * 2. The adapter resolves the data source (here: a `.md` file on disk;
 *    in production: a database query, API call, or cache lookup).
 * 3. The queried dataset is serialized and injected into the compiler
 *    pipeline as ground-truth context.
 *
 * **Graceful degradation:** If the file is missing or unreadable, the
 * route logs a warning and returns `undefined`. The system prompt
 * builder skips data context injection, and the LLM falls back to
 * generating synthetic domain data (reduced fidelity, not a crash).
 *
 * @param theme - The scene's theme string (e.g., `'finance'`).
 * @returns The data context string, or `undefined` if unavailable.
 *
 * @internal
 */
async function loadDataContext(theme: string): Promise<string | undefined> {
  if (!DATA_CONTEXT_THEMES.has(theme)) {
    return undefined;
  }

  const filePath = join(DATA_CONTEXT_DIR, `${theme}.md`);

  try {
    const content = await readFile(filePath, 'utf-8');
    return content;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown read error';
    console.warn(
      `[ENS-5106] Data context file not found or unreadable for theme "${theme}": ${message}. ` +
        'Proceeding without data context (degraded fidelity).',
    );
    return undefined;
  }
}

/**
 * Keyword heuristic for domain detection from free-form prompts.
 *
 * When the scene theme has no dedicated data context file (e.g., Open Canvas
 * with `theme: 'enterstellar'`), this function scans the user's prompt for domain
 * keywords and returns the best-fit data context theme.
 *
 * **Priority order:** medical → finance → commerce → saas → education.
 * Medical is highest priority because its data (vitals, medications) is
 * the most structurally complex and benefits most from grounded context.
 *
 * **Zero-latency:** Pure string matching, no LLM call, no network request.
 *
 * @param intent - The user's natural-language prompt.
 * @returns The matched domain theme string, or `undefined` if no keywords match.
 *
 * @internal
 */
function detectDomainFromIntent(intent: string): string | undefined {
  const lower = intent.toLowerCase();

  /** Keyword → theme mapping in priority order. */
  const heuristics: readonly { readonly theme: string; readonly keywords: readonly string[] }[] = [
    {
      theme: 'medical',
      keywords: [
        'patient',
        'vitals',
        'medication',
        'clinical',
        'hospital',
        'diagnosis',
        'treatment',
        'nurse',
        'doctor',
        'healthcare',
        'ehr',
        'prescription',
        'lab result',
      ],
    },
    {
      theme: 'finance',
      keywords: [
        'revenue',
        'transaction',
        'ledger',
        'compliance',
        'portfolio',
        'banking',
        'fintech',
        'payment',
        'invoice',
        'cash flow',
        'audit',
        'tax',
        'accounting',
      ],
    },
    {
      theme: 'commerce',
      keywords: [
        'product',
        'catalog',
        'order',
        'shipping',
        'cart',
        'inventory',
        'ecommerce',
        'e-commerce',
        'customer segment',
        'storefront',
        'merchant',
        'sku',
      ],
    },
    {
      theme: 'saas',
      keywords: [
        'subscription',
        'churn',
        'mrr',
        'arr',
        'onboarding',
        'feature flag',
        'tenant',
        'usage',
        'seat',
        'engagement',
        'cohort',
        'saas',
        'ltv',
        'pipeline',
      ],
    },
    {
      theme: 'education',
      keywords: [
        'student',
        'course',
        'grade',
        'curriculum',
        'enrollment',
        'assignment',
        'classroom',
        'campus',
        'gpa',
        'tutor',
        'syllabus',
        'edtech',
        'learning',
      ],
    },
  ];

  for (const { theme, keywords } of heuristics) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return theme;
    }
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * POST `/api/playground` — Multi-zone AI endpoint.
 *
 * **Flow:**
 * 1. Rate limit check (20 req/IP/min)
 * 2. Parse and validate request body (`{ intent, scene, mode }`)
 * 3. Generate system prompt from manifest + scene + mode
 * 4. Mode dispatch:
 *    - `'healthy'`/`'cloud'` → `streamText()` → data stream response
 *    - `'hallucinating'` → dual `generateText()` → JSON response
 * 5. Provider cascade: Groq → Google AI on failure
 * 6. Structured error responses on failure
 *
 * **Data Context Resolution (two-pass):**
 * 1. Try scene.theme → direct file lookup (domain scenes).
 * 2. If no file found → keyword heuristic on intent (open canvas / quick scenes).
 * 3. If no keywords match → no context (LLM invents sample data).
 *
 * @param req - The incoming HTTP request with JSON body.
 * @returns Streaming response or JSON response, depending on mode.
 */
export async function POST(req: Request): Promise<Response> {
  // ── Rate Limit ────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return errorResponse(429, {
      code: 'ENS-5102',
      module: '@enterstellar-ai/playground/playground',
      recoverable: true,
      message: 'Rate limit exceeded. Please wait a moment before sending another request.',
    });
  }

  // ── Parse Request ─────────────────────────────────────────────────────
  let body: PlaygroundRequest;
  try {
    body = (await req.json()) as PlaygroundRequest;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request body';
    return errorResponse(400, {
      code: 'ENS-5103',
      module: '@enterstellar-ai/playground/playground',
      recoverable: false,
      message: `Invalid request body: ${message}`,
    });
  }

  // Validate required fields
  if (body.intent.trim() === '') {
    return errorResponse(400, {
      code: 'ENS-5104',
      module: '@enterstellar-ai/playground/playground',
      recoverable: false,
      message: 'Request body must include: intent (non-empty string), scene, and mode.',
    });
  }

  const { intent, scene, mode } = body;

  // ── Load Data Context (DataAdapter Simulation) ─────────────────────────
  // Two-pass resolution:
  // 1. Direct theme lookup (e.g., scene-finance → finance.md)
  // 2. Keyword heuristic on user intent (e.g., "patient vitals" → medical.md)
  let dataContext = await loadDataContext(scene.theme);
  if (dataContext === undefined) {
    const detectedTheme = detectDomainFromIntent(intent);
    if (detectedTheme !== undefined) {
      dataContext = await loadDataContext(detectedTheme);
    }
  }

  // ── Build System Prompt ───────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(manifest, scene, mode, playgroundContracts, dataContext);

  // ── Mode Dispatch ─────────────────────────────────────────────────────
  if (mode === 'hallucinating') {
    // Dual mode: `systemPrompt` above is sabotaged (mode='hallucinating'
    // routes to buildSabotagedPrompt which ignores data context). Build
    // the correct one explicitly WITH the data context for side-by-side.
    const correctPrompt = buildSystemPrompt(
      manifest,
      scene,
      'healthy',
      playgroundContracts,
      dataContext,
    );
    return handleHallucinatingMode(correctPrompt, scene, intent);
  }

  return handleStreamingMode(systemPrompt, intent);
}

// ---------------------------------------------------------------------------
// Streaming Mode (Healthy / Cloud)
// ---------------------------------------------------------------------------

/**
 * Handles `'healthy'` and `'cloud'` modes with `streamText()`.
 *
 * Streams the LLM response back as a Vercel AI SDK data stream.
 * The `LiveAgentConnection` on the client parses `0:` text chunks,
 * buffers the complete JSON, and dispatches per-zone intents.
 *
 * Provider cascade: Groq → Google AI on failure.
 *
 * @internal
 */
function handleStreamingMode(systemPrompt: string, userIntent: string): Response {
  const messages = [{ role: 'user' as const, content: userIntent }];

  // ── Primary: Groq ───────────────────────────────────────────────────
  try {
    const result = streamText({
      model: groq(PRIMARY_MODEL),
      system: systemPrompt,
      messages,
      maxOutputTokens: 8192,
    });

    return result.toTextStreamResponse();
  } catch (primaryErr: unknown) {
    const primaryMessage = primaryErr instanceof Error ? primaryErr.message : 'Unknown Groq error';

    console.warn(
      `[ENS-5101] Groq primary provider failed, falling back to Google AI: ${primaryMessage}`,
    );

    // ── Fallback: Google AI ───────────────────────────────────────────
    try {
      const fallbackResult = streamText({
        model: google(FALLBACK_MODEL),
        system: systemPrompt,
        messages,
        maxOutputTokens: 8192,
      });

      return fallbackResult.toTextStreamResponse();
    } catch (fallbackErr: unknown) {
      const fallbackMessage =
        fallbackErr instanceof Error ? fallbackErr.message : 'Unknown Google AI error';

      console.error(
        `[ENS-5101] Both providers failed. Groq: ${primaryMessage}. Google: ${fallbackMessage}`,
      );

      return errorResponse(503, {
        code: 'ENS-5101',
        module: '@enterstellar-ai/playground/playground',
        recoverable: true,
        message: 'AI service is temporarily unavailable. Please try again in a few moments.',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Hallucinating Mode (Dual Concurrent)
// ---------------------------------------------------------------------------

/**
 * Handles `'hallucinating'` mode with dual concurrent `generateText()`.
 *
 * Two LLM calls run in parallel via `Promise.allSettled()`:
 * 1. **Healthy call** — correct system prompt with full manifest
 * 2. **Hallucinated call** — sabotaged system prompt (no manifest)
 *
 * Both must complete before the response is sent (no streaming). This
 * ensures the client can render a complete side-by-side comparison of
 * the healthy vs. hallucinated trace.
 *
 * The sabotaged prompt uses the SAME provider to isolate the prompt
 * difference as the sole variable. If the primary provider fails,
 * both calls fall back to the fallback provider.
 *
 * @internal
 */
async function handleHallucinatingMode(
  correctPrompt: string,
  scene: PlaygroundScene,
  userIntent: string,
): Promise<Response> {
  const sabotagedPrompt = buildSystemPrompt(manifest, scene, 'hallucinating');

  const messages = [{ role: 'user' as const, content: userIntent }];

  // ── Primary Provider: Groq (dual concurrent) ─────────────────────────
  try {
    const [healthyResult, hallucinatedResult] = await Promise.all([
      generateText({
        model: groq(PRIMARY_MODEL),
        system: correctPrompt,
        messages,
        maxOutputTokens: 8192,
      }),
      generateText({
        model: groq(PRIMARY_MODEL),
        system: sabotagedPrompt,
        messages,
        maxOutputTokens: 8192,
      }),
    ]);

    return Response.json({
      healthy: healthyResult.text,
      hallucinated: hallucinatedResult.text,
    });
  } catch (primaryErr: unknown) {
    const primaryMessage = primaryErr instanceof Error ? primaryErr.message : 'Unknown Groq error';

    console.warn(
      `[ENS-5101] Groq dual-concurrent failed, falling back to Google AI: ${primaryMessage}`,
    );

    // ── Fallback Provider: Google AI (dual concurrent) ──────────────────
    try {
      const [healthyResult, hallucinatedResult] = await Promise.all([
        generateText({
          model: google(FALLBACK_MODEL),
          system: correctPrompt,
          messages,
          maxOutputTokens: 8192,
        }),
        generateText({
          model: google(FALLBACK_MODEL),
          system: sabotagedPrompt,
          messages,
          maxOutputTokens: 8192,
        }),
      ]);

      return Response.json({
        healthy: healthyResult.text,
        hallucinated: hallucinatedResult.text,
      });
    } catch (fallbackErr: unknown) {
      const fallbackMessage =
        fallbackErr instanceof Error ? fallbackErr.message : 'Unknown Google AI error';

      console.error(
        `[ENS-5101] Both providers failed in dual-concurrent mode. Groq: ${primaryMessage}. Google: ${fallbackMessage}`,
      );

      return errorResponse(503, {
        code: 'ENS-5101',
        module: '@enterstellar-ai/playground/playground',
        recoverable: true,
        message: 'AI service is temporarily unavailable. Please try again in a few moments.',
      });
    }
  }
}
