/**
 * @module playground/enterstellar/renderers
 * @description Interactive React renderers for the Enterstellar Playground components.
 *
 * Per Design Choice R6, renderers are completely decoupled from contracts.
 * Each renderer is registered via `registerRenderer()` from `@enterstellar-ai/react`
 * and looked up at render time by `<Zone>` using string name matching.
 *
 * **Interactive renderers (no readOnly):**
 * - `DataTable` — column sorting via click (ephemeral React state)
 * - `CommandPalette` — search filtering + keyboard navigation (↑↓ Enter)
 * - `AlertBanner` — dismissible via close button
 * - All form inputs are typeable
 *
 * All interactions use ephemeral React `useState`. They NEVER leak into
 * the compilation pipeline — the compiler sees only the original props.
 *
 * @see Design Choice R6 — `render` not on ComponentContract
 * @see Design Choice RE13 — string-based renderer lookup
 * @see implementation_plan.md §2.5.1 — Interactive components
 */
'use client';

import { useState, useMemo, type JSX } from 'react';

import { registerRenderer } from '@enterstellar-ai/react';

import { registerAllDomainRenderers } from './domain-renderers';

// ---------------------------------------------------------------------------
// Type-safe prop extraction utilities
// ---------------------------------------------------------------------------

/**
 * Safely extracts a string from unknown props.
 * @internal
 */
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Safely extracts a number from unknown props.
 * @internal
 */
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

/**
 * Safely extracts a boolean from unknown props.
 * @internal
 */
function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Safely extracts an array from unknown props.
 * @internal
 */
