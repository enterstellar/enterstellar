/**
 * @module playground/enterstellar/domain-components/commerce
 * @description ARC Store — E-Commerce domain component contracts.
 *
 * **Components (6):**
 * 1. **ProductCatalog** — Product grid with pricing and stock status
 * 2. **OrderPipeline** — Order fulfillment pipeline tracker
 * 3. **InventoryTracker** — Inventory levels with reorder alerts
 * 4. **CustomerSegment** — Customer cohort analysis with LTV and churn risk
 * 5. **ShippingTracker** — Multi-carrier shipment tracking with milestones
 * 6. **ReturnsDashboard** — Returns analytics with reason codes and resolution rates
 *
 * These are **data-only contracts** — no React, no JSX (Design Choice R6).
 * Renderers live in `domain-renderers/commerce-renderers.tsx`.
 *
 * @see Bible §5.1 — defineComponent specification
 * @see implementation_plan.md §2.5.4 — Domain Scenes
 */

import { z } from 'zod';
import { defineComponent } from '@enterstellar-ai/registry';
// ---------------------------------------------------------------------------
// 1. ProductCatalog
// ---------------------------------------------------------------------------

/**
 * ProductCatalog — product grid with pricing and stock status.
 *
 * Displays a visual grid of e-commerce products including names, SKUs,
 * pricing in local currency, category taxonomy, and real-time inventory
 * status. Used on storefront category pages and search result listings.
 *
 * Inspired by Shopify's product grid and Amazon's catalog listing pages.
 */
