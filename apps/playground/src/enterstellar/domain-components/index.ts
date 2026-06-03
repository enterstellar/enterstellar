/**
 * @module playground/enterstellar/domain-components
 * @description Barrel export for all domain-specific component contracts.
 *
 * 30 components across 5 domains (6 per domain).
 *
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

export {
  financeContracts,
  TransactionLedger,
  RevenueChart,
  ComplianceAlert,
  RiskScorecard,
  CashFlowForecast,
  FeeSchedule,
} from './finance';

export {
  medicalContracts,
  PatientTimeline,
  VitalsMonitor,
  ClinicalAlert,
  MedicationSchedule,
  LabResultsPanel,
  CareTeamRoster,
} from './medical';

export {
  commerceContracts,
  ProductCatalog,
  OrderPipeline,
  InventoryTracker,
  CustomerSegment,
  ShippingTracker,
  ReturnsDashboard,
} from './commerce';

export {
  saasContracts,
  PipelineBoard,
  DealCard,
  ActivityTimeline,
  ForecastGauge,
  LeadScoreMatrix,
  IntegrationStatus,
} from './saas';

export {
  educationContracts,
  CourseProgress,
  StudentAnalytics,
  AssessmentResults,
  CurriculumMap,
  EngagementHeatmap,
  CertificationTracker,
} from './education';
