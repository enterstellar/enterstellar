/**
 * @module playground/enterstellar/domain-components/medical
 * @description VitalSync — Healthcare domain component contracts.
 *
 * **Components (6):**
 * 1. **PatientTimeline** — Chronological patient event history
 * 2. **VitalsMonitor** — Real-time vital signs display
 * 3. **ClinicalAlert** — Clinical attention notification
 * 4. **MedicationSchedule** — Multi-drug administration record with timing and conflicts
 * 5. **LabResultsPanel** — Lab values with reference ranges and H/L/C flags
 * 6. **CareTeamRoster** — Interdisciplinary care team with roles and shifts
 *
 * These are **data-only contracts** — no React, no JSX (Design Choice R6).
 * Renderers live in `domain-renderers/medical-renderers.tsx`.
 *
 * @see Bible §5.1 — defineComponent specification
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';

// ---------------------------------------------------------------------------
// 1. PatientTimeline
// ---------------------------------------------------------------------------

/**
 * PatientTimeline — chronological patient event history.
 *
 * Displays a chronological feed of patient encounters, procedures, lab
 * collections, and medication administrations. Ensures clinicians can
 * quickly scan a patient's recent history to understand disease progression
 * and treatment efficacy.
 *
 * Inspired by Epic's Storyboard timeline and Cerner's patient history views.
 */
