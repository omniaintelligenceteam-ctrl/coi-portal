/**
 * Coordinate map for ACORD 25 (2016/03) field positions.
 *
 * Coordinate system: PDF points (72 per inch), origin at BOTTOM-LEFT.
 * Page size: US Letter = 612 × 792 points.
 *
 * 2026-05-18 calibration: derived from `npx tsx scripts/probeTemplate.ts`, which
 * extracts every STATIC label position from the source ACORD 25 PDF (the page
 * content stream — XFA-filled values are invisible, but labels like "INSURER A :",
 * "EACH OCCURRENCE", "WORKERS COMPENSATION" are extractable). Each text field
 * below is anchored to the y-baseline of its corresponding label so values land
 * on the same baseline as the label they answer to.
 *
 * Tune with:   npm run calibrate   (writes out/calibration.pdf — red dots at every coord)
 * Verify with: npm run regen-sheffer + visual diff against ~/Downloads/Sheffer COI (1).pdf
 * Regression:  tests/fillAcord25.positions.test.ts (locks each coord against drift)
 */

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;

export type Coord = { x: number; y: number; size?: number; maxWidth?: number };

export const DEFAULT_SIZE = 7.5;

export const COORDS = {
  // Header — top-right date (the box labeled "DATE (MM/DD/YYYY)")
  DATE: { x: 546, y: 753, size: 8 },

  // Producer block (top-left, label "PRODUCER" at y=664.08)
  PRODUCER_NAME:      { x: 35, y: 654, size: 7.5, maxWidth: 260 },
  PRODUCER_ADDRESS_1: { x: 35, y: 645, size: 7.5, maxWidth: 260 },
  PRODUCER_ADDRESS_2: { x: 35, y: 636, size: 7.5, maxWidth: 260 },

  // Contact column (CONTACT label y=666.60, PHONE y=654.12, FAX y=654.60, E-MAIL y=642.48)
  // Values render on the same baseline as their corresponding label.
  // CONTACT_NAME: NAME sub-row sits between CONTACT label (y=666) and PHONE row (y=654)
  //   — center the value mid-cell at y=661 so it's clear of the row separator near y=657.
  CONTACT_NAME:  { x: 344, y: 661, size: 7.5, maxWidth: 220 },
  CONTACT_PHONE: { x: 344, y: 654, size: 7.5, maxWidth: 100 },
  CONTACT_FAX:   { x: 502, y: 654, size: 7.5, maxWidth: 75 },
  CONTACT_EMAIL: { x: 344, y: 642, size: 7.5, maxWidth: 230 },

  // Insurers block — label baselines extracted from template:
  // A=613.56, B=601.56, C=589.56, D=577.56, E=565.56, F=553.56
  // Values render slightly below each label baseline.
  INSURER_A_NAME: { x: 344, y: 613, size: 7.5, maxWidth: 220 },
  INSURER_A_NAIC: { x: 572, y: 613, size: 7.5, maxWidth: 32 },
  INSURER_B_NAME: { x: 344, y: 601, size: 7.5, maxWidth: 220 },
  INSURER_B_NAIC: { x: 572, y: 601, size: 7.5, maxWidth: 32 },
  INSURER_C_NAME: { x: 344, y: 589, size: 7.5, maxWidth: 220 },
  INSURER_C_NAIC: { x: 572, y: 589, size: 7.5, maxWidth: 32 },
  INSURER_D_NAME: { x: 344, y: 577, size: 7.5, maxWidth: 220 },
  INSURER_D_NAIC: { x: 572, y: 577, size: 7.5, maxWidth: 32 },
  INSURER_E_NAME: { x: 344, y: 565, size: 7.5, maxWidth: 220 },
  INSURER_E_NAIC: { x: 572, y: 565, size: 7.5, maxWidth: 32 },
  INSURER_F_NAME: { x: 344, y: 553, size: 7.5, maxWidth: 220 },
  INSURER_F_NAIC: { x: 572, y: 553, size: 7.5, maxWidth: 32 },

  // Insured block (INSURED label y=604.08; value below)
  INSURED_NAME:      { x: 35, y: 593, size: 7.5, maxWidth: 280 },
  INSURED_ADDRESS_1: { x: 35, y: 581, size: 7.5, maxWidth: 280 },
  INSURED_ADDRESS_2: { x: 35, y: 569, size: 7.5, maxWidth: 280 },

  // Cert number row (COVERAGES + CERTIFICATE NUMBER labels at y=542.40)
  CERT_NUMBER:     { x: 238, y: 542, size: 7.5, maxWidth: 130 },
  REVISION_NUMBER: { x: 481, y: 542, size: 7.5, maxWidth: 130 },

  // GL row — row label "COMMERCIAL GENERAL LIABILITY" at y=484.02
  // Right-column limit labels at y=482.04 / 475.02 / 458.04 / 446.04 / 434.04 / 422.04
  GL_INSR_LTR:           { x: 28,  y: 478, size: 7.5 },
  GL_POLICY_NUMBER:      { x: 223, y: 478, size: 7.5, maxWidth: 92 },
  GL_EFF_DATE:           { x: 318, y: 478, size: 7.5 },
  GL_EXP_DATE:           { x: 364, y: 478, size: 7.5 },
  GL_LIMIT_EACH_OCC:     { x: 562, y: 482, size: 7.5, maxWidth: 45 },
  GL_LIMIT_DAMAGE_RENT:  { x: 562, y: 475, size: 7.5, maxWidth: 45 },
  GL_LIMIT_MED_EXP:      { x: 562, y: 458, size: 7.5, maxWidth: 45 },
  GL_LIMIT_PERS_ADV_INJ: { x: 562, y: 446, size: 7.5, maxWidth: 45 },
  GL_LIMIT_GEN_AGG:      { x: 562, y: 434, size: 7.5, maxWidth: 45 },
  GL_LIMIT_PROD_COMP_OP: { x: 562, y: 422, size: 7.5, maxWidth: 45 },

  // AUTO row — row label "AUTOMOBILE LIABILITY" at y=400.08
  // Right-column limit labels: COMBINED SINGLE LIMIT y=402.48, BI Per person y=388.02,
  // BI Per accident y=376.02, PROPERTY DAMAGE y=366.48
  AUTO_INSR_LTR:          { x: 28,  y: 394, size: 7.5 },
  AUTO_POLICY_NUMBER:     { x: 223, y: 394, size: 7.5, maxWidth: 92 },
  AUTO_EFF_DATE:          { x: 318, y: 394, size: 7.5 },
  AUTO_EXP_DATE:          { x: 364, y: 394, size: 7.5 },
  AUTO_LIMIT_CSL:         { x: 562, y: 402, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_BI_PER_PERS: { x: 562, y: 388, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_BI_PER_ACC:  { x: 562, y: 376, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_PD:          { x: 562, y: 366, size: 7.5, maxWidth: 45 },

  // Umbrella / Excess row — row label "UMBRELLA LIAB" at y=340.08
  // Limit label EACH OCCURRENCE y=338.04, AGGREGATE one row below ~y=326
  UMB_INSR_LTR:       { x: 28,  y: 334, size: 7.5 },
  UMB_POLICY_NUMBER:  { x: 223, y: 334, size: 7.5, maxWidth: 92 },
  UMB_EFF_DATE:       { x: 318, y: 334, size: 7.5 },
  UMB_EXP_DATE:       { x: 364, y: 334, size: 7.5 },
  UMB_LIMIT_EACH_OCC: { x: 562, y: 338, size: 7.5, maxWidth: 45 },
  UMB_LIMIT_AGG:      { x: 562, y: 326, size: 7.5, maxWidth: 45 },

  // Workers Comp row — row label "WORKERS COMPENSATION" at y=305.28
  // Limit labels: E.L. EACH ACCIDENT y=290.04, OFFICER/MEMBER EXCLUDED y=284.52
  // E.L. DISEASE EA EMPLOYEE ~y=278, E.L. DISEASE POLICY LIMIT ~y=266
  WC_INSR_LTR:          { x: 28,  y: 296, size: 7.5 },
  WC_POLICY_NUMBER:     { x: 223, y: 296, size: 7.5, maxWidth: 92 },
  WC_EFF_DATE:          { x: 318, y: 296, size: 7.5 },
  WC_EXP_DATE:          { x: 364, y: 296, size: 7.5 },
  WC_LIMIT_EACH_ACC:    { x: 562, y: 290, size: 7.5, maxWidth: 45 },
  WC_LIMIT_DIS_EA_EMPL: { x: 562, y: 278, size: 7.5, maxWidth: 45 },
  WC_LIMIT_DIS_POL_LIM: { x: 562, y: 266, size: 7.5, maxWidth: 45 },

  // "Other" row — blank row between WC bottom and DESCRIPTION OF OPERATIONS top (y=265.56)
  // Used for Equipment, Inland Marine, etc. Sits roughly y=255 area.
  OTHER_INSR_LTR:      { x: 28,  y: 255, size: 7.5 },
  OTHER_DESCRIPTION:   { x: 57,  y: 261, size: 7.5, maxWidth: 155 },
  OTHER_POLICY_NUMBER: { x: 223, y: 255, size: 7.5, maxWidth: 92 },
  OTHER_EFF_DATE:      { x: 318, y: 255, size: 7.5 },
  OTHER_EXP_DATE:      { x: 364, y: 255, size: 7.5 },
  OTHER_LIMIT:         { x: 562, y: 249, size: 7.5, maxWidth: 45 },

  // Description of Operations / Locations / Vehicles
  // Label "DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES" at y=220.08
  DESCRIPTION: { x: 35, y: 207, size: 7, maxWidth: 540 },

  // Cert Holder block — label "CERTIFICATE HOLDER" at y=134.04
  HOLDER_NAME:      { x: 35, y: 115, size: 7.5, maxWidth: 290 },
  HOLDER_ADDRESS_1: { x: 35, y: 103, size: 7.5, maxWidth: 290 },
  HOLDER_ADDRESS_2: { x: 35, y: 91,  size: 7.5, maxWidth: 290 },

  // Authorized Representative signature stamp — label at y=76.08
  // Stamp rectangle sits in the AUTHORIZED REPRESENTATIVE box below CANCELLATION
  SIGNATURE: { x: 425, y: 55, width: 115, height: 28 },
} as const;

export type CoordKey = keyof typeof COORDS;
