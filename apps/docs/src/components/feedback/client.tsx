/**
 * Enterstellar Docs — Feedback System Client Components
 *
 * Client-side UI for the page-level and block-level feedback systems.
 * Users can rate documentation pages (thumbs up/down) and leave inline
 * feedback on specific content blocks. Submissions are persisted to
 * `localStorage` to prevent duplicate submissions and are sent to the
 * server via React Server Actions (which create GitHub Discussions).
 *
 * **Exports:**
 * - `Feedback` — Page-level rating widget (thumbs up/down + comment).
 * - `FeedbackBlock` — Inline block-level feedback popover.
 *
 * @see components/feedback/schema.ts — Zod validation schemas
 * @see lib/github/feedback.ts — Server actions (`onPageFeedbackAction`, `onBlockFeedbackAction`)
 * @see app/(docs)/[[...slug]]/page.tsx — Where feedback components are rendered
 *
 * @module
 */
'use client';
import { cn } from '@/lib/cn';
import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import { CornerDownRightIcon, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useEffectEvent,
  useState,
  useTransition,
} from 'react';
import { Collapsible, CollapsibleContent } from 'fumadocs-ui/components/ui/collapsible';
import { cva } from 'class-variance-authority';
import { usePathname } from 'next/navigation';
import { Popover, PopoverContent, PopoverTrigger } from 'fumadocs-ui/components/ui/popover';
import type { FeedbackBlockProps } from 'fumadocs-core/mdx-plugins/remark-feedback-block';
import {
  actionResponse,
  blockFeedback,
  pageFeedback,
  type ActionResponse,
  type BlockFeedback,
  type PageFeedback,
} from './schema';
import { z } from 'zod/mini';

// =============================================================================
// Styles & Schema Extensions
// =============================================================================

/** CVA variants for the thumbs up/down rating buttons. */
const rateButtonVariants = cva(
  'inline-flex items-center gap-2 px-3 py-2 rounded-full font-medium border text-sm [&_svg]:size-4 disabled:cursor-not-allowed',
  {
    variants: {
      active: {
        true: 'bg-fd-accent text-fd-accent-foreground [&_svg]:fill-current',
        false: 'text-fd-muted-foreground',
      },
    },
  },
);

// Extended schemas that wrap server responses with their original payloads.
// Used by `useSubmissionStorage` to validate localStorage values on rehydration.

/** Extended schema combining page feedback with its server response. */
const pageFeedbackResult = z.extend(pageFeedback, {
  response: actionResponse,
});

/** Extended schema combining block feedback with its server response. */
const blockFeedbackResult = z.extend(blockFeedback, {
  response: actionResponse,
});

// =============================================================================
// Page-Level Feedback
// =============================================================================

/**
 * Page-level feedback widget.
 *
 * Renders a thumbs up/down rating bar at the bottom of documentation pages.
 * After rating, a collapsible textarea opens for detailed feedback. On
 * submission, the feedback is sent via a Server Action and the response
 * (GitHub Discussion URL) is displayed.
 *
 * @param props - Component props.
 * @param props.onSendAction - Server Action that processes the feedback.
 * @returns The feedback widget element.
 */