export const PatientTimeline = defineComponent({
  name: 'PatientTimeline',
  description: 'Chronological patient event timeline with event types, providers, and clinical notes.',
  category: 'data-display',
  tags: ['medical', 'patient', 'timeline', 'history', 'ehr'],
  props: z.object({
    patientName: z.string().min(1),
    patientId: z.string().min(1),
    events: z.array(z.object({
      date: z.string().min(1),
      type: z.enum(['admission', 'discharge', 'lab', 'medication', 'procedure', 'note']),
      title: z.string().min(1),
      provider: z.string().min(1),
      details: z.string().optional(),
    })).min(1),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent' },
  accessibility: { role: 'feed', ariaLabel: 'Patient timeline', announceOnUpdate: false },
  states: { loading: 'PatientTimelineLoading', error: 'PatientTimelineError', empty: 'PatientTimelineEmpty', ready: 'PatientTimeline' },
  examples: [{ intent: 'Show patient timeline for James Rivera', props: { patientName: 'James Rivera', patientId: 'PT-4821', events: [{ date: '2024-03-15', type: 'lab', title: 'CBC Panel Results', provider: 'Dr. Sarah Chen', details: 'WBC 7.2, RBC 4.8, Hemoglobin 14.2' }, { date: '2024-03-12', type: 'medication', title: 'Metformin 500mg Prescribed', provider: 'Dr. Sarah Chen' }] } }],
});

// ---------------------------------------------------------------------------
// 2. VitalsMonitor
// ---------------------------------------------------------------------------

/**
 * VitalsMonitor — real-time vital signs display.
 *
 * Displays a high-contrast dashboard of critical patient vital signs
 * including heart rate, blood pressure, oxygen saturation, temperature,
 * and respiratory rate. Includes visual status indicators (normal,
 * elevated, critical) driven by configurable clinical thresholds.
 *
 * Inspired by bedside ICU monitoring interfaces and telemetry dashboards
 * used for continuous patient surveillance.
 */
export const VitalsMonitor = defineComponent({
  name: 'VitalsMonitor',
  description: 'Real-time vital signs monitor with heart rate, blood pressure, SpO2, temperature, and respiratory rate.',
  category: 'data-display',
  tags: ['medical', 'vitals', 'monitor', 'real-time', 'icu'],
  props: z.object({
    patientName: z.string().min(1),
    heartRate: z.object({ value: z.number(), unit: z.string().default('bpm'), status: z.enum(['normal', 'elevated', 'critical']) }),
    bloodPressure: z.object({ systolic: z.number(), diastolic: z.number(), status: z.enum(['normal', 'elevated', 'critical']) }),
    spO2: z.object({ value: z.number().min(0).max(100), status: z.enum(['normal', 'low', 'critical']) }),
    temperature: z.object({ value: z.number(), unit: z.string().default('°F'), status: z.enum(['normal', 'elevated', 'critical']) }),
    respiratoryRate: z.object({ value: z.number(), unit: z.string().default('/min'), status: z.enum(['normal', 'elevated', 'critical']) }).optional(),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', success: 'token:success', danger: 'token:danger', warning: 'token:warning' },
  accessibility: { role: 'status', ariaLabel: 'Vital signs monitor', announceOnUpdate: true },
  states: { loading: 'VitalsMonitorLoading', error: 'VitalsMonitorError', empty: 'VitalsMonitorEmpty', ready: 'VitalsMonitor' },
  examples: [{ intent: 'Show vital signs for patient James Rivera', props: { patientName: 'James Rivera', heartRate: { value: 78, unit: 'bpm', status: 'normal' }, bloodPressure: { systolic: 128, diastolic: 82, status: 'elevated' }, spO2: { value: 97, status: 'normal' }, temperature: { value: 98.6, unit: '°F', status: 'normal' }, respiratoryRate: { value: 16, unit: '/min', status: 'normal' } } }],
});

// ---------------------------------------------------------------------------
// 3. ClinicalAlert
// ---------------------------------------------------------------------------

/**
 * ClinicalAlert — clinical attention notification.
 *
 * Surfaces critical, actionable clinical notifications such as severe
 * drug-drug interactions, critical lab values, or necessary care plan
 * modifications. Designed with distinct severity levels to combat alert
 * fatigue in clinical environments.
 *
 * Emulates the Interruptive Alert modals and Best Practice Advisories (BPA)
 * found in modern EHR systems.
 */
export const ClinicalAlert = defineComponent({
  name: 'ClinicalAlert',
  description: 'Clinical alert for critical patient conditions, drug interactions, or care plan changes.',
  category: 'feedback',
  tags: ['medical', 'alert', 'clinical', 'notification', 'safety'],
  props: z.object({
    title: z.string().min(1),
    message: z.string().min(1),
    severity: z.enum(['info', 'warning', 'critical']),
    category: z.enum(['drug-interaction', 'vital-alert', 'care-plan', 'lab-result', 'allergy']),
    patientId: z.string().optional(),
    actionRequired: z.boolean().default(false),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', warning: 'token:warning', danger: 'token:danger' },
  accessibility: { role: 'alert', ariaLabel: 'Clinical alert', announceOnUpdate: true },
  states: { loading: 'ClinicalAlertLoading', error: 'ClinicalAlertError', empty: 'ClinicalAlertEmpty', ready: 'ClinicalAlert' },
  examples: [{ intent: 'Show a drug interaction alert for patient Rivera', props: { title: 'Drug Interaction Warning', message: 'Metformin may interact with Contrast Dye scheduled for CT scan on 03/18. Consider holding medication 48h prior.', severity: 'warning', category: 'drug-interaction', patientId: 'PT-4821', actionRequired: true } }],
});

// ---------------------------------------------------------------------------
// 4. MedicationSchedule
// ---------------------------------------------------------------------------

/**
 * MedicationSchedule — multi-drug administration record (MAR).
 *
 * Renders a medication administration timeline showing each active
 * prescription with drug name, dosage, route (oral, IV, IM, SC, topical),
 * frequency, next administration window, and conflict/interaction markers.
 * Nurses check this screen at the start of every shift.
 *
 * Inspired by Epic's Medication Administration Record (MAR) and Cerner
 * PowerChart's medication schedule view. Conflict markers map to the
 * same drug-interaction databases (Lexicomp, First Databank) used
 * in production EHR systems.
 */
export const MedicationSchedule = defineComponent({
  name: 'MedicationSchedule',
  description: 'Multi-drug administration schedule with dosage, route, timing windows, and interaction markers.',
  category: 'data-display',
  tags: ['medical', 'medication', 'schedule', 'mar', 'pharmacy'],
  props: z.object({
    patientName: z.string().min(1),
    patientId: z.string().min(1),
    medications: z.array(z.object({
      name: z.string().min(1),
      dosage: z.string().min(1),
      route: z.enum(['oral', 'iv', 'im', 'sc', 'topical', 'inhaled', 'rectal']),
      frequency: z.string().min(1),
      nextDue: z.string(),
      status: z.enum(['active', 'held', 'discontinued', 'prn']),
      conflicts: z.array(z.object({
        withDrug: z.string().min(1),
        severity: z.enum(['minor', 'moderate', 'major', 'contraindicated']),
        description: z.string().min(1),
      })).optional(),
    })).min(1, 'At least one medication is required.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    danger: 'token:danger',
    warning: 'token:warning',
    accent: 'token:accent',
  },
  accessibility: {
    role: 'table',
    ariaLabel: 'Medication schedule',
    announceOnUpdate: true,
  },
  states: {
    loading: 'MedicationScheduleLoading',
    error: 'MedicationScheduleError',
    empty: 'MedicationScheduleEmpty',
    ready: 'MedicationSchedule',
  },
  examples: [
    {
      intent: 'Show medication schedule for patient Rivera',
      props: {
        patientName: 'James Rivera',
        patientId: 'PT-4821',
        medications: [
          { name: 'Metformin', dosage: '500mg', route: 'oral', frequency: 'BID (twice daily)', nextDue: '2024-03-15T18:00:00Z', status: 'active', conflicts: [{ withDrug: 'Contrast Dye', severity: 'major', description: 'Hold 48h before and after iodinated contrast administration' }] },
          { name: 'Lisinopril', dosage: '10mg', route: 'oral', frequency: 'QD (once daily)', nextDue: '2024-03-16T08:00:00Z', status: 'active' },
          { name: 'Heparin', dosage: '5000 units', route: 'sc', frequency: 'Q8H (every 8 hours)', nextDue: '2024-03-15T22:00:00Z', status: 'active' },
          { name: 'Ondansetron', dosage: '4mg', route: 'iv', frequency: 'PRN (as needed)', nextDue: '', status: 'prn' },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 5. LabResultsPanel
// ---------------------------------------------------------------------------

/**
 * LabResultsPanel — laboratory results with reference ranges and flags.
 *
 * Displays a structured table of lab test results with the measured value,
 * reference range (low–high), flags (H = high, L = low, C = critical),
 * units, delta from previous result, and collection timestamp. This is
 * the single most viewed screen in clinical medicine.
 *
 * Inspired by Epic's Lab Results Flowsheet and Cerner's Lab Review.
 * The flag system matches the HL7 FHIR Observation interpretation codes
 * used in real clinical interoperability.
 */
export const LabResultsPanel = defineComponent({
  name: 'LabResultsPanel',
  description: 'Lab results table with reference ranges, H/L/C flags, and delta from previous result.',
  category: 'data-display',
  tags: ['medical', 'lab', 'results', 'diagnostics', 'pathology'],
  props: z.object({
    panelName: z.string().min(1),
    collectedAt: z.string().min(1),
    orderedBy: z.string().min(1),
    results: z.array(z.object({
      testName: z.string().min(1),
      value: z.number(),
      unit: z.string().min(1),
      referenceLow: z.number(),
      referenceHigh: z.number(),
      flag: z.enum(['normal', 'high', 'low', 'critical-high', 'critical-low']),
      previousValue: z.number().optional(),
    })).min(1, 'At least one lab result is required.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    danger: 'token:danger',
    warning: 'token:warning',
  },
  accessibility: {
    role: 'table',
    ariaLabel: 'Lab results panel',
    announceOnUpdate: true,
  },
  states: {
    loading: 'LabResultsPanelLoading',
    error: 'LabResultsPanelError',
    empty: 'LabResultsPanelEmpty',
    ready: 'LabResultsPanel',
  },
  examples: [
    {
      intent: 'Show CBC panel results for patient Rivera',
      props: {
        panelName: 'Complete Blood Count (CBC)',
        collectedAt: '2024-03-15T06:30:00Z',
        orderedBy: 'Dr. Sarah Chen',
        results: [
          { testName: 'WBC', value: 11.8, unit: 'K/uL', referenceLow: 4.5, referenceHigh: 11.0, flag: 'high', previousValue: 7.2 },
          { testName: 'RBC', value: 4.8, unit: 'M/uL', referenceLow: 4.5, referenceHigh: 5.5, flag: 'normal', previousValue: 4.9 },
          { testName: 'Hemoglobin', value: 14.2, unit: 'g/dL', referenceLow: 13.5, referenceHigh: 17.5, flag: 'normal', previousValue: 14.0 },
          { testName: 'Platelets', value: 142, unit: 'K/uL', referenceLow: 150, referenceHigh: 400, flag: 'low', previousValue: 168 },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 6. CareTeamRoster
// ---------------------------------------------------------------------------

/**
 * CareTeamRoster — interdisciplinary care team with roles and shifts.
 *
 * Displays the patient's current care team with each member's role
 * (attending physician, resident, registered nurse, respiratory therapist,
 * social worker, pharmacist), shift status (on-shift, off-shift, on-call),
 * contact priority, and pager/phone number. Primary vs. consulting
 * designation is shown for physicians.
 *
 * Inspired by Epic's Care Team panel and hospital whiteboard systems.
 * Nurses and physicians use this to coordinate handoffs and consults.
 */
export const CareTeamRoster = defineComponent({
  name: 'CareTeamRoster',
  description: 'Interdisciplinary care team roster with roles, shift status, and contact priority.',
  category: 'data-display',
  tags: ['medical', 'care-team', 'roster', 'staff', 'coordination'],
  props: z.object({
    patientName: z.string().min(1),
    unit: z.string().min(1),
    members: z.array(z.object({
      name: z.string().min(1),
      role: z.enum(['attending', 'resident', 'nurse', 'respiratory', 'pharmacist', 'social-worker', 'dietitian', 'case-manager']),
      designation: z.enum(['primary', 'consulting', 'covering']).optional(),
      shiftStatus: z.enum(['on-shift', 'off-shift', 'on-call']),
      contact: z.string().min(1),
      since: z.string().min(1),
    })).min(1, 'At least one care team member is required.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    accent: 'token:accent',
  },
  accessibility: {
    role: 'list',
    ariaLabel: 'Care team roster',
    announceOnUpdate: false,
  },
  states: {
    loading: 'CareTeamRosterLoading',
    error: 'CareTeamRosterError',
    empty: 'CareTeamRosterEmpty',
    ready: 'CareTeamRoster',
  },
  examples: [
    {
      intent: 'Show care team for patient Rivera in ICU',
      props: {
        patientName: 'James Rivera',
        unit: 'ICU-3B',
        members: [
          { name: 'Dr. Sarah Chen', role: 'attending', designation: 'primary', shiftStatus: 'on-shift', contact: 'Pager 4821', since: '2024-03-10' },
          { name: 'Dr. Marcus Webb', role: 'resident', shiftStatus: 'on-shift', contact: 'Pager 5103', since: '2024-03-14' },
          { name: 'Lisa Tran, RN', role: 'nurse', designation: 'primary', shiftStatus: 'on-shift', contact: 'Ext. 7240', since: '2024-03-15' },
          { name: 'Dr. Amy Rodriguez', role: 'pharmacist', shiftStatus: 'on-call', contact: 'Pager 6012', since: '2024-03-12' },
        ],
      },
    },
  ],
});

/**
 * All VitalSync (Medical) domain component contracts.
 *
 * Spread into the playground registry and system prompt manifest.
 */
export const medicalContracts = [
  PatientTimeline,
  VitalsMonitor,
  ClinicalAlert,
  MedicationSchedule,
  LabResultsPanel,
  CareTeamRoster,
] as const;
