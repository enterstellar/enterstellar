---
domain: E-Commerce Operations
brand: ARC Store
currentDate: 2026-04-14
---

# ARC Store — Enterprise Data Context

Use this dataset as your absolute ground truth. Generate component props that reflect this data accurately and comprehensively. Do not hallucinate data. If a component (like an order pipeline or inventory tracker) supports it, you should saturate it with dense data from the lists below to demonstrate enterprise scale.

## 1. Store Overview & Revenues

- **Today's Revenue**: $42,850.00 (Run Rate: $1.2M/mo)
- **Average Order Value (AOV)**: $145.20
- **Total Orders (Today)**: 295
- **Conversion Rate**: 3.2% (Up 0.4% MoM)
- **Cart Abandonment**: 68% (Recovered: 12%)
- **Active Promotions**: SPRING20 (20% off apparel, usage: 45 times today), FREESHIP (Orders > $100)

## 2. Comprehensive Inventory Tracker

Ensure inventory tables render densely using these rows.
| SKU | Product Name | Category | Current Stock | Reorder Point | Velocity (Units/Wk) | Status | Last Restock |
|---|---|---|---|---|---|---|---|
| ARC-APP-001 | Apex Performance Jacket | Apparel | 12 | 50 | 45 | critical | 2026-03-10 |
| ARC-APP-002 | Summit Rain Shell | Apparel | 340 | 100 | 55 | healthy | 2026-04-01 |
| ARC-APP-023 | Merino Base Layer (M) | Apparel | 850 | 200 | 110 | healthy | 2026-04-05 |
| ARC-APP-024 | Merino Base Layer (L) | Apparel | 14 | 100 | 85 | reorder | 2026-03-15 |
| ARC-EQP-033 | Ultralight 2P Tent | Equipment | 45 | 50 | 15 | reorder | 2026-02-28 |
| ARC-EQP-044 | Titanium Trekking Poles | Equipment | 240 | 100 | 25 | healthy | 2026-03-20 |
| ARC-EQP-045 | Expedition Backpack 65L | Equipment | 115 | 75 | 30 | healthy | 2026-04-02 |
| ARC-EQP-050 | LED Headlamp 400 Lumens| Equipment | 560 | 200 | 140 | healthy | 2026-04-10 |
| ARC-FTW-088 | Trail Runner V2 | Footwear | 120 | 150 | 60 | reorder | 2026-03-22 |
| ARC-FTW-092 | Trailblazer Pro Boots | Footwear | 5 | 20 | 18 | critical | 2026-01-15 |
| ARC-FTW-095 | Alpine Approach Shoes | Footwear | 310 | 100 | 40 | healthy | 2026-04-08 |
| ARC-ACC-112 | Summit Hydration Pack | Accessories | 0 | 30 | 50 | out-of-stock | N/A |
| ARC-ACC-115 | Polarized Sunglasses | Accessories | 88 | 50 | 22 | healthy | 2026-03-30 |
| ARC-ACC-118 | Merino Wool Beanie | Accessories | 410 | 100 | 15 | healthy | 2025-11-15 |

## 3. Order Fulfillment Pipeline (Live Snapshot)

| Stage                 | Volume | Avg Time | Oldest Order          | Action Required             |
| --------------------- | ------ | -------- | --------------------- | --------------------------- |
| Checkout / Payment    | 14     | < 5 mins | -                     | None                        |
| Pending Verification  | 45     | 1.2 hrs  | ORD-7710 (Fraud Hold) | Review 3 high-risk IPS      |
| Processing (Pick)     | 120    | 4.5 hrs  | ORD-7601 (Delayed)    | Expedite Zone B picking     |
| Packaging (Pack)      | 85     | 1.5 hrs  | ORD-7688              | None                        |
| Ready for Carrier     | 110    | 3.0 hrs  | ORD-7505              | Print manifest for FedEx PM |
| In Transit            | 310    | 2.4 days | ORD-6099              | Monitor weather delays      |
| Out for Delivery      | 84     | -        | -                     | None                        |
| Delivered (Last 24h)  | 180    | -        | -                     | Trigger review emails       |
| Exceptions (Hold/RTS) | 5      | 5.0 days | ORD-5501 (Bad Addr)   | Contact customers           |

## 4. Active Shipping Tracker (High-Value / Exception Orders)

