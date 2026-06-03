/**
 * @module playground/enterstellar/domain-renderers/finance-renderers
 * @description React renderers for Meridian Pay (Finance) domain components.
 *
 * Renderers are decoupled from contracts per Design Choice R6.
 * Each renderer is registered via `registerRenderer()` and looked up
 * by `<Zone>` at render time using string name matching.
 *
 * @see Design Choice R6 — render not on ComponentContract
 * @see domain-components/finance.ts — TransactionLedger, RevenueChart, ComplianceAlert, RiskScorecard, CashFlowForecast, FeeSchedule
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
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Tracks whether finance renderers have been registered. */
let registered = false;

/**
 * Registers all Meridian Pay (Finance) domain component renderers.
 * Idempotent — safe to call multiple times.
 */
export function registerFinanceRenderers(): void {
  if (registered) return;

  // -- TransactionLedger ----------------------------------------------------

  registerRenderer('TransactionLedger', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Transaction Ledger');
    const transactions = arr(props['transactions']).map(rec);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))]">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">
            {title}
          </h3>
        </div>
        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {transactions.map((txn, i) => {
            const status = str(txn['status']);
            const type = str(txn['type']);
            const amount = num(txn['amount']);
            const statusDot: Record<string, string> = {
              completed: 'bg-success',
              pending: 'bg-warning',
              failed: 'bg-error',
              reversed: 'bg-playground-muted',
            };
            return (
              <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-[var(--token-surface,theme(colors.playground-panel))] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`size-2 rounded-full ${statusDot[status] ?? 'bg-playground-muted'} shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(txn['description'])}</p>
                    <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">{str(txn['counterparty'])} · {str(txn['date'])}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${type === 'credit' ? 'text-success' : 'text-[var(--token-text-primary,theme(colors.neutral-100))]'}`}>
                  {type === 'credit' ? '+' : '−'}${amount.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- RevenueChart ---------------------------------------------------------

  registerRenderer('RevenueChart', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Revenue');
    const currentValue = num(props['currentValue']);
    const previousValue = num(props['previousValue']);
    const currency = str(props['currency'], 'USD');
    const period = str(props['period']);
    const trend = str(props['trend']);
    const breakdown = arr(props['breakdown']).map(rec);

    const changePercent = previousValue > 0
      ? (((currentValue - previousValue) / previousValue) * 100).toFixed(1)
      : '0';

    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(currentValue);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--token-text-secondary,theme(colors.playground-muted))] mb-1">
          {title} · {period}
        </p>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-bold text-[var(--token-text-primary,theme(colors.neutral-100))]">{formatted}</span>
          <span className={`text-sm font-semibold ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-error' : 'text-playground-muted'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {changePercent}%
          </span>
        </div>

        {breakdown.length > 0 && (
          <div className="space-y-2 pt-3 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
            {breakdown.map((item, i) => {
              const pct = num(item['percentage']);
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-[var(--token-text-secondary,theme(colors.playground-muted))]">{str(item['category'])}</span>
                    <span className="text-[var(--token-text-primary,theme(colors.neutral-200))] tabular-nums">{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))]">
                    <div className="h-full rounded-full bg-[var(--token-accent,oklch(0.65_0.15_250))] transition-all" style={{ width: `${String(pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  });

  // -- ComplianceAlert ------------------------------------------------------

  registerRenderer('ComplianceAlert', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Compliance Alert');
    const message = str(props['message']);
    const severity = str(props['severity'], 'info');
    const regulation = str(props['regulation']);
    const deadline = str(props['deadline']);

    const severityStyles: Record<string, { border: string; icon: string; bg: string }> = {
      info: { border: 'border-primary-500/30', icon: 'ℹ️', bg: 'bg-primary-500/10' },
      warning: { border: 'border-warning/30', icon: '⚠️', bg: 'bg-warning/10' },
      critical: { border: 'border-error/50', icon: '🚨', bg: 'bg-error/15' },
    };
    const style = severityStyles[severity] ?? severityStyles['info'] ?? { border: 'border-primary-500/30', icon: 'ℹ️', bg: 'bg-primary-500/10' };

    return (
      <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0">{style.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h4>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--token-surface,theme(colors.playground-panel))] text-playground-muted border border-[var(--token-card-border,theme(colors.playground-border))]">
                {regulation}
              </span>
            </div>
            <p className="text-xs text-[var(--token-text-secondary,theme(colors.neutral-300))] leading-relaxed">{message}</p>
            {deadline !== '' && (
              <p className="text-[10px] text-warning mt-2 font-medium">
                ⏰ Deadline: {deadline}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  });

  // -- RiskScorecard -------------------------------------------------------

  registerRenderer('RiskScorecard', (props: Record<string, unknown>): JSX.Element => {
    const txnId = str(props['transactionId']);
    const overall = num(props['overallScore']);
    const riskLevel = str(props['riskLevel'], 'medium');
    const factors = arr(props['factors']).map(rec);
    const recommendation = str(props['recommendation']);
    const evaluatedAt = str(props['evaluatedAt']);

    const riskColor: Record<string, string> = {
      low: 'text-success', medium: 'text-warning', high: 'text-error', critical: 'text-error',
    };
    const riskBg: Record<string, string> = {
      low: 'bg-success', medium: 'bg-warning', high: 'bg-error', critical: 'bg-error',
    };
    const statusChip: Record<string, { cls: string; label: string }> = {
      pass: { cls: 'bg-success/20 text-success', label: 'PASS' },
      warn: { cls: 'bg-warning/20 text-warning', label: 'WARN' },
      fail: { cls: 'bg-error/20 text-error', label: 'FAIL' },
    };
    const recBadge: Record<string, { cls: string; label: string }> = {
      approve: { cls: 'bg-success/20 text-success', label: 'Approve' },
      review: { cls: 'bg-warning/20 text-warning', label: 'Manual Review' },
      decline: { cls: 'bg-error/20 text-error', label: 'Decline' },
      block: { cls: 'bg-error/30 text-error', label: 'Block' },
    };
    const badge = recBadge[recommendation] ?? recBadge['review'] ?? { cls: '', label: recommendation };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">Risk Assessment</h3>
            <p className="text-[10px] text-playground-muted">{txnId} &middot; {evaluatedAt}</p>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold tabular-nums ${riskColor[riskLevel] ?? 'text-warning'}`}>{overall}</div>
            <div className={`text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full ${riskBg[riskLevel] ?? 'bg-warning'}/20 ${riskColor[riskLevel] ?? 'text-warning'}`}>{riskLevel}</div>
          </div>
        </div>

        <div className="space-y-2.5 mb-4">
          {factors.map((factor, i) => {
            const score = num(factor['score']);
            const weight = num(factor['weight']);
            const status = str(factor['status']);
            const chip = statusChip[status] ?? statusChip['warn'] ?? { cls: '', label: status };
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-[var(--token-text-primary,theme(colors.neutral-200))]">{str(factor['name'])}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-playground-muted tabular-nums">{(weight * 100).toFixed(0)}%w</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.label}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))]">
                  <div className={`h-full rounded-full transition-all ${status === 'fail' ? 'bg-error' : status === 'warn' ? 'bg-warning' : 'bg-success'}`} style={{ width: `${String(score)}%` }} />
                </div>
                <p className="text-[10px] text-playground-muted mt-0.5 leading-tight">{str(factor['detail'])}</p>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-[var(--token-card-border,theme(colors.playground-border))] flex items-center justify-between">
          <span className="text-xs text-playground-muted">Recommendation</span>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
        </div>
      </div>
    );
  });

  // -- CashFlowForecast ---------------------------------------------------

  registerRenderer('CashFlowForecast', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Cash Flow Forecast');
    const currency = str(props['currency'], 'USD');
    const currentBalance = num(props['currentBalance']);
    const periods = arr(props['periods']).map(rec);
    const runwayMonths = props['runwayMonths'] !== undefined ? num(props['runwayMonths']) : undefined;
    const burnRate = props['burnRate'] !== undefined ? num(props['burnRate']) : undefined;

    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 });
    const maxValue = Math.max(...periods.map((p) => Math.max(num(p['inflow']), num(p['outflow']))), 1);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
          <span className="text-xs text-playground-muted">Balance: {fmt.format(currentBalance)}</span>
        </div>

        {runwayMonths !== undefined && (
          <p className="text-[10px] text-success mb-3">
            {runwayMonths.toFixed(1)} months runway{burnRate !== undefined ? ` / ${fmt.format(burnRate)}/mo burn` : ''}
          </p>
        )}

        <div className="flex items-end gap-1.5">
          {periods.map((period, i) => {
            const inflow = num(period['inflow']);
            const outflow = num(period['outflow']);
            const inflowH = Math.max((inflow / maxValue) * 80, 4);
            const outflowH = Math.max((outflow / maxValue) * 80, 4);
            return (
              <div key={i} className="flex-1 text-center">
                <div className="flex items-end justify-center gap-0.5" style={{ height: '80px' }}>
                  <div className="w-2 rounded-t bg-success/70 transition-all" style={{ height: `${String(inflowH)}px` }} title={`In: ${fmt.format(inflow)}`} />
                  <div className="w-2 rounded-t bg-error/60 transition-all" style={{ height: `${String(outflowH)}px` }} title={`Out: ${fmt.format(outflow)}`} />
                </div>
                <p className="text-[9px] text-playground-muted mt-1 leading-tight">{str(period['label'])}</p>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
          <div className="flex items-center gap-1.5 text-[10px] text-playground-muted">
            <span className="size-2 rounded-full bg-success/70" /> Inflow
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-playground-muted">
            <span className="size-2 rounded-full bg-error/60" /> Outflow
          </div>
        </div>
      </div>
    );
  });

  // -- FeeSchedule --------------------------------------------------------

  registerRenderer('FeeSchedule', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Fee Schedule');
    const tiers = arr(props['tiers']).map(rec);
    const currentIdx = num(props['currentTierIndex']);
    const volume = num(props['currentMonthlyVolume']);
    const estCost = props['estimatedMonthlyCost'] !== undefined ? num(props['estimatedMonthlyCost']) : undefined;

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
          <span className="text-[10px] text-playground-muted tabular-nums">{volume.toLocaleString()} txns/mo</span>
        </div>

        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {tiers.map((tier, i) => {
            const isCurrent = i === currentIdx;
            const volMin = num(tier['volumeMin']);
            const volMax = tier['volumeMax'] !== null && tier['volumeMax'] !== undefined ? num(tier['volumeMax']) : null;
            const rate = num(tier['ratePercentage']);
            const flat = num(tier['flatFee']);
            return (
              <div key={i} className={`px-5 py-2.5 flex items-center justify-between ${isCurrent ? 'bg-[var(--token-accent,oklch(0.65_0.15_250))]/8 border-l-2 border-l-[var(--token-accent,oklch(0.65_0.15_250))]' : ''}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${isCurrent ? 'text-[var(--token-accent,oklch(0.65_0.15_250))]' : 'text-[var(--token-text-primary,theme(colors.neutral-200))]'}`}>{str(tier['name'])}</p>
                    {isCurrent && <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--token-accent,oklch(0.65_0.15_250))]/20 text-[var(--token-accent,oklch(0.65_0.15_250))]">Current</span>}
                  </div>
                  <p className="text-[10px] text-playground-muted tabular-nums">
                    {volMin.toLocaleString()}&ndash;{volMax !== null ? volMax.toLocaleString() : 'Unlimited'} txns
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{rate}%</p>
                  <p className="text-[10px] text-playground-muted tabular-nums">+ ${flat.toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {estCost !== undefined && (
          <div className="px-5 py-2.5 border-t border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-surface,theme(colors.playground-panel))] flex items-center justify-between">
            <span className="text-xs text-playground-muted">Est. monthly cost</span>
            <span className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">${estCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>
    );
  });

  registered = true;
}
