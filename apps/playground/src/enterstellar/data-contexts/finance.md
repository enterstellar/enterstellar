---
domain: Financial Services
brand: Meridian Pay
currentDate: 2026-04-14
currency: USD
---

# Meridian Pay — Enterprise Data Context

Use this dataset as your absolute ground truth. Generate component props that reflect this data accurately and comprehensively. Do not hallucinate data. If a component (like a ledger or a chart) supports it, you should saturate it with dense data from the lists below to demonstrate enterprise scale.

## 1. Corporate Treasury Overview

- **Today's Date**: April 14, 2026
- **Current Balance**: $14,250,900.00
- **Total Revenue (Q2 to Date)**: $4,102,500.00 (Up 12.4% from Q1)
- **Active Accounts**: 12,405 Corporate, 85,200 Consumer
- **Burn Rate**: $850,000/month
- **Runway**: 16.7 months
- **Liquidity Ratio**: 2.4

### Revenue Breakdown (YTD)

- **Payment Processing Fees**: $1,846,125.00 (45%)
- **Subscription Services**: $1,230,750.00 (30%)
- **FX Spread / Interchange**: $615,375.00 (15%)
- **Hardware Leases (POS terminals)**: $410,250.00 (10%)

### Trailing 12-Month Revenue History

| Month   | Gross Volume | Net Revenue     | Growth                      |
| ------- | ------------ | --------------- | --------------------------- |
| 2025-05 | $85,000,000  | $1,200,500      | +2.1%                       |
| 2025-06 | $88,500,000  | $1,250,000      | +4.1%                       |
| 2025-07 | $84,200,000  | $1,190,000      | -4.8%                       |
| 2025-08 | $92,000,000  | $1,300,000      | +9.2%                       |
| 2025-09 | $96,500,000  | $1,365,000      | +5.0%                       |
| 2025-10 | $105,000,000 | $1,480,000      | +8.4%                       |
| 2025-11 | $145,000,000 | $2,100,000      | +41.8% (Holiday Peak)       |
| 2025-12 | $160,000,000 | $2,350,000      | +11.9% (Holiday Peak)       |
| 2026-01 | $90,000,000  | $1,280,000      | -45.5% (Post-Holiday Curve) |
| 2026-02 | $98,000,000  | $1,410,000      | +10.1%                      |
| 2026-03 | $110,000,000 | $1,550,000      | +9.9%                       |
| 2026-04 | To Date      | $4,102,500 (Q2) | N/A                         |

## 2. Compliance & Regulatory Center

1. **[CRITICAL] GDPR Cross-Border Data Audit**
   - Regulation: GDPR Art. 46 / Standard Contractual Clauses (SCC)
   - Deadline: April 25, 2026
   - Exposure Risk: Up to €20M or 4% of Global Revenue.
   - Message: Urgent: 15 cross-border transfer agreements need EU SCC addendum signatures. Operations to Frankfurt data center may be halted if non-compliant.
2. **[WARNING] FinCEN SAR Filing Backlog**
   - Regulation: Bank Secrecy Act / AML
   - Deadline: April 18, 2026
   - Exposure Risk: $250k fine per incident.
   - Message: 24 Suspicious Activity Reports (SARs) are pending final compliance officer sign-off from the weekend batch.
3. **[WARNING] KYC Refresh Batch**
   - Regulation: FinCEN AML/KYC
   - Deadline: May 01, 2026
   - Message: 342 high-risk merchant accounts require updated UBO (Ultimate Beneficial Owner) declarations.
4. **[INFO] SOC2 Type II Preparation**
   - Regulation: AICPA SOC2
   - Message: Evidence collection for Q2 controls testing begins next week. Please review logical access logs and SSH key rotations.

## 3. Transaction Ledger (Last 48 Hours)

Ensure ledger components render densely using these rows.
| Date/Time | ID | Counterparty | Type | Amount | Status | Category | Description |
|---|---|---|---|---|---|---|---|
| `2026-04-14 11:22:00` | TXN-9950 | ACME Supply Co | credit | 15,200.00 | completed | B2B Invoice | Settlement Inv-0414 |
| `2026-04-14 10:45:10` | TXN-9949 | GCP Cloud Services | debit | 12,450.00 | completed | Infrastructure | Server infrastructure March |
| `2026-04-14 10:15:00` | TXN-9948 | Stripe Payout | credit | 145,900.50 | completed | Settlement | T+2 batch settlement |
| `2026-04-14 09:30:22` | TXN-9947 | Global Logistics Inc | debit | 88,200.00 | pending | Wire Transfer | International Freight |
| `2026-04-14 09:12:00` | TXN-9946 | Zenith Partners | debit | 250,000.00 | reversed | Escrow | Escrow deposit failure, insufficient funds |
| `2026-04-14 08:05:44` | TXN-9945 | Vertex SaaS | credit | 9,500.00 | completed | Software | Annual License Fee |
| `2026-04-13 18:20:00` | TXN-9944 | State Tax Board | debit | 112,040.00 | completed | Taxation | Q1 Estimated Corporate Tax |
| `2026-04-13 16:45:12` | TXN-9943 | Radiant Marketing | debit | 45,000.00 | pending | Marketing | Q2 Ad Placement Retainer |
| `2026-04-13 15:30:00` | TXN-9942 | Horizon Real Estate | debit | 18,500.00 | completed | Lease | NYC HQ Office Lease (April) |
| `2026-04-13 14:10:00` | TXN-9941 | Oracle Corporation | debit | 32,150.00 | completed | Software | DB Storage overages |
| `2026-04-13 12:05:00` | TXN-9940 | E-Com Partners LLC | credit | 68,400.00 | completed | Revenue | Tier 2 Payout |
| `2026-04-13 11:22:00` | TXN-9939 | Salary/Payroll Batch | debit | 345,000.00 | completed | Payroll | Bi-weekly employee payroll |
| `2026-04-13 10:08:44` | TXN-9938 | ADP Fees | debit | 1,250.00 | completed | Operations | Payroll processing fee |
| `2026-04-13 09:15:00` | TXN-9937 | Nexus CRM | debit | 8,400.00 | completed | Software | Monthly core platform |
| `2026-04-12 17:30:00` | TXN-9936 | Angel Invest Co | credit | 2,500,000.00 | completed | Capital | Series B Bridge round draw |
| `2026-04-12 15:40:00` | TXN-9935 | WeWork | debit | 4,200.00 | completed | Lease | SF satellite office |

