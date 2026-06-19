/**
 * Enterstellar Docs — AI Search Chat Panel
 *
 * Full-featured conversational AI search panel for the documentation site.
 * Users can ask natural language questions about the docs and receive
 * grounded, citation-rich answers powered by the Vercel AI SDK.
 *
 * **Architecture:**
 * - `AISearch` — Root provider wrapping children with chat state context.
 * - `AISearchTrigger` — Button that toggles the panel (supports `float` position).
 * - `AISearchPanel` — Slide-in panel with header, message list, and input.
 * - `AISearchPanelHeader` — Panel header with title and close button.
 * - `AISearchPanelList` — Scrollable message list with auto-scroll.
 * - `AISearchInput` — Chat input form with submit/abort controls.
 * - `AISearchInputActions` — Retry/clear buttons for completed conversations.
 * - `useAISearchContext` — Hook to access the AI chat context from children.
 * - `useHotKey` — Keyboard shortcut handler (`Cmd+/` open, `Esc` close).
 *
 * @see app/api/chat/route.ts — Server-side chat endpoint
 * @see app/(docs)/layout.tsx — Where the AI panel is mounted
 * @see components/ai/launcher.tsx — Button variant styles
 *
 * @module
 */
'use client';
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
  use,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Loader2, MessageCircleIcon, RefreshCw, SearchIcon, Send, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { buttonVariants } from './launcher';
import { useChat, type UseChatHelpers } from '@ai-sdk/react';
import { DefaultChatTransport, type Tool, type UIToolInvocation } from 'ai';
import { Markdown } from '../markdown';
import { Presence } from '@radix-ui/react-presence';
import type { ChatUIMessage, SearchTool } from '../../app/api/chat/route';

/**
 * Internal React context for sharing AI chat state between the panel
 * components. Initialized as `null` — consumers must use `useAISearchContext()`
 * which asserts non-null.
 */
type AISearchContextType = {
  open: boolean;
  setOpen: (open: boolean) => void;
  chat: UseChatHelpers<ChatUIMessage>;
};

/**
 * Internal React context for sharing AI chat state between the panel
 * components. Initialized as `null` — consumers must use `useAISearchContext()`
 * which asserts non-null.
 */
const Context = createContext<AISearchContextType | null>(null);

/**
 * AI chat panel header with title, disclaimer, and close button.
 *
 * @param props - Standard `div` props. `className` is merged with defaults.
 * @returns The header element.
 */
export function AISearchPanelHeader({ className, ...props }: ComponentProps<'div'>): ReactElement {
  const { setOpen } = useAISearchContext();

  return (
    <div
      className={cn(
        'sticky top-0 flex items-start gap-2 border rounded-xl bg-fd-secondary text-fd-secondary-foreground shadow-sm',
        className,
      )}
      {...props}
    >
      <div className="px-3 py-2 flex-1">
        <p className="text-sm font-medium mb-2">AI Chat</p>
        <p className="text-xs text-fd-muted-foreground">
          AI can be inaccurate, please verify the answers.
        </p>
      </div>

      <button
        aria-label="Close"
        tabIndex={-1}
        className={cn(
          buttonVariants({
            size: 'icon-sm',
            color: 'ghost',
            className: 'text-fd-muted-foreground rounded-full',
          }),
        )}
        onClick={() => {
          setOpen(false);
        }}
      >
        <X />
      </button>
    </div>
  );
}

/**
 * Contextual action buttons for the chat input area.
 *
 * Shows "Retry" (regenerate last response) and "Clear Chat" buttons
 * when a conversation is active. Hidden when no messages exist.
 *
 * @returns The action buttons, or `null` if no messages.
 */
export function AISearchInputActions(): ReactElement | null {
  const { messages, status, setMessages, regenerate } = useChatContext();
  const isLoading = status === 'streaming';

  if (messages.length === 0) return null;

  return (
    <>
      {!isLoading && messages.at(-1)?.role === 'assistant' && (
        <button
          type="button"
          className={cn(
            buttonVariants({
              color: 'secondary',
              size: 'sm',
              className: 'rounded-full gap-1.5',
            }),
          )}
          onClick={() => regenerate()}
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      )}
      <button
        type="button"
        className={cn(
          buttonVariants({
            color: 'secondary',
            size: 'sm',
            className: 'rounded-full',
          }),
        )}
        onClick={() => {
          setMessages([]);
        }}
      >
        Clear Chat
      </button>
    </>
  );
}

