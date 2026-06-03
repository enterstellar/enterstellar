/**
 * @module playground/enterstellar/scenes/scene-medical
 * @description VitalSync — Healthcare domain scene.
 *
 * A multi-zone medical dashboard demonstrating Enterstellar's ability to render
 * a cohesive clinical monitoring application. Uses the `medical` theme
 * (teal + white, clean, high-contrast, a11y-first).
 *
 * **Fictional brand:** VitalSync
 * **Visual DNA:** Clinical white + teal, monospaced vitals, ICU aesthetic
 *
 * **Zones (4 required + 5 optional):**
 * 1. `vitals-monitor` — VitalsMonitor showing real-time vital signs (standard)
 * 2. `clinical-alert` — ClinicalAlert for drug interactions/vital alerts (compact)
 * 3. `patient-timeline` — PatientTimeline with chronological events (wide)
 * 4. `patient-profile` — UserProfile as patient info card (compact)
 * 5. `progress-tracker` — ProgressTracker for care plan (standard, optional)
 * 6. `metric-card` — MetricCard for lab highlight (compact, optional)
 * 7. `medication-schedule` — MedicationSchedule with MAR and conflict markers (wide, optional)
 * 8. `lab-results` — LabResultsPanel with reference ranges and flags (standard, optional)
 * 9. `care-team` — CareTeamRoster with roles and shift status (standard, optional)
 *
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import type { PlaygroundScene } from './types';

/**
 * VitalSync — Healthcare patient monitoring dashboard.
 *
 * Demonstrates Enterstellar rendering a clinical application with real-time
 * patient vitals, rigorous multi-drug medication schedules, lab
 * result panels, and care team rosters — all with cross-zone data coherence.
 */
export const sceneMedical: PlaygroundScene = {
  id: 'scene-medical',
  name: 'Patient Dashboard',
  description: 'VitalSync — Patient vitals, timeline, and clinical alerts',
  category: 'domain',
  theme: 'medical',
  layout: 'grid-2col',
  zones: [
    {
      name: 'vitals-monitor',
      position: { row: 1, col: 1 },
      expectedComponent: 'VitalsMonitor',
      intentHint: 'Show real-time vital signs: heart rate, blood pressure, SpO2, temperature',
      sizeHint: 'standard',
    },
    {
      name: 'clinical-alert',
      position: { row: 1, col: 2 },
      expectedComponent: 'ClinicalAlert',
      intentHint: 'Show a clinical alert for drug interaction or vital threshold breach',
      sizeHint: 'compact',
    },
    {
      name: 'patient-timeline',
      position: { row: 2, col: 1, span: 2 },
      expectedComponent: 'PatientTimeline',
      intentHint: 'Show chronological patient events: labs, medications, procedures, notes',
      sizeHint: 'wide',
    },
    {
      name: 'patient-profile',
      position: { row: 3, col: 1 },
      expectedComponent: 'UserProfile',
      intentHint: 'Show patient profile with name, age, primary diagnosis, and care team',
      sizeHint: 'compact',
    },
    {
      name: 'progress-tracker',
      position: { row: 3, col: 2 },
      expectedComponent: 'ProgressTracker',
      intentHint: 'Show care plan progress: admission, diagnosis, treatment, discharge',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'metric-card',
      position: { row: 4, col: 1 },
      expectedComponent: 'MetricCard',
      intentHint: 'Show a key lab result like hemoglobin or glucose level',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'medication-schedule',
      position: { row: 5, col: 1, span: 2 },
      expectedComponent: 'MedicationSchedule',
      intentHint: 'Show the medication administration schedule with routes, doses, and interaction alerts',
      sizeHint: 'wide',
      optional: true,
    },
    {
      name: 'lab-results',
      position: { row: 6, col: 1 },
      expectedComponent: 'LabResultsPanel',
      intentHint: 'Show recent lab results with reference ranges and high/low/critical flags',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'care-team',
      position: { row: 6, col: 2 },
      expectedComponent: 'CareTeamRoster',
      intentHint: 'Show the interdisciplinary care team with roles, shift status, and contacts',
      sizeHint: 'standard',
      optional: true,
    },
  ],
  suggestedIntents: [
    'Show me a patient dashboard for VitalSync with vitals, timeline, and alerts',
    'Display a clinical overview with drug interactions and care plan progress',
    'Build an ICU monitoring view with real-time vital signs and recent events',
  ],
};