export const ProductCatalog = defineComponent({
  name: 'ProductCatalog',
  description: 'Product catalog grid with images, pricing, stock status, and category badges.',
  category: 'data-display',
  tags: ['commerce', 'products', 'catalog', 'pricing', 'inventory'],
  props: z.object({
    title: z.string().min(1),
    products: z.array(z.object({
      name: z.string().min(1),
      sku: z.string().min(1),
      price: z.number().min(0),
      currency: z.string().default('USD'),
      category: z.string().min(1),
      stockStatus: z.enum(['in-stock', 'low-stock', 'out-of-stock']).default('in-stock'),
      stockCount: z.number().int().min(0),
    })).min(1),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent', success: 'token:success', danger: 'token:danger', warning: 'token:warning' },
  accessibility: { role: 'list', ariaLabel: 'Product catalog', announceOnUpdate: false },
  states: { loading: 'ProductCatalogLoading', error: 'ProductCatalogError', empty: 'ProductCatalogEmpty', ready: 'ProductCatalog' },
  examples: [{ intent: 'Show ARC Store product catalog', props: { title: 'Featured Products', products: [{ name: 'ARC Runner Pro', sku: 'ARC-RP-001', price: 189.99, currency: 'USD', category: 'Footwear', stockStatus: 'in-stock', stockCount: 342 }, { name: 'ARC Heritage Tee', sku: 'ARC-HT-012', price: 49.99, currency: 'USD', category: 'Apparel', stockStatus: 'low-stock', stockCount: 18 }] } }],
});
// ---------------------------------------------------------------------------
// 2. OrderPipeline
// ---------------------------------------------------------------------------

/**
 * OrderPipeline — order fulfillment pipeline tracker.
 *
 * Displays an aggregated view of e-commerce orders moving through fulfillment
 * stages (placed, processing, shipped, delivered) alongside a recent orders
 * ledger. Provides operations teams with a macro-level view of fulfillment
 * bottlenecks and daily processing volume.
 *
 * Inspired by ShipStation's order dashboard and Shopify's fulfillment views.
 */
export const OrderPipeline = defineComponent({
  name: 'OrderPipeline',
  description: 'Order fulfillment pipeline showing orders across stages from placed to delivered.',
  category: 'data-display',
  tags: ['commerce', 'orders', 'pipeline', 'fulfillment', 'shipping'],
  props: z.object({
    title: z.string().min(1),
    stages: z.array(z.object({
      name: z.string().min(1),
      count: z.number().int().min(0),
      value: z.number().min(0),
    })).min(1),
    recentOrders: z.array(z.object({
      orderId: z.string().min(1),
      customer: z.string().min(1),
      total: z.number().min(0),
      stage: z.string().min(1),
      date: z.string().min(1),
    })).optional(),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', accent: 'token:accent', success: 'token:success' },
  accessibility: { role: 'group', ariaLabel: 'Order pipeline', announceOnUpdate: false },
  states: { loading: 'OrderPipelineLoading', error: 'OrderPipelineError', empty: 'OrderPipelineEmpty', ready: 'OrderPipeline' },
  examples: [{ intent: 'Show order pipeline for ARC Store', props: { title: 'Order Pipeline', stages: [{ name: 'Placed', count: 45, value: 12400 }, { name: 'Processing', count: 28, value: 8200 }, { name: 'Shipped', count: 63, value: 18900 }, { name: 'Delivered', count: 412, value: 98500 }] } }],
});
// ---------------------------------------------------------------------------
// 3. InventoryTracker
// ---------------------------------------------------------------------------

/**
 * InventoryTracker — inventory levels with reorder alerts.
 *
 * Displays warehouse stock levels for individual SKUs, highlighting items
 * that have fallen below their calculated reorder threshold. Includes
 * daily sales velocity to help supply chain managers predict stockouts.
 *
 * Emulates the inventory management screens found in ERP systems like
 * NetSuite and inventory specialized tools like Stitch Labs.
 */
export const InventoryTracker = defineComponent({
  name: 'InventoryTracker',
  description: 'Inventory level tracker with reorder alerts and stock velocity metrics.',
  category: 'data-display',
  tags: ['commerce', 'inventory', 'stock', 'alerts', 'warehouse'],
  props: z.object({
    title: z.string().min(1),
    items: z.array(z.object({
      name: z.string().min(1),
      sku: z.string().min(1),
      currentStock: z.number().int().min(0),
      reorderPoint: z.number().int().min(0),
      dailyVelocity: z.number().min(0),
      status: z.enum(['healthy', 'reorder', 'critical', 'out-of-stock']),
    })).min(1),
    totalSku: z.number().int().min(0).optional(),
  }),
  tokens: { cardBg: 'token:card-bg', cardBorder: 'token:card-border', textPrimary: 'token:text-primary', textSecondary: 'token:text-secondary', success: 'token:success', danger: 'token:danger', warning: 'token:warning' },
  accessibility: { role: 'table', ariaLabel: 'Inventory tracker', announceOnUpdate: true },
  states: { loading: 'InventoryTrackerLoading', error: 'InventoryTrackerError', empty: 'InventoryTrackerEmpty', ready: 'InventoryTracker' },
  examples: [{ intent: 'Show inventory status for ARC Store warehouse', props: { title: 'Inventory Status', items: [{ name: 'ARC Runner Pro', sku: 'ARC-RP-001', currentStock: 342, reorderPoint: 100, dailyVelocity: 12.5, status: 'healthy' }, { name: 'ARC Heritage Tee', sku: 'ARC-HT-012', currentStock: 18, reorderPoint: 50, dailyVelocity: 8.3, status: 'critical' }], totalSku: 847 } }],
});

// ---------------------------------------------------------------------------
// 4. CustomerSegment
// ---------------------------------------------------------------------------

/**
 * CustomerSegment — customer cohort analysis with LTV and churn risk.
 *
 * Displays a customer segment card showing cohort metrics: lifetime value
 * (LTV), purchase frequency, average order value, churn risk score,
 * acquisition channel, and cohort size. Used by retention teams to
 * identify high-value segments and at-risk cohorts.
 *
 * Inspired by Shopify's Customer Segmentation, Klaviyo's RFM analysis,
 * and Amplitude's cohort explorer. Real e-commerce teams segment by
 * these exact dimensions to drive targeted campaigns.
 */
export const CustomerSegment = defineComponent({
  name: 'CustomerSegment',
  description: 'Customer cohort analysis card with LTV, purchase frequency, churn risk, and acquisition channel.',
  category: 'data-display',
  tags: ['commerce', 'customer', 'segment', 'cohort', 'retention'],
  props: z.object({
    segmentName: z.string().min(1),
    cohortSize: z.number().int().min(0),
    metrics: z.object({
      averageLtv: z.number().min(0),
      purchaseFrequency: z.number().min(0),
      averageOrderValue: z.number().min(0),
      churnRisk: z.number().min(0).max(100),
      retentionRate: z.number().min(0).max(100),
    }),
    acquisitionChannel: z.enum(['organic', 'paid-search', 'social', 'email', 'referral', 'direct']).optional(),
    trend: z.enum(['growing', 'stable', 'declining']),
    currency: z.string().default('USD'),
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
    role: 'region',
    ariaLabel: 'Customer segment',
    announceOnUpdate: false,
  },
  states: {
    loading: 'CustomerSegmentLoading',
    error: 'CustomerSegmentError',
    empty: 'CustomerSegmentEmpty',
    ready: 'CustomerSegment',
  },
  examples: [
    {
      intent: 'Show high-value customer segment analysis for ARC Store',
      props: {
        segmentName: 'Premium Loyalists',
        cohortSize: 2840,
        metrics: {
          averageLtv: 1247.00,
          purchaseFrequency: 4.2,
          averageOrderValue: 296.90,
          churnRisk: 12,
          retentionRate: 88,
        },
        acquisitionChannel: 'organic',
        trend: 'growing',
        currency: 'USD',
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 5. ShippingTracker
// ---------------------------------------------------------------------------

/**
 * ShippingTracker — multi-carrier shipment tracking with milestones.
 *
 * Displays a shipment's journey through fulfillment milestones: order
 * confirmed, picked, packed, shipped, in-transit, out-for-delivery,
 * delivered. Shows carrier name, tracking number, estimated delivery
 * date, and current location. Supports multiple carriers (UPS, FedEx,
 * USPS, DHL).
 *
 * Inspired by ShipStation, AfterShip, and Shopify's order tracking.
 * E-commerce ops teams use this exact milestone view for logistics
 * coordination and customer communication.
 */
export const ShippingTracker = defineComponent({
  name: 'ShippingTracker',
  description: 'Multi-carrier shipment tracker with fulfillment milestones, ETA, and current location.',
  category: 'data-display',
  tags: ['commerce', 'shipping', 'tracking', 'logistics', 'fulfillment'],
  props: z.object({
    orderId: z.string().min(1),
    carrier: z.string().min(1),
    trackingNumber: z.string(),
    estimatedDelivery: z.string(),
    currentLocation: z.string().optional(),
    milestones: z.array(z.object({
      stage: z.enum(['confirmed', 'picked', 'packed', 'shipped', 'in-transit', 'out-for-delivery', 'delivered', 'exception']),
      timestamp: z.string().min(1),
      location: z.string().optional(),
      completed: z.boolean(),
    })).min(1, 'At least one milestone is required.'),
    status: z.enum(['on-track', 'delayed', 'delivered', 'exception']),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    success: 'token:success',
    warning: 'token:warning',
    danger: 'token:danger',
    accent: 'token:accent',
  },
  accessibility: {
    role: 'progressbar',
    ariaLabel: 'Shipping tracker',
    announceOnUpdate: true,
  },
  states: {
    loading: 'ShippingTrackerLoading',
    error: 'ShippingTrackerError',
    empty: 'ShippingTrackerEmpty',
    ready: 'ShippingTracker',
  },
  examples: [
    {
      intent: 'Show shipment tracking for order ORD-8842',
      props: {
        orderId: 'ORD-8842',
        carrier: 'FedEx',
        trackingNumber: '7489 2103 8841',
        estimatedDelivery: '2024-03-18',
        currentLocation: 'Memphis, TN — FedEx Hub',
        milestones: [
          { stage: 'confirmed', timestamp: '2024-03-14T09:00:00Z', completed: true },
          { stage: 'picked', timestamp: '2024-03-14T14:30:00Z', location: 'Warehouse A', completed: true },
          { stage: 'packed', timestamp: '2024-03-14T16:45:00Z', location: 'Warehouse A', completed: true },
          { stage: 'shipped', timestamp: '2024-03-15T08:00:00Z', location: 'Portland, OR', completed: true },
          { stage: 'in-transit', timestamp: '2024-03-16T03:20:00Z', location: 'Memphis, TN', completed: true },
          { stage: 'out-for-delivery', timestamp: '', completed: false },
          { stage: 'delivered', timestamp: '', completed: false },
        ],
        status: 'on-track',
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// 6. ReturnsDashboard
// ---------------------------------------------------------------------------

/**
 * ReturnsDashboard — returns analytics with reason codes and resolution rates.
 *
 * Displays returns/refunds analytics showing volume by reason code
 * (defective, wrong-item, not-as-described, changed-mind, damaged,
 * late-delivery), resolution rates (refund, exchange, store-credit),
 * average processing time, and total refund amount.
 *
 * Every e-commerce ops team (Shopify, Amazon Seller Central, BigCommerce)
 * tracks exactly these metrics. High return rates by reason code drive
 * product quality investigations and supplier reviews.
 */
export const ReturnsDashboard = defineComponent({
  name: 'ReturnsDashboard',
  description: 'Returns analytics dashboard with reason codes, resolution rates, and refund totals.',
  category: 'data-display',
  tags: ['commerce', 'returns', 'refunds', 'analytics', 'operations'],
  props: z.object({
    title: z.string().min(1),
    period: z.string().min(1),
    totalReturns: z.number().int().min(0),
    totalRefundAmount: z.number().min(0),
    returnRate: z.number().min(0).max(100),
    averageProcessingDays: z.number().min(0),
    reasonBreakdown: z.array(z.object({
      reason: z.enum(['defective', 'wrong-item', 'not-as-described', 'changed-mind', 'damaged-in-transit', 'late-delivery', 'other']),
      count: z.number().int().min(0),
      percentage: z.number().min(0).max(100),
    })).min(1, 'At least one return reason is required.'),
    resolutionBreakdown: z.array(z.object({
      type: z.enum(['full-refund', 'partial-refund', 'exchange', 'store-credit', 'denied']),
      count: z.number().int().min(0),
      percentage: z.number().min(0).max(100),
    })).optional(),
    currency: z.string().default('USD'),
  }),
  tokens: {
    cardBg: 'token:card-bg',
    cardBorder: 'token:card-border',
    textPrimary: 'token:text-primary',
    textSecondary: 'token:text-secondary',
    danger: 'token:danger',
    warning: 'token:warning',
    accent: 'token:accent',
  },
  accessibility: {
    role: 'region',
    ariaLabel: 'Returns dashboard',
    announceOnUpdate: false,
  },
  states: {
    loading: 'ReturnsDashboardLoading',
    error: 'ReturnsDashboardError',
    empty: 'ReturnsDashboardEmpty',
    ready: 'ReturnsDashboard',
  },
  examples: [
    {
      intent: 'Show returns analytics for ARC Store this month',
      props: {
        title: 'Returns & Refunds',
        period: 'March 2024',
        totalReturns: 187,
        totalRefundAmount: 28450.00,
        returnRate: 3.4,
        averageProcessingDays: 2.8,
        reasonBreakdown: [
          { reason: 'changed-mind', count: 68, percentage: 36 },
          { reason: 'not-as-described', count: 42, percentage: 22 },
          { reason: 'defective', count: 31, percentage: 17 },
          { reason: 'damaged-in-transit', count: 28, percentage: 15 },
          { reason: 'wrong-item', count: 18, percentage: 10 },
        ],
        resolutionBreakdown: [
          { type: 'full-refund', count: 112, percentage: 60 },
          { type: 'exchange', count: 45, percentage: 24 },
          { type: 'store-credit', count: 22, percentage: 12 },
          { type: 'denied', count: 8, percentage: 4 },
        ],
        currency: 'USD',
      },
    },
  ],
});

/**
 * All ARC Store (Commerce) domain component contracts.
 *
 * Spread into the playground registry and system prompt manifest.
 */
export const commerceContracts = [
  ProductCatalog,
  OrderPipeline,
  InventoryTracker,
  CustomerSegment,
  ShippingTracker,
  ReturnsDashboard,
] as const;
