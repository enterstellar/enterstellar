/**
 * @module api/chat
 * @description AI Chat API route for Enterstellar documentation.
 *
 * Provides a streaming chat endpoint backed by:
 * - **Primary:** Groq (gpt-oss120b) — ultra-fast inference
 * - **Fallback:** Google AI (gemini-3-flash) — reliable, large context
 *
 * Features:
 * - FlexSearch-based documentation search tool (LLM retrieves context autonomously)
 * - In-memory sliding window rate limiter (20 req/IP/min)
 * - Automatic provider fallback on primary failure
 * - Structured error responses following EnterstellarError pattern (ENS-5xxx)
 *
 * @see {@link https://sdk.vercel.ai/docs Vercel AI SDK Documentation}
 */

import { createGroq } from '@ai-sdk/groq';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
  type LanguageModel,
} from 'ai';
import { z } from 'zod';
import { source } from '@/lib/source';
import { Document, type DocumentData } from 'flexsearch';

// =============================================================================
// Types
// =============================================================================

/**
 * Custom FlexSearch document shape for indexed documentation pages.
 * Each page is stored with its full text content for semantic search.
 */
interface CustomDocument extends DocumentData {
  /** The page URL path (e.g., '/getting-started') */
  url: string;
  /** Page title from frontmatter */
  title: string;
  /** Page description from frontmatter */
  description: string;
  /** Full raw text content of the page (MDX stripped) */
  content: string;
}

/**
 * Chat UI message type with client-side context extension.
 * The client sends the current page URL as context with each message,
 * enabling the LLM to provide location-aware answers.
 */
export type ChatUIMessage = UIMessage<
  never,
  {
    client: {
      /** The current browser URL when the message was sent */
      location: string;
    };
  }
>;

// =============================================================================
// Error Response Helpers
// =============================================================================

/**
 * Structured error response shape following the Enterstellar error pattern.
 * @see Coding Rules §Error Handling — ENS-5xxx codes for AI/chat errors
 */
interface ChatErrorResponse {
  /** Enterstellar error code (e.g., 'ENS-5001') */
  code: string;
  /** Module that originated the error */
  module: string;
  /** Whether the client can retry the request */
  recoverable: boolean;
  /** Human-readable error description */
  message: string;
}

/**
 * Creates a structured JSON error response following the EnterstellarError pattern.
 *
 * @param status - HTTP status code
 * @param error - Structured error payload
 * @returns A `Response` with JSON body and appropriate headers
 */