## 4. Risk Assessment Scorecards

### Evaluation Target: TXN-9947 (Global Logistics Inc — Wire Transfer)

- **Evaluated**: 2026-04-14 09:30:25 UTC
- **Overall Score**: 82/100 (High Risk)
- **Risk Level**: HIGH
- **Recommendation**: BLOCK & ESCALATE
- **Factors**:
  1. **Velocity/Frequency**: Score 95% (Weight: 20%) | FAIL | 3rd large transfer to this locale in 24h.
  2. **Geo-Location**: Score 88% (Weight: 40%) | WARN | Destination bank in FATF heavily monitored jurisdiction (Country Code: CY).
  3. **Account Age**: Score 12% (Weight: 10%) | PASS | Originating account is 5 years old.
  4. **Amount Deviation**: Score 75% (Weight: 30%) | WARN | 300% larger than 30-day average.

### Evaluation Target: TXN-9943 (Radiant Marketing)

- **Evaluated**: 2026-04-13 16:45:15 UTC
- **Overall Score**: 42/100 (Medium Risk)
- **Risk Level**: MEDIUM
- **Recommendation**: FLAG FOR REVIEW
- **Factors**:
  1. Amount Deviation: Score 65% (Weight 40%) | WARN | Higher than historical media spends.
  2. Velocity/Frequency: Score 15% (Weight 20%) | PASS | Rare transaction.
  3. Geo-Location: Score 10% (Weight 40%) | PASS | Domestic US transfer.

### Evaluation Target: TXN-9950 (ACME Supply Co)

- **Evaluated**: 2026-04-14 11:22:05 UTC
- **Overall Score**: 12/100 (Low Risk)
- **Risk Level**: LOW
- **Recommendation**: APPROVE
- **Factors**:
  1. Amount Deviation: Score 10% (Weight 40%) | PASS | Within normal variance.
  2. Counterparty History: Score 5% (Weight 60%) | PASS | Trusted vendor since 2022 (Over 40 payments clear).

## 5. Cash Flow Forecast (Next 12 Months)

| Period  | Label    | Projected Inflow | Projected Outflow | Expected Net                |
| ------- | -------- | ---------------- | ----------------- | --------------------------- |
| 2026-05 | May 2026 | $2,100,000       | $1,850,000        | +$250,000                   |
| 2026-06 | Jun 2026 | $2,250,000       | $1,900,000        | +$350,000                   |
| 2026-07 | Jul 2026 | $1,900,000       | $2,500,000        | -$600,000 (Tax Month)       |
| 2026-08 | Aug 2026 | $2,400,000       | $1,850,000        | +$550,000                   |
| 2026-09 | Sep 2026 | $2,600,000       | $1,900,000        | +$700,000                   |
| 2026-10 | Oct 2026 | $2,800,000       | $2,100,000        | +$700,000                   |
| 2026-11 | Nov 2026 | $4,500,000       | $2,200,000        | +$2,300,000 (Holiday Scale) |
| 2026-12 | Dec 2026 | $5,100,000       | $2,400,000        | +$2,700,000 (Holiday Scale) |
| 2027-01 | Jan 2027 | $2,000,000       | $2,100,000        | -$100,000 (Post-Holiday)    |
| 2027-02 | Feb 2027 | $2,150,000       | $1,950,000        | +$200,000                   |
| 2027-03 | Mar 2027 | $2,300,000       | $1,950,000        | +$350,000                   |
| 2027-04 | Apr 2027 | $2,400,000       | $2,500,000        | -$100,000 (Tax Month)       |

## 6. Tiered Fee Schedule (Current Contract)

- **Current Monthly Volume**: 145,200 transactions
- **Estimated Monthly Cost**: $27,588.00

| Tier Name    | Volume Min | Volume Max | Rate (BPS/Pct) | Flat Fee | Note                           |
| ------------ | ---------- | ---------- | -------------- | -------- | ------------------------------ |
| Starter      | 0          | 10,000     | 2.90%          | $0.30    | No dedicated support           |
| Professional | 10,001     | 50,000     | 2.50%          | $0.25    | Includes standard reporting    |
| Enterprise   | 50,001     | 250,000    | 1.90%          | $0.15    | **(CURRENT TIER)** + Custom AM |
| Custom       | 250,001    | Unlimited  | 1.10%          | $0.05    | Negotiated directly            |
