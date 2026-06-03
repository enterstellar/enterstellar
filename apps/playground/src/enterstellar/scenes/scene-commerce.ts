/**
 * @module playground/enterstellar/scenes/scene-commerce
 * @description ARC Store — E-Commerce domain scene.
 *
 * A multi-zone e-commerce operations dashboard demonstrating Enterstellar's ability
 * to render a retail management interface. Uses the `commerce` theme
 * (bold black + white, editorial, product-focused).
 *
 * **Fictional brand:** ARC Store
 * **Visual DNA:** Dark charcoal + neon orange, bold typography, sport aesthetic
 *
 * **Zones (4 required + 5 optional):**
 * 1. `product-catalog` — ProductCatalog with product grid (wide)
 * 2. `order-pipeline` — OrderPipeline showing fulfillment stages (standard)
 * 3. `inventory-tracker` — InventoryTracker with stock levels (standard)
 * 4. `revenue-metric` — MetricCard showing daily revenue (compact)
 * 5. `alert-banner` — AlertBanner for inventory alerts (compact, optional)
 * 6. `activity-feed` — ActivityFeed for recent orders (standard, optional)
 * 7. `customer-segment` — CustomerSegment with LTV and churn analysis (standard, optional)
 * 8. `shipping-tracker` — ShippingTracker with fulfillment milestones (standard, optional)
 * 9. `returns-dashboard` — ReturnsDashboard with reason codes and resolution rates (wide, optional)
 *
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import type { PlaygroundScene } from './types';

/**
 * ARC Store — E-Commerce operations dashboard.
 *
 * Demonstrates Enterstellar rendering a complex retail management interface:
 * customer segments, fulfillment pipelines, shipping trackers, and
 * return dashboards — showcasing diverse, domain-rich visualization categories.
 */
export const sceneCommerce: PlaygroundScene = {
  id: 'scene-commerce',
  name: 'E-Commerce Dashboard',
  description: 'ARC Store — Products, orders, and inventory management',
  category: 'domain',
  theme: 'commerce',
  layout: 'grid-2col',
  zones: [
    {
      name: 'product-catalog',
      position: { row: 1, col: 1, span: 2 },
      expectedComponent: 'ProductCatalog',
      intentHint: 'Show featured products with pricing and stock status',
      sizeHint: 'wide',
    },
    {
      name: 'order-pipeline',
      position: { row: 2, col: 1 },
      expectedComponent: 'OrderPipeline',
      intentHint: 'Show order fulfillment pipeline from placed to delivered',
      sizeHint: 'standard',
    },
    {
      name: 'inventory-tracker',
      position: { row: 2, col: 2 },
      expectedComponent: 'InventoryTracker',
      intentHint: 'Show inventory levels with reorder alerts and stock velocity',
      sizeHint: 'standard',
    },
    {
      name: 'revenue-metric',
      position: { row: 3, col: 1 },
      expectedComponent: 'MetricCard',
      intentHint: 'Show daily revenue or average order value',
      sizeHint: 'compact',
    },
    {
      name: 'alert-banner',
      position: { row: 3, col: 2 },
      expectedComponent: 'AlertBanner',
      intentHint: 'Show a low-stock or shipping delay alert',
      sizeHint: 'compact',
      optional: true,
    },
    {
      name: 'activity-feed',
      position: { row: 4, col: 1, span: 2 },
      expectedComponent: 'ActivityFeed',
      intentHint: 'Show recent customer orders and fulfillment events',
      sizeHint: 'wide',
      optional: true,
    },
    {
      name: 'customer-segment',
      position: { row: 5, col: 1 },
      expectedComponent: 'CustomerSegment',
      intentHint: 'Show customer cohort analysis with LTV, churn risk, and acquisition channel',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'shipping-tracker',
      position: { row: 5, col: 2 },
      expectedComponent: 'ShippingTracker',
      intentHint: 'Show shipment tracking with carrier milestones and delivery ETA',
      sizeHint: 'standard',
      optional: true,
    },
    {
      name: 'returns-dashboard',
      position: { row: 6, col: 1, span: 2 },
      expectedComponent: 'ReturnsDashboard',
      intentHint: 'Show returns analytics with reason codes, resolution rates, and refund totals',
      sizeHint: 'wide',
      optional: true,
    },
  ],
  suggestedIntents: [
    'Show me an e-commerce dashboard for ARC Store with products, orders, and inventory',
    'Display a storefront operations overview with stock alerts',
    'Build a retail management dashboard with fulfillment pipeline',
  ],
};
