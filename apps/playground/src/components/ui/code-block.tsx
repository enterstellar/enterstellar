/**
 * Enterstellar Playground — Code Block Primitive
 *
 * A pre-formatted code viewer for displaying JSON payloads,
 * ComponentIntent data, CompilationResult diffs, and raw
 * LLM output in the trace panel. Uses JetBrains Mono (font-mono)
 * with horizontal scroll for wide content.
 *
 * @example
 * ```tsx
 * <CodeBlock
 *   title="ComponentIntent"
 *   language="json"
 * >
 *   {JSON.stringify(intent, null, 2)}
 * </CodeBlock>
 * ```
 *
 * @module components/ui/code-block
 */
import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for the {@link CodeBlock} component.
 *
 * @property title - Optional label displayed above the code block
 *   (e.g., "Raw LLM Output", "Compiled Intent", "Diff").
 * @property language - Language identifier for semantic styling.
 *   Currently decorative — future integration with a syntax
 *   highlighter (Shiki) would use this for tokenization.
 */
export interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional label above the code block */
  readonly title?: string;
  /** Language identifier (decorative, ready for future Shiki integration) */
  readonly language?: string;
}

/**
 * Pre-formatted code viewer with dark surface styling.
 *
 * Renders monospace text inside a scrollable container with
 * the playground panel background. Designed for JSON payloads
 * that may be wide (nested objects) or tall (multi-zone intent arrays).
 *
 * Does NOT include syntax highlighting in this primitive —
 * that would require Shiki, which is a Phase 5 polish item.
 * The raw monospace rendering is sufficient for MVP trace output.
 */
function CodeBlock({
  title,
  language,
  className,
  children,
  ...props
}: CodeBlockProps): React.JSX.Element {
  return (
    <div
      className={cn('rounded-lg border border-playground-border overflow-hidden', className)}
      {...props}
    >
      {title != null && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-playground-bg border-b border-playground-border">
          <span className="text-[10px] font-medium text-playground-muted uppercase tracking-wider">
            {title}
          </span>
          {language != null && (
            <span className="text-[10px] font-mono text-playground-muted">
              {language}
            </span>
          )}
        </div>
      )}
      <pre className="p-3 bg-playground-panel overflow-x-auto">
        <code className="text-xs font-mono text-neutral-300 leading-relaxed whitespace-pre">
          {children}
        </code>
      </pre>
    </div>
  );
}

CodeBlock.displayName = 'CodeBlock';

export { CodeBlock };
