/**
 * @module playground/lib/ai-client
 * @description Server-side AI provider configuration for the Enterstellar Playground.
 *
 * Exports pre-configured LLM provider instances and model identifiers
 * for use by the playground API route (`/api/playground`).
 *
 * **Provider cascade (§2.2 of implementation plan):**
 * 1. **Primary:** Groq — GPT OSS 120B (paid, ultra-fast LPU inference)
 * 2. **Fallback 1:** Google AI — Gemini Flash 3.0 (reliable, large context)
 *
 * Provider cascade logic (try/catch fallback) lives in the route handler,
 * not here. This module only creates the provider instances.
 *
 * **API keys:** Read lazily from `process.env` — not available at build time
 * on Cloudflare Workers. The `?? ''` fallback ensures the SDK initializes
 * without throwing; errors surface when the first API call is made.
 *
 * @see apps/docs/src/app/api/chat/route.ts L177–198 — identical pattern
 * @see implementation_plan.md §2.2 — Provider Cascade
 */

import { createGroq } from '@ai-sdk/groq';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

// ---------------------------------------------------------------------------
// Provider Instances
// ---------------------------------------------------------------------------

/**
 * Primary LLM provider: Groq.
 *
 * Groq provides ultra-fast inference via LPU hardware.
 * API key is read lazily from `process.env['GROQ_API_KEY']` at request time
 * to prevent empty key binding during module load on Cloudflare Workers.
 *
 * @see https://console.groq.com/docs/api — Groq API documentation
 */
export const groq = (modelId: string): LanguageModel => {
  const apiKey = process.env['GROQ_API_KEY'];
  return createGroq(apiKey ? { apiKey } : {})(modelId);
};

/**
 * Fallback LLM provider: Google AI (via Google AI Studio).
 *
 * Google AI provides reliable, large-context inference.
 * API key is read lazily from `process.env['GOOGLE_GENERATIVE_AI_API_KEY']` at request time
 * to prevent empty key binding during module load on Cloudflare Workers.
 *
 * @remarks Uses `@ai-sdk/google` (Google AI Studio API key), NOT
 * `@ai-sdk/google-vertex` (GCP service account). Migration to Vertex
 * for production GCP deployments is deferred to future cycles.
 */
export const google = (modelId: string): LanguageModel => {
  const apiKey = process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
  return createGoogleGenerativeAI(apiKey ? { apiKey } : {})(modelId);
};

// ---------------------------------------------------------------------------
// Model Identifiers
// ---------------------------------------------------------------------------

/**
 * Primary model identifier — GPT OSS 120B on Groq.
 *
 * Configurable via `GROQ_MODEL_ID` env var. The default
 * `openai/gpt-oss-120b` matches the docs app pattern.
 *
 * @see .env.example — `GROQ_MODEL_ID`
 */
export const PRIMARY_MODEL: string = process.env['GROQ_MODEL_ID'] ?? 'openai/gpt-oss-120b';

/**
 * Fallback model identifier — Gemini Flash 3.0.
 *
 * Configurable via `GOOGLE_MODEL_ID` env var. The default
 * `gemini-3-flash` is fast and cost-effective for structured output.
 *
 * @see .env.example — `GOOGLE_MODEL_ID`
 */
export const FALLBACK_MODEL: string = process.env['GOOGLE_MODEL_ID'] ?? 'gemini-3-flash';
