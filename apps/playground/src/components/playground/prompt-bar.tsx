/**
 * @module playground/components/playground/prompt-bar
 * @description Intent input bar with scene suggestion chips and typewriter placeholder.
 *
 * Positioned above the Controls Bar and below the Behind the Scenes panel
 * in the inverted layout (O6). The bar provides:
 * - Scene suggestion chips (Domain 💡 + Quick ⚡) for one-click demos
 * - Intent text input with typewriter placeholder cycling suggested intents
 * - Send button with pipeline-state-aware icon (idle ▶ / loading ⟳ / done ✓)
 *
 * **Layout context (O6):**
 * ```
 * │ Scene Grid (top)                               │
 * ├────────────────────────────────────────────────┤
 * │ Behind the Scenes (educational panel, UP)       │
 * ├──────────── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ────────────┤
 * │         Prompt Bar ←←← (this component)          │
 * ├────────────────────────────────────────────────┤
 * │ Controls Bar (sticky bottom)                    │
 * ```
 *
 * @see implementation_plan.md §4.6 — Prompt Bar
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

import type { PlaygroundScene } from '@/enterstellar/scenes/types';
import type { PipelineState } from './playground-shell';
import { allQuickScenes, allDomainScenes } from '@/enterstellar/scenes';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link PromptBar} component.
 */
interface PromptBarProps {
  /** Currently active scene. */
  readonly activeScene: PlaygroundScene;
  /** Current pipeline state — controls send button icon. */
  readonly pipelineState: PipelineState;
  /** Callback when the user submits an intent. */
  readonly onSendIntent: (intent: string) => void;
  /** Callback when the user selects a scene chip. */
  readonly onSelectScene: (scene: PlaygroundScene) => void;
}

/**
 * Return type for the {@link useTypewriter} hook.
 *
 * @internal
 */
interface TypewriterResult {
  /** The current typewriter text (animated character-by-character). */
  readonly text: string;
  /**
   * Snapshots the current typewriter text and pauses the animation.
   * Returns the snapshotted text (the full text of the current suggestion,
   * not just the partially-typed characters) for use as editable input.
   *
   * Called on input focus to auto-fill the suggested prompt text.
   */
  readonly snapshot: () => string;
  /**
   * Resumes the typewriter animation from where it left off.
   * Called on input blur when the user didn't modify the auto-filled text.
   */
  readonly resume: () => void;
}

/**
 * Cycles through placeholder text with a typewriter effect.
 *
 * Supports a `snapshot()` callback that freezes the animation and
 * returns the **full** current suggestion text (not the partial
 * typed-so-far). This enables the auto-fill UX: when the user
 * focuses the input, the suggested text becomes editable.
 *
 * @param texts - Array of placeholder strings to cycle through.
 * @param typingSpeed - Milliseconds per character.
 * @param pauseDuration - Milliseconds to hold the full text.
 * @returns A {@link TypewriterResult} with the animated text and snapshot callback.
 *
 * @internal
 */
