/**
 * @module playground/components/playground/playground-shell
 * @description Main playground shell — the state orchestrator.
 *
 * Composes the vertical layout (scene-first, controls-bottom):
 * ```
 * ┌──────────────────────────────────────────────┐
 * │                                              │  ← TOP
 * │           Scene Grid (90%+ viewport)         │
 * │                                              │
 * ├──────────────────────────────────────────────┤
 * │ Behind the Scenes (educational panel, UP)    │
 * ├──────────────────────────────────────────────┤
 * │ Controls Bar (pipeline status, toggles)      │
 * ├──────────────────────────────────────────────┤
 * │ Prompt Bar (sticky bottom, intent input)     │  ← BOTTOM
 * └──────────────────────────────────────────────┘
 * ```
 *
 * The layout inversion places the demo output (SceneGrid) at the top
 * of the viewport — the first thing the user sees. Controls, prompt,
 * and educational panels anchor to the bottom, following the same
 * pattern as modern AI chat UIs.
 *
 * The "Behind the Scenes" panel expands **upward** from the controls
 * bar, overlaying the bottom portion of the SceneGrid. This replaces
 * the previous separate Pipeline and Trace tabs with a single unified
 * toggle.
 *
 * **State managed here:**
 * - `activeScene` — the currently selected `PlaygroundScene`
 * - `mode` — `'healthy' | 'hallucinating' | 'cloud'`
 * - `pipelineState` — `'idle' | 'loading' | 'compiled' | 'error'`
 * - `lastResult` — `SceneIntentResult` from the latest API call
 *
 * Child components are controlled — they receive state via props and
 * communicate back via callback props. No prop drilling more than 1 level.
 *
 * @see implementation_plan.md §4.2 — PlaygroundShell
 */
'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { PlaygroundMode, SceneIntentResult } from '@/enterstellar/agent-connection';
import type { PlaygroundScene } from '@/enterstellar/scenes/types';
import type { ZoneTrace, CompilationProvenance, CompilationError } from '@enterstellar-ai/types';
import { useEnterstellar } from '@enterstellar-ai/react';
import { playgroundContracts } from '@/enterstellar/registry';
import { sceneOpenCanvas } from '@/enterstellar/scenes/scene-open-canvas';

import { ControlsBar } from './controls-bar';
import { ModeSelector } from './mode-selector';
import { PromptBar } from './prompt-bar';
import { SceneGrid } from './scene-grid';
import { EducationalTraceConsole } from './educational-trace-console';
import { usePlaygroundConnection } from './playground-context';
import { cn } from '@/lib/utils';

/**
 * Active panel in the controls bar.
 *
 * - `'behind-the-scenes'` — educational trace panel is expanded (opens upward)
 * - `null` — no panel is expanded
 *
 * Replaces the previous `'pipeline' | 'trace'` dual-tab model with a
 * single unified toggle. The educational console merges both Pipeline
 * and Trace views into a synchronized Master-Detail layout.
 */
type ActiveTab = 'behind-the-scenes' | null;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Pipeline state — drives the Controls Bar's visual feedback.
 *
 * - `'idle'` — no active compilation, default state
 * - `'loading'` — API request in flight, awaiting LLM response
 * - `'compiled'` — compilation complete, zones rendered
 * - `'error'` — API or compilation error
 */
export type PipelineState = 'idle' | 'loading' | 'compiled' | 'error';

// ---------------------------------------------------------------------------
// PlaygroundShell Component
// ---------------------------------------------------------------------------

/**
 * The main playground shell — state orchestrator.
 *
 * Manages all playground state and coordinates communication between:
 * - `ControlsBar` — 5-step pipeline summary, mode selector, Behind the Scenes toggle
 * - `PromptBar` — intent input, scene suggestions, send action
 * - `SceneGrid` — zone rendering, lifecycle animation
 *
 * The `LiveAgentConnection` is created in `PlaygroundProviders` and
 * accessed here via a stable ref. The shell calls
 * `connection.sendSceneIntent()` on prompt submission.
 */
