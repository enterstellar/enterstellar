/**
 * @module playground/enterstellar/domain-renderers/saas-renderers
 * @description React renderers for Nexus CRM (SaaS) domain components.
 *
 * Renderers are decoupled from contracts per Design Choice R6.
 * Each renderer is registered via `registerRenderer()` and looked up
 * by `<Zone>` at render time using string name matching.
 *
 * @see Design Choice R6 — render not on ComponentContract
 * @see domain-components/saas.ts — PipelineBoard, DealCard, ActivityTimeline, ForecastGauge, LeadScoreMatrix, IntegrationStatus
 */
'use client';

import type { JSX } from 'react';
import { registerRenderer } from '@enterstellar-ai/react';

// ---------------------------------------------------------------------------
// Type-safe prop extraction (re-imported from renderers)
// ---------------------------------------------------------------------------

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}
function arr(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}
function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Tracks whether saas renderers have been registered. */
let registered = false;

/**
 * Registers all Nexus CRM (SaaS) domain component renderers.
 * Idempotent — safe to call multiple times.
 */
export function registerSaasRenderers(): void {
  if (registered) return;

  // -- PipelineBoard --------------------------------------------------------

  registerRenderer('PipelineBoard', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Sales Pipeline');
    const stages = arr(props['stages']).map(rec);
    const currency = str(props['currency'], 'USD');

    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 0 });

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))] mb-4">{title}</h3>
        <div className="flex gap-2 overflow-x-auto">
          {stages.map((stage, i) => {
            const dealCount = num(stage['dealCount']);
            const totalValue = num(stage['totalValue']);
            return (
              <div key={i} className="flex-1 min-w-[100px] rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--token-text-secondary,theme(colors.playground-muted))] mb-2 truncate">{str(stage['name'])}</p>
                <p className="text-lg font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{dealCount}</p>
                <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))] tabular-nums">{formatter.format(totalValue)}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- DealCard -------------------------------------------------------------

  registerRenderer('DealCard', (props: Record<string, unknown>): JSX.Element => {
    const company = str(props['company'], 'Company');
    const dealName = str(props['dealName']);
    const value = num(props['value']);
    const currency = str(props['currency'], 'USD');
    const stage = str(props['stage']);
    const probability = num(props['probability']);
    const assignedTo = str(props['assignedTo']);
    const closeDate = str(props['closeDate']);
    const priority = str(props['priority']);

    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 0 }).format(value);

    const priorityBadge: Record<string, string> = {
      high: 'bg-error/20 text-error',
      medium: 'bg-warning/20 text-warning',
      low: 'bg-playground-muted/20 text-playground-muted',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))] truncate">{company}</h3>
            <p className="text-xs text-[var(--token-text-secondary,theme(colors.playground-muted))]">{dealName}</p>
          </div>
          {priority !== '' && (
            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full uppercase ${priorityBadge[priority] ?? ''}`}>{priority}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-playground-muted mb-0.5">Value</p>
            <p className="text-lg font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{formatted}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-playground-muted mb-0.5">Probability</p>
            <p className="text-lg font-bold text-success tabular-nums">{probability}%</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-full bg-[var(--token-accent,oklch(0.65_0.15_250))]/20 flex items-center justify-center text-[10px] font-bold text-[var(--token-accent,oklch(0.65_0.15_250))]">
              {assignedTo.split(' ').map((n) => n[0] ?? '').join('').toUpperCase().slice(0, 2)}
            </div>
            <span className="text-xs text-[var(--token-text-secondary,theme(colors.playground-muted))]">{assignedTo}</span>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-playground-muted uppercase tracking-wider">{stage}</p>
            <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">Close: {closeDate}</p>
          </div>
        </div>
      </div>
    );
  });

  // -- ActivityTimeline -----------------------------------------------------

  registerRenderer('ActivityTimeline', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Activity');
    const activities = arr(props['activities']).map(rec);

    const typeIcons: Record<string, string> = {
      call: '📞', email: '✉️', meeting: '👥', note: '📝', task: '✅',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))] mb-3">{title}</h3>
        <div className="space-y-0">
          {activities.map((activity, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="text-sm shrink-0">{typeIcons[str(activity['type'])] ?? '📋'}</span>
                {i < activities.length - 1 && <div className="w-px flex-1 bg-[var(--token-card-border,theme(colors.playground-border))]" />}
              </div>
              <div className="pb-3 min-w-0">
                <p className="text-sm text-[var(--token-text-primary,theme(colors.neutral-200))]">{str(activity['subject'])}</p>
                <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">{str(activity['rep'])} → {str(activity['contact'])} · {str(activity['timestamp'])}</p>
                {str(activity['outcome']) !== '' && (
                  <p className="text-xs text-success mt-0.5">{str(activity['outcome'])}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  });

  // -- ForecastGauge -------------------------------------------------------

  registerRenderer('ForecastGauge', (props: Record<string, unknown>): JSX.Element => {
    const period = str(props['period']);
    const quota = num(props['quota']);
    const closedWon = num(props['closedWon']);
    const weighted = num(props['weightedPipeline']);
    const bestCase = num(props['bestCase']);
    const worstCase = num(props['worstCase']);
    const attainment = num(props['attainmentPercentage']);
    const currency = str(props['currency'], 'USD');
    const stageConf = arr(props['stageConfidence']).map(rec);

    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    const attainColor = attainment >= 100 ? 'text-success' : attainment >= 70 ? 'text-warning' : 'text-error';

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">Revenue Forecast</h3>
          <span className="text-[10px] text-playground-muted">{period}</span>
        </div>

        <div className="text-center my-4">
          <div className={`text-4xl font-black tabular-nums ${attainColor}`}>{attainment}%</div>
          <p className="text-[10px] text-playground-muted">of {fmt.format(quota)} quota</p>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-playground-muted">Closed</p>
            <p className="text-sm font-bold text-success tabular-nums">{fmt.format(closedWon)}</p>
          </div>
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-playground-muted">Weighted</p>
            <p className="text-sm font-bold text-[var(--token-accent,oklch(0.65_0.15_250))] tabular-nums">{fmt.format(weighted)}</p>
          </div>
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-playground-muted">Best/Worst</p>
            <p className="text-[10px] font-bold text-[var(--token-text-primary,theme(colors.neutral-200))] tabular-nums">{fmt.format(worstCase)}&ndash;{fmt.format(bestCase)}</p>
          </div>
        </div>

        {stageConf.length > 0 && (
          <div className="pt-2 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
            <p className="text-[10px] text-playground-muted uppercase tracking-wider mb-1.5">Confidence Breakdown</p>
            {stageConf.map((sc, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-[var(--token-text-primary,theme(colors.neutral-200))]">{str(sc['stage'])}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-playground-muted tabular-nums">{num(sc['probability'])}%</span>
                  <span className="text-[10px] font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{fmt.format(num(sc['weighted']))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });

  // -- LeadScoreMatrix ------------------------------------------------------

  registerRenderer('LeadScoreMatrix', (props: Record<string, unknown>): JSX.Element => {
    const leadName = str(props['leadName']);
    const company = str(props['company']);
    const overallScore = num(props['overallScore']);
    const grade = str(props['grade']);
    const behavioral = arr(props['behavioralSignals']).map(rec);
    const demographic = arr(props['demographicSignals']).map(rec);
    const recommendation = str(props['recommendation']);
    const lastActivity = str(props['lastActivity']);

    const gradeColor: Record<string, string> = {
      A: 'text-success', B: 'text-success', C: 'text-warning', D: 'text-error', F: 'text-error',
    };
    const recBadge: Record<string, { cls: string; label: string }> = {
      nurture: { cls: 'bg-playground-muted/20 text-playground-muted', label: 'Nurture' },
      mql: { cls: 'bg-warning/20 text-warning', label: 'MQL' },
      sql: { cls: 'bg-success/20 text-success', label: 'SQL' },
      'fast-track': { cls: 'bg-[var(--token-accent,oklch(0.65_0.15_250))]/20 text-[var(--token-accent,oklch(0.65_0.15_250))]', label: 'Fast-Track' },
    };
    const badge = recBadge[recommendation] ?? recBadge['mql'] ?? { cls: '', label: recommendation };

    function SignalRow({ signals, label }: { signals: readonly Record<string, unknown>[]; label: string }): JSX.Element {
      return (
        <div className="mb-2">
          <p className="text-[10px] text-playground-muted uppercase tracking-wider mb-1">{label}</p>
          {signals.map((sig, j) => (
            <div key={j} className="flex items-center justify-between py-0.5">
              <span className="text-[10px] text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(sig['signal'])}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-playground-muted truncate max-w-[80px]">{str(sig['value'])}</span>
                <span className="text-[10px] font-bold tabular-nums text-[var(--token-text-primary,theme(colors.neutral-100))]">{num(sig['score'])}</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{leadName}</h3>
            <p className="text-[10px] text-playground-muted">{company} &middot; Last: {lastActivity}</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black tabular-nums text-[var(--token-text-primary,theme(colors.neutral-100))]">{overallScore}</div>
            <span className={`text-sm font-bold ${gradeColor[grade] ?? 'text-playground-muted'}`}>Grade {grade}</span>
          </div>
        </div>

        <SignalRow signals={behavioral} label="Behavioral Signals" />
        <SignalRow signals={demographic} label="Demographic Signals" />

        <div className="pt-2 border-t border-[var(--token-card-border,theme(colors.playground-border))] flex items-center justify-between">
          <span className="text-xs text-playground-muted">Recommendation</span>
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
        </div>
      </div>
    );
  });

  // -- IntegrationStatus ----------------------------------------------------

  registerRenderer('IntegrationStatus', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Integrations');
    const integrations = arr(props['integrations']).map(rec);

    const statusDot: Record<string, string> = {
      synced: 'bg-success', syncing: 'bg-[var(--token-accent,oklch(0.65_0.15_250))]',
      error: 'bg-error', paused: 'bg-warning', disconnected: 'bg-playground-muted',
    };
    const statusLabel: Record<string, string> = {
      synced: 'Synced', syncing: 'Syncing...', error: 'Error',
      paused: 'Paused', disconnected: 'Disconnected',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))]">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
        </div>
        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {integrations.map((integ, i) => {
            const status = str(integ['status']);
            const errorRate = num(integ['errorRate24h']);
            const errorMsg = str(integ['errorMessage']);
            return (
              <div key={i} className={`px-5 py-3 ${status === 'error' ? 'bg-error/5' : ''}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`size-2 rounded-full shrink-0 ${statusDot[status] ?? 'bg-playground-muted'} ${status === 'syncing' ? 'animate-pulse' : ''}`} />
                    <span className="text-sm text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(integ['name'])}</span>
                  </div>
                  <span className="text-[10px] text-playground-muted">{statusLabel[status] ?? status}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-playground-muted">
                  <span>{str(integ['provider'])} &middot; {num(integ['recordsSynced']).toLocaleString()} records</span>
                  <span className={errorRate > 1 ? 'text-error' : ''}>Err: {errorRate}%</span>
                </div>
                {errorMsg !== '' && (
                  <p className="text-[10px] text-error mt-1 bg-error/10 px-2 py-0.5 rounded">{errorMsg}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  registered = true;
}
