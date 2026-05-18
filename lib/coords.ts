/**
 * Coordinate map for ACORD 25 (2016/03) field positions.
 *
 * Coordinate system: PDF points (72 per inch), origin at BOTTOM-LEFT.
 * Page size: US Letter = 612 × 792 points.
 *
 * Tune with:   npm run calibrate   (writes out/calibration.pdf — red dots at every coord)
 * Verify with: npm run regen-sheffer + visual diff against ~/Downloads/Sheffer COI.pdf
 *
 * Coordinates derived from band-relative mapping of the Sheffer sample PDF text positions.
 * Reference grid lines in MY template (612x792): 744/702/672/552/540/492/408/348/312/264/228/144/132/48
 * Reference grid lines in Sheffer source (604.8x786.96): 725.9/685.6/657.2/542.2/530.5/488.6/408.4/350.0/316.1/268.4/235.3/155.1/143.7/65.0
 */

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;

export type Coord = { x: number; y: number; size?: number; maxWidth?: number };

export const DEFAULT_SIZE = 7.5;

export const COORDS = {
  // Header — top-right date (the box labeled "DATE (MM/DD/YYYY)")
  DATE: { x: 546, y: 753, size: 8 },

  // Producer block (top-left, in PRODUCER cell pt 636-672, below PRODUCER label at ~664-668)
  PRODUCER_NAME:      { x: 35, y: 657, size: 7.5, maxWidth: 260 },
  PRODUCER_ADDRESS_1: { x: 35, y: 648, size: 7.5, maxWidth: 260 },
  PRODUCER_ADDRESS_2: { x: 35, y: 639, size: 7.5, maxWidth: 260 },

  // Contact column (right of producer, also in CONTACT cell pt 636-672)
  // Each label-value pair stacked tightly (~8.5pt apart)
  CONTACT_NAME:  { x: 344, y: 658, size: 7.5, maxWidth: 220 },
  CONTACT_PHONE: { x: 344, y: 645, size: 7.5, maxWidth: 100 },
  CONTACT_FAX:   { x: 486, y: 645, size: 7.5, maxWidth: 90 },
  CONTACT_EMAIL: { x: 344, y: 638, size: 7.5, maxWidth: 230 },

  // Insurers block (right side, INSURER rows in Zone C pt 552-612)
  // Form letters detected at template pt 604/593/581/569/566/556 (~10pt spacing)
  INSURER_A_NAME: { x: 344, y: 602, size: 7.5, maxWidth: 220 },
  INSURER_A_NAIC: { x: 572, y: 602, size: 7.5, maxWidth: 32 },
  INSURER_B_NAME: { x: 344, y: 591, size: 7.5, maxWidth: 220 },
  INSURER_B_NAIC: { x: 572, y: 591, size: 7.5, maxWidth: 32 },
  INSURER_C_NAME: { x: 344, y: 579, size: 7.5, maxWidth: 220 },
  INSURER_C_NAIC: { x: 572, y: 579, size: 7.5, maxWidth: 32 },
  INSURER_D_NAME: { x: 344, y: 567, size: 7.5, maxWidth: 220 },
  INSURER_D_NAIC: { x: 572, y: 567, size: 7.5, maxWidth: 32 },
  INSURER_E_NAME: { x: 344, y: 556, size: 7.5, maxWidth: 220 },
  INSURER_E_NAIC: { x: 572, y: 556, size: 7.5, maxWidth: 32 },
  INSURER_F_NAME: { x: 344, y: 544, size: 7.5, maxWidth: 220 },
  INSURER_F_NAIC: { x: 572, y: 544, size: 7.5, maxWidth: 32 },

  // Insured block (INSURED cell in Zone C pt 552-612, on left side under INSURED label)
  INSURED_NAME:      { x: 35, y: 596, size: 7.5, maxWidth: 280 },
  INSURED_ADDRESS_1: { x: 35, y: 583, size: 7.5, maxWidth: 280 },
  INSURED_ADDRESS_2: { x: 35, y: 570, size: 7.5, maxWidth: 280 },

  // Cert number row (under "COVERAGES" header band)
  CERT_NUMBER:     { x: 238, y: 543, size: 7.5, maxWidth: 130 },
  REVISION_NUMBER: { x: 481, y: 543, size: 7.5, maxWidth: 130 },

  // Coverage grid — letter column INSR LTR is leftmost, then ADDL/SUBR cols, then TYPE, POLICY #, dates, LIMITS column on right
  // GL row (top of GL row = line 540, bottom = line 492). Policy/dates at top, 6 limit values stacked.
  GL_INSR_LTR:           { x: 28,  y: 531, size: 7.5 },
  GL_POLICY_NUMBER:      { x: 223, y: 531, size: 7.5, maxWidth: 92 },
  GL_EFF_DATE:           { x: 318, y: 531, size: 7.5 },
  GL_EXP_DATE:           { x: 364, y: 531, size: 7.5 },
  GL_LIMIT_EACH_OCC:     { x: 562, y: 532, size: 7.5, maxWidth: 45 },
  GL_LIMIT_DAMAGE_RENT:  { x: 562, y: 524, size: 7.5, maxWidth: 45 },
  GL_LIMIT_MED_EXP:      { x: 562, y: 516, size: 7.5, maxWidth: 45 },
  GL_LIMIT_PERS_ADV_INJ: { x: 562, y: 508, size: 7.5, maxWidth: 45 },
  GL_LIMIT_GEN_AGG:      { x: 562, y: 500, size: 7.5, maxWidth: 45 },
  GL_LIMIT_PROD_COMP_OP: { x: 562, y: 492, size: 7.5, maxWidth: 45 },

  // Auto row (line 492 - line 408 = 84pt). 4 limit values.
  AUTO_INSR_LTR:          { x: 28,  y: 462, size: 7.5 },
  AUTO_POLICY_NUMBER:     { x: 223, y: 462, size: 7.5, maxWidth: 92 },
  AUTO_EFF_DATE:          { x: 318, y: 462, size: 7.5 },
  AUTO_EXP_DATE:          { x: 364, y: 462, size: 7.5 },
  AUTO_LIMIT_CSL:         { x: 562, y: 472, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_BI_PER_PERS: { x: 562, y: 462, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_BI_PER_ACC:  { x: 562, y: 452, size: 7.5, maxWidth: 45 },
  AUTO_LIMIT_PD:          { x: 562, y: 442, size: 7.5, maxWidth: 45 },

  // Umbrella / Excess row (line 408 - line 348 = 60pt). 2 limit values.
  UMB_INSR_LTR:       { x: 28,  y: 392, size: 7.5 },
  UMB_POLICY_NUMBER:  { x: 223, y: 392, size: 7.5, maxWidth: 92 },
  UMB_EFF_DATE:       { x: 318, y: 392, size: 7.5 },
  UMB_EXP_DATE:       { x: 364, y: 392, size: 7.5 },
  UMB_LIMIT_EACH_OCC: { x: 562, y: 392, size: 7.5, maxWidth: 45 },
  UMB_LIMIT_AGG:      { x: 562, y: 379, size: 7.5, maxWidth: 45 },

  // Workers Comp row (line 348 - line 312 = 36pt). 3 limit values.
  WC_INSR_LTR:          { x: 28,  y: 337, size: 7.5 },
  WC_POLICY_NUMBER:     { x: 223, y: 337, size: 7.5, maxWidth: 92 },
  WC_EFF_DATE:          { x: 318, y: 337, size: 7.5 },
  WC_EXP_DATE:          { x: 364, y: 337, size: 7.5 },
  WC_LIMIT_EACH_ACC:    { x: 562, y: 337, size: 7.5, maxWidth: 45 },
  WC_LIMIT_DIS_EA_EMPL: { x: 562, y: 327, size: 7.5, maxWidth: 45 },
  WC_LIMIT_DIS_POL_LIM: { x: 562, y: 316, size: 7.5, maxWidth: 45 },

  // "Other" row (line 312 - line 264 = 48pt) — used for Equipment, Inland Marine, etc.
  OTHER_INSR_LTR:      { x: 28,  y: 290, size: 7.5 },
  OTHER_DESCRIPTION:   { x: 57,  y: 304, size: 7.5, maxWidth: 155 },
  OTHER_POLICY_NUMBER: { x: 223, y: 285, size: 7.5, maxWidth: 92 },
  OTHER_EFF_DATE:      { x: 318, y: 285, size: 7.5 },
  OTHER_EXP_DATE:      { x: 364, y: 285, size: 7.5 },
  OTHER_LIMIT:         { x: 562, y: 279, size: 7.5, maxWidth: 45 },

  // Description of Operations / Locations / Vehicles
  DESCRIPTION: { x: 35, y: 247, size: 7, maxWidth: 540 },

  // Cert Holder block (line 132 - line 48 = 84pt for content area)
  HOLDER_NAME:      { x: 35, y: 115, size: 7.5, maxWidth: 290 },
  HOLDER_ADDRESS_1: { x: 35, y: 103, size: 7.5, maxWidth: 290 },
  HOLDER_ADDRESS_2: { x: 35, y: 91,  size: 7.5, maxWidth: 290 },

  // Authorized Representative signature stamp (bottom-right of CANCELLATION block)
  SIGNATURE: { x: 425, y: 55, width: 115, height: 28 },
} as const;

export type CoordKey = keyof typeof COORDS;