function arr(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/**
 * Safely extracts a record from unknown props.
 * @internal
 */
function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Idempotency Guard
// ---------------------------------------------------------------------------

/** Tracks whether renderers have been registered. */
let renderersRegistered = false;

/**
 * Registers all 39 playground component renderers (9 core + 30 domain).
 *
 * This function is **idempotent** — calling it multiple times has no
 * effect after the first invocation. Call it at the app entry point
 * (playground layout) before any `<Zone>` mounts.
 *
 * @example
 * ```ts
 * import { registerPlaygroundRenderers } from '@/enterstellar/renderers';
 * registerPlaygroundRenderers();
 * ```
 */
export function registerPlaygroundRenderers(): void {
  if (renderersRegistered) return;

  // -- 1. MetricCard --------------------------------------------------------

  registerRenderer('MetricCard', (props: Record<string, unknown>): JSX.Element => {
    const label = str(props['label'], 'Metric');
    const value = props['value'] !== undefined ? String(props['value']) : '—';
    const unit = str(props['unit']);
    const trend = str(props['trend']);
    const sparkline = arr(props['sparkline']).filter(
      (v): v is number => typeof v === 'number',
    );

    /** Trend arrow and color class */
    const trendConfig = {
      up: { arrow: '↑', color: 'text-success' },
      down: { arrow: '↓', color: 'text-error' },
      flat: { arrow: '→', color: 'text-playground-muted' },
    }[trend] ?? null;

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--token-text-secondary,theme(colors.playground-muted))] mb-1">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-[var(--token-text-primary,theme(colors.neutral-100))]">
            {value}
          </span>
          {unit !== '' && (
            <span className="text-sm text-[var(--token-text-secondary,theme(colors.playground-muted))]">
              {unit}
            </span>
          )}
          {trendConfig !== null && (
            <span className={`text-sm font-semibold ${trendConfig.color}`}>
              {trendConfig.arrow}
            </span>
          )}
        </div>

        {/* Inline sparkline SVG */}
        {sparkline.length > 1 && (
          <div className="mt-3">
            <svg
              viewBox={`0 0 ${String((sparkline.length - 1) * 16)} 32`}
              className="w-full h-8"
              preserveAspectRatio="none"
            >
              {(() => {
                const min = Math.min(...sparkline);
                const max = Math.max(...sparkline);
                const range = max - min || 1;
                const points = sparkline
                  .map((v, i) => {
                    const x = i * 16;
                    const y = 32 - ((v - min) / range) * 28 - 2;
                    return `${String(x)},${y.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polyline
                    points={points}
                    fill="none"
                    stroke="var(--token-accent, oklch(0.65 0.15 250))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              })()}
            </svg>
          </div>
        )}
      </div>
    );
  });

  // -- 2. DataTable (sortable) -----------------------------------------------

  registerRenderer('DataTable', (props: Record<string, unknown>): JSX.Element => {
    const columns = arr(props['columns']).map(rec);
    const rows = arr(props['rows']).map(rec);
    const sortable = bool(props['sortable']);

    /**
     * Ephemeral sort state — column key + direction.
     * NEVER leaks into the compilation pipeline.
     */
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortAsc, setSortAsc] = useState(true);

    const sortedRows = useMemo(() => {
      if (sortKey === null) return rows;
      return [...rows].sort((a, b) => {
        const aVal = str(a[sortKey]);
        const bVal = str(b[sortKey]);
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }, [rows, sortKey, sortAsc]);

    function handleSort(key: string): void {
      if (!sortable) return;
      if (sortKey === key) {
        setSortAsc((prev) => !prev);
      } else {
        setSortKey(key);
        setSortAsc(true);
      }
    }

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-surface,theme(colors.playground-panel))]">
                {columns.map((col) => {
                  const key = str(col['key']);
                  const label = str(col['label']);
                  const align = str(col['align'], 'left');
                  const isSorted = sortKey === key;
                  return (
                    <th
                      key={key}
                      className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--token-text-secondary,theme(colors.playground-muted))] text-${align} ${sortable ? 'cursor-pointer select-none hover:text-[var(--token-text-primary,theme(colors.neutral-100))]' : ''}`}
                      onClick={() => { handleSort(key); }}
                    >
                      {label}
                      {isSorted && (
                        <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--token-card-border,theme(colors.playground-border))] last:border-b-0 hover:bg-[var(--token-accent,theme(colors.playground-panel))] hover:bg-opacity-10 transition-colors"
                >
                  {columns.map((col) => {
                    const key = str(col['key']);
                    const align = str(col['align'], 'left');
                    return (
                      <td
                        key={key}
                        className={`px-4 py-2.5 text-[var(--token-text-primary,theme(colors.neutral-200))] text-${align}`}
                      >
                        {str(row[key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  });

  // -- 3. StatusBadge --------------------------------------------------------

  registerRenderer('StatusBadge', (props: Record<string, unknown>): JSX.Element => {
    const status = str(props['status'], 'offline');
    const label = str(props['label'], 'Unknown');
    const pulse = bool(props['pulse']);

    const dotColor: Record<string, string> = {
      online: 'bg-success',
      offline: 'bg-playground-muted',
      warning: 'bg-warning',
      error: 'bg-error',
      maintenance: 'bg-warning',
      stable: 'bg-success',
      critical: 'bg-error',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] px-5 py-4 inline-flex items-center gap-3">
        <span className="relative flex size-3">
          <span className={`absolute inline-flex size-full rounded-full opacity-75 ${dotColor[status] ?? 'bg-playground-muted'} ${pulse ? 'animate-ping' : ''}`} />
          <span className={`relative inline-flex size-3 rounded-full ${dotColor[status] ?? 'bg-playground-muted'}`} />
        </span>
        <span className="text-sm font-medium text-[var(--token-text-primary,theme(colors.neutral-100))]">
          {label}
        </span>
      </div>
    );
  });

  // -- 4. UserProfile --------------------------------------------------------

  registerRenderer('UserProfile', (props: Record<string, unknown>): JSX.Element => {
    const name = str(props['name'], 'Unknown');
    const role = str(props['role'], 'User');
    const avatar = str(props['avatar']);
    const stats = arr(props['stats']).map(rec);

    const initials = name
      .split(' ')
      .map((n) => n[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center gap-4 mb-4">
          {avatar !== '' ? (
            <img
              src={avatar}
              alt={name}
              className="size-12 rounded-full object-cover ring-2 ring-[var(--token-accent,theme(colors.primary-500))] ring-offset-2 ring-offset-[var(--token-card-bg,theme(colors.playground-surface))]"
            />
          ) : (
            <div className="size-12 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))] flex items-center justify-center text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))]">
              {initials}
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">
              {name}
            </h3>
            <p className="text-xs text-[var(--token-text-secondary,theme(colors.playground-muted))]">
              {role}
            </p>
          </div>
        </div>

        {stats.length > 0 && (
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
            {stats.map((stat) => (
              <div key={str(stat['label'])} className="text-center">
                <p className="text-lg font-bold text-[var(--token-text-primary,theme(colors.neutral-100))]">
                  {str(stat['value'], '—')}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--token-text-secondary,theme(colors.playground-muted))]">
                  {str(stat['label'])}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });

  // -- 5. ActivityFeed -------------------------------------------------------

  registerRenderer('ActivityFeed', (props: Record<string, unknown>): JSX.Element => {
    const entries = arr(props['entries']).map(rec);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="space-y-0">
          {entries.map((entry, i) => (
            <div key={i} className="flex gap-3">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center">
                <div className="size-2.5 rounded-full bg-[var(--token-accent,theme(colors.primary-500))] mt-1.5 shrink-0" />
                {i < entries.length - 1 && (
                  <div className="w-px flex-1 bg-[var(--token-card-border,theme(colors.playground-border))]" />
                )}
              </div>
              {/* Content */}
              <div className="pb-4">
                <p className="text-sm text-[var(--token-text-primary,theme(colors.neutral-200))]">
                  {str(entry['action'])}
                </p>
                <p className="text-xs text-[var(--token-text-secondary,theme(colors.playground-muted))] mt-0.5">
                  {str(entry['user'])} · {str(entry['timestamp'])}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  });

  // -- 6. ProgressTracker ----------------------------------------------------

  registerRenderer('ProgressTracker', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Progress');
    const steps = arr(props['steps']).map((s) => str(s));
    const current = num(props['current']);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))] mb-4">
          {title}
        </h3>
        <div className="flex items-center gap-0">
          {steps.map((step, i) => {
            const isComplete = i < current;
            const isActive = i === current;
            const isPending = i > current;

            return (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                {/* Step circle */}
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`size-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${isComplete
                      ? 'bg-success/20 border-success text-success'
                      : isActive
                        ? 'bg-[var(--token-accent,theme(colors.primary-500))]/20 border-[var(--token-accent,theme(colors.primary-500))] text-[var(--token-accent,theme(colors.primary-500))]'
                        : 'border-[var(--token-card-border,theme(colors.playground-border))] text-playground-muted'
                      }`}
                  >
                    {isComplete ? '✓' : String(i + 1)}
                  </div>
                  <span
                    className={`text-[10px] text-center max-w-[72px] leading-tight ${isActive
                      ? 'text-[var(--token-text-primary,theme(colors.neutral-100))] font-medium'
                      : isPending
                        ? 'text-playground-muted'
                        : 'text-success'
                      }`}
                  >
                    {step}
                  </span>
                </div>
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-1 mt-[-18px] ${isComplete
                      ? 'bg-success'
                      : 'bg-[var(--token-card-border,theme(colors.playground-border))]'
                      }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- 7. AlertBanner (dismissible) ------------------------------------------

  registerRenderer('AlertBanner', (props: Record<string, unknown>): JSX.Element => {
    const severity = str(props['severity'], 'info');
    const title = str(props['title'], 'Alert');
    const message = str(props['message']);
    const dismissible = bool(props['dismissible']);

    /**
     * Ephemeral dismiss state — component removes itself from DOM
     * but the compilation pipeline is unaware. The compiler still
     * sees the original intent with the AlertBanner present.
     */
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return <></>;

    const severityStyles: Record<string, { border: string; icon: string; bg: string }> = {
      info: { border: 'border-primary-500/30', icon: 'ℹ️', bg: 'bg-primary-500/10' },
      success: { border: 'border-success/30', icon: '✅', bg: 'bg-success/10' },
      warning: { border: 'border-warning/30', icon: '⚠️', bg: 'bg-warning/10' },
      error: { border: 'border-error/30', icon: '❌', bg: 'bg-error/10' },
      critical: { border: 'border-error/50', icon: '🚨', bg: 'bg-error/15' },
    };

    const style = severityStyles[severity] ?? severityStyles['info'] ?? { border: 'border-primary-500/30', icon: 'ℹ️', bg: 'bg-primary-500/10' };

    return (
      <div className={`rounded-xl border ${style.border} ${style.bg} p-4 flex gap-3`}>
        <span className="text-lg shrink-0 mt-0.5">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">
            {title}
          </h4>
          <p className="text-xs text-[var(--token-text-secondary,theme(colors.neutral-300))] mt-1 leading-relaxed">
            {message}
          </p>
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={() => { setDismissed(true); }}
            className="text-playground-muted hover:text-neutral-100 transition-colors text-lg shrink-0 cursor-pointer"
            aria-label="Dismiss alert"
          >
            ×
          </button>
        )}
      </div>
    );
  });

  // -- 8. CommandPalette (searchable + keyboard nav) -------------------------

  registerRenderer('CommandPalette', (props: Record<string, unknown>): JSX.Element => {
    const commands = arr(props['commands']).map(rec);
    const placeholder = str(props['placeholder'], 'Type a command...');

    /**
     * Ephemeral search + keyboard navigation state.
     * Filtering and selection NEVER leak into the compilation pipeline.
     */
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const filteredCommands = useMemo(() => {
      if (search === '') return commands;
      const lower = search.toLowerCase();
      return commands.filter(
        (cmd) =>
          str(cmd['label']).toLowerCase().includes(lower) ||
          str(cmd['action']).toLowerCase().includes(lower) ||
          str(cmd['group']).toLowerCase().includes(lower),
      );
    }, [commands, search]);

    /** Group commands by their `group` field for visual sections. */
    const groups = useMemo(() => {
      const map = new Map<string, Record<string, unknown>[]>();
      for (const cmd of filteredCommands) {
        const group = str(cmd['group'], 'Commands');
        const existing = map.get(group) ?? [];
        existing.push(cmd);
        map.set(group, existing);
      }
      return map;
    }, [filteredCommands]);

    function handleKeyDown(e: React.KeyboardEvent): void {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
    }

    let currentIndex = 0;

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        {/* Search input */}
        <div className="p-3 border-b border-[var(--token-card-border,theme(colors.playground-border))]">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-[var(--token-surface,theme(colors.playground-panel))] border border-[var(--token-card-border,theme(colors.playground-border))] rounded-lg px-3 py-2 text-sm text-[var(--token-text-primary,theme(colors.neutral-100))] placeholder:text-playground-muted focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Command list */}
        <div className="max-h-[280px] overflow-y-auto">
          {[...groups.entries()].map(([groupName, groupCommands]) => (
            <div key={groupName}>
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-playground-muted bg-[var(--token-surface,theme(colors.playground-panel))]">
                {groupName}
              </p>
              {groupCommands.map((cmd) => {
                const thisIndex = currentIndex;
                currentIndex += 1;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    key={str(cmd['action'])}
                    className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${isSelected
                      ? 'bg-[var(--token-accent,theme(colors.primary-500))]/15 text-[var(--token-text-primary,theme(colors.neutral-100))]'
                      : 'hover:bg-[var(--token-surface,theme(colors.playground-panel))] text-[var(--token-text-primary,theme(colors.neutral-200))]'
                      }`}
                    onMouseEnter={() => { setSelectedIndex(thisIndex); }}
                  >
                    <span className="text-sm">{str(cmd['label'])}</span>
                    {str(cmd['shortcut']) !== '' && (
                      <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--token-surface,theme(colors.playground-panel))] text-playground-muted border border-[var(--token-card-border,theme(colors.playground-border))]">
                        {str(cmd['shortcut'])}
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-playground-muted">
              No commands found
            </p>
          )}
        </div>
      </div>
    );
  });

  // -- 9. GenericCard (Fallback) ---------------------------------------------

  registerRenderer('GenericCard', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title']);
    const subtitle = str(props['subtitle']);
    const bodyText = str(props['body']);
    const variant = str(props['variant'], 'default');

    const isFallback = props['originalComponent'] !== undefined || (title === '' && bodyText === '');

    if (isFallback) {
      const originalComponent = str(props['originalComponent'], 'UnknownComponent');
      const originalProps = props['originalProps'] as Record<string, unknown> | undefined;
      const errors = arr(props['errors']) as Array<{ message: string }>;
      const firstError = errors[0]?.message ?? 'Schema validation failed';

      return (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex flex-col gap-2 h-full justify-center">
          <div className="flex items-center gap-2 text-red-500">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <h3 className="text-xs font-bold tracking-wider uppercase">LLM Crash Isolated</h3>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--token-text-secondary,theme(colors.playground-muted))]">
            The Enterstellar Engine intercepted an invalid component schema hallucination for <strong>{originalComponent}</strong> and sandboxed the failure.
            <br />
            <span className="text-red-400 mt-1 block">Error: {firstError}</span>
          </p>
          {originalProps && (
            <div className="mt-1 bg-black/40 p-2 rounded text-[10px] font-mono text-[var(--token-text-secondary,theme(colors.playground-muted))] overflow-x-auto whitespace-pre">
              {JSON.stringify(originalProps, null, 2)}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={`p-5 rounded-xl border ${variant === 'outlined' ? 'border-[var(--token-card-border,theme(colors.playground-border))] bg-transparent' : 'border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))]'}`}>
        {title !== '' && <h3 className="text-lg font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))] mb-1">{title}</h3>}
        {subtitle !== '' && <p className="text-sm text-[var(--token-text-secondary,theme(colors.playground-muted))] mb-4">{subtitle}</p>}
        {bodyText !== '' && <p className="text-sm text-[var(--token-text-primary,theme(colors.neutral-200))] whitespace-pre-wrap mb-4">{bodyText}</p>}
      </div>
    );
  });

  // -- Domain Components (30 renderers) ----------------------------
  //
  // Each domain has its own registration function (idempotent).
  // Combined via the barrel export's convenience aggregator.
  registerAllDomainRenderers();

  renderersRegistered = true;
}