function useTypewriter(
  texts: readonly string[],
  typingSpeed = 50,
  pauseDuration = 2000,
): TypewriterResult {
  const [text, setText] = useState('');
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  /**
   * Ref tracking the inner "pause at full text" timer.
   * Without this, the nested setTimeout is orphaned when the effect
   * cleanup runs — it fires setIsDeleting(true) unexpectedly,
   * causing a visual stutter between text transitions.
   */
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (texts.length === 0) return;
    if (isPaused) return;

    const currentText = texts[textIndex % texts.length] ?? '';

    const timer = setTimeout(
      () => {
        if (!isDeleting) {
          if (charIndex < currentText.length) {
            setText(currentText.slice(0, charIndex + 1));
            setCharIndex((c) => c + 1);
          } else {
            // Pause at full text, then start deleting.
            // Timer tracked in ref for proper cleanup.
            pauseTimerRef.current = setTimeout(() => {
              setIsDeleting(true);
              pauseTimerRef.current = null;
            }, pauseDuration);
          }
        } else {
          if (charIndex > 0) {
            setText(currentText.slice(0, charIndex - 1));
            setCharIndex((c) => c - 1);
          } else {
            setIsDeleting(false);
            setTextIndex((t) => (t + 1) % texts.length);
          }
        }
      },
      isDeleting ? typingSpeed / 2 : typingSpeed,
    );

    return () => {
      clearTimeout(timer);
      // Also clear the inner pause timer to prevent orphaned state updates
      if (pauseTimerRef.current !== null) {
        clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
    };
  }, [texts, textIndex, charIndex, isDeleting, typingSpeed, pauseDuration, isPaused]);

  /**
   * Snapshots the current suggestion and pauses the animation.
   * Returns the FULL current suggestion text so the input can
   * be pre-filled with the complete prompt, not a partial string.
   */
  const snapshot = useCallback((): string => {
    const fullText = texts[textIndex % texts.length] ?? '';
    setIsPaused(true);
    return fullText;
  }, [texts, textIndex]);

  /**
   * Resumes the typewriter animation from the paused state.
   * The animation continues from where it left off (same text index
   * and character position).
   */
  const resume = useCallback((): void => {
    setIsPaused(false);
  }, []);

  // Resume animation when texts change (scene switch)
  useEffect(() => {
    setIsPaused(false);
    setCharIndex(0);
    setTextIndex(0);
    setText('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts]);

  return { text, snapshot, resume };
}

// ---------------------------------------------------------------------------
// PromptBar Component
// ---------------------------------------------------------------------------

/**
 * Intent input bar with scene suggestion chips and typewriter placeholder.
 *
 * **Layout:**
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ 💡 Financial  💡 Medical  💡 Commerce  💡 SaaS  💡 EdTech      │
 * │ ⚡ MetricCard  ⚡ DataTable  ⚡ StatusBadge  ⚡ UserProfile ...  │
 * ├──────────────────────────────────────────────────────────────────┤
 * │ [Typewriter placeholder...                              ] [▶]  │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * - Scene chips: two rows (💡 Domain, ⚡ Quick). Click auto-selects + auto-sends.
 * - Input: single-line text with typewriter placeholder cycling scene intents.
 * - Send button: idle (▶), loading (⟳ animated), compiled (✓).
 * - Enter key submits.
 */
export function PromptBar({
  activeScene,
  pipelineState,
  onSendIntent,
  onSelectScene,
}: PromptBarProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Typewriter placeholder from active scene's suggested intents
  const { text: placeholderText, snapshot: snapshotTypewriter, resume: resumeTypewriter } = useTypewriter(
    activeScene.suggestedIntents,
    40,
    2500,
  );

  /**
   * Tracks the text that was auto-filled on focus.
   * Used by handleBlur to determine if the user modified the suggestion.
   * If inputValue still matches this ref on blur, we clear and resume.
   */
  const autoFilledTextRef = useRef<string>('');

  /**
   * Handles input focus — auto-fills the input with the current typewriter
   * suggestion if the input is empty. This saves the user from retyping
   * the prompt text they were already reading.
   */
  const handleFocus = useCallback(() => {
    if (inputValue === '') {
      const snappedText = snapshotTypewriter();
      if (snappedText.length > 0) {
        setInputValue(snappedText);
        autoFilledTextRef.current = snappedText;
      }
    }
  }, [inputValue, snapshotTypewriter]);

  /**
   * Handles input blur — if the user didn't modify the auto-filled
   * suggestion, clears the input and resumes the typewriter animation.
   * If they edited it (even a single character), keeps their text.
   */
  const handleBlur = useCallback(() => {
    if (inputValue === autoFilledTextRef.current && autoFilledTextRef.current !== '') {
      setInputValue('');
      autoFilledTextRef.current = '';
      resumeTypewriter();
    }
  }, [inputValue, resumeTypewriter]);

  /**
   * Handles form submission (Enter key or send button click).
   */
  const handleSubmit = useCallback(() => {
    const text = inputValue.trim();
    if (text === '') return;
    onSendIntent(text);
    setInputValue('');
  }, [inputValue, onSendIntent]);

  /**
   * Handles Enter key press.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Send button icon based on pipeline state
  const sendIcon =
    pipelineState === 'loading'
      ? '⟳'
      : pipelineState === 'compiled'
        ? '✓'
        : '▶';

  const sendDisabled = pipelineState === 'loading';

  return (
    <div className="px-4 py-3 border-t border-playground-border/30">
      {/* ── Scene Suggestion Chips ── */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {/* Domain scenes */}
        {allDomainScenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            onClick={() => { onSelectScene(scene); }}
            title={scene.description}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-all duration-200',
              activeScene.id === scene.id
                ? 'bg-cloud/20 text-cloud border border-cloud/30'
                : 'bg-playground-panel/60 text-playground-muted border border-playground-border/40 hover:bg-playground-panel hover:text-neutral-200 hover:border-playground-border',
            )}
          >
            <span>💡</span>
            <span>{scene.name}</span>
          </button>
        ))}

        {/* Separator */}
        <span className="self-center text-playground-border mx-0.5">│</span>

        {/* Quick scenes */}
        {allQuickScenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            onClick={() => { onSelectScene(scene); }}
            title={scene.description}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer transition-all duration-200',
              activeScene.id === scene.id
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'bg-playground-panel/60 text-playground-muted border border-playground-border/40 hover:bg-playground-panel hover:text-neutral-200 hover:border-playground-border',
            )}
          >
            <span>⚡</span>
            <span>{scene.name}</span>
          </button>
        ))}
      </div>

      {/* ── Intent Input Row ── */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); }}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholderText || 'Describe the UI you want to see...'}
            className={cn(
              'w-full bg-playground-panel/60 border border-playground-border/50 rounded-lg',
              'px-4 py-2.5 text-sm text-neutral-100',
              'placeholder:text-playground-muted/60',
              'focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20',
              'transition-colors duration-200',
            )}
            disabled={sendDisabled}
          />
        </div>

        {/* Send button */}
        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={sendDisabled}
          whileHover={sendDisabled ? {} : { scale: 1.05 }}
          whileTap={sendDisabled ? {} : { scale: 0.95 }}
          className={cn(
            'size-10 rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer transition-all duration-200',
            pipelineState === 'loading' && 'bg-playground-panel text-playground-muted cursor-wait',
            pipelineState === 'compiled' && 'bg-success/20 text-success',
            pipelineState !== 'loading' && pipelineState !== 'compiled' && 'bg-primary-500/20 text-primary-400 hover:bg-primary-500/30',
            sendDisabled && 'opacity-60',
          )}
        >
          {pipelineState === 'loading' ? (
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              {sendIcon}
            </motion.span>
          ) : (
            sendIcon
          )}
        </motion.button>
      </div>
    </div>
  );
}