/** LocalStorage key for persisting the draft input across page navigations. */
const StorageKeyInput = '__ai_search_input';

/**
 * Chat input form with auto-expanding textarea and submit/abort controls.
 *
 * Persists the draft input to `localStorage` so users don't lose their
 * query on accidental navigation. Supports `Enter` to submit and
 * `Shift+Enter` for newlines.
 *
 * @param props - Standard `form` props. `className` is merged with defaults.
 * @returns The chat input form element.
 */
export function AISearchInput(props: ComponentProps<'form'>): ReactElement {
  const { status, sendMessage, stop } = useChatContext();
  const [input, setInput] = useState(() => localStorage.getItem(StorageKeyInput) ?? '');
  const isLoading = status === 'streaming' || status === 'submitted';
  const onStart = (e?: SyntheticEvent): void => {
    e?.preventDefault();
    const message = input.trim();
    if (message.length === 0) return;

    void sendMessage({
      role: 'user',
      parts: [
        {
          type: 'data-client',
          data: {
            location: location.href,
          },
        },
        {
          type: 'text',
          text: message,
        },
      ],
    });
    setInput('');
    localStorage.removeItem(StorageKeyInput);
  };

  useEffect(() => {
    if (isLoading) document.getElementById('nd-ai-input')?.focus();
  }, [isLoading]);

  return (
    <form {...props} className={cn('flex items-start pe-2', props.className)} onSubmit={onStart}>
      <Input
        value={input}
        placeholder={isLoading ? 'AI is answering...' : 'Ask a question'}
        autoFocus
        className="p-3"
        disabled={status === 'streaming' || status === 'submitted'}
        onChange={(e) => {
          setInput(e.target.value);
          localStorage.setItem(StorageKeyInput, e.target.value);
        }}
        onKeyDown={(event) => {
          if (!event.shiftKey && event.key === 'Enter') {
            onStart(event);
          }
        }}
      />
      {isLoading ? (
        <button
          key="bn"
          type="button"
          className={cn(
            buttonVariants({
              color: 'secondary',
              className: 'transition-all rounded-full mt-2 gap-2',
            }),
          )}
          onClick={stop}
        >
          <Loader2 className="size-4 animate-spin text-fd-muted-foreground" />
          Abort Answer
        </button>
      ) : (
        <button
          key="bn"
          type="submit"
          className={cn(
            buttonVariants({
              color: 'primary',
              className: 'transition-all rounded-full mt-2',
            }),
          )}
          disabled={input.length === 0}
        >
          <Send className="size-4" />
        </button>
      )}
    </form>
  );
}

/**
 * Auto-scrolling container for the chat message list.
 *
 * Uses a `ResizeObserver` on the first child element to detect content
 * height changes and instantly scroll to the bottom (streaming behavior).
 *
 * @param props - Standard `div` props (excluding `dir`).
 * @returns The scrollable container element.
 */
function List(props: Omit<ComponentProps<'div'>, 'dir'>): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    function callback(): void {
      const container = containerRef.current;
      if (!container) return;

      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'instant',
      });
    }

    const observer = new ResizeObserver(callback);
    callback();

    const element = containerRef.current.firstElementChild;

    if (element) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      {...props}
      className={cn('fd-scroll-container overflow-y-auto min-w-0 flex flex-col', props.className)}
    >
      {props.children}
    </div>
  );
}

/**
 * Auto-expanding textarea input using the CSS grid overlay technique.
 *
 * A hidden `div` mirrors the textarea content to drive the grid row
 * height, creating a smooth auto-expand effect without JavaScript
 * height measurement.
 *
 * @param props - Standard `textarea` props.
 * @returns The auto-expanding textarea element.
 */
function Input(props: ComponentProps<'textarea'>): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const shared = cn('col-start-1 row-start-1', props.className);

  return (
    <div className="grid flex-1">
      <textarea
        id="nd-ai-input"
        {...props}
        className={cn(
          'resize-none bg-transparent placeholder:text-fd-muted-foreground focus-visible:outline-none',
          shared,
        )}
      />
      <div ref={ref} className={cn(shared, 'break-all invisible')}>
        {`${props.value?.toString() ?? ''}\n`}
      </div>
    </div>
  );
}

/** Display names for chat message roles. */
const roleName: Record<string, string> = {
  user: 'You',
  assistant: 'Enterstellar',
};