export function Feedback({
  onSendAction,
}: {
  onSendAction: (feedback: PageFeedback) => Promise<ActionResponse>;
}): ReactElement {
  const url = usePathname();
  const { previous, setPrevious } = useSubmissionStorage(url, (v: unknown) => {
    const result = pageFeedbackResult.safeParse(v);
    return result.success ? result.data : null;
  });
  const [opinion, setOpinion] = useState<'good' | 'bad' | null>(null);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  // ── Submit Handler ───────────────────────────────────────────────────
  // Calls the Server Action and persists the result to localStorage
  // so the user sees "Thank you" on revisit instead of a fresh form.
  function submit(e?: SyntheticEvent): void {
    if (opinion == null) return;

    startTransition(async () => {
      const feedback: PageFeedback = {
        url,
        opinion,
        message,
      };

      const response = await onSendAction(feedback);
      setPrevious({
        response,
        ...feedback,
      });
      setMessage('');
      setOpinion(null);
    });

    e?.preventDefault();
  }

  // Use previous submission's opinion for display, or current selection
  const activeOpinion = previous?.opinion ?? opinion;

  return (
    <Collapsible
      open={opinion !== null || previous !== null}
      onOpenChange={(v) => {
        if (!v) setOpinion(null);
      }}
      className="border-y py-3"
    >
      <div className="flex flex-row items-center gap-2">
        <p className="text-sm font-medium pe-2">How is this guide?</p>
        <button
          disabled={previous !== null}
          className={cn(
            rateButtonVariants({
              active: activeOpinion === 'good',
            }),
          )}
          onClick={() => {
            setOpinion('good');
          }}
        >
          <ThumbsUp />
          Good
        </button>
        <button
          disabled={previous !== null}
          className={cn(
            rateButtonVariants({
              active: activeOpinion === 'bad',
            }),
          )}
          onClick={() => {
            setOpinion('bad');
          }}
        >
          <ThumbsDown />
          Bad
        </button>
      </div>
      <CollapsibleContent className="mt-3">
        {previous ? (
          <div className="px-3 py-6 flex flex-col items-center gap-3 bg-fd-card text-fd-muted-foreground text-sm text-center rounded-xl">
            <p>Thank you for your feedback!</p>
            <div className="flex flex-row items-center gap-2">
              <a
                href={previous.response.githubUrl}
                rel="noreferrer noopener"
                target="_blank"
                className={cn(
                  buttonVariants({
                    color: 'primary',
                  }),
                  'text-xs',
                )}
              >
                View on GitHub
              </a>

              <button
                className={cn(
                  buttonVariants({
                    color: 'secondary',
                  }),
                  'text-xs',
                )}
                onClick={() => {
                  setOpinion(previous.opinion);
                  setPrevious(null);
                }}
              >
                Submit Again
              </button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <textarea
              autoFocus
              required
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
              }}
              className="border rounded-lg bg-fd-secondary text-fd-secondary-foreground p-3 resize-none focus-visible:outline-none placeholder:text-fd-muted-foreground"
              placeholder="Leave your feedback..."
              onKeyDown={(e) => {
                if (!e.shiftKey && e.key === 'Enter') {
                  submit(e);
                }
              }}
            />
            <button
              type="submit"
              className={cn(buttonVariants({ color: 'outline' }), 'w-fit px-3')}
              disabled={isPending}
            >
              Submit
            </button>
          </form>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// Block-Level Feedback
// =============================================================================

/**
 * Inline block-level feedback popover.
 *
 * Wraps a content block with a hover-triggered "Feedback" button. When
 * clicked, opens a popover with a textarea for the user to submit feedback
 * about the specific block content. Used with the `remark-feedback-block`
 * MDX plugin.
 *
 * @param props - Block feedback props from the MDX plugin + server action.
 * @param props.id - Unique block identifier from the MDX plugin.
 * @param props.body - The text content of the block (for context).
 * @param props.onSendAction - Server Action that processes the feedback.
 * @param props.children - The wrapped content block.
 * @returns The block wrapper with feedback popover.
 *
 * @see {@link https://fumadocs.dev/docs/integrations/feedback Fumadocs integration docs}
 */
export function FeedbackBlock({
  id,
  body,
  onSendAction,
  children,
}: FeedbackBlockProps & {
  onSendAction: (feedback: BlockFeedback) => Promise<ActionResponse>;
  children: ReactNode;
}): ReactElement {
  const url = usePathname();
  const blockId = `${url}-${id}`;
  const { previous, setPrevious } = useSubmissionStorage(blockId, (v) => {
    const result = blockFeedbackResult.safeParse(v);
    if (result.success) return result.data;
    return null;
  });
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // ── Submit Handler ───────────────────────────────────────────────────
  function submit(e?: SyntheticEvent): void {
    startTransition(async () => {
      const feedback: BlockFeedback = {
        blockId,
        blockBody: body,
        url,
        message,
      };

      const response = await onSendAction(feedback);
      setPrevious({
        response,
        ...feedback,
      });
      setMessage('');
    });

    e?.preventDefault();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative group/feedback">
        <div
          className={cn(
            'absolute -inset-1 rounded-sm pointer-events-none transition-colors duration-100 z-[-1]',
            open
              ? 'bg-fd-accent'
              : 'group-hover/feedback:bg-fd-accent group-hover/feedback:delay-100',
          )}
        />
        <PopoverTrigger
          className={cn(
            buttonVariants({ variant: 'secondary', size: 'sm' }),
            'absolute -top-7 end-0 backdrop-blur-sm text-fd-muted-foreground gap-1.5 transition-all duration-100 data-[state=open]:bg-fd-accent data-[state=open]:text-fd-accent-foreground',
            !open &&
            'opacity-0 pointer-events-none group-hover/feedback:pointer-events-auto group-hover/feedback:opacity-100 group-hover/feedback:delay-100 hover:pointer-events-auto hover:opacity-100 hover:delay-100',
          )}
          onClick={(e) => {
            setOpen((prev) => !prev);
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <MessageSquare className="size-3.5" />
          Feedback
        </PopoverTrigger>

        <div className="in-[.prose-no-margin]:prose-no-margin">{children}</div>
      </div>

      <PopoverContent className="min-w-[300px] bg-fd-card text-fd-card-foreground">
        {previous ? (
          <div className="flex flex-col items-center py-2 gap-2 text-fd-muted-foreground text-sm text-center rounded-xl">
            <p>Thank you for your feedback!</p>
            <div className="flex flex-row items-center gap-2">
              <a
                href={previous.response.githubUrl}
                rel="noreferrer noopener"
                target="_blank"
                className={cn(
                  buttonVariants({
                    color: 'primary',
                  }),
                  'text-xs',
                )}
              >
                View on GitHub
              </a>

              <button
                className={cn(
                  buttonVariants({
                    color: 'secondary',
                  }),
                  'text-xs',
                )}
                onClick={() => {
                  setPrevious(null);
                }}
              >
                Submit Again
              </button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={submit}>
            <textarea
              autoFocus
              required
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
              }}
              className="border rounded-lg bg-fd-secondary text-fd-secondary-foreground p-3 resize-none focus-visible:outline-none placeholder:text-fd-muted-foreground"
              placeholder="Leave your feedback..."
              onKeyDown={(e) => {
                if (!e.shiftKey && e.key === 'Enter') {
                  submit(e);
                }
              }}
            />
            <button
              type="submit"
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-1.5')}
              disabled={isPending}
            >
              <CornerDownRightIcon className="text-fd-muted-foreground size-4" />
              Submit
            </button>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}

// =============================================================================
// Submission Persistence Hook
// =============================================================================

/**
 * LocalStorage-backed submission persistence hook.
 *
 * Prevents duplicate feedback submissions by storing the validated
 * submission result in `localStorage` keyed by page URL or block ID.
 * On mount, attempts to restore a previous submission using the
 * provided `validate` function.
 *
 * @typeParam Result - The type of the validated submission result.
 * @param blockId - Unique identifier for the feedback target (URL or block key).
 * @param validate - Validation function that parses a stored value into `Result` or `null`.
 * @returns An object with `previous` (cached result) and `setPrevious` (setter).
 */
function useSubmissionStorage<Result>(
  blockId: string,
  validate: (v: unknown) => Result | null,
): {
  previous: Result | null;
  setPrevious: (v: Result | null) => void;
} {
  const storageKey = `docs-feedback-${blockId}`;
  const [value, setValue] = useState<Result | null>(null);
  const validateCallback = useEffectEvent(validate);

  useEffect(() => {
    const item = localStorage.getItem(storageKey);
    if (item === null) return;
    const validated = validateCallback(JSON.parse(item));

    if (validated !== null) setValue(validated);
  }, [storageKey]);

  return {
    previous: value,
    setPrevious: (result: Result | null) => {
      if (result) localStorage.setItem(storageKey, JSON.stringify(result));
      else localStorage.removeItem(storageKey);

      setValue(result);
    },
  };
}