| Order ID | Customer   | Destination  | Carrier | Service        | Milestone / Status | ETA         |
| -------- | ---------- | ------------ | ------- | -------------- | ------------------ | ----------- |
| ORD-7781 | M. Davis   | Seattle, WA  | FedEx   | 2-Day Priority | out-for-delivery   | Today 14:00 |
| ORD-7782 | S. Patel   | Austin, TX   | UPS     | Ground         | in-transit         | Apr 16      |
| ORD-7783 | J. Schmidt | Munich, DE   | DHL     | Express Int'l  | delayed            | Apr 18      |
| ORD-7784 | R. Chen    | New York, NY | USPS    | Priority       | exception          | Unknown     |
| ORD-7785 | L. Gomez   | Denver, CO   | FedEx   | Overnight      | shipped            | Tomorrow    |
| ORD-7786 | K. O'Hara  | Chicago, IL  | UPS     | 2nd Day Air    | in-transit         | Apr 15      |
| ORD-7787 | B. King    | Boston, MA   | FedEx   | Ground         | exception          | Hold at Hub |

## 5. Customer Segmentation (Q1 Cohort Analysis)

| Segment Name           | Cohort Size | Avg LTV | Churn Risk     | Acquisition Cost (CAC) | Primary Channel | Next Best Action            |
| ---------------------- | ----------- | ------- | -------------- | ---------------------- | --------------- | --------------------------- |
| High-Value Enthusiasts | 4,200       | $1,250  | Low (5%)       | $45.00                 | Organic Search  | VIP Early Access Invites    |
| Seasonal Shoppers      | 12,500      | $210    | High (45%)     | $18.50                 | Instagram Ads   | Retargeting 20% Promo       |
| Discount Deal Hunters  | 22,000      | $95     | Critical (70%) | $30.00                 | Affiliate/Promo | Upsell complementary gear   |
| Brand Loyalists        | 3,100       | $2,800  | Very Low (2%)  | $65.00                 | Direct/Referral | Referral program double pts |
| One-Time Gift Buyers   | 18,500      | $115    | High (80%)     | $15.00                 | Google Shopping | Holiday capture campaigns   |

## 6. Returns Dashboard (Last 30 Days)

- **Total RMAs (Returned Merchandise Auth)**: 450
- **Overall Return Rate**: 5.2% (Target < 8.0%)
- **Pending Refunds Liquid Value**: $12,400.00
- **Average Time to Refund**: 1.2 days
- **Exchanges vs Refunds**: 30% opted for exchange, 70% refund.
- **Processing Backlog**: 45 items waiting inspection at warehouse dock.

### Return Reason Codes & Product Quality Metrics

| Reason Code      | Proportion | Top Affected Sub-Category | Actionable Insight                                                         |
| ---------------- | ---------- | ------------------------- | -------------------------------------------------------------------------- |
| not-as-described | 45%        | Apparel (Jackets)         | Update sizing charts on FTW/APP division. Run true-to-size survey.         |
| changed-mind     | 28%        | Accessories (Sunglasses)  | Standard buyer's remorse. Improve 3D product viewing.                      |
| defective        | 12%        | Equipment (Tents)         | [FLAG] Investigate ARC-EQP-033 Ultralight poles snapping. Pull from floor. |
| late-delivery    | 10%        | Assorted                  | Carrier SLA failure (FedEx Ground US Midwest corridor).                    |
| wrong-item       | 5%         | Footwear                  | Warehouse picking error in Zone C. Retrain staff on SKU prefixes.          |

## 7. Recent Operational Activity Feed

- `10:15 AM`: [Merchandising] Promoted "Sprint Running Shoes" to front page hero slot.
- `09:45 AM`: [Warehouse] Received inbound re-stock shipment of 500 units for ARC-APP-001. Dock doors 4.
- `09:30 AM`: [Support] Issued manual refund for ORD-7550 ($210.00) due to defective item claim.
- `09:05 AM`: [Logistics] FedEx daily trailer dispatched with 240 packages.
- `08:30 AM`: [Fraud] Checkpoint Auto-cancelled ORD-7790 due to high-risk IP score from known proxy subnet.
- `08:15 AM`: [System] Nightly order batch sync to NetSuite ERP completed successfully (1,450 records).
