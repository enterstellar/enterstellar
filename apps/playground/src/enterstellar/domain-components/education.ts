/**
 * @module playground/enterstellar/domain-components/education
 * @description Cortex Learn — EdTech domain component contracts.
 *
 * **Components (6):**
 * 1. **CourseProgress** — Course completion tracker with module breakdown
 * 2. **StudentAnalytics** — Student performance analytics dashboard
 * 3. **AssessmentResults** — Assessment/quiz results with score breakdown
 * 4. **CurriculumMap** — Learning path with prerequisites and mastery levels
 * 5. **EngagementHeatmap** — Weekly engagement pattern by day and hour
 * 6. **CertificationTracker** — Professional certification progress with expiry dates
 *
 * These are **data-only contracts** — no React, no JSX (Design Choice R6).
 * Renderers live in `domain-renderers/education-renderers.tsx`.
 *
 * @see Bible §5.1 — defineComponent specification
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';
// ---------------------------------------------------------------------------
// 1. CourseProgress
// ---------------------------------------------------------------------------

/**
 * CourseProgress — course completion tracker with module breakdown.
 *
 * Displays a learner's progress through a specific course, including
 * an overall completion percentage, a list of modules with their current
 * status (completed, in-progress, locked), and estimated time remaining.
 *
 * Inspired by Coursera's syllabus view and Canvas LMS progress modules.
 */
