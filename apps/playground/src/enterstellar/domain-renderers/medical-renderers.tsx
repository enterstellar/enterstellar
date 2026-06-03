/**
 * @module playground/enterstellar/domain-renderers/medical-renderers
 * @description React renderers for VitalSync (Medical) domain components.
 *
 * Renderers are decoupled from contracts per Design Choice R6.
 * Each renderer is registered via `registerRenderer()` and looked up
 * by `<Zone>` at render time using string name matching.
 *
 * @see Design Choice R6 — render not on ComponentContract
 * @see domain-components/medical.ts — PatientTimeline, VitalsMonitor, ClinicalAlert, MedicationSchedule, LabResultsPanel, CareTeamRoster
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

/** Tracks whether medical renderers have been registered. */
let registered = false;

/**
 * Registers all VitalSync (Medical) domain component renderers.
 * Idempotent — safe to call multiple times.
 */
export function registerMedicalRenderers(): void {
  if (registered) return;

  // -- PatientTimeline ------------------------------------------------------

  registerRenderer('PatientTimeline', (props: Record<string, unknown>): JSX.Element => {
    const patientName = str(props['patientName'], 'Patient');
    const patientId = str(props['patientId']);
    const events = arr(props['events']).map(rec);

    const typeIcons: Record<string, string> = {
      admission: '🏥', discharge: '🚪', lab: '🔬',
      medication: '💊', procedure: '🔧', note: '📝',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{patientName}</h3>
          <span className="text-[10px] font-mono text-playground-muted bg-[var(--token-surface,theme(colors.playground-panel))] px-2 py-0.5 rounded">{patientId}</span>
        </div>
        <div className="space-y-0">
          {events.map((event, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="text-sm shrink-0">{typeIcons[str(event['type'])] ?? '📋'}</span>
                {i < events.length - 1 && <div className="w-px flex-1 bg-[var(--token-card-border,theme(colors.playground-border))]" />}
              </div>
              <div className="pb-4 min-w-0">
                <p className="text-sm font-medium text-[var(--token-text-primary,theme(colors.neutral-200))]">{str(event['title'])}</p>
                <p className="text-[10px] text-[var(--token-text-secondary,theme(colors.playground-muted))]">{str(event['provider'])} · {str(event['date'])}</p>
                {str(event['details']) !== '' && (
                  <p className="text-xs text-[var(--token-text-secondary,theme(colors.neutral-400))] mt-1">{str(event['details'])}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  });

  // -- VitalsMonitor --------------------------------------------------------

  registerRenderer('VitalsMonitor', (props: Record<string, unknown>): JSX.Element => {
    const patientName = str(props['patientName'], 'Patient');
    const hr = rec(props['heartRate']);
    const bp = rec(props['bloodPressure']);
    const spo2 = rec(props['spO2']);
    const temp = rec(props['temperature']);

    const statusColor: Record<string, string> = {
      normal: 'text-success', elevated: 'text-warning', low: 'text-warning', critical: 'text-error',
    };

    function VitalCard({ label, value, unit, status }: { label: string; value: string; unit: string; status: string }): JSX.Element {
      return (
        <div className="rounded-lg bg-[var(--token-surface,theme(colors.playground-panel))] p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-[var(--token-text-secondary,theme(colors.playground-muted))] mb-1">{label}</p>
          <p className={`text-xl font-bold tabular-nums ${statusColor[status] ?? 'text-[var(--token-text-primary,theme(colors.neutral-100))]'}`}>
            {value}
          </p>
          <p className="text-[10px] text-playground-muted">{unit}</p>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] p-5">
        <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))] mb-3">{patientName} — Vitals</h3>
        <div className="grid grid-cols-2 gap-2">
          <VitalCard label="Heart Rate" value={String(num(hr['value']))} unit={str(hr['unit'], 'bpm')} status={str(hr['status'])} />
          <VitalCard label="Blood Pressure" value={`${String(num(bp['systolic']))}/${String(num(bp['diastolic']))}`} unit="mmHg" status={str(bp['status'])} />
          <VitalCard label="SpO₂" value={`${String(num(spo2['value']))}%`} unit="saturation" status={str(spo2['status'])} />
          <VitalCard label="Temperature" value={num(temp['value']).toFixed(1)} unit={str(temp['unit'], '°F')} status={str(temp['status'])} />
        </div>
      </div>
    );
  });

  // -- ClinicalAlert --------------------------------------------------------

  registerRenderer('ClinicalAlert', (props: Record<string, unknown>): JSX.Element => {
    const title = str(props['title'], 'Clinical Alert');
    const message = str(props['message']);
    const severity = str(props['severity'], 'info');
    const category = str(props['category']);

    const categoryIcons: Record<string, string> = {
      'drug-interaction': '💊', 'vital-alert': '❤️', 'care-plan': '📋',
      'lab-result': '🔬', allergy: '⚠️',
    };

    const severityStyles: Record<string, { border: string; bg: string }> = {
      info: { border: 'border-primary-500/30', bg: 'bg-primary-500/10' },
      warning: { border: 'border-warning/30', bg: 'bg-warning/10' },
      critical: { border: 'border-error/50', bg: 'bg-error/15' },
    };
    const style = severityStyles[severity] ?? severityStyles['info'] ?? { border: 'border-primary-500/30', bg: 'bg-primary-500/10' };

    return (
      <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
        <div className="flex items-start gap-3">
          <span className="text-lg shrink-0">{categoryIcons[category] ?? '🔔'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{title}</h4>
              <span className="text-[9px] uppercase tracking-wider text-playground-muted">{category.replace('-', ' ')}</span>
            </div>
            <p className="text-xs text-[var(--token-text-secondary,theme(colors.neutral-300))] leading-relaxed">{message}</p>
          </div>
        </div>
      </div>
    );
  });

  // -- MedicationSchedule --------------------------------------------------

  registerRenderer('MedicationSchedule', (props: Record<string, unknown>): JSX.Element => {
    const patientName = str(props['patientName'], 'Patient');
    const patientId = str(props['patientId']);
    const medications = arr(props['medications']).map(rec);

    const routeBadge: Record<string, string> = {
      oral: 'bg-primary-500/20 text-primary-400', iv: 'bg-error/20 text-error',
      im: 'bg-warning/20 text-warning', sc: 'bg-success/20 text-success',
      topical: 'bg-playground-muted/20 text-playground-muted', inhaled: 'bg-accent/20 text-accent',
      rectal: 'bg-playground-muted/20 text-playground-muted',
    };
    const statusIcon: Record<string, string> = {
      active: '\u25CF', held: '\u25CB', discontinued: '\u2717', prn: '\u25C6',
    };
    const statusColor: Record<string, string> = {
      active: 'text-success', held: 'text-warning', discontinued: 'text-playground-muted', prn: 'text-accent',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">Medication Schedule</h3>
          <span className="text-[10px] font-mono text-playground-muted">{patientName} ({patientId})</span>
        </div>
        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {medications.map((med, i) => {
            const status = str(med['status']);
            const route = str(med['route']);
            const conflicts = arr(med['conflicts']).map(rec);
            return (
              <div key={i} className="px-5 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs ${statusColor[status] ?? 'text-playground-muted'}`}>{statusIcon[status] ?? '\u25CF'}</span>
                    <span className="text-sm font-medium text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(med['name'])}</span>
                    <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${routeBadge[route] ?? 'bg-playground-muted/20 text-playground-muted'}`}>{route}</span>
                  </div>
                  <span className="text-xs text-[var(--token-text-primary,theme(colors.neutral-100))] font-bold tabular-nums shrink-0">{str(med['dosage'])}</span>
                </div>
                <p className="text-[10px] text-playground-muted">{str(med['frequency'])}{str(med['nextDue']) !== '' ? ` \u00B7 Next: ${str(med['nextDue'])}` : ''}</p>
                {conflicts.length > 0 && conflicts.map((c, j) => (
                  <div key={j} className="mt-1.5 flex items-start gap-1.5 text-[10px] text-error bg-error/10 px-2 py-1 rounded">
                    <span className="shrink-0">\u26A0</span>
                    <span><b>{str(c['severity']).toUpperCase()}</b> interaction with {str(c['withDrug'])}: {str(c['description'])}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- LabResultsPanel ----------------------------------------------------

  registerRenderer('LabResultsPanel', (props: Record<string, unknown>): JSX.Element => {
    const panelName = str(props['panelName'], 'Lab Results');
    const collectedAt = str(props['collectedAt']);
    const orderedBy = str(props['orderedBy']);
    const results = arr(props['results']).map(rec);

    const flagLabel: Record<string, { text: string; cls: string }> = {
      normal: { text: '', cls: '' },
      high: { text: 'H', cls: 'text-error font-bold' },
      low: { text: 'L', cls: 'text-warning font-bold' },
      'critical-high': { text: 'C\u2191', cls: 'text-error font-black bg-error/20 px-1 rounded' },
      'critical-low': { text: 'C\u2193', cls: 'text-error font-black bg-error/20 px-1 rounded' },
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))]">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">{panelName}</h3>
          <p className="text-[10px] text-playground-muted">{orderedBy} &middot; {collectedAt}</p>
        </div>

        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {results.map((result, i) => {
            const value = num(result['value']);
            const refLow = num(result['referenceLow']);
            const refHigh = num(result['referenceHigh']);
            const flag = str(result['flag']);
            const prevVal = result['previousValue'] !== undefined ? num(result['previousValue']) : undefined;
            const fl = flagLabel[flag] ?? flagLabel['normal'] ?? { text: '', cls: '' };

            const delta = prevVal !== undefined ? value - prevVal : undefined;

            return (
              <div key={i} className="px-5 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-[var(--token-text-primary,theme(colors.neutral-200))] w-24 truncate">{str(result['testName'])}</span>
                  {fl.text !== '' && <span className={`text-[10px] ${fl.cls}`}>{fl.text}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold tabular-nums ${flag !== 'normal' ? 'text-[var(--token-text-primary,theme(colors.neutral-100))]' : 'text-success'}`}>{value}</span>
                  <span className="text-[10px] text-playground-muted tabular-nums w-16 text-right">{refLow}&ndash;{refHigh}</span>
                  <span className="text-[10px] text-playground-muted w-6">{str(result['unit'])}</span>
                  {delta !== undefined && (
                    <span className={`text-[10px] tabular-nums ${delta > 0 ? 'text-error' : delta < 0 ? 'text-success' : 'text-playground-muted'}`}>
                      {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  // -- CareTeamRoster -----------------------------------------------------

  registerRenderer('CareTeamRoster', (props: Record<string, unknown>): JSX.Element => {
    const patientName = str(props['patientName'], 'Patient');
    const unit = str(props['unit']);
    const members = arr(props['members']).map(rec);

    const roleLabel: Record<string, string> = {
      attending: 'Attending', resident: 'Resident', nurse: 'RN',
      respiratory: 'RT', pharmacist: 'PharmD', 'social-worker': 'SW',
      dietitian: 'RD', 'case-manager': 'CM',
    };
    const shiftDot: Record<string, string> = {
      'on-shift': 'bg-success', 'off-shift': 'bg-playground-muted', 'on-call': 'bg-warning',
    };

    return (
      <div className="rounded-xl border border-[var(--token-card-border,theme(colors.playground-border))] bg-[var(--token-card-bg,theme(colors.playground-surface))] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--token-card-border,theme(colors.playground-border))] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--token-text-primary,theme(colors.neutral-100))]">Care Team</h3>
          <span className="text-[10px] text-playground-muted">{patientName} &middot; {unit}</span>
        </div>
        <div className="divide-y divide-[var(--token-card-border,theme(colors.playground-border))]">
          {members.map((member, i) => {
            const role = str(member['role']);
            const shift = str(member['shiftStatus']);
            const designation = str(member['designation']);
            return (
              <div key={i} className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`size-2 rounded-full ${shiftDot[shift] ?? 'bg-playground-muted'} shrink-0`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--token-text-primary,theme(colors.neutral-200))] truncate">{str(member['name'])}</span>
                      {designation !== '' && (
                        <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-[var(--token-accent,oklch(0.65_0.15_250))]/15 text-[var(--token-accent,oklch(0.65_0.15_250))]">{designation}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-playground-muted">{str(member['contact'])} &middot; Since {str(member['since'])}</p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-playground-muted uppercase shrink-0">{roleLabel[role] ?? role}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  registered = true;
}
