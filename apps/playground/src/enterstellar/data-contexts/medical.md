---
domain: Healthcare & Clinical Monitoring
brand: VitalSync
currentDate: 2026-04-14T10:30:00Z
---

# VitalSync — Enterprise Data Context

Use this dataset as your absolute ground truth. Generate component props that reflect this data accurately and comprehensively. Do not hallucinate data. If a component (like a timeline or lab panel) supports it, you should saturate it with dense data from the lists below to demonstrate enterprise scale.

## 1. Primary Patient Profile

- **Name**: Marcus Chen
- **MRN**: MRN-8842-1109
- **Age/Gender**: 58 / M
- **Height/Weight**: 175 cm / 88 kg (BMI: 28.7)
- **Admitted**: 2026-04-12 08:00:00Z
- **Primary Diagnosis**: Coronary Artery Disease; Post-Op CABG (Coronary Artery Bypass Graft) day 2.
- **Secondary Diagnoses**: Type 2 Diabetes Mellitus, Essential Hypertension, Hyperlipidemia.
- **Code Status**: Full Code
- **Allergies**: Penicillin (Hives, Anaphylaxis), Latex (Contact Dermatitis)

## 2. Current Vitals (ICU Bed 04)

_Recorded at: 2026-04-14 10:15:00Z_

- **Heart Rate (HR)**: 92 bpm (Sinus Rhythm, stable. Past 24h range: 84 - 110)
- **Blood Pressure (NIBP)**: 138/84 mmHg (MAP: 102. Past 24h range: 110/70 - 145/90)
- **SpO2**: 96% (on 2L Nasal Cannula. Past 24h range: 93% - 99%)
- **Respiratory Rate (RR)**: 18 breaths/min (Past 24h range: 14 - 24)
- **Temperature**: 37.4 °C (Oral. Past 24h range: 36.8 - 38.1)
- **Pain Score**: 4/10 (Incisional pain)

## 3. Clinical Alerts

1. **[CRITICAL] Medication Interaction Detected**
   - Alert: Severe risk of bleeding.
   - Details: Concurrent use of Warfarin (prescribed for post-op AFib prophylaxis) and Ketorolac (requested for breakthrough pain).
   - Action Required: Acknowledge and switch analgesic to Acetaminophen route.
2. **[WARNING] Potassium Level Low**
   - Alert: Hypokalemia warning.
   - Details: Morning labs show K+ at 3.3 mEq/L. Risk of arrhythmias post-CABG.
   - Action Required: Review standing orders for Potassium Chloride (KCl) 40mEq IV replacement protocol.
3. **[INFO] Sternal Precautions**
   - Alert: Movement Restriction.
   - Details: Post-CABG sternal precautions in place. Do not lift > 10 lbs.
   - Action Required: Ensure physical therapy eval is completed before chair transfer.

## 4. Patient Timeline (Chronological Hospital Course)

Ensure timeline components render densely using these rows.
| Timestamp | Event Type | Description | Performed By |
|---|---|---|---|
| 2026-04-14 10:00:00Z | note | PT/OT Eval. Patient assisted to chair. Tolerated well, SpO2 95% on RA. | M. Lopez, DPT |
| 2026-04-14 09:15:00Z | note | Endocrine note: BS poorly controlled post-surgery, adjusting sliding scale insulin. | Dr. T. Nguyen, Endocrine |
| 2026-04-14 06:00:00Z | lab | Morning Comprehensive Metabolic Panel, CBC, Coags, Troponin. | J. Smith, RN |
| 2026-04-14 04:30:00Z | note | Temp spike to 38.1C. Blood cultures drawn x2. Tylenol given. | J. Smith, RN |
| 2026-04-13 22:30:00Z | procedure | Extubation successful. Patient breathing on own, transition to NC. | Dr. A. Patel |
| 2026-04-13 20:00:00Z | note | Neurosurg check. Pupils PERRLA, moves all 4 extremities, follows commands. | Dr. S. Kazi |
| 2026-04-13 18:30:00Z | medication | Heparin drip discontinued. Started oral Warfarin bridge. | E. Chu, PharmD |
| 2026-04-13 16:00:00Z | lab | Afternoon ABG. pH 7.38, pCO2 42, pO2 88. Adequate gas exchange. | M. Torres, RT |
| 2026-04-13 14:15:00Z | procedure | Post-op Chest X-Ray portable. Clear lungs, good hardware placement. Chest tubes in place. | Radiology Tech |
| 2026-04-13 12:00:00Z | procedure | Pacemaker wires pulled, site sterile. | Dr. S. Kazi |
| 2026-04-13 09:00:00Z | note | Cardiology morning rounds. Graft flow excellent, begin weaning pressors. | Dr. L. Brooks |
| 2026-04-13 06:00:00Z | lab | Morning Labs. K+ at 3.6, supplemented. Hgb 10.5. | R. Davis, RN |
| 2026-04-13 02:00:00Z | note | Chest tube output 150cc/hr (Serosanguinous). Within acceptable limits. | R. Davis, RN |
| 2026-04-12 23:45:00Z | note | Transient AFib noted on monitor for 30s, reverted to NSR natively. | R. Davis, RN |
| 2026-04-12 18:45:00Z | procedure | Patient transferred from OR to CVICU bed 04. Intubated, sedated. | PACU Transfer Team |
| 2026-04-12 08:30:00Z | procedure | Cut time. CABG x3 using LIMA and SVG. | Dr. S. Kazi |
| 2026-04-12 08:00:00Z | procedure | Patient wheeled to OR 12. Pre-op checklist complete. | Pre-Op Nursing |

