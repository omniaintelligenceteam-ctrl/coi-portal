/**
 * Coordinate map for ACORD 25 (2016/03) field positions.
 *
 * Coordinate system: PDF points (72 per inch), origin at BOTTOM-LEFT.
 * Page size: US Letter = 612 × 792 points.
 *
 * Tune with:   npm run calibrate   (writes out/calibration.pdf — red dots at every coord)
 * Verify with: npm run regen-sheffer + visual diff against ~/Downloads/Sheffer COI.pdf
 *
 * NOTE: these are still v1 estimates with one tuning pass applied. Phase 1.6 visual-diff
 * pass against the Sheffer sample will likely produce 5-15pt adjustments per field.
 */

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;

export type Coord = { x: number; y: number; size?: number; maxWidth?: number };

export const DEFAULT_SIZE = 7.5;

export const COORDS = {
  // Header — top-right date (the box labeled "DATE (MM/DD/YYYY)")
  DATE: { x: 538, y: 757, size: 8 },

  // Producer block (top-left, under the PRODUCER label band)
  PRODUCER_NAME:      { x: 36, y: 735, size: 7.5, maxWidth: 260 },
  PRODUCER_ADDRESS_1: { x: 36, y: 722, size: 7.5, maxWidth: 260 },
  PRODUCER_ADDRESS_2: { x: 36, y: 709, size: 7.5, maxWidth: 260 },

  // Contact column (right of producer)
  CONTACT_NAME:  { x: 320, y: 735, size: 7.5, maxWidth: 175 },
  CONTACT_PHONE: { x: 320, y: 722, size: 7.5, maxWidth: 100 },
  CONTACT_FAX:   { x: 480, y: 722, size: 7.5, maxWidth: 90 },
  CONTACT_EMAIL: { x: 320, y: 709, size: 7.5, maxWidth: 230 },

  // Insurers block (right side, under "INSURERS AFFORDING COVERAGE")
  INSURER_A_NAME: { x: 318, y: 685, size: 7.5, maxWidth: 245 },
  INSURER_A_NAIC: { x: 578, y: 685, size: 7.5, maxWidth: 28 },
  INSURER_B_NAME: { x: 318, y: 673, size: 7.5, maxWidth: 245 },
  INSURER_B_NAIC: { x: 578, y: 673, size: 7.5, maxWidth: 28 },
  INSURER_C_NAME: { x: 318, y: 661, size: 7.5, maxWidth: 245 },
  INSURER_C_NAIC: { x: 578, y: 661, size: 7.5, maxWidth: 28 },
  INSURER_D_NAME: { x: 318, y: 649, size: 7.5, maxWidth: 245 },
  INSURER_D_NAIC: { x: 578, y: 649, size: 7.5, maxWidth: 28 },
  INSURER_E_NAME: { x: 318, y: 637, size: 7.5, maxWidth: 245 },
  INSURER_E_NAIC: { x: 578, y: 637, size: 7.5, maxWidth: 28 },
  INSURER_F_NAME: { x: 318, y: 625, size: 7.5, maxWidth: 245 },
  INSURER_F_NAIC: { x: 578, y: 625, size: 7.5, maxWidth: 28 },

  // Insured block (under INSURED label, left side)
  INSURED_NAME:      { x: 36, y: 672, size: 7.5, maxWidth: 280 },
  INSURED_ADDRESS_1: { x: 36, y: 659, size: 7.5, maxWidth: 280 },
  INSURED_ADDRESS_2: { x: 36, y: 646, size: 7.5, maxWidth: 280 },

  // Cert number row (under "COVERAGES" header band)
  CERT_NUMBER:     { x: 230, y: 612, size: 7.5, maxWidth: 130 },
  REVISION_NUMBER: { x: 470, y: 612, size: 7.5, maxWidth: 130 },

  // Coverage grid — letter column INSR LTR is leftmost, then ADDL/SUBR cols, then TYPE, POLICY #, dates, LIMITS column on right
  // GL row, y ≈ 550-570 (multiple lines in limits column)
  GL_INSR_LTR:           { x: 28,  y: 547, size: 7.5 },
  GL_POLICY_NUMBER:      { x: 218, y: 538, size: 7.5, maxWidth: 92 },
  GL_EFF_DATE:           { x: 314, y: 538, size: 7.5 },
  GL_EXP_DATE:           { x: 362, y: 538, size: 7.5 },
  GL_LIMIT_EACH_OCC:     { x: 562, y: 572, size: 7.5, maxWidth: 45 },
  GL_LIMIT_DAMAGE_RENT:  { x: 562, y: 559, size: 7.5, maxWidth: 45 },
  GL_LIMIT_MED_EXP:      { x: 562, y: 546, size: 7.5, maxWidth: 45 },
  GL_LIMIT_PERS_ADV_INJ: { x: 562, y: 533, size: 7.5, maxWidth: 45 },
  GL_LIMIT_GEN_AGG:      { x: 562, y: 520, size: 7.5, maxWidth: 45 },
  GL_LIMIT_PROD_COMP_OP: { x: 562, y: 507, size: 7.5, maxWidth: 45 },

  // Auto row, y ≈ 458-475
  AUTO_INSR_LTR:          { x: 28,  y: 468, size: 7.5 },
  AUTO_POLICY_NUMBER:     { x: 218, y: 468, size: 7.5, maxWidth: 92 },
  AUTO_EFF_DATE:          { x: 314, y: 468, size: 7.5 },
  AUTO_EXP_DATE:          { x: 362, y: 468, size: 7.5 },
  AUTO_LIMIT_CSL:         { x: 562, y: 474, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_BI_PER_PERS: { x: 562, y: 461, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_BI_PER_ACC:  { x: 562, y: 448, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_PD:          { x: 562, y: 435, size: 7.5, maxWidth: 45 },

  // Umbrella / Excess row, y ≈ 400
  UMB_INSR_LTR:       { x: 28,  y: 405, size: 7.5 },
  UMB_POLICY_NUMBER:  { x: 218, y: 405, size: 7.5, maxWidth: 92 },
  UMB_EFF_DATE:       { x: 314, y: 405, size: 7.5 },
  UMB_EXP_DATE:       { x: 362, y: 405, size: 7.5 },
  UMB_LIMIT_EACH_OCC: { x: 562, y: 411, size: 7.5, maxWidth: 45 },
  UMB_LIMIT_AGG:      { x: 562, y: 398, size: 7.5, maxWidth: 45 },

  // Workers Comp row, y ≈ 355
  WC_INSR_LTR:          { x: 28,  y: 358, size: 7.5 },
  WC_POLICY_NUMBER:     { x: 218, y: 358, size: 7.5, maxWidth: 92 },
  WC_EFF_DATE:          { x: 314, y: 358, size: 7.5 },
  WC_EXP_DATE:          { x: 362, y: 358, size: 7.5 },
  WC_LIMIT_EACH_ACC:    { x: 562, y: 365, size: 7.5, maxWidth: 45 },
  WC_LIMIT_DIS_EA_EMPL: { x: 562, y: 352, size: 7.5, maxWidth: 45 },
  WC_LIMIT_DIS_POL_LIM: { x: 562, y: 339, size: 7.5, maxWidth: 45 },

  // "Other" row — used for Equipment, Inland Marine, etc., y ≈ 305
  OTHER_INSR_LTR:      { x: 28,  y: 305, size: 7.5 },
  OTHER_DESCRIPTION:   { x: 56,  y: 305, size: 7.5, maxWidth: 155 },
  OTHER_POLICY_NUMBER: { x: 218, y: 305, size: 7.5, maxWidth: 92 },
  OTHER_EFF_DATE:      { x: 314, y: 305, size: 7.5 },
  OTHER_EXP_DATE:      { x: 362, y: 305, size: 7.5 },
  OTHER_LIMIT:         { x: 562, y: 305, size: 7.5, maxWidth: 45 },

  // Description of Operations / Locations / Vehicles — usually blank for E&O safety
  DESCRIPTION: { x: 36, y: 268, size: 7, maxWidth: 540 },

  // Cert Holder block (bottom-left, under CERTIFICATE HOLDER label)
  HOLDER_NAME:      { x: 36, y: 168, size: 7.5, maxWidth: 290 },
  HOLDER_ADDRESS_1: { x: 36, y: 155, size: 7.5, maxWidth: 290 },
  HOLDER_ADDRESS_2: { x: 36, y: 142, size: 7.5, maxWidth: 290 },

  // Authorized Representative signature stamp (bottom-right of CANCELLATION block)
  SIGNATURE: { x: 425, y: 55, width: 115, height: 28 },
} as const;

export type CoordKey = keyof typeof COORDS;
