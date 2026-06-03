/**
 * @module playground/enterstellar/domain-renderers
 * @description Barrel export for all domain-specific component renderers.
 *
 * Each domain's registration function is idempotent — safe to call
 * multiple times. Call `registerAllDomainRenderers()` at the app
 * entry point alongside `registerPlaygroundRenderers()`.
 *
 * @see implementation_plan.md §2.3 — Domain Component Expansion
 */

import { registerFinanceRenderers } from './finance-renderers';
import { registerMedicalRenderers } from './medical-renderers';
import { registerCommerceRenderers } from './commerce-renderers';
import { registerSaasRenderers } from './saas-renderers';
import { registerEducationRenderers } from './education-renderers';

export {
  registerFinanceRenderers,
  registerMedicalRenderers,
  registerCommerceRenderers,
  registerSaasRenderers,
  registerEducationRenderers,
};

/**
 * Registers all domain-specific component renderers (30 total: 6 per domain).
 *
 * Convenience function that calls each domain's registration function.
 * Idempotent — safe to call multiple times.
 *
 * @example
 * ```ts
 * import { registerAllDomainRenderers } from '@/enterstellar/domain-renderers';
 * registerAllDomainRenderers();
 * ```
 */
export function registerAllDomainRenderers(): void {
  registerFinanceRenderers();
  registerMedicalRenderers();
  registerCommerceRenderers();
  registerSaasRenderers();
  registerEducationRenderers();
}
