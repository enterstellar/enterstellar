/**
 * @module playground/enterstellar/domain-renderers/education-renderers
 * @description React renderers for Cortex Learn (Education) domain components.
 *
 * Renderers are decoupled from contracts per Design Choice R6.
 * Each renderer is registered via `registerRenderer()` and looked up
 * by `<Zone>` at render time using string name matching.
 *
 * @see Design Choice R6 — render not on ComponentContract
 * @see domain-components/education.ts — CourseProgress, StudentAnalytics, AssessmentResults, CurriculumMap, EngagementHeatmap, CertificationTracker
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

/** Tracks whether education renderers have been registered. */
let registered = false;

/**
 * Registers all Cortex Learn (Education) domain component renderers.
 * Idempotent — safe to call multiple times.
 */
export function registerEducationRenderers(): void {
  if (registered) return;

  // -- CourseProgress -------------------------------------------------------

  registerRenderer('CourseProgress', (props: Record<string, unknown>): JSX.Element => {
    const courseName = str(props['courseName'], 'Course');
    const instructor = str(props['instructor']);
    const completion = num(props['completionPercentage']);
    const modules = arr(props['modules']).map(rec);
    const remaining = str(props['estimatedTimeRemaining']);

    const statusIcons: Record<string, string> = {
      completed: '✅', 'in-progress': '🔄', locked: '🔒', 'not-started': '⬜',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{courseName}</h3>
            <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">{instructor}</p>
          </div>
          <span className="text-lg font-bold text-[var(--token-accent,oklch(0.65_0.15_250))] tabular-nums">{completion}%</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))] mb-3">
          <div className="h-full rounded-full bg-[var(--token-accent,oklch(0.65_0.15_250))] transition-all" style={{ width: `${String(completion)}%` }} />
        </div>

        {/* Module list */}
        <div className="space-y-1.5">
          {modules.map((mod, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-sm shrink-0">{statusIcons[str(mod['status'])] ?? '⬜'}</span>
              <span className={`flex-1 ${str(mod['status']) === 'completed' ? 'text-success' : str(mod['status']) === 'locked' ? 'text-playground-muted' : 'text-[var(--token-text-primary,theme(colors.neutral-200))]'}`}>
                {str(mod['name'])}
              </span>
              <span className="text-[10px] text-playground-muted tabular-nums">{num(mod['durationMinutes'])}min</span>
            </div>
          ))}
        </div>

        {remaining !== '' && (
          <p className="text-[10px] text-playground-muted mt-3 pt-2 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
            ⏱ Estimated: {remaining} remaining
          </p>
        )}
      </div>
    );
  });

  // -- StudentAnalytics -----------------------------------------------------

  registerRenderer('StudentAnalytics', (props: Record<string, unknown>): JSX.Element => {
    const studentName = str(props['studentName'], 'Student');
    const metrics = rec(props['metrics']);
    const recentGrades = arr(props['recentGrades']).map(rec);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))] mb-3">{studentName}</h3>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-playground-muted">GPA</p>
            <p className="text-lg font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{num(metrics['gpa']).toFixed(1)}</p>
          </div>
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-playground-muted">Engagement</p>
            <p className="text-lg font-bold text-success tabular-nums">{num(metrics['engagementScore'])}%</p>
          </div>
          <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-playground-muted">Streak</p>
            <p className="text-lg font-bold text-[var(--token-accent,oklch(0.65_0.15_250))] tabular-nums">{num(metrics['currentStreak'])}d</p>
          </div>
        </div>

        <p className="text-[10px] text-playground-muted mb-2">
          {num(metrics['coursesCompleted'])}/{num(metrics['coursesEnrolled'])} courses completed
        </p>

        {recentGrades.length > 0 && (
          <div className="pt-3 border-t border-[var(--token-card-border,theme(colors.playground-border))] space-y-1">
            {recentGrades.map((grade, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(grade['course'])}</span>
                <div className="flex items-center gap-2">
                  <span className="text-success font-semibold">{str(grade['grade'])}</span>
                  <span className="text-playground-muted tabular-nums">{num(grade['score'])}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  });

  // -- AssessmentResults ----------------------------------------------------

  registerRenderer('AssessmentResults', (props: Record<string, unknown>): JSX.Element => {
    const name = str(props['assessmentName'], 'Assessment');
    const courseName = str(props['courseName']);
    const score = num(props['score']);
    const passingScore = num(props['passingScore']);
    const passed = bool(props['passed']);
    const timeTaken = str(props['timeTaken']);
    const breakdown = arr(props['questionBreakdown']).map(rec);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{name}</h3>
            <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">{courseName}</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${passed ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>
            {passed ? 'PASSED' : 'FAILED'}
          </span>
        </div>

        {/* Score donut (simplified as horizontal bar) */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <div className="h-3 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))] overflow-hidden relative">
              <div className={`h-full rounded-full transition-all ${passed ? 'bg-success' : 'bg-error'}`} style={{ width: `${String(score)}%` }} />
              {/* Passing threshold marker */}
              <div className="absolute top-0 h-full w-px bg-[var(--token-text-primary,theme(colors.neutral-100))]/30" style={{ left: `${String(passingScore)}%` }} />
            </div>
          </div>
          <span className="text-xl font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{score}%</span>
        </div>

        <p className="text-[10px] text-playground-muted mb-3">⏱ {timeTaken} · Passing: {passingScore}%</p>

        {breakdown.length > 0 && (
          <div className="pt-3 border-t border-[var(--token-card-border,theme(colors.playground-border))] space-y-1.5">
            {breakdown.map((section, i) => {
              const correct = num(section['correct']);
              const total = num(section['total']);
              const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--token-text-primary,theme(colors.neutral-200))]">{str(section['section'])}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-playground-muted tabular-nums">{correct}/{total}</span>
                    <span className={`font-semibold tabular-nums ${pct >= 80 ? 'text-success' : pct >= 60 ? 'text-warning' : 'text-error'}`}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  });

  // -- CurriculumMap -------------------------------------------------------

  registerRenderer('CurriculumMap', (props: Record<string, unknown>): JSX.Element => {
    const pathName = str(props['pathName'], 'Learning Path');
    const description = str(props['description']);
    const totalHours = num(props['totalHours']);
    const topics = arr(props['topics']).map(rec);

    const masteryBadge: Record<string, { cls: string; label: string }> = {
      expert: { cls: 'bg-success/20 text-success', label: 'Expert' },
      proficient: { cls: 'bg-success/20 text-success', label: 'Proficient' },
      intermediate: { cls: 'bg-warning/20 text-warning', label: 'Intermediate' },
      novice: { cls: 'bg-[var(--token-accent,oklch(0.65_0.15_250))]/20 text-[var(--token-accent,oklch(0.65_0.15_250))]', label: 'Novice' },
      'not-started': { cls: 'bg-playground-muted/20 text-playground-muted', label: 'Not Started' },
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{pathName}</h3>
          <span className="text-[10px] text-playground-muted tabular-nums">{totalHours}h total</span>
        </div>
        {description !== '' && (
          <p className="text-[10px] text-playground-muted mb-3 leading-relaxed">{description}</p>
        )}

        <div className="space-y-0">
          {topics.map((topic, i) => {
            const mastery = str(topic['mastery']);
            const unlocked = bool(topic['unlocked']);
            const completedAt = str(topic['completedAt']);
            const prerequisites = arr(topic['prerequisites']).map((p) => str(p));
            const badge = masteryBadge[mastery] ?? masteryBadge['not-started'] ?? { cls: '', label: mastery };
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`size-3 rounded-full border-2 shrink-0 ${unlocked ? (completedAt !== '' ? 'bg-success border-success' : 'bg-[var(--token-accent,oklch(0.65_0.15_250))] border-[var(--token-accent,oklch(0.65_0.15_250))]') : 'bg-transparent border-playground-muted'}`} />
                  {i < topics.length - 1 && <div className={`w-px flex-1 min-h-[16px] ${unlocked ? 'bg-success/50' : 'bg-playground-muted/30'}`} />}
                </div>
                <div className="pb-2 min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${unlocked ? 'text-[var(--token-text-primary,theme(colors.neutral-200))]' : 'text-playground-muted'}`}>{str(topic['name'])}</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-playground-muted">
                    <span className="tabular-nums">{num(topic['estimatedHours'])}h</span>
                    {prerequisites.length > 0 && <span>Requires: {prerequisites.join(', ')}</span>}
                    {completedAt !== '' && <span className="text-success">Completed {completedAt}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- EngagementHeatmap ----------------------------------------------------

  registerRenderer('EngagementHeatmap', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Engagement');
    const period = str(props['period']);
    const grid = arr(props['grid']).map(rec);
    const metrics = rec(props['metrics']);

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h3>
          <span className="text-[10px] text-playground-muted">{period}</span>
        </div>

        <div className="space-y-1 mb-3">
          {grid.map((dayRow, i) => {
            const day = str(dayRow['day']);
            const hours = arr(dayRow['hours']).map(rec);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[9px] text-playground-muted w-6 shrink-0 text-right">{day}</span>
                <div className="flex gap-0.5 flex-1">
                  {hours.map((h, j) => {
                    const intensity = num(h['intensity']);
                    const hour = num(h['hour']);
                    const opacity = Math.max(intensity / 100, 0.1);
                    return (
                      <div
                        key={j}
                        className="h-3 flex-1 rounded-sm bg-[var(--token-accent,oklch(0.65_0.15_250))] transition-all"
                        style={{ opacity }}
                        title={`${day} ${String(hour).padStart(2, '0')}:00 — ${String(intensity)}%`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-[var(--token-card-border,theme(colors.playground-border))]">
          <div className="text-center">
            <p className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{num(metrics['totalSessions'])}</p>
            <p className="text-[8px] text-playground-muted uppercase">Sessions</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[var(--token-text-primary,theme(colors.neutral-100))] tabular-nums">{num(metrics['averageDurationMinutes']).toFixed(0)}m</p>
            <p className="text-[8px] text-playground-muted uppercase">Avg Duration</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-[var(--token-accent,oklch(0.65_0.15_250))]">{str(metrics['peakHour'])}</p>
            <p className="text-[8px] text-playground-muted uppercase">Peak Hour</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-success">{str(metrics['mostActiveDay'])}</p>
            <p className="text-[8px] text-playground-muted uppercase">Top Day</p>
          </div>
        </div>
      </div>
    );
  });

  // -- CertificationTracker ------------------------------------------------

  registerRenderer('CertificationTracker', (props: Record<string, unknown>): JSX.Element => {
    const certifications = arr(props['certifications']).map(rec);

    const statusBadge: Record<string, { cls: string; label: string }> = {
      active: { cls: 'bg-success/20 text-success', label: 'Active' },
      'expiring-soon': { cls: 'bg-warning/20 text-warning', label: 'Expiring' },
      expired: { cls: 'bg-error/20 text-error', label: 'Expired' },
      'in-progress': { cls: 'bg-[var(--token-accent,oklch(0.65_0.15_250))]/20 text-[var(--token-accent,oklch(0.65_0.15_250))]', label: 'In Progress' },
      'not-started': { cls: 'bg-playground-muted/20 text-playground-muted', label: 'Not Started' },
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))]">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">Certifications</h3>
        </div>
        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {certifications.map((cert, i) => {
            const status = str(cert['status']);
            const badge = statusBadge[status] ?? statusBadge['not-started'] ?? { cls: '', label: status };
            const requirements = arr(cert['requirements']).map(rec);
            const ceu = cert['ceuProgress'] !== undefined ? rec(cert['ceuProgress']) : undefined;
            const completed = requirements.filter((r) => bool(r['completed'])).length;
            const earnedDate = str(cert['earnedDate']);
            const expiryDate = str(cert['expiryDate']);

            return (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(cert['name'])}</p>
                    <p className="text-[10px] text-playground-muted">{str(cert['issuer'])}</p>
                  </div>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>{badge.label}</span>
                </div>

                {/* Requirements checklist */}
                <div className="space-y-0.5 mb-1.5">
                  {requirements.map((req, j) => (
                    <div key={j} className="flex items-center gap-1.5 text-[10px]">
                      <span className={bool(req['completed']) ? 'text-success' : 'text-playground-muted'}>{bool(req['completed']) ? '\u2713' : '\u25CB'}</span>
                      <span className={bool(req['completed']) ? 'text-playground-muted line-through' : 'text-[var(--token-text-primary,theme(colors.neutral-200))]'}>{str(req['description'])}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-[10px] text-playground-muted">
                  <span>{completed}/{requirements.length} complete</span>
                  {earnedDate !== '' && <span>Earned: {earnedDate}</span>}
                  {expiryDate !== '' && <span>Expires: {expiryDate}</span>}
                </div>

                {ceu !== undefined && (
                  <div className="mt-1.5">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <span className="text-playground-muted">CEU Progress</span>
                      <span className="text-[var(--token-text-primary,theme(colors.neutral-200))] tabular-nums">{num(ceu['earned'])}/{num(ceu['required'])}</span>
                    </div>
                    <div className="h-1 rounded-full bg-[var(--token-surface,theme(colors.playground-panel))]">
                      <div
                        className="h-full rounded-full bg-[var(--token-accent,oklch(0.65_0.15_250))] transition-all"
                        style={{ width: `${String(num(ceu['required']) > 0 ? Math.min((num(ceu['earned']) / num(ceu['required'])) * 100, 100) : 0)}%` }}
                      />
                    </div>
                  </div>
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
