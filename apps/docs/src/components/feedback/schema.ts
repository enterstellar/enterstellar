/**
 * Enterstellar Docs — Feedback Validation Schemas
 *
 * Zod schemas for validating feedback payloads submitted by users through
 * the page-level and block-level feedback systems. These schemas are
 * shared between the client-side form (`feedback/client.tsx`) and the
 * server-side action handler (`lib/github/feedback.ts`).
 *
 * **Schemas:**
 * - `blockFeedback` — Per-block feedback (inline content feedback).
 * - `pageFeedback` — Per-page feedback (thumbs up/down + comment).
 * - `actionResponse` — Server response after creating a GitHub Discussion.
 *
 * @see components/feedback/client.tsx — Client-side UI consuming these schemas
 * @see lib/github/feedback.ts — Server actions that validate with these schemas
 *
 * @module
 */
import { z } from 'zod/mini';

/**
 * Schema for per-block feedback submissions.
 *
 * Sent when a user provides feedback on a specific content block within
 * a documentation page (e.g., a code example, callout, or paragraph).
 */
export const blockFeedback = z.object({
  /** The page URL where the feedback was submitted. */
  url: z.string(),
  /** Unique identifier of the content block. */
  blockId: z.string(),
  /** The user's feedback message. */
  message: z.string(),
  /** The referenced text content of the block (optional context). */
  blockBody: z.optional(z.string()),
});

/**
 * Schema for per-page feedback submissions.
 *
 * Sent when a user rates an entire documentation page via the
 * thumbs up/down widget at the bottom of the page.
 */
export const pageFeedback = z.object({
  /** User's rating: `'good'` (thumbs up) or `'bad'` (thumbs down). */
  opinion: z.enum(['good', 'bad']),
  /** The page URL where the feedback was submitted. */
  url: z.string(),
  /** The user's optional feedback message. */
  message: z.string(),
});

/**
 * Schema for the server's response after processing a feedback submission.
 *
 * Contains the URL of the created GitHub Discussion thread (if applicable).
 */
export const actionResponse = z.object({
  /** URL of the created GitHub Discussion (absent if creation was skipped/failed). */
  githubUrl: z.optional(z.string()),
});

/** Inferred TypeScript type for block-level feedback payloads. */
export type BlockFeedback = z.infer<typeof blockFeedback>;

/** Inferred TypeScript type for page-level feedback payloads. */
export type PageFeedback = z.infer<typeof pageFeedback>;

/** Inferred TypeScript type for feedback action server responses. */
export type ActionResponse = z.infer<typeof actionResponse>;