export function PlaygroundShell(): React.JSX.Element {
  // ── State ───────────────────────────────────────────────────────────────
  const [activeScene, setActiveScene] = useState<PlaygroundScene>(sceneOpenCanvas);
  const [mode, setMode] = useState<PlaygroundMode>('healthy');
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle');
  const [lastResult, setLastResult] = useState<SceneIntentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(null);

  /**
   * Toggles the "Behind the Scenes" educational panel.
   * Clicking when open closes it; clicking when closed opens it.
   */
  const toggleBehindTheScenes = useCallback(() => {
    setActiveTab((current) =>
      current === 'behind-the-scenes' ? null : 'behind-the-scenes',
    );
  }, []);

  /**
   * Shared LiveAgentConnection from PlaygroundProviders.
   * Same instance as the one passed to Provider — ensures zones
   * and shell communicate through a single event bus.
   */
  const connection = usePlaygroundConnection();

  /**
   * Store access for DevTools trace writing.
   *
   * The engine's `Zone` writes only `traceIds` (string[]) to the store,
   * but DevTools' `useDevtoolsTraces` reads `store.get('traces')` expecting
   * full `ZoneTrace[]` objects. This is an engine key/shape mismatch.
   *
   * Workaround: after each successful `sendSceneIntent()`, we construct
   * synthetic `ZoneTrace` objects from the API result and append them to
   * the store's `'traces'` key. DevTools picks them up automatically.
   */
  const { store, cache } = useEnterstellar();
  const traceCounterRef = useRef(0);

  /**
   * Constructs `ZoneTrace[]` from a `SceneIntentResult` and appends them
   * to the store's `'traces'` key for DevTools consumption.
   *
   * **Critical fix:** Traces now run the real Zod `safeParse` against
   * the component contract's schema — the same validation the compiler
   * performs inside `<Zone>`. This ensures the trace status
   * (`pass`/`fail`) accurately matches the actual render outcome.
   *
   * Previously, traces were hardcoded to `status: 'pass'`, creating a
   * disconnect where the Behind the Scenes panel showed "passed" for
   * components that actually failed schema validation and fell back
   * to GenericCard.
   */
  const writeTracesToStore = useCallback(
    (result: SceneIntentResult, scene: PlaygroundScene) => {
      const newTraces: ZoneTrace[] = result.intents.map((intent, i) => {
        const zoneName = scene.zones[i]?.name ?? `zone-${String(i)}`;
        const traceId = `${zoneName}-${String(++traceCounterRef.current)}-${String(Date.now())}`;


        const provenance: CompilationProvenance = {
          agent: 'GPT OSS 120B',
          registry: 'playground',
          compilerVersion: '0.1.0',
          compiledAt: new Date().toISOString(),
        };

        // ── Real Schema Pre-Validation ────────────────────────────────
        // Run the same Zod safeParse the compiler uses in parse-step.ts.
        // This produces accurate trace data for the educational console.
        const contract = playgroundContracts.find(
          (c) => c.name === intent.component,
        );

        let compilationStatus: 'pass' | 'fail' = 'pass';
        let compilationErrors: CompilationError[] = [];

        if (contract === undefined) {
          // Component name doesn't exist in registry → ENS-3004
          compilationStatus = 'fail';
          compilationErrors = [{
            code: 'ENS-3004',
            message: `Component "${intent.component}" not found in registry`,
            path: 'component',
          }];
        } else {
          // Run the real Zod schema validation
          const parseResult = contract.props.safeParse(intent.props);
          if (!parseResult.success) {
            compilationStatus = 'fail';
            compilationErrors = parseResult.error.issues.map((issue) => ({
              code: 'ENS-2001',
              message: `Schema validation failed at '${issue.path.length > 0 ? `props.${issue.path.join('.')}` : 'props'}': ${issue.message}`,
              path: issue.path.length > 0 ? `props.${issue.path.join('.')}` : 'props',
            }));
          }
        }

        return {
          id: traceId,
          intent: {
            component: intent.component,
            props: intent.props,
            confidence: intent.confidence,
            _source: {
              protocol: 'custom' as const,
              rawEventId: `playground-${scene.id}-zone-${zoneName}`,
            },
          },
          compilation: {
            status: compilationStatus,
            errors: compilationErrors,
            selfCorrectionAttempts: 0,
          },
          provenance,
          metrics: {
            totalMs: result.durationMs,
            retryAttempt: 0,
          },
          timestamp: new Date().toISOString(),
        };
      });

      // Write hallucinated traces with status 'fail' for DevTools
      // dual-trace comparison. These show in the timeline alongside
      // healthy 'pass' traces, visualizing what the compiler caught.
      const hallucinatedTraces: ZoneTrace[] = (result.hallucinatedIntents ?? []).map((intent, i) => {
        const zoneName = `hallucinated-zone-${String(i)}`;
        const traceId = `${zoneName}-${String(++traceCounterRef.current)}-${String(Date.now())}`;


        return {
          id: traceId,
          intent: {
            component: intent.component,
            props: intent.props,
            confidence: intent.confidence,
            _source: {
              protocol: 'custom' as const,
              rawEventId: `playground-${scene.id}-hallucinated-${zoneName}`,
            },
          },
          compilation: {
            status: 'fail' as const,
            errors: [
              {
                code: 'ENS-3004',
                message: `Hallucinated component "${intent.component}" — no registry match`,
                path: 'component',
              },
            ],
            selfCorrectionAttempts: 0,
          },
          provenance: {
            agent: 'GPT OSS 120B (sabotaged)',
            registry: 'playground',
            compilerVersion: '0.1.0',
            compiledAt: new Date().toISOString(),
          },
          metrics: {
            totalMs: result.durationMs,
            retryAttempt: 0,
          },
          timestamp: new Date().toISOString(),
        };
      });

      const existingTraces = store.get<ZoneTrace[]>('traces') ?? [];
      store.set('traces', [...existingTraces, ...newTraces, ...hallucinatedTraces]);
    },
    [store],
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  /**
   * Sends an intent to the API via the LiveAgentConnection.
   *
   * Called by `PromptBar` on submit (Enter key or send button click).
   * Updates pipeline state through the lifecycle:
   * idle → loading → compiled (success) or error (failure).
   *
   * **Scene decoupling:** When the user manually types a prompt, we
   * auto-switch to `sceneOpenCanvas` as the layout container. This
   * ensures the prompt is not constrained by the currently selected
   * chip's zone names and data context. The keyword heuristic in
   * `route.ts` will detect the best data context from the prompt.
   *
   * Exception: if the active scene is already a domain scene (user
   * clicked a chip), we respect it — they explicitly chose that layout.
   */
  const handleSendIntent = useCallback(
    async (intentText: string) => {
      if (intentText.trim() === '') return;

      // Auto-switch to Open Canvas for free-form prompts.
      // If the user clicked a domain chip, handleSelectScene already set
      // activeScene. Here we only override for quick scenes (single-zone
      // atomic demos) which can't sensibly host multi-component prompts.
      const effectiveScene = activeScene.category === 'quick'
        ? sceneOpenCanvas
        : activeScene;

      // Update the visible scene to Open Canvas if we switched
      if (effectiveScene.id !== activeScene.id) {
        setActiveScene(effectiveScene);
      }

      setPipelineState('loading');
      setErrorMessage(null);
      setLastResult(null);

      // Invalidate the render cache before each new prompt.
      // Zone's cache key is `componentName::componentName` (CA1) —
      // it doesn't include the user's prompt or props. Without this,
      // a second MetricCard intent returns the first prompt's cached
      // compilation, ignoring the new prompt entirely.
      if (cache !== null) {
        cache.invalidateAll();
      }

      try {
        const result = await connection.sendSceneIntent(
          effectiveScene,
          intentText,
          mode,
        );
        setLastResult(result);
        writeTracesToStore(result, effectiveScene);
        setPipelineState('compiled');
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setErrorMessage(message);
        setPipelineState('error');
      }
    },
    [activeScene, mode, connection, writeTracesToStore, cache],
  );

  /**
   * Handles scene selection from a suggestion chip.
   *
   * Updates the active scene, auto-populates the first suggested intent,
   * and auto-sends it to the API. This is the "one-click demo" flow.
   */
  const handleSelectScene = useCallback(
    (scene: PlaygroundScene) => {
      setActiveScene(scene);
      setPipelineState('idle');
      setLastResult(null);
      setErrorMessage(null);

      // Invalidate the render cache on scene switch.
      // Cache keys are `componentName::componentName` (CA1) — they don't
      // include scene/domain context. Without this, switching from Medical
      // to Finance returns stale medical-domain compiled results because
      // the same MetricCard component maps to the same cache key.
      if (cache !== null) {
        cache.invalidateAll();
      }

      // Auto-send the first suggested intent for immediate demo
      const firstIntent = scene.suggestedIntents[0];
      if (firstIntent !== undefined) {
        // Small delay to let React update the scene state first
        setTimeout(() => {
          void (async () => {
            setPipelineState('loading');
            try {
              const result = await connection.sendSceneIntent(
                scene,
                firstIntent,
                mode,
              );
              setLastResult(result);
              writeTracesToStore(result, scene);
              setPipelineState('compiled');
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : 'Unknown error occurred';
              setErrorMessage(message);
              setPipelineState('error');
            }
          })();
        }, 100);
      }
    },
    [mode, connection, writeTracesToStore, cache],
  );

  /**
   * Handles mode change from the ModeSelector.
   *
   * Resets pipeline state when switching modes — previous results
   * are no longer relevant to the new mode's visualization.
   */
  const handleModeChange = useCallback((newMode: PlaygroundMode) => {
    setMode(newMode);
    setPipelineState('idle');
    setLastResult(null);
    setErrorMessage(null);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────
  //
  // Layout order (scene-first, controls-above-prompt):
  //   1. Scene Grid — demo output, fills 90%+ of viewport (top)
  //   2. Behind the Scenes — educational panel, expands upward
  //   3. Controls Bar — pipeline summary + mode selector
  //   4. Prompt Bar — intent input + scene suggestion chips (sticky bottom)
  //

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── 1. Demo Zone — 90%+ of viewport, at the TOP ── */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeScene.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="h-full"
          >
            <SceneGrid
              scene={activeScene}
              pipelineState={pipelineState}
              mode={mode}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── 2. Educational Trace Console — drops UP from controls bar ── */}
      <EducationalTraceConsole
        isOpen={activeTab === 'behind-the-scenes'}
        mode={mode}
        scene={activeScene}
        pipelineState={pipelineState}
        lastResult={lastResult}
      />

      {/* ── 3. Controls Bar ── */}
      <ControlsBar
        pipelineState={pipelineState}
        mode={mode}
        lastResult={lastResult}
        errorMessage={errorMessage}
      >
        {/* Behind the Scenes toggle — single unified button */}
        <motion.button
          type="button"
          onClick={toggleBehindTheScenes}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'text-[11px] px-3 py-1 rounded cursor-pointer transition-colors',
            'inline-flex items-center gap-1.5',
            activeTab === 'behind-the-scenes'
              ? 'bg-primary-500/20 text-primary-400'
              : 'text-playground-muted hover:text-neutral-200',
          )}
        >
          <span className="text-[10px]">{activeTab === 'behind-the-scenes' ? '▼' : '▲'}</span>
          <span>Behind the Scenes</span>
        </motion.button>

        {/* Inline DevTools toggle — discoverable entry point */}
        <motion.button
          type="button"
          onClick={() => {
            const toggle = document.querySelector<HTMLButtonElement>('[data-enterstellar-devtools-toggle]');
            if (toggle !== null) toggle.click();
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'text-[11px] px-2.5 py-1 rounded cursor-pointer transition-colors',
            'inline-flex items-center gap-1',
            'text-playground-muted hover:text-neutral-200',
          )}
          title="Open Enterstellar DevTools (Ctrl+Shift+A)"
        >
          <span className="text-[10px]">⚡</span>
          <span>Debug</span>
        </motion.button>

        <ModeSelector mode={mode} onModeChange={handleModeChange} />
      </ControlsBar>

      {/* ── 4. Prompt Bar — sticky BOTTOM ── */}
      <PromptBar
        activeScene={activeScene}
        pipelineState={pipelineState}
        onSendIntent={handleSendIntent}
        onSelectScene={handleSelectScene}
      />
    </div>
  );
}
