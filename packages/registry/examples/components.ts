/**
 * @module @enterstellar-ai/registry/examples
 * @description 10 example clinical-domain ComponentContracts.
 *
 * These contracts are the canonical test fixtures for the Enterstellar pipeline.
 * Every contract passes all 10 registration-time rules (R1–R10) and
 * exercises the full contract surface: props schemas, design tokens,
 * accessibility roles, lifecycle states, and example intents.
 *
 * **Domain:** Healthcare / Clinical — chosen to demonstrate Enterstellar's
 * suitability for high-stakes, regulation-sensitive applications.
 *
 * @see Implementation Bible §5.1 — Component Registry
 * @see Design Choice R10 — Example data via intent + props
 */

import { z } from 'zod';

import { defineComponent } from '../src/define-component.js';

// ---------------------------------------------------------------------------
// 1. PatientVitals
// ---------------------------------------------------------------------------

export const PatientVitals = defineComponent({
    name: 'PatientVitals',
    description: 'Displays real-time patient vital signs with risk stratification.',
    category: 'clinical',
    tags: ['patient', 'vitals', 'monitoring', 'real-time', 'risk'],
    props: z.object({
        patientId: z.string(),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
        heartRate: z.number().optional(),
        bloodPressure: z.string().optional(),
        temperature: z.number().optional(),
        oxygenSaturation: z.number().optional(),
    }),
    tokens: {
        statusColor: 'token:status-color',
        cardBg: 'token:card-bg',
        dangerColor: 'token:danger',
        warningColor: 'token:warning',
    },
    accessibility: { role: 'region', ariaLabel: 'Patient vital signs', announceOnUpdate: true },
    states: {
        loading: 'VitalsLoading',
        error: 'VitalsError',
        empty: 'VitalsEmpty',
        ready: 'PatientVitals',
    },
    examples: [
        {
            intent: 'Show patient vitals',
            props: { patientId: '123e4567-e89b-12d3-a456-426614174000', riskLevel: 'high' },
        },
        {
            intent: 'Display critical patient monitoring',
            props: { patientId: '550e8400-e29b-41d4-a716-446655440000', riskLevel: 'critical', heartRate: 142, oxygenSaturation: 88 },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 2. MedicationList
// ---------------------------------------------------------------------------

export const MedicationList = defineComponent({
    name: 'MedicationList',
    description: 'Renders an interactive list of patient medications with dosage and schedule.',
    category: 'clinical',
    tags: ['medication', 'prescription', 'pharmacy', 'list'],
    props: z.object({
        patientId: z.string(),
        filter: z.enum(['active', 'discontinued', 'all']).optional(),
        sortBy: z.enum(['name', 'date', 'dosage']).optional(),
    }),
    tokens: {
        listBg: 'token:list-bg',
        activeColor: 'token:success',
        discontinuedColor: 'token:muted',
    },
    accessibility: { role: 'list', ariaLabel: 'Patient medications', announceOnUpdate: false },
    states: {
        loading: 'MedicationListLoading',
        error: 'MedicationListError',
        empty: 'MedicationListEmpty',
        ready: 'MedicationList',
    },
    examples: [
        {
            intent: 'Show current medications',
            props: { patientId: '123e4567-e89b-12d3-a456-426614174000', filter: 'active' },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 3. DiagnosisSummary
// ---------------------------------------------------------------------------

export const DiagnosisSummary = defineComponent({
    name: 'DiagnosisSummary',
    description: 'Summarizes patient diagnoses with ICD-10 codes and clinical notes.',
    category: 'clinical',
    tags: ['diagnosis', 'icd10', 'summary', 'clinical'],
    props: z.object({
        patientId: z.string(),
        timeRange: z.enum(['30d', '90d', '1y', 'all']).optional(),
        includeCodes: z.boolean().optional(),
    }),
    tokens: {
        cardBg: 'token:card-bg',
        headerColor: 'token:text-primary',
        codeColor: 'token:text-secondary',
    },
    accessibility: { role: 'article', ariaLabel: 'Diagnosis summary', announceOnUpdate: false },
    states: {
        loading: 'DiagnosisSummaryLoading',
        error: 'DiagnosisSummaryError',
        empty: 'DiagnosisSummaryEmpty',
        ready: 'DiagnosisSummary',
    },
    examples: [
        {
            intent: 'Summarize patient diagnoses',
            props: { patientId: '123e4567-e89b-12d3-a456-426614174000', timeRange: '1y', includeCodes: true },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 4. LabResults
// ---------------------------------------------------------------------------

export const LabResults = defineComponent({
    name: 'LabResults',
    description: 'Displays laboratory test results with reference ranges and trend indicators.',
    category: 'clinical',
    tags: ['lab', 'results', 'pathology', 'trends', 'data-display'],
    props: z.object({
        patientId: z.string(),
        testCategory: z.enum(['blood', 'urine', 'imaging', 'all']).optional(),
        showTrends: z.boolean().optional(),
        limit: z.number().optional(),
    }),
    tokens: {
        normalColor: 'token:success',
        abnormalColor: 'token:danger',
        borderlineColor: 'token:warning',
        tableBg: 'token:table-bg',
    },
    accessibility: { role: 'table', ariaLabel: 'Laboratory results', announceOnUpdate: true },
    states: {
        loading: 'LabResultsLoading',
        error: 'LabResultsError',
        empty: 'LabResultsEmpty',
        ready: 'LabResults',
    },
    examples: [
        {
            intent: 'Show latest lab results',
            props: { patientId: '123e4567-e89b-12d3-a456-426614174000', testCategory: 'blood', showTrends: true },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 5. AppointmentCard
// ---------------------------------------------------------------------------

export const AppointmentCard = defineComponent({
    name: 'AppointmentCard',
    description: 'Compact card showing an upcoming or past appointment with provider details.',
    category: 'admin',
    tags: ['appointment', 'schedule', 'card', 'provider'],
    props: z.object({
        appointmentId: z.string(),
        patientId: z.string(),
        providerName: z.string(),
        dateTime: z.string(),
        status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']),
        specialty: z.string().optional(),
    }),
    tokens: {
        cardBg: 'token:card-bg',
        scheduledColor: 'token:info',
        completedColor: 'token:success',
        cancelledColor: 'token:muted',
    },
    accessibility: { role: 'article', ariaLabel: 'Appointment details', announceOnUpdate: false },
    states: {
        loading: 'AppointmentCardLoading',
        error: 'AppointmentCardError',
        empty: 'AppointmentCardEmpty',
        ready: 'AppointmentCard',
    },
    examples: [
        {
            intent: 'Show next appointment',
            props: {
                appointmentId: 'apt-001',
                patientId: '123e4567-e89b-12d3-a456-426614174000',
                providerName: 'Dr. Sarah Chen',
                dateTime: '2026-03-01T09:00:00Z',
                status: 'scheduled',
                specialty: 'Cardiology',
            },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 6. AlertBanner
// ---------------------------------------------------------------------------

export const AlertBanner = defineComponent({
    name: 'AlertBanner',
    description: 'Dismissible banner for clinical alerts, warnings, and system notifications.',
    category: 'feedback',
    tags: ['alert', 'banner', 'notification', 'warning'],
    props: z.object({
        severity: z.enum(['info', 'warning', 'error', 'critical']),
        title: z.string(),
        message: z.string(),
        dismissible: z.boolean().optional(),
        actionLabel: z.string().optional(),
        actionUrl: z.string().optional(),
    }),
    tokens: {
        infoBg: 'token:info-bg',
        warningBg: 'token:warning-bg',
        errorBg: 'token:error-bg',
        criticalBg: 'token:critical-bg',
        textColor: 'token:text-on-alert',
    },
    accessibility: { role: 'alert', ariaLabel: 'Clinical alert', announceOnUpdate: true },
    states: {
        loading: 'AlertBannerLoading',
        error: 'AlertBannerError',
        empty: 'AlertBannerEmpty',
        ready: 'AlertBanner',
    },
    examples: [
        {
            intent: 'Show critical drug interaction alert',
            props: { severity: 'critical', title: 'Drug Interaction', message: 'Warfarin + Aspirin detected. Review immediately.', dismissible: false },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 7. PatientHeader
// ---------------------------------------------------------------------------

export const PatientHeader = defineComponent({
    name: 'PatientHeader',
    description: 'Patient identity banner with demographics, allergies, and care team.',
    category: 'clinical',
    tags: ['patient', 'header', 'identity', 'demographics'],
    props: z.object({
        patientId: z.string(),
        fullName: z.string(),
        dateOfBirth: z.string(),
        gender: z.enum(['male', 'female', 'other', 'unknown']),
        mrn: z.string(),
        allergies: z.array(z.string()).optional(),
        primaryProvider: z.string().optional(),
    }),
    tokens: {
        headerBg: 'token:header-bg',
        textPrimary: 'token:text-primary',
        allergyBadge: 'token:danger-bg',
    },
    accessibility: { role: 'banner', ariaLabel: 'Patient information header', announceOnUpdate: false },
    states: {
        loading: 'PatientHeaderLoading',
        error: 'PatientHeaderError',
        empty: 'PatientHeaderEmpty',
        ready: 'PatientHeader',
    },
    examples: [
        {
            intent: 'Show patient header',
            props: {
                patientId: '123e4567-e89b-12d3-a456-426614174000',
                fullName: 'Jane Doe',
                dateOfBirth: '1985-06-15',
                gender: 'female',
                mrn: 'MRN-0042',
                allergies: ['Penicillin', 'Latex'],
                primaryProvider: 'Dr. Sarah Chen',
            },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 8. ClinicalNote
// ---------------------------------------------------------------------------

export const ClinicalNote = defineComponent({
    name: 'ClinicalNote',
    description: 'Renders a clinical note with SOAP format sections and timestamp.',
    category: 'clinical',
    tags: ['note', 'soap', 'documentation', 'clinical', 'text'],
    props: z.object({
        noteId: z.string(),
        patientId: z.string(),
        authorName: z.string(),
        createdAt: z.string(),
        subjective: z.string().optional(),
        objective: z.string().optional(),
        assessment: z.string().optional(),
        plan: z.string().optional(),
        noteType: z.enum(['progress', 'admission', 'discharge', 'consultation']).optional(),
    }),
    tokens: {
        noteBg: 'token:card-bg',
        sectionHeader: 'token:text-secondary',
        timestamp: 'token:text-muted',
    },
    accessibility: { role: 'article', ariaLabel: 'Clinical note', announceOnUpdate: false },
    states: {
        loading: 'ClinicalNoteLoading',
        error: 'ClinicalNoteError',
        empty: 'ClinicalNoteEmpty',
        ready: 'ClinicalNote',
    },
    examples: [
        {
            intent: 'Show latest clinical note',
            props: {
                noteId: 'note-001',
                patientId: '123e4567-e89b-12d3-a456-426614174000',
                authorName: 'Dr. Sarah Chen',
                createdAt: '2026-02-19T14:30:00Z',
                subjective: 'Patient reports persistent chest pain, 3/10 severity.',
                objective: 'BP 130/85, HR 78, SpO2 97%.',
                assessment: 'Stable angina, well-controlled.',
                plan: 'Continue current regimen. Follow up in 2 weeks.',
                noteType: 'progress',
            },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 9. VitalsChart
// ---------------------------------------------------------------------------

export const VitalsChart = defineComponent({
    name: 'VitalsChart',
    description: 'Time-series chart of patient vitals with configurable metrics and range.',
    category: 'data-display',
    tags: ['chart', 'vitals', 'time-series', 'trends', 'visualization'],
    props: z.object({
        patientId: z.string(),
        metrics: z.array(z.enum(['heartRate', 'bloodPressure', 'temperature', 'oxygenSaturation', 'respiratoryRate'])),
        timeRange: z.enum(['24h', '7d', '30d', '90d']),
        showThresholds: z.boolean().optional(),
    }),
    tokens: {
        chartBg: 'token:chart-bg',
        lineColor: 'token:primary',
        thresholdColor: 'token:danger',
        gridColor: 'token:border-subtle',
    },
    accessibility: { role: 'img', ariaLabel: 'Patient vitals trend chart', announceOnUpdate: false },
    states: {
        loading: 'VitalsChartLoading',
        error: 'VitalsChartError',
        empty: 'VitalsChartEmpty',
        ready: 'VitalsChart',
    },
    examples: [
        {
            intent: 'Show heart rate trend over 7 days',
            props: { patientId: '123e4567-e89b-12d3-a456-426614174000', metrics: ['heartRate'], timeRange: '7d', showThresholds: true },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// 10. GenericCard
// ---------------------------------------------------------------------------

export const GenericCard = defineComponent({
    name: 'GenericCard',
    description: 'General-purpose card component for any structured content display.',
    category: 'data-display',
    tags: ['card', 'generic', 'layout', 'content'],
    props: z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        body: z.string().optional(),
        imageUrl: z.string().optional(),
        actionLabel: z.string().optional(),
        actionUrl: z.string().optional(),
        variant: z.enum(['default', 'outlined', 'elevated']).optional(),
    }),
    tokens: {
        cardBg: 'token:card-bg',
        titleColor: 'token:text-primary',
        subtitleColor: 'token:text-secondary',
        borderColor: 'token:border-default',
        shadowColor: 'token:shadow-md',
    },
    accessibility: { role: 'article', ariaLabel: 'Content card', announceOnUpdate: false },
    states: {
        loading: 'GenericCardLoading',
        error: 'GenericCardError',
        empty: 'GenericCardEmpty',
        ready: 'GenericCard',
    },
    examples: [
        {
            intent: 'Show information card',
            props: { title: 'System Status', subtitle: 'All services operational', body: 'Last checked: 2 minutes ago', variant: 'elevated' },
        },
    ],
    origin: { registryUrl: 'https://registry.enterstellar.dev', publisher: 'enterstellar-team' },
});

// ---------------------------------------------------------------------------
// All Example Components (Convenience Export)
// ---------------------------------------------------------------------------

/**
 * Array of all 10 example component contracts.
 * Ready to pass directly to `createRegistry({ components: allExampleComponents })`.
 */
export const allExampleComponents = [
    PatientVitals,
    MedicationList,
    DiagnosisSummary,
    LabResults,
    AppointmentCard,
    AlertBanner,
    PatientHeader,
    ClinicalNote,
    VitalsChart,
    GenericCard,
] as const;
