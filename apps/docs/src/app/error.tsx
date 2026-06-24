/**
 * Enterstellar Docs — Global Error Boundary
 *
 * Next.js error boundary that catches unhandled runtime errors in any
 * route segment. Renders a branded error page with a retry button and
 * a fallback link to the documentation root.
 *
 * **Behavior:**
 * - Logs the error to the console for observability.
 * - Offers a "Try Again" button that calls `reset()` to re-render the
 *   errored segment without a full page reload.
 * - Provides a "Return to Documentation" escape hatch for unrecoverable errors.
 *
 * **Important:** This is a Client Component (`'use client'`) as required
 * by Next.js for error boundaries. The `error` prop is sanitized by
 * Next.js in production (message is stripped to avoid leaking internals).
 *
 * @see {@link https://nextjs.org/docs/app/building-your-application/routing/error-handling Next.js Error Handling}
 *
 * @module
 */
'use client';

import Link from 'fumadocs-core/link';
import type { ReactElement } from 'react';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';

/**
 * Props for the Next.js error boundary component.
 */
interface ErrorPageProps {
  /** The caught error object (message is sanitized in production). */
  error: Error & { digest?: string };
  /** Function to re-render the errored route segment. */
  reset: () => void;
}

/**
 * Global error boundary page component.
 *
 * Rendered by Next.js when an unhandled error occurs during rendering,
 * data fetching, or in event handlers within any route segment.
 *
 * @param props - Error boundary props from Next.js.
 * @returns The error page with retry and navigation options.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps): ReactElement {
  // ── Error Logging ────────────────────────────────────────────────────
  // Log to console for local debugging and Vercel runtime logs.
  // In production, `error.message` is sanitized by Next.js.
  useEffect(() => {
    console.error('[Enterstellar Docs] Unhandled error:', error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center gap-6 p-8">
      {/* ── Error Indicator ──────────────────────────────────────────── */}
      <p className="text-6xl font-bold font-mono text-fd-muted-foreground/50">Error</p>

      {/* ── Message ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Something Went Wrong</h1>
        <p className="text-fd-muted-foreground text-sm max-w-md">
          An unexpected error occurred. You can try again or return to the documentation home.
        </p>
        {/* Show error digest in dev for debugging */}
        {error.digest && (
          <p className="text-xs text-fd-muted-foreground/50 font-mono mt-1">
            Digest: {error.digest}
          </p>
        )}
      </div>

      {/* ── Actions ────────────────────────────────────────────────── */}
      <div className="flex flex-row items-center gap-3 mt-2">
        <button onClick={reset} className={cn(buttonVariants({ variant: 'secondary' }))}>
          Try Again
        </button>
        <Link href="/" className={cn(buttonVariants({ variant: 'ghost' }))}>
          Return to Documentation
        </Link>
      </div>
    </div>
  );
}