function errorResponse(status: number, error: ChatErrorResponse): Response {
  return new Response(JSON.stringify(error), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// =============================================================================
// Rate Limiter
// =============================================================================

/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per IP address. Evicts expired entries on each check.
 * On Vercel, the Map resets on cold start — acceptable for v1
 * since it provides burst protection without external infrastructure.
 *
 * @remarks
 * - Window: 60 seconds
 * - Max requests per IP per window: 20
 * - IP extraction: `x-forwarded-for` header (Vercel/proxy) → `'unknown'` fallback
 */
const RATE_LIMIT_MAX_PER_IP = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipWindows = new Map<string, number[]>();

/**
 * Extracts the client IP address from the request.
 * Vercel populates `x-forwarded-for`; falls back to 'unknown'.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
    // The first entry is the original client IP
    const firstIp = forwarded.split(',')[0];
    if (firstIp) return firstIp.trim();
  }
  return 'unknown';
}

/**
 * Checks if the given IP has exceeded the rate limit.
 * Evicts expired timestamps and adds the current one if within limits.
 *
 * @param ip - Client IP address
 * @returns `true` if the request is allowed, `false` if rate-limited
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Get or create the timestamp array for this IP
  let timestamps = ipWindows.get(ip);
  if (!timestamps) {
    timestamps = [];
    ipWindows.set(ip, timestamps);
  }

  // Evict expired timestamps (sliding window)
  const filtered = timestamps.filter((ts) => ts > windowStart);
  ipWindows.set(ip, filtered);

  // Check if within limit
  if (filtered.length >= RATE_LIMIT_MAX_PER_IP) {
    return false;
  }

  // Record this request
  filtered.push(now);
  return true;
}

// =============================================================================
// LLM Providers
// =============================================================================

/**
 * Primary LLM provider: Groq
 *
 * Groq provides ultra-fast inference via their LPU hardware.
 * Model: gpt-oss120b — fast, high-quality, ideal for documentation Q&A.
 *
 * @remarks API key is read lazily on first request, not at module load.
 */
const groq = (modelId: string): LanguageModel => {
  const apiKey = process.env['GROQ_API_KEY'];
  return createGroq(apiKey ? { apiKey } : {})(modelId);
};

/**
 * Fallback LLM provider: Google AI (via Google AI Studio)
 *
 * Google AI provides reliable, large-context inference.
 * Model: gemini-3-flash — fast, cost-effective, excellent for RAG workloads.
 *
 * @remarks Uses `@ai-sdk/google` (Google AI Studio API key), NOT `@ai-sdk/google-vertex`
 * (GCP service account). Migration to Vertex for production GCP deployments is deferred.
 */
const google = (modelId: string): LanguageModel => {
  const apiKey = process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
  return createGoogleGenerativeAI(apiKey ? { apiKey } : {})(modelId);
};

/** Primary model identifier */
const PRIMARY_MODEL = 'openai/gpt-oss-120b';

/** Fallback model identifier */
const FALLBACK_MODEL = 'gemini-3-flash';

// =============================================================================
// System Prompt
// =============================================================================

/**
 * System prompt for the Enterstellar documentation AI assistant.
 *
 * Defines the assistant's identity, knowledge domain, and behavioral
 * rules. The prompt instructs the model to ground all answers in search
 * results retrieved via the `search` tool, cite sources as markdown
 * links, and admit uncertainty when results are insufficient.
 */
const systemPrompt = [
  'You are an AI documentation assistant for Enterstellar — a compiler-driven UI engine that transforms natural language intent into production-grade, type-safe user interfaces.',
  '',
  '## About Enterstellar',
  'Enterstellar is a full-stack GenUI system with these core pillars:',
  '- **Enterstellar Compiler** — The deterministic engine that transforms IntentContracts into ComponentContracts (certified, renderable UI specifications)',
  '- **Enterstellar Cloud** — Enterprise infrastructure for hosting, A/B testing, and serving compiled UI at the edge',
  '- **Enterstellar UI** — Pre-built component library and design system for rendering ComponentContracts in React',
  '- **Enterstellar CLI** — Developer tooling for scaffolding, validating, and deploying Enterstellar projects',
  '',
  '## Instructions',
  'Use the `search` tool to retrieve relevant documentation context before answering. Always ground your answers in the search results.',
  'The `search` tool returns raw JSON results from documentation. Cite sources as markdown links using the document `url` field.',
  'If you cannot find the answer in search results, say so honestly and suggest a more specific search query.',
  'Format responses in clear markdown with headings, code blocks, and bullet points where appropriate.',
].join('\n');

// =============================================================================
// FlexSearch Document Index
// =============================================================================

/**
 * Module-level FlexSearch document index.
 *
 * Initialized once at module load by indexing all documentation pages.
 * The Promise is awaited in the search tool's `execute` function.
 * Pages are processed in batches of 50 to avoid overwhelming the event loop.
 */
const searchServer = createSearchServer();

/**
 * Builds a FlexSearch document index from all documentation pages.
 *
 * Each page is indexed by title, description, and full raw text content.
 * Pages without a `getText` method (e.g., meta pages) are skipped.
 *
 * @returns A FlexSearch `Document` instance ready for search queries
 */
async function createSearchServer(): Promise<Document<CustomDocument>> {
  const search = new Document<CustomDocument>({
    document: {
      id: 'url',
      index: ['title', 'description', 'content'],
      store: true,
    },
  });

  const docs = await chunkedAll(
    source.getPages().map(async (page) => {
      if (!('getText' in page.data)) return null;

      return {
        title: page.data.title,
        description: page.data.description,
        url: page.url,
        content: await page.data.getText('raw'),
      } as CustomDocument;
    }),
  );

  for (const doc of docs) {
    if (doc) search.add(doc);
  }

  return search;
}

/**
 * Processes an array of promises in sequential batches to prevent
 * event loop exhaustion when indexing large documentation sets.
 *
 * @param promises - Array of promises to resolve
 * @returns Resolved values in original order
 */
async function chunkedAll<O>(promises: Promise<O>[]): Promise<O[]> {
  const SIZE = 50;
  const out: O[] = [];
  for (let i = 0; i < promises.length; i += SIZE) {
    out.push(...(await Promise.all(promises.slice(i, i + SIZE))));
  }
  return out;
}

// =============================================================================
// Search Tool
// =============================================================================

/**
 * FlexSearch-backed documentation search tool.
 *
 * The LLM calls this tool autonomously to retrieve relevant documentation
 * context before generating answers. Results are returned as enriched JSON
 * with full document content for RAG grounding.
 */
const searchTool = tool({
  description:
    'Search the Enterstellar documentation and return relevant results. Use this before answering questions to ground your response in actual documentation.',
  inputSchema: z.object({
    query: z.string().describe('The search query to find relevant documentation'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10)
      .describe('Maximum number of results to return'),
  }),
  async execute({ query, limit }) {
    const search = await searchServer;
    return await search.searchAsync(query, { limit, merge: true, enrich: true });
  },
});

/** Exported type for the search tool — used by the client UI for type-safe tool invocations */
export type SearchTool = typeof searchTool;

// =============================================================================
// Route Handler
// =============================================================================

/**
 * POST /api/chat — Streaming AI chat endpoint.
 *
 * Accepts chat messages from the client, invokes the LLM with documentation
 * search context, and streams the response back as UI message parts.
 *
 * **Flow:**
 * 1. Rate limit check (20 req/IP/min)
 * 2. Parse and validate request body
 * 3. Stream response from Groq (primary)
 * 4. On Groq failure → fallback to Google AI
 * 5. On both failure → structured 503 error
 *
 * @param req - The incoming HTTP request with JSON body containing `messages`
 * @returns Streaming response or structured error JSON
 */
export async function POST(req: Request): Promise<Response> {
  // ── Rate Limit ──────────────────────────────────────────────────────────
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return errorResponse(429, {
      code: 'ENS-5002',
      module: '@enterstellar-ai/docs-chat',
      recoverable: true,
      message: 'Rate limit exceeded. Please wait a moment before sending another message.',
    });
  }

  // ── Parse Request ───────────────────────────────────────────────────────
  let reqJson: { messages?: unknown };
  try {
    reqJson = (await req.json()) as { messages?: unknown };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid request body';
    return errorResponse(400, {
      code: 'ENS-5003',
      module: '@enterstellar-ai/docs-chat',
      recoverable: false,
      message: `Invalid request body: ${message}`,
    });
  }

  // ── Build Messages ──────────────────────────────────────────────────────
  const messages = await convertToModelMessages<ChatUIMessage>(
    (reqJson.messages ?? []) as ChatUIMessage[],
    {
      convertDataPart(part) {
        return {
          type: 'text' as const,
          text: `[Client Context: ${JSON.stringify(part.data)}]`,
        };
      },
    },
  );

  const streamConfig = {
    stopWhen: stepCountIs(5),
    tools: { search: searchTool },
    system: systemPrompt,
    messages,
    toolChoice: 'auto' as const,
  };

  // ── Primary Provider: Groq ──────────────────────────────────────────────
  try {
    const result = streamText({
      model: groq(PRIMARY_MODEL),
      ...streamConfig,
    });

    return result.toUIMessageStreamResponse();
  } catch (primaryErr: unknown) {
    // Log the primary provider failure for observability
    const primaryMessage = primaryErr instanceof Error ? primaryErr.message : 'Unknown Groq error';
    console.warn(
      `[ENS-5001] Groq primary provider failed, falling back to Google AI: ${primaryMessage}`,
    );

    // ── Fallback Provider: Google AI ────────────────────────────────────────
    try {
      const fallbackResult = streamText({
        model: google(FALLBACK_MODEL),
        ...streamConfig,
      });

      return fallbackResult.toUIMessageStreamResponse();
    } catch (fallbackErr: unknown) {
      const fallbackMessage =
        fallbackErr instanceof Error ? fallbackErr.message : 'Unknown Google AI error';
      console.error(
        `[ENS-5001] Both providers failed. Groq: ${primaryMessage}. Google: ${fallbackMessage}`,
      );

      return errorResponse(503, {
        code: 'ENS-5001',
        module: '@enterstellar-ai/docs-chat',
        recoverable: true,
        message: 'AI service is temporarily unavailable. Please try again in a few moments.',
      });
    }
  }
}
