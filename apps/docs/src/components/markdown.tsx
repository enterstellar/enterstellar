/**
 * Enterstellar Docs — Markdown→JSX Renderer
 *
 * Converts raw markdown text into React elements for the AI chat panel.
 * Uses a `remark` → `remark-rehype` → `hast-util-to-jsx-runtime` pipeline
 * with Fumadocs MDX component overrides.
 *
 * **Pipeline:**
 * 1. Parse markdown to MDAST (`remark`).
 * 2. Convert to HAST (`remark-rehype`).
 * 3. Apply `rehypeWrapWords` — wraps each word in `<span>` with
 *    `animate-fd-fade-in` for streaming word-by-word animation.
 * 4. Convert HAST to React JSX (`toJsxRuntime`).
 *
 * **Caching:** Processed results are cached in a module-level `Map` to
 * avoid reprocessing identical markdown strings during re-renders.
 *
 * @see components/ai/search.tsx — Consumes `<Markdown>` for chat messages
 *
 * @module
 */
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import {
  Children,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  Suspense,
  use,
  useDeferredValue,
} from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { visit } from 'unist-util-visit';
import type { ElementContent, Root, RootContent } from 'hast';

/**
 * Interface for the markdown processing pipeline.
 *
 * Encapsulates the `remark` → `rehype` → JSX conversion chain.
 */
export interface Processor {
  /** Process a raw markdown string into React nodes. */
  process: (content: string) => Promise<ReactNode>;
}

/**
 * Rehype plugin that wraps each word in a `<span>` for streaming animation.
 *
 * Splits text nodes by whitespace boundaries and wraps each word in a
 * `<span class="animate-fd-fade-in">`. Skips `<pre>` elements to preserve
 * code block formatting.
 *
 * @returns A HAST tree transformer function.
 */
export function rehypeWrapWords() {
  return (tree: Root) => {
    visit(tree, ['text', 'element'], (node, index, parent) => {
      if (node.type === 'element' && node.tagName === 'pre') return 'skip';
      if (node.type !== 'text' || !parent || index === undefined) return;

      // Skip whitespace-only text nodes (reduces DOM bloat)
      if (node.value.trim().length === 0) return;

      // Skip text nodes inside strict block elements where <span> is invalid
      if (
        parent.type === 'element' &&
        ['table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'dl'].includes(parent.tagName)
      ) {
        return;
      }

      const words = node.value.split(/(?=\s)/);

      // Create new span nodes for each word and whitespace
      const newNodes: ElementContent[] = words.flatMap((word) => {
        if (word.length === 0) return [];

        return {
          type: 'element',
          tagName: 'span',
          properties: {
            class: 'animate-fd-fade-in',
          },
          children: [{ type: 'text', value: word }],
        };
      });

      Object.assign(node, {
        type: 'element',
        tagName: 'span',
        properties: {},
        children: newNodes,
      } satisfies RootContent);
      return 'skip';
    });
  };
}

/**
 * Create a configured markdown processor instance.
 *
 * Chains `remark-gfm` (GitHub Flavored Markdown), `remark-rehype`
 * (MDAST→HAST conversion), and `rehypeWrapWords` (word animation).
 * The final HAST tree is converted to React JSX with Fumadocs
 * component overrides.
 *
 * @returns A `Processor` instance with a `process()` method.
 */
function createProcessor(): Processor {
  const processor = remark().use(remarkGfm).use(remarkRehype).use(rehypeWrapWords);

  return {
    async process(content) {
      const nodes = processor.parse({ value: content });
      const hast = await processor.run(nodes);

      return toJsxRuntime(hast, {
        development: false,
        jsx,
        jsxs,
        Fragment,
        components: {
          ...defaultMdxComponents,
          pre: Pre,
          img: undefined, // use JSX
        },
      }) as ReactNode;
    },
  };
}

/**
 * Custom `<pre>` override for code blocks.
 *
 * Extracts the language from the `className` of the inner `<code>`
 * element and renders a `DynamicCodeBlock` with syntax highlighting.
 *
 * @param props - Standard `pre` element props.
 * @returns The syntax-highlighted code block, or `null` if content is not a string.
 */
function Pre(props: ComponentProps<'pre'>): ReactElement | null {
  const code = Children.only(props.children) as ReactElement;
  const codeProps = code.props as ComponentProps<'code'>;
  const content = codeProps.children;
  if (typeof content !== 'string') return null;

  let lang =
    codeProps.className
      ?.split(' ')
      .find((v) => v.startsWith('language-'))
      ?.slice('language-'.length) ?? 'text';

  if (lang === 'mdx') lang = 'md';

  return <DynamicCodeBlock lang={lang} code={content.trimEnd()} />;
}

/** Singleton processor instance (created once at module load). */
const processor = createProcessor();

/**
 * Markdown rendering component with deferred updates.
 *
 * Wraps the async `Renderer` in React Suspense with an invisible
 * fallback (preserving layout height). Uses `useDeferredValue` to
 * avoid blocking the UI during rapid streaming updates.
 *
 * @param props - Component props.
 * @param props.text - Raw markdown string to render.
 * @returns The rendered markdown element.
 */
export function Markdown({ text }: { text: string }): ReactElement {
  const deferredText = useDeferredValue(text);

  return (
    <Suspense fallback={<p className="invisible">{text}</p>}>
      <Renderer text={deferredText} />
    </Suspense>
  );
}

/**
 * Module-level promise cache for processed markdown results.
 *
 * Prevents re-processing identical markdown strings during React
 * re-renders. Entries persist for the lifetime of the page session.
 */
const cache = new Map<string, Promise<ReactNode>>();

/**
 * Async renderer that unwraps the cached processing promise.
 *
 * Uses React's `use()` hook to suspend until the markdown is
 * processed, then returns the resulting React tree.
 *
 * @param props - Component props.
 * @param props.text - Raw markdown string (used as cache key).
 * @returns The processed React nodes.
 */
function Renderer({ text }: { text: string }): ReactNode {
  const result = cache.get(text) ?? processor.process(text);
  cache.set(text, result);

  return use(result);
}
