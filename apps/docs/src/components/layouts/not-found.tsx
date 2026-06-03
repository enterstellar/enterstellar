/**
 * Enterstellar Docs — Not Found (404) Page
 *
 * Renders a 404 error page with intelligent alternative page suggestions.
 * Uses React `Suspense` to asynchronously load and display similar pages
 * from the documentation tree, helping users find what they were looking for.
 *
 * **Architecture:**
 * - `NotFound` — Synchronous wrapper with error title and Suspense boundary.
 * - `Alternative` — Async RSC that fetches and renders page suggestions.
 *
 * @see app/(docs)/[[...slug]]/page.tsx — Where `NotFound` is rendered on 404
 * @see lib/source/index.ts — `source` API used to generate suggestions
 *
 * @module
 */
import Link from 'fumadocs-core/link';
import { type ReactElement, type ReactNode, Suspense } from 'react';
import { cn } from '@/lib/cn';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';

/**
 * A single suggested page to display on the 404 error page.
 */
export interface Suggestion {
  /** Unique identifier for the suggestion (typically the page slug). */
  id: string;
  /** URL path to the suggested page. */
  href: string;
  /** Display title of the suggested page. */
  title: ReactNode;
}

/**
 * Props for the `NotFound` component.
 */
export interface NotFoundProps {
  /**
   * Async function that returns an array of suggested pages.
   * Called within a React Suspense boundary.
   */
  getSuggestions: () => Promise<Suggestion[]>;
}

/**
 * 404 Not Found page component.
 *
 * Renders a centered error message with a dashed border card containing
 * alternative page suggestions loaded via React Suspense. While suggestions
 * are loading, displays a "Finding Alternatives..." placeholder.
 *
 * @param props - Component props containing the suggestion loader.
 * @returns The 404 error page element.
 */
export function NotFound(props: NotFoundProps): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 p-8 [grid-area:main]">
      <h1 className="text-4xl font-bold font-mono">Not Found</h1>
      <div className="w-full border border-fd-foreground/50 border-dashed p-4 max-w-[600px]">
        <Suspense
          fallback={<p className="text-sm text-fd-muted-foreground">Finding Alternatives...</p>}
        >
          <Alternative {...props} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Async server component that fetches and renders page suggestions.
 *
 * If no suggestions are found, renders a "No Alternative Found" message
 * with a "Return to Home" link. Otherwise, renders a card list with
 * page titles and their URL paths.
 *
 * @param props - Props containing the suggestion loader function.
 * @returns The suggestion list or fallback message.
 */
async function Alternative({ getSuggestions }: NotFoundProps): Promise<ReactElement> {
  const suggestions = await getSuggestions();

  if (suggestions.length === 0) {
    return (
      <div>
        <p className="text-sm text-fd-muted-foreground mb-2">No Alternative Found</p>
        <Link href="/" className={cn(buttonVariants({ variant: 'secondary' }))}>
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm text-fd-muted-foreground mb-2">Maybe you are looking for</h2>

      <div className="flex flex-col rounded-lg border bg-fd-card text-fd-card-foreground shadow-md overflow-hidden divide-y divide-fd-border">
        {suggestions.map((doc) => (
          <Link
            key={doc.id}
            href={doc.href}
            className="inline-flex items-center justify-between gap-4 text-sm px-3 py-2 hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            <p className="font-medium text-nowrap">{doc.title}</p>
            <code className="text-fd-muted-foreground truncate">{doc.href}</code>
          </Link>
        ))}
      </div>
    </div>
  );
}
