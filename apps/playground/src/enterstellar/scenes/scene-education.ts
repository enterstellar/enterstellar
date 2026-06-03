/**
 * @module playground/enterstellar/scenes/scene-education
 * @description Cortex Learn — EdTech domain scene.
 *
 * A multi-zone education dashboard demonstrating Enterstellar's ability to render
 * a learning management interface. Uses the `education` theme
 * (warm orange + cream, friendly, approachable).
 *
 * **Fictional brand:** Cortex Learn
 * **Visual DNA:** Warm amber + cream, learning-focused, clean typography
 *
 * **Zones (4 required + 5 optional):**
 * 1. `course-progress` — CourseProgress with module breakdown (standard)
 * 2. `student-analytics` — StudentAnalytics with performance metrics (standard)
 * 3. `assessment-results` — AssessmentResults with score breakdown (standard)
 * 4. `metric-card` — MetricCard for enrollment or completion rate (compact)
 * 5. `alert-banner` — AlertBanner for upcoming deadlines (compact, optional)
 * 6. `activity-feed` — ActivityFeed for recent learning activity (standard, optional)
 * 7. `curriculum-map` — CurriculumMap with learning path and mastery levels (standard, optional)
 * 8. `engagement-heatmap` — EngagementHeatmap with daily activity grid (standard, optional)
 * 9. `certifications` — CertificationTracker with requirements and CEU progress (wide, optional)
 *
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import type { PlaygroundScene } from './types';

/**
 * Cortex Learn — EdTech learning management dashboard.
 *
 * Demonstrates Enterstellar rendering a comprehensive education platform with
 * course curriculum mapping, engagement heatmaps, robust assessment
 * analytics, and certification tracking — in a friendly, approachable aesthetic.
 */
export const sceneEducation: PlaygroundScene = {
  id: 'scene-education',
  name: 'Learning Dashboard',
  description: 'Cortex Learn — Course progress, analytics, and assessments',
  category: 'domain',
  theme: 'education',
  layout: 'grid-2col',
  zones: [
    {
      name: 'course-progress',
      position: { row: 1, col: 1 },
      expectedComponent: 'CourseProgress',
      intentHint: 'Show course progress with module breakdown and completion percentage',
      sizeHint: 'standard',
    },
    {
      name: 'student-analytics',
      position: { row: 1, col: 2 },
      expectedComponent: 'StudentAnalytics',
      intentHint: 'Show student performance analytics with GPA, engagement, and streak',
      sizeHint: 'standard',
    },
    {
      name: 'assessment-results',
      position: { row: 2, col: 1 },
      expectedComponent: 'AssessmentResults',
      intentHint: 'Show recent assessment results with score breakdown by section',
      sizeHint: 'standard',
    },
    {
      name: 'metric-card',
      position: { row: 2, col: 2 },
      expectedComponent: 'MetricCard',
      intentHint: 'Show enrollment count or platform-wide completion rate',
      sizeHint: 'compact',
    },
    {
      name: 'alert-banner',
      position: { row: 3, col: 1 },
      expectedComponent: 'AlertBanner',
      intentHint: 'Show an upcoming assignment deadline or course update notification',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'activity-feed',
      position: { row: 3, col: 2 },
      expectedComponent: 'ActivityFeed',
      intentHint: 'Show recent learning activities: submissions, grades, discussions',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'curriculum-map',
      position: { row: 4, col: 1 },
      expectedComponent: 'CurriculumMap',
      intentHint: 'Show the learning path with topic progression, mastery badges, and prerequisites',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'engagement-heatmap',
      position: { row: 4, col: 2 },
      expectedComponent: 'EngagementHeatmap',
      intentHint: 'Show a weekly engagement heatmap with hourly activity intensity',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'certifications',
      position: { row: 5, col: 1, span: 2 },
      expectedComponent: 'CertificationTracker',
      intentHint: 'Show certification progress with requirement checklists and CEU tracking',
      sizeHint: 'wide',
      optional: true,
    },
  ],
  suggestedIntents: [
    'Show me a learning dashboard for Cortex Learn with course progress and analytics',
    'Display a student performance overview with recent grades and engagement',
    'Build an education platform dashboard with assessments and course tracking',
  ],
};