export const CourseProgress = defineComponent({
  name: 'CourseProgress',
  description: 'Course completion tracker with module breakdown, completion percentage, and time-to-complete.',
  category: 'data-display',
  tags: ['education', 'course', 'progress', 'learning', 'modules'],
  props: z.object({
    courseName: z.string().min(1),
    instructor: z.string().min(1),
    completionPercentage: z.number().min(0).max(100),
    modules: z.array(z.object({
      name: z.string().min(1),
      status: z.enum(['completed', 'in-progress', 'locked', 'not-started']),
      durationMinutes: z.number().int().min(0),
    })).min(1),
    estimatedTimeRemaining: z.string().nullish(),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent', success: 'token:success' },
  accessibility: { role: 'progressbar', ariaLabel: 'Course progress', announceOnUpdate: true },
  states: { loading: 'CourseProgressLoading', error: 'CourseProgressError', empty: 'CourseProgressEmpty', ready: 'CourseProgress' },
  examples: [{ intent: 'Show progress for Machine Learning Fundamentals course', props: { courseName: 'Machine Learning Fundamentals', instructor: 'Dr. Priya Patel', completionPercentage: 68, modules: [{ name: 'Introduction to ML', status: 'completed', durationMinutes: 45 }, { name: 'Supervised Learning', status: 'completed', durationMinutes: 90 }, { name: 'Neural Networks', status: 'in-progress', durationMinutes: 120 }, { name: 'Deep Learning', status: 'locked', durationMinutes: 150 }], estimatedTimeRemaining: '4h 30m' } }],
});
// ---------------------------------------------------------------------------
// 2. StudentAnalytics
// ---------------------------------------------------------------------------

/**
 * StudentAnalytics — student performance analytics dashboard.
 *
 * Provides a holistic view of a learner's performance metrics including
 * GPA, courses completed vs enrolled, engagement score, and current
 * learning streak. Often used in student profiles or advisor dashboards.
 *
 * Inspired by Duolingo's streak tracking and corporate LMS analytics.
 */
export const StudentAnalytics = defineComponent({
  name: 'StudentAnalytics',
  description: 'Student performance analytics with GPA, course completion rate, engagement score, and streak.',
  category: 'data-display',
  tags: ['education', 'analytics', 'student', 'performance', 'metrics'],
  props: z.object({
    studentName: z.string().min(1),
    enrollmentDate: z.string().min(1),
    metrics: z.object({
      gpa: z.number().min(0).max(4),
      coursesCompleted: z.number().int().min(0),
      coursesEnrolled: z.number().int().min(0),
      engagementScore: z.number().min(0).max(100),
      currentStreak: z.number().int().min(0),
    }),
    recentGrades: z.array(z.object({
      course: z.string().min(1),
      grade: z.string().min(1),
      score: z.number().min(0).max(100),
    })).nullish(),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent', success: 'token:success' },
  accessibility: { role: 'region', ariaLabel: 'Student analytics', announceOnUpdate: false },
  states: { loading: 'StudentAnalyticsLoading', error: 'StudentAnalyticsError', empty: 'StudentAnalyticsEmpty', ready: 'StudentAnalytics' },
  examples: [{ intent: 'Show analytics for student Alex Torres', props: { studentName: 'Alex Torres', enrollmentDate: '2023-09-01', metrics: { gpa: 3.7, coursesCompleted: 8, coursesEnrolled: 12, engagementScore: 87, currentStreak: 14 }, recentGrades: [{ course: 'Data Structures', grade: 'A', score: 94 }, { course: 'Database Design', grade: 'B+', score: 88 }] } }],
});
// ---------------------------------------------------------------------------
// 3. AssessmentResults
// ---------------------------------------------------------------------------

/**
 * AssessmentResults — assessment/quiz results with score breakdown.
 *
 * Displays the outcome of a summative assessment. Shows the final score
 * vs the passing threshold, time taken, and a detailed breakdown of
 * performance across different educational sections or topics.
 *
 * Emulates grading views in prominent EdTech platforms like Blackboard.
 */
export const AssessmentResults = defineComponent({
  name: 'AssessmentResults',
  description: 'Assessment results card with overall score, time taken, question breakdown, and pass/fail status.',
  category: 'data-display',
  tags: ['education', 'assessment', 'quiz', 'results', 'grading'],
  props: z.object({
    assessmentName: z.string().min(1),
    courseName: z.string().min(1),
    score: z.number().min(0).max(100),
    passingScore: z.number().min(0).max(100),
    passed: z.boolean(),
    timeTaken: z.string().min(1),
    questionBreakdown: z.array(z.object({
      section: z.string().min(1),
      correct: z.number().int().min(0),
      total: z.number().int().min(1),
    })).nullish(),
    submittedAt: z.string().min(1),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', success: 'token:success', danger: 'token:danger' },
  accessibility: { role: 'region', ariaLabel: 'Assessment results', announceOnUpdate: true },
  states: { loading: 'AssessmentResultsLoading', error: 'AssessmentResultsError', empty: 'AssessmentResultsEmpty', ready: 'AssessmentResults' },
  examples: [{ intent: 'Show assessment results for Neural Networks quiz', props: { assessmentName: 'Neural Networks Mid-Term', courseName: 'Machine Learning Fundamentals', score: 92, passingScore: 70, passed: true, timeTaken: '42 minutes', questionBreakdown: [{ section: 'Theory', correct: 18, total: 20 }, { section: 'Implementation', correct: 14, total: 15 }, { section: 'Case Study', correct: 6, total: 8 }], submittedAt: '2024-03-15T14:30:00Z' } }],
});

// ---------------------------------------------------------------------------
// 4. CurriculumMap
// ---------------------------------------------------------------------------

/**
 * CurriculumMap — learning path with prerequisites and mastery levels.
 *
 * Renders a structured curriculum showing topics arranged as a learning
 * path with prerequisite dependencies ("must complete X before Y"),
 * mastery level per topic (novice, intermediate, proficient, expert),
 * estimated hours, and unlock conditions. Instructional designers use
 * this to visualize and communicate course architecture.
 *
 * Inspired by Canvas LMS course modules, Docebo's learning paths,
 * and Coursera's skill trees. Real L&D teams build prerequisite
 * chains to enforce pedagogical sequencing.
 */
export const CurriculumMap = defineComponent({
  name: 'CurriculumMap',
  description: 'Learning path curriculum map with prerequisite chains, mastery levels, and unlock conditions.',
  category: 'data-display',
  tags: ['education', 'curriculum', 'learning-path', 'prerequisites', 'mastery'],
  props: z.object({
    pathName: z.string().min(1),
    description: z.string().nullish(),
    totalHours: z.number().min(0),
    topics: z.array(z.object({
      name: z.string().min(1),
      mastery: z.enum(['novice', 'intermediate', 'proficient', 'expert', 'not-started']),
      estimatedHours: z.number().min(0),
      prerequisites: z.array(z.string()).nullish(),
      unlocked: z.boolean(),
      completedAt: z.string().nullish(),
    })).min(2, 'A curriculum requires at least two topics.'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    accent: 'token:accent',
    warning: 'token:warning',
  },
  accessibility: {
    role: 'list',
    ariaLabel: 'Curriculum map',
    announceOnUpdate: false,
  },
  states: {
    loading: 'CurriculumMapLoading',
    error: 'CurriculumMapError',
    empty: 'CurriculumMapEmpty',
    ready: 'CurriculumMap',
  },
  examples: [
    {
      intent: 'Show the Data Science learning path curriculum',
      props: {
        pathName: 'Data Science Specialization',
        description: 'Complete learning path from statistics fundamentals to production ML deployment.',
        totalHours: 120,
        topics: [
          { name: 'Statistics Fundamentals', mastery: 'proficient', estimatedHours: 20, unlocked: true, completedAt: '2024-02-15' },
          { name: 'Python for Data Science', mastery: 'proficient', estimatedHours: 25, prerequisites: ['Statistics Fundamentals'], unlocked: true, completedAt: '2024-03-01' },
          { name: 'Machine Learning', mastery: 'intermediate', estimatedHours: 30, prerequisites: ['Python for Data Science', 'Statistics Fundamentals'], unlocked: true },
          { name: 'Deep Learning', mastery: 'not-started', estimatedHours: 25, prerequisites: ['Machine Learning'], unlocked: false },
          { name: 'MLOps & Deployment', mastery: 'not-started', estimatedHours: 20, prerequisites: ['Deep Learning'], unlocked: false },
        ],
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 5. EngagementHeatmap
// ---------------------------------------------------------------------------

/**
 * EngagementHeatmap — weekly engagement pattern by day and hour.
 *
 * Renders a 7×24 grid showing learning activity intensity by day-of-week
 * and hour-of-day. Each cell has an intensity value (0–100) representing
 * normalized session activity. Includes aggregate metrics: total sessions,
 * average session duration, peak hour, and most active day.
 *
 * Inspired by GitHub's contribution graph, Duolingo's streak heatmap, and
 * Blackboard's engagement analytics. L&D teams use this to optimize
 * live session scheduling and identify participation patterns.
 */
export const EngagementHeatmap = defineComponent({
  name: 'EngagementHeatmap',
  description: 'Weekly engagement heatmap showing activity by day and hour with session metrics.',
  category: 'data-display',
  tags: ['education', 'engagement', 'heatmap', 'analytics', 'activity'],
  props: z.object({
    title: z.string().min(1),
    period: z.string().min(1),
    grid: z.array(z.object({
      day: z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
      hours: z.array(z.object({
        hour: z.number().int().min(0).max(23),
        intensity: z.number().min(0).max(100),
      })),
    })).min(1, 'At least one day of data is required.'),
    metrics: z.object({
      totalSessions: z.number().int().min(0),
      averageDurationMinutes: z.number().min(0),
      peakHour: z.string().min(1),
      mostActiveDay: z.string().min(1),
    }),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    accent: 'token:accent',
    success: 'token:success',
  },
  accessibility: {
    role: 'img',
    ariaLabel: 'Engagement heatmap',
    announceOnUpdate: false,
  },
  states: {
    loading: 'EngagementHeatmapLoading',
    error: 'EngagementHeatmapError',
    empty: 'EngagementHeatmapEmpty',
    ready: 'EngagementHeatmap',
  },
  examples: [
    {
      intent: 'Show weekly engagement heatmap for Cortex Learn',
      props: {
        title: 'Weekly Engagement',
        period: 'March 10–16, 2024',
        grid: [
          { day: 'Mon', hours: [{ hour: 9, intensity: 75 }, { hour: 10, intensity: 90 }, { hour: 14, intensity: 60 }, { hour: 20, intensity: 45 }] },
          { day: 'Tue', hours: [{ hour: 9, intensity: 80 }, { hour: 11, intensity: 85 }, { hour: 15, intensity: 50 }] },
          { day: 'Wed', hours: [{ hour: 10, intensity: 95 }, { hour: 14, intensity: 70 }, { hour: 19, intensity: 55 }] },
          { day: 'Thu', hours: [{ hour: 9, intensity: 65 }, { hour: 13, intensity: 40 }] },
          { day: 'Fri', hours: [{ hour: 10, intensity: 50 }, { hour: 16, intensity: 30 }] },
        ],
        metrics: {
          totalSessions: 342,
          averageDurationMinutes: 28.5,
          peakHour: '10:00 AM',
          mostActiveDay: 'Wednesday',
        },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 6. CertificationTracker
// ---------------------------------------------------------------------------

/**
 * CertificationTracker — professional certification progress with expiry dates.
 *
 * Displays professional certification or licensure status with requirement
 * checklist (exams passed, courses completed, continuing education hours
 * logged), earned date, expiry date, renewal deadline, and CEU/CPE
 * progress toward renewal. Supports multiple certifications per learner.
 *
 * Inspired by Credly's credential management, CompTIA's CertMaster, and
 * corporate compliance platforms (SAP Litmos, Cornerstone). HR/L&D teams
 * use this to track workforce certification compliance and flag expiring
 * credentials before they lapse.
 */
export const CertificationTracker = defineComponent({
  name: 'CertificationTracker',
  description: 'Professional certification tracker with requirements, expiry dates, and CEU renewal progress.',
  category: 'data-display',
  tags: ['education', 'certification', 'compliance', 'credentials', 'renewal'],
  props: z.object({
    certifications: z.array(z.object({
      name: z.string().min(1),
      issuer: z.string().min(1),
      status: z.enum(['active', 'expiring-soon', 'expired', 'in-progress', 'not-started']),
      earnedDate: z.string().nullish(),
      expiryDate: z.string().nullish(),
      requirements: z.array(z.object({
        description: z.string().min(1),
        completed: z.boolean(),
      })).min(1, 'At least one requirement is needed.'),
      ceuProgress: z.object({
        earned: z.number().min(0),
        required: z.number().min(0),
      }).nullish(),
    })).min(1, 'At least one certification is required.'),
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
    role: 'list',
    ariaLabel: 'Certification tracker',
    announceOnUpdate: true,
  },
  states: {
    loading: 'CertificationTrackerLoading',
    error: 'CertificationTrackerError',
    empty: 'CertificationTrackerEmpty',
    ready: 'CertificationTracker',
  },
  examples: [
    {
      intent: 'Show certification status for Alex Torres',
      props: {
        certifications: [
          {
            name: 'AWS Solutions Architect — Associate',
            issuer: 'Amazon Web Services',
            status: 'active',
            earnedDate: '2023-06-15',
            expiryDate: '2026-06-15',
            requirements: [
              { description: 'SAA-C03 Exam passed', completed: true },
              { description: '6 months hands-on experience', completed: true },
            ],
            ceuProgress: { earned: 15, required: 40 },
          },
          {
            name: 'Google Data Analytics Certificate',
            issuer: 'Google / Coursera',
            status: 'in-progress',
            requirements: [
              { description: 'Foundations of Data Science', completed: true },
              { description: 'Ask Questions to Make Data-Driven Decisions', completed: true },
              { description: 'Process Data from Dirty to Clean', completed: false },
              { description: 'Analyze Data to Answer Questions', completed: false },
              { description: 'Capstone Project', completed: false },
            ],
          },
        ],
      },
    },
  ],
});

/**
 * All Cortex Learn (Education) domain component contracts.
 *
 * Spread into the playground registry and system prompt manifest.
 */
export const educationContracts = [
  CourseProgress,
  StudentAnalytics,
  AssessmentResults,
  CurriculumMap,
  EngagementHeatmap,
  CertificationTracker,
] as const;