## 5. Comprehensive Lab Results Panel (06:00 Draw)

Ensure lab panels render densely using these clinical results.
| Panel | Analyte | Result | Unit | Ref Range | Flag | Prev Value |
|---|---|---|---|---|---|---|
| CBC | Hemoglobin (Hgb) | 10.2 | g/dL | 13.8 - 17.2 | low | 10.5 |
| CBC | Hematocrit (Hct) | 31.5 | % | 41.0 - 50.0 | low | 32.1 |
| CBC | White Blood Cells (WBC) | 11.2 | K/uL | 4.5 - 11.0 | high | 7.9 |
| CBC | Platelets | 250 | K/uL | 150 - 450 | normal | 240 |
| CBC | RBC Count | 4.10 | M/uL | 4.50 - 5.90 | low | 4.35 |
| BMP | Sodium (Na) | 139 | mEq/L | 135 - 145 | normal | 140 |
| BMP | Potassium (K) | 3.3 | mEq/L | 3.5 - 5.0 | critical-low | 3.8 |
| BMP | Chloride (Cl) | 102 | mEq/L | 96 - 106 | normal | 104 |
| BMP | CO2 (Bicarbonate) | 26 | mEq/L | 23 - 29 | normal | 25 |
| BMP | Blood Urea Nitrogen (BUN) | 22 | mg/dL | 7 - 20 | high | 18 |
| BMP | Creatinine | 1.1 | mg/dL | 0.7 - 1.3 | normal | 0.9 |
| BMP | Glucose | 185 | mg/dL | 70 - 99 | high | 145 |
| BMP | Calcium | 8.8 | mg/dL | 8.5 - 10.2 | normal | 9.0 |
| LFT | AST | 35 | U/L | 10 - 40 | normal | 30 |
| LFT | ALT | 42 | U/L | 7 - 56 | normal | 38 |
| Coag | INR | 1.8 | Ratio| 0.8 - 1.1 | high | 1.2 |
| Coag | PTT | 45.2 | Sec | 25 - 35 | high | 38.0 |
| Coag | PT | 18.5 | Sec | 11 - 13.5 | high | 14.2 |
| Card | Troponin I | 2.4 | ng/mL | < 0.04 | critical-high | 0.8 |
| Card | BNP | 450 | pg/mL | < 100 | high | 410 |

## 6. Medication Administration Record (MAR)

Ensure medication lists render densely using these active orders.
| Name | Dosage | Route | Frequency | NextDue | Status | Indications |
|---|---|---|---|---|---|---|
| Amiodarone | 150 mg | iv | Continuous | 2026-04-14T12:00:00Z | active | Prevent Post-op AFib |
| Metoprolol | 2.5 mg | iv | Q6H | 2026-04-14T12:00:00Z | active | Hold if HR < 60 |
| Warfarin | 5 mg | oral | Daily | 2026-04-14T18:00:00Z | active | Bridge from Heparin |
| Aspirin | 81 mg | oral | Daily | 2026-04-15T08:00:00Z | active | Antiplatelet |
| Atorvastatin | 40 mg | oral | Daily | 2026-04-14T21:00:00Z | active | Lipid lowering |
| Metformin | 500 mg | oral | BID | 2026-04-14T18:00:00Z | active | Type 2 DM |
| Insulin Lispro | Sliding | sc | AC / HS | 2026-04-14T12:00:00Z | active | Glucose correction |
| Pantoprazole | 40 mg | iv | Daily | 2026-04-15T08:00:00Z | active | Ulcer prophylaxis |
| Docusate | 100 mg | oral | BID | 2026-04-14T20:00:00Z | active | Stool softener |
| Cefazolin | 2g | iv | Q8H | Discontinued | discontinued | SSI prevention complete |
| Acetaminophen | 650 mg | oral | Q6H PRN | PRN Not Scheduled | prn | Sternal ache |
| Morphine S. | 2 mg | iv | Q2H PRN | Held Not Scheduled | held | Avoid due to sedation |
| Potassium Cl | 40 mEq | iv | x1 dose | 2026-04-14T11:00:00Z | active | K+ replacement |

## 7. Care Team Roster

| Name              | role        | designation | shiftStatus | contact         | since      |
| ----------------- | ----------- | ----------- | ----------- | --------------- | ---------- |
| Dr. Sarah Kazi    | attending   | primary     | on-shift    | Pager: #8892    | 2026-04-10 |
| Dr. Lauren Brooks | attending   | consulting  | on-shift    | Pager: #4112    | 2026-04-12 |
| Dr. Alex Patel    | attending   | consulting  | off-shift   | Office: x4402   | 2026-04-13 |
| Dr. Thien Nguyen  | attending   | consulting  | on-shift    | Pager: #5590    | 2026-04-13 |
| Jane Smith, BSN   | nurse       | primary     | on-shift    | Vocera: RN Four | 2026-04-14 |
| Richard Davis, RN | nurse       | covering    | off-shift   | N/A             | 2026-04-13 |
| Mike Torres, RT   | respiratory | primary     | on-shift    | Pager: #1105    | 2026-04-14 |
| Dr. Emily Chu     | pharmacist  | primary     | on-shift    | Ext: x9921      | 2026-04-12 |
| Mark Lopez, DPT   | dietitian   | consulting  | on-shift    | Ext: x3310      | 2026-04-14 |
