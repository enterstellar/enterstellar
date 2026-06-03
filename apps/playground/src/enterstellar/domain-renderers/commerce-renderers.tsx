/**
 * @module playground/enterstellar/domain-renderers/commerce-renderers
 * @description React renderers for ARC Store (Commerce) domain components.
 *
 * Renderers are decoupled from contracts per Design Choice R6.
 * Each renderer is registered via `registerRenderer()` and looked up
 * by `<Zone>` at render time using string name matching.
 *
 * @see Design Choice R6 — render not on ComponentContract
 * @see domain-components/commerce.ts — ProductCatalog, OrderPipeline, InventoryTracker, CustomerSegment, ShippingTracker, ReturnsDashboard
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
function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Tracks whether commerce renderers have been registered. */
let registered = false;

/**
 * Registers all ARC Store (Commerce) domain component renderers.
 * Idempotent — safe to call multiple times.
 */
export function registerCommerceRenderers(): void {
  if (registered) return;

  // -- ProductCatalog -------------------------------------------------------

  registerRenderer('ProductCatalog', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Products');
    const products = arr(props['products']).map(rec);

    const stockBadge: Record<string, { label: string; cls: string }> = {
      'in-stock': { label: 'In Stock', cls: 'bg-success/20 text-success' },
      'low-stock': { label: 'Low Stock', cls: 'bg-warning/20 text-warning' },
      'out-of-stock': { label: 'Out of Stock', cls: 'bg-error/20 text-error' },
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))]">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
        </div>
        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {products.map((product, i) => {
            const status = str(product['stockStatus']);
            const badge = stockBadge[status] ?? stockBadge['in-stock'] ?? { label: 'Unknown', cls: 'bg-playground-muted/20 text-playground-muted' };
            return (
              <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-[var(--token-surface,theme(colors.playground-panel))] transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(product['name'])}</p>
                  <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">{str(product['sku'])} · {str(product['category'])}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  <span className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">${num(product['price']).toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- OrderPipeline --------------------------------------------------------

  registerRenderer('OrderPipeline', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Order Pipeline');
    const stages = arr(props['stages']).map(rec);

    const totalOrders = stages.reduce((sum, s) => sum + num(s['count']), 0);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
          <span className="text-xs text-playground-muted">{totalOrders} total orders</span>
        </div>
        <div className="flex items-end gap-1">
          {stages.map((stage, i) => {
            const count = num(stage['count']);
            const maxCount = Math.max(...stages.map((s) => num(s['count'])), 1);
            const height = Math.max((count / maxCount) * 100, 8);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{count}</span>
                <div
                  className="w-full rounded-t bg-[var(--token-accent,oklch(0.65_0.15_250))] transition-all"
                  style={{ height: `${String(height)}px` }}
                />
                <span className="text-[9px] text-[var(--token-text-secondary,theme(colors.playground-muted))] text-center leading-tight">{str(stage['name'])}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- InventoryTracker -----------------------------------------------------

  registerRenderer('InventoryTracker', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Inventory');
    const items = arr(props['items']).map(rec);

    const statusColor: Record<string, string> = {
      healthy: 'text-success', reorder: 'text-warning', critical: 'text-error', 'out-of-stock': 'text-error',
    };
    const statusLabel: Record<string, string> = {
      healthy: '● Healthy', reorder: '● Reorder', critical: '● Critical', 'out-of-stock': '● OOS',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))]">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
        </div>
        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {items.map((item, i) => {
            const current = num(item['currentStock']);
            const reorder = num(item['reorderPoint']);
            const fill = reorder > 0 ? Math.min((current / reorder) * 100, 100) : 100;
            const status = str(item['status']);
            return (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(item['name'])}</p>
                    <p className="text-[10px] text-playground-muted">{str(item['sku'])} · {num(item['dailyVelocity']).toFixed(1)}/day</p>
                  </div>
                  <span className={`text-[10px] font-semibold ${statusColor[status] ?? 'text-playground-muted'}`}>
                    {statusLabel[status] ?? status}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))]">
                  <div
                    className={`h-full rounded-full transition-all ${status === 'critical' || status === 'out-of-stock' ? 'bg-error' : status === 'reorder' ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${String(fill)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- CustomerSegment -----------------------------------------------------

  registerRenderer('CustomerSegment', (props: Record<string, unknown>): JSX.Element => {
    const segmentName = str(props['segmentName'], 'Segment');
    const cohortSize = num(props['cohortSize']);
    const metrics = rec(props['metrics']);
    const channel = str(props['acquisitionChannel']);
    const trend = str(props['trend']);
    const currency = str(props['currency'], 'USD');

    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
    const trendBadge: Record<string, { icon: string; cls: string }> = {
      growing: { icon: '\u2191', cls: 'text-success' },
      stable: { icon: '\u2192', cls: 'text-playground-muted' },
      declining: { icon: '\u2193', cls: 'text-error' },
    };
    const t = trendBadge[trend] ?? trendBadge['stable'] ?? { icon: '', cls: '' };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{segmentName}</h3>
            <p className="text-[10px] text-playground-muted">{cohortSize.toLocaleString()} customers &middot; {channel}</p>
          </div>
          <span className={`text-lg font-bold ${t.cls}`}>{t.icon}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-playground-muted">LTV</p>
            <p className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{fmt.format(num(metrics['averageLtv']))}</p>
          </div>
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-playground-muted">AOV</p>
            <p className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{fmt.format(num(metrics['averageOrderValue']))}</p>
          </div>
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[9px] uppercase tracking-wider text-playground-muted">Freq</p>
            <p className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{num(metrics['purchaseFrequency']).toFixed(1)}x</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-playground-muted">Retention</span>
            <span className="text-xs font-bold text-success tabular-nums">{num(metrics['retentionRate'])}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-playground-muted">Churn Risk</span>
            <span className={`text-xs font-bold tabular-nums ${num(metrics['churnRisk']) > 30 ? 'text-error' : num(metrics['churnRisk']) > 15 ? 'text-warning' : 'text-success'}`}>{num(metrics['churnRisk'])}%</span>
          </div>
        </div>
      </div>
    );
  });

  // -- ShippingTracker ------------------------------------------------------

  registerRenderer('ShippingTracker', (props: Record<string, unknown>): JSX.Element => {
    const orderId = str(props['orderId']);
    const carrier = str(props['carrier']);
    const trackingNumber = str(props['trackingNumber']);
    const eta = str(props['estimatedDelivery']);
    const currentLoc = str(props['currentLocation']);
    const milestones = arr(props['milestones']).map(rec);
    const status = str(props['status']);

    const statusBadge: Record<string, { cls: string; label: string }> = {
      'on-track': { cls: 'bg-success/20 text-success', label: 'On Track' },
      delayed: { cls: 'bg-warning/20 text-warning', label: 'Delayed' },
      delivered: { cls: 'bg-success/20 text-success', label: 'Delivered' },
      exception: { cls: 'bg-error/20 text-error', label: 'Exception' },
    };
    const badge = statusBadge[status] ?? statusBadge['on-track'] ?? { cls: '', label: status };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">Shipment Tracking</h3>
          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
        </div>
        <p className="text-[10px] text-playground-muted mb-3">{orderId} &middot; {carrier} &middot; {trackingNumber}</p>

        <div className="space-y-0 mb-3">
          {milestones.map((ms, i) => {
            const completed = bool(ms['completed']);
            const stage = str(ms['stage']);
            const timestamp = str(ms['timestamp']);
            const location = str(ms['location']);
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`size-3 rounded-full border-2 shrink-0 ${completed ? 'bg-success border-success' : 'bg-transparent border-playground-muted'}`} />
                  {i < milestones.length - 1 && <div className={`w-px flex-1 min-h-[16px] ${completed ? 'bg-success' : 'bg-playground-muted/30'}`} />}
                </div>
                <div className="pb-2 min-w-0">
                  <p className={`text-xs ${completed ? 'text-[var(--token-text-primary,theme(colors.neutral-200))]' : 'text-playground-muted'}`}>
                    {stage.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </p>
                  {timestamp !== '' && <p className="text-[10px] text-playground-muted">{timestamp}{location !== '' ? ` \u00B7 ${location}` : ''}</p>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-[var(--token-card-border,theme(colors.playground-border))] flex items-center justify-between">
          <span className="text-[10px] text-playground-muted">ETA: {eta}</span>
          {currentLoc !== '' && <span className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">Currently: {currentLoc}</span>}
        </div>
      </div>
    );
  });

  // -- ReturnsDashboard ----------------------------------------------------

  registerRenderer('ReturnsDashboard', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Returns');
    const period = str(props['period']);
    const totalReturns = num(props['totalReturns']);
    const totalRefund = num(props['totalRefundAmount']);
    const returnRate = num(props['returnRate']);
    const avgDays = num(props['averageProcessingDays']);
    const reasons = arr(props['reasonBreakdown']).map(rec);
    const resolutions = arr(props['resolutionBreakdown']).map(rec);
    const currency = str(props['currency'], 'USD');

    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
          <span className="text-[10px] text-playground-muted">{period}</span>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{totalReturns}</p>
            <p className="text-[9px] text-playground-muted uppercase">Returns</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-error tabular-nums">{fmt.format(totalRefund)}</p>
            <p className="text-[9px] text-playground-muted uppercase">Refunded</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-warning tabular-nums">{returnRate}%</p>
            <p className="text-[9px] text-playground-muted uppercase">Rate</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{avgDays.toFixed(1)}d</p>
            <p className="text-[9px] text-playground-muted uppercase">Avg Process</p>
          </div>
        </div>

        {reasons.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] text-playground-muted uppercase tracking-wider mb-1.5">By Reason</p>
            <div className="space-y-1">
              {reasons.map((r, i) => {
                const pct = num(r['percentage']);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--token-text-primary,theme(colors.neutral-200))] w-28 truncate">{str(r['reason']).replace(/-/g, ' ')}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))]">
                      <div className="h-full rounded-full bg-error/60 transition-all" style={{ width: `${String(pct)}%` }} />
                    </div>
                    <span className="text-[10px] text-playground-muted tabular-nums w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {resolutions.length > 0 && (
          <div className="pt-2 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
            <p className="text-[10px] text-playground-muted uppercase tracking-wider mb-1.5">Resolutions</p>
            <div className="flex gap-2">
              {resolutions.map((r, i) => (
                <div key={i} className="flex-1 rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-1.5 text-center">
                  <p className="text-xs font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{num(r['percentage'])}%</p>
                  <p className="text-[8px] text-playground-muted leading-tight">{str(r['type']).replace(/-/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  });

  registered = true;
}