/**
 * Single chat message bubble with markdown rendering and search tool results.
 *
 * Parses the message parts to extract text content and search tool calls,
 * then renders the text as markdown and any search results as status cards.
 *
 * @param props - Message object and standard `div` props.
 * @param props.message - The AI SDK chat message with typed parts.
 * @returns The rendered message element.
 */
function Message({
  message,
  ...props
}: { message: ChatUIMessage } & ComponentProps<'div'>): ReactElement {
  let markdown = '';
  const searchCalls: UIToolInvocation<SearchTool>[] = [];

  for (const part of message.parts) {
    if (part.type === 'text') {
      markdown += part.text;
      continue;
    }

    if (part.type.startsWith('tool-')) {
      const toolName = part.type.slice('tool-'.length);
      const p = part as UIToolInvocation<Tool>;

      if (toolName !== 'search' || !p.toolCallId) continue;
      searchCalls.push(p);
    }
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
      }}
      {...props}
    >
      <p
        className={cn(
          'mb-1 text-sm font-medium text-fd-muted-foreground',
          message.role === 'assistant' && 'text-fd-primary',
        )}
      >
        {roleName[message.role] ?? 'unknown'}
      </p>
      <div className="prose text-sm">
        <Markdown text={markdown} />
      </div>

      {searchCalls.map((call) => {
        return (
          <div
            key={call.toolCallId}
            className="flex flex-row gap-2 items-center mt-3 rounded-lg border bg-fd-secondary text-fd-muted-foreground text-xs p-2"
          >
            <SearchIcon className="size-4" />
            {call.state === 'output-error' || call.state === 'output-denied' ? (
              <p className="text-fd-error">{call.errorText ?? 'Failed to search'}</p>
            ) : (
              <p>{!call.output ? 'Searching…' : `${String(call.output.length)} search results`}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Root AI search provider.
 *
 * Initializes the Vercel AI SDK `useChat` hook and wraps children with
 * the shared context. Must be an ancestor of all other `AISearch*`
 * components.
 *
 * @param props - Component props.
 * @param props.children - Child components that consume the AI context.
 * @returns The context-providing wrapper.
 */
export function AISearch({ children }: { children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  const chat = useChat<ChatUIMessage>({
    id: 'search',
    transport: new DefaultChatTransport({
      api: '/docs/api/chat',
    }),
  });

  return (
    <Context value={useMemo(() => ({ chat, open, setOpen }), [chat, open])}>{children}</Context>
  );
}

/**
 * Toggle button for the AI search panel.
 *
 * Supports two position modes:
 * - `'default'` — Inline in the layout flow.
 * - `'float'` — Fixed to the bottom-right corner with slide/fade animation.
 *
 * @param props - Button props with optional `position` mode.
 * @param props.position - Layout mode. Defaults to `'default'`.
 * @returns The trigger button element.
 */
export function AISearchTrigger({
  position = 'default',
  className,
  ...props
}: ComponentProps<'button'> & { position?: 'default' | 'float' }): ReactElement {
  const { open, setOpen } = useAISearchContext();

  return (
    <button
      data-state={open ? 'open' : 'closed'}
      className={cn(
        position === 'float' && [
          'fixed bottom-4 gap-3 w-24 inset-e-[calc(--spacing(4)+var(--removed-body-scroll-bar-size,0px))] shadow-lg z-20 transition-[translate,opacity]',
          open && 'translate-y-10 opacity-0',
        ],
        className,
      )}
      onClick={() => {
        setOpen(!open);
      }}
      {...props}
    >
      {props.children}
    </button>
  );
}

/**
 * Full AI search panel with overlay, animations, and responsive layout.
 *
 * On mobile: renders as a centered dialog with overlay.
 * On desktop: slides in as a sticky sidebar in the docs layout `toc` grid area.
 *
 * @returns The animated panel element.
 */
export function AISearchPanel(): ReactElement {
  const { open, setOpen } = useAISearchContext();
  useHotKey();

  return (
    <>
      <style>
        {`
        @keyframes ask-ai-open {
          from {
            translate: 100% 0;
          }
          to {
            translate: 0 0;
          }
        }
        @keyframes ask-ai-close {
          from {
            width: var(--ai-chat-width);
          }
          to {
            width: 0px;
          }
        }`}
      </style>
      <Presence present={open}>
        <div
          data-state={open ? 'open' : 'closed'}
          className="fixed inset-0 z-30 backdrop-blur-xs bg-fd-overlay data-[state=open]:animate-fd-fade-in data-[state=closed]:animate-fd-fade-out lg:hidden"
          onClick={() => {
            setOpen(false);
          }}
        />
      </Presence>
      <Presence present={open}>
        <div
          className={cn(
            'overflow-hidden z-30 bg-fd-card text-fd-card-foreground [--ai-chat-width:400px] 2xl:[--ai-chat-width:460px]',
            'max-lg:fixed max-lg:inset-x-2 max-lg:inset-y-4 max-lg:border max-lg:rounded-2xl max-lg:shadow-xl',
            'lg:sticky lg:top-0 lg:h-dvh lg:border-s lg:ms-auto lg:in-[#nd-docs-layout]:[grid-area:toc] lg:in-[#nd-notebook-layout]:row-span-full lg:in-[#nd-notebook-layout]:col-start-5',
            open
              ? 'animate-fd-dialog-in lg:animate-[ask-ai-open_200ms]'
              : 'animate-fd-dialog-out lg:animate-[ask-ai-close_200ms]',
          )}
        >
          <div className="flex flex-col size-full p-2 lg:p-3 lg:w-(--ai-chat-width)">
            <AISearchPanelHeader />
            <AISearchPanelList className="flex-1" />
            <div className="rounded-xl border bg-fd-secondary text-fd-secondary-foreground shadow-sm has-focus-visible:shadow-md">
              <AISearchInput />
              <div className="flex items-center gap-1.5 p-1 empty:hidden">
                <AISearchInputActions />
              </div>
            </div>
          </div>
        </div>
      </Presence>
    </>
  );
}

/**
 * Message list area with gradient edge masks and empty state.
 *
 * Displays all non-system messages from the chat context. When empty,
 * shows a "Start a new chat" prompt. Error states are rendered inline.
 *
 * @param props - Standard `div` props. `className` and `style` are merged.
 * @returns The message list element.
 */
export function AISearchPanelList({
  className,
  style,
  ...props
}: ComponentProps<'div'>): ReactElement {
  const chat = useChatContext();
  const messages = chat.messages.filter((msg) => msg.role !== 'system');

  return (
    <List
      className={cn('py-4 overscroll-contain', className)}
      style={{
        maskImage:
          'linear-gradient(to bottom, transparent, white 1rem, white calc(100% - 1rem), transparent 100%)',
        ...style,
      }}
      {...props}
    >
      {messages.length === 0 ? (
        <div className="text-sm text-fd-muted-foreground/80 size-full flex flex-col items-center justify-center text-center gap-2">
          <MessageCircleIcon fill="currentColor" stroke="none" />
          <p
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            Start a new chat below.
          </p>
        </div>
      ) : (
        <div className="flex flex-col px-3 gap-4">
          {chat.error && (
            <div className="p-2 bg-fd-secondary text-fd-secondary-foreground border rounded-lg">
              <p className="text-xs text-fd-muted-foreground mb-1">
                Request Failed: {chat.error.name}
              </p>
              <p className="text-sm">{chat.error.message}</p>
            </div>
          )}
          {messages.map((item) => (
            <Message key={item.id} message={item} />
          ))}
        </div>
      )}
    </List>
  );
}

/**
 * Keyboard shortcut handler for the AI search panel.
 *
 * - `Escape` — Close the panel (when open).
 * - `Cmd+/` or `Ctrl+/` — Open the panel (when closed).
 *
 * Registers a global `keydown` listener on mount.
 */
export function useHotKey(): void {
  const { open, setOpen } = useAISearchContext();

  const onKeyPress = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      setOpen(false);
      e.preventDefault();
    }

    if (e.key === '/' && (e.metaKey || e.ctrlKey) && !open) {
      setOpen(true);
      e.preventDefault();
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyPress);
    return () => {
      window.removeEventListener('keydown', onKeyPress);
    };
  }, []);
}

/**
 * Access the AI search context from any child of `<AISearch>`.
 *
 * @returns The context value containing `open`, `setOpen`, and `chat`.
 * @throws If called outside an `<AISearch>` provider.
 */
export function useAISearchContext(): AISearchContextType {
  const ctx = use(Context);
  if (!ctx) throw new Error('useAISearchContext must be used within AISearch');
  return ctx;
}

/**
 * Internal hook to access only the chat helpers from context.
 *
 * @returns The `UseChatHelpers` instance.
 */
function useChatContext(): UseChatHelpers<ChatUIMessage> {
  const ctx = use(Context);
  if (!ctx) throw new Error('useChatContext must be used within AISearch');
  return ctx.chat;
}
