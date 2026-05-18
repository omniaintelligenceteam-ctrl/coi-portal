// @ts-nocheck — one-off audit script; strict-mode noise not worth fixing.
/**
 * CoiInput ↔ COORDS coverage audit.
 *
 * Reports three classes of gap:
 *
 *   ZOMBIE    COORDS entry that has no path through fillAcord25 that renders it.
 *             These are dead declarations cluttering lib/coords.ts.
 *
 *   SILENT    CoiInput leaf value that is used in fillAcord25 but has no COORDS
 *             entry — it's either rendered at a hardcoded coord (a regression risk)
 *             or simply not rendered (a silent drop for recipients).
 *
 *   UNGUARDED Optional CoiInput leaf that maps to a COORDS entry but has no Zod
 *             validator in FIELD_VALIDATORS — a malformed value would render
 *             without error.
 *
 * This script is informational (exits 0 always). Its output feeds the cert-doctor
 * workflow and documents the known gaps for future closure.
 *
 * Usage: npm run coverage-audit
 */

import { COORDS, FIELD_ANCHORS, FIELD_VALIDATORS } from '../lib/coords.js';

// ---------------------------------------------------------------------------
// Known COORDS keys (from FIELD_ANCHORS — these are all anchor-relative fields
// that go through declare(). SIGNATURE rect is excluded since it's an image.)
// ---------------------------------------------------------------------------
const allCoordKeys = new Set(Object.keys(FIELD_ANCHORS));

// ---------------------------------------------------------------------------
// Known rendered fields — extracted from fillAcord25.ts by hand. This list
// intentionally explicit so any new drawAt() call that lacks a COORDS entry
// is visible here. Update when fillAcord25 adds new fields.
// ---------------------------------------------------------------------------
const RENDERED_FROM_FILL: Record<string, string> = {
  // Header
  DATE: 'input.certDate',
  // Producer
  PRODUCER_NAME: 'input.agency.name',
  PRODUCER_ADDRESS_1: 'input.agency.address1',
  PRODUCER_ADDRESS_2: 'input.agency.address2',
  CONTACT_NAME: 'input.agency.contactName',
  CONTACT_PHONE: 'input.agency.phone',
  CONTACT_FAX: 'input.agency.fax',
  CONTACT_EMAIL: 'input.agency.email',
  // Insurers
  INSURER_A_NAME: 'input.insurers[A].name',
  INSURER_A_NAIC: 'input.insurers[A].naic',
  INSURER_B_NAME: 'input.insurers[B].name',
  INSURER_B_NAIC: 'input.insurers[B].naic',
  INSURER_C_NAME: 'input.insurers[C].name',
  INSURER_C_NAIC: 'input.insurers[C].naic',
  INSURER_D_NAME: 'input.insurers[D].name',
  INSURER_D_NAIC: 'input.insurers[D].naic',
  INSURER_E_NAME: 'input.insurers[E].name',
  INSURER_E_NAIC: 'input.insurers[E].naic',
  INSURER_F_NAME: 'input.insurers[F].name',
  INSURER_F_NAIC: 'input.insurers[F].naic',
  // Insured
  INSURED_NAME: 'input.insured.name',
  INSURED_ADDRESS_1: 'input.insured.address1',
  INSURED_ADDRESS_2: 'input.insured.address2',
  // Cert number
  CERT_NUMBER: 'input.certNumber',
  // GL
  GL_CHK_TYPE: 'static "X" (if gl)',
  GL_CHK_OCCUR: 'static "X" (if !gl.claimsMade)',
  GL_CHK_AGG_POLICY: 'static "X" (if gl.generalAggregateAppliesPer === POLICY)',
  GL_INSR_LTR: 'gl.insurerLetter',
  GL_POLICY_NUMBER: 'gl.policyNumber',
  GL_EFF_DATE: 'gl.effDate',
  GL_EXP_DATE: 'gl.expDate',
  GL_LIMIT_EACH_OCC: 'gl.limits.eachOccurrence',
  GL_LIMIT_DAMAGE_RENT: 'gl.limits.damageToRented',
  GL_LIMIT_MED_EXP: 'gl.limits.medExp',
  GL_LIMIT_PERS_ADV_INJ: 'gl.limits.personalAdvInjury',
  GL_LIMIT_GEN_AGG: 'gl.limits.generalAggregate',
  GL_LIMIT_PROD_COMP_OP: 'gl.limits.productsCompOp',
  // AUTO
  AUTO_INSR_LTR: 'auto.insurerLetter',
  AUTO_POLICY_NUMBER: 'auto.policyNumber',
  AUTO_EFF_DATE: 'auto.effDate',
  AUTO_EXP_DATE: 'auto.expDate',
  AUTO_LIMIT_CSL: 'auto.limits.combinedSingleLimit (optional)',
  AUTO_LIMIT_BI_PER_PERS: 'auto.limits.bodilyInjuryPerPerson (optional)',
  AUTO_LIMIT_BI_PER_ACC: 'auto.limits.bodilyInjuryPerAccident (optional)',
  AUTO_LIMIT_PD: 'auto.limits.propertyDamage (optional)',
  // UMBRELLA
  UMB_INSR_LTR: 'umb.insurerLetter',
  UMB_POLICY_NUMBER: 'umb.policyNumber',
  UMB_EFF_DATE: 'umb.effDate',
  UMB_EXP_DATE: 'umb.expDate',
  UMB_LIMIT_EACH_OCC: 'umb.limits.eachOccurrence',
  UMB_LIMIT_AGG: 'umb.limits.aggregate',
  // WC
  WC_CHK_PER_STATUTE: 'static "X" (if wc)',
  WC_OFFICER_YN: 'wc.officerExcluded ? "Y" : "N"',
  WC_INSR_LTR: 'wc.insurerLetter',
  WC_POLICY_NUMBER: 'wc.policyNumber',
  WC_EFF_DATE: 'wc.effDate',
  WC_EXP_DATE: 'wc.expDate',
  WC_LIMIT_EACH_ACC: 'wc.limits.eachAccident',
  WC_LIMIT_DIS_EA_EMPL: 'wc.limits.diseaseEaEmployee',
  WC_LIMIT_DIS_POL_LIM: 'wc.limits.diseasePolicyLimit',
  // OTHER (EQUIPMENT)
  OTHER_INSR_LTR: 'equipment.insurerLetter',
  OTHER_DESCRIPTION: 'equipment.description',
  OTHER_POLICY_NUMBER: 'equipment.policyNumber',
  OTHER_EFF_DATE: 'equipment.effDate',
  OTHER_EXP_DATE: 'equipment.expDate',
  OTHER_LIMIT: 'equipment.limits.equipmentLimit',
  // Cert holder
  HOLDER_NAME: 'input.holder.name',
  HOLDER_ADDRESS_1: 'input.holder.address1',
  HOLDER_ADDRESS_2: 'input.holder.address2',
  // Description of operations
  DESCRIPTION: 'input.description (optional)',
  // Revision number
  REVISION_NUMBER: 'input.revisionNumber (optional)',
};

// Flags for known intentional gaps (don't report as issues)
const KNOWN_UNRENDERED = new Set<string>();

function main(): void {
  console.log('\ncoverage-audit — CoiInput ↔ COORDS gap report\n');

  let zombies = 0;
  let silent = 0;
  let unguarded = 0;

  // ZOMBIE: in FIELD_ANCHORS but not in RENDERED_FROM_FILL
  console.log('── ZOMBIE coords (declared but never rendered) ──');
  for (const key of allCoordKeys) {
    if (!(key in RENDERED_FROM_FILL)) {
      if (!KNOWN_UNRENDERED.has(key)) {
        console.log(`  ZOMBIE  ${key}`);
        zombies++;
      }
    }
  }
  if (zombies === 0) console.log('  (none)');

  // KNOWN_UNRENDERED: note separately
  console.log('\n── Known unrendered (intentional, not yet wired) ──');
  for (const key of KNOWN_UNRENDERED) {
    const source = RENDERED_FROM_FILL[key] ?? 'unknown';
    console.log(`  PENDING ${key}  (${source})`);
  }

  // SILENT: rendered but not in FIELD_ANCHORS (these use absolute coords or are special)
  console.log('\n── SILENT renders (drawAt call exists, no COORDS anchor tracking) ──');
  for (const key of Object.keys(RENDERED_FROM_FILL)) {
    if (!allCoordKeys.has(key) && !KNOWN_UNRENDERED.has(key)) {
      // Expected: SIGNATURE is a rect, not in FIELD_ANCHORS
      if (key !== 'SIGNATURE') {
        console.log(`  SILENT  ${key}  →  ${RENDERED_FROM_FILL[key]}`);
        silent++;
      }
    }
  }
  if (silent === 0) console.log('  (none — all rendered fields are tracked in FIELD_ANCHORS)');

  // UNGUARDED: in FIELD_ANCHORS, rendered, but no FIELD_VALIDATORS entry
  console.log('\n── UNGUARDED optional fields (no Zod validator) ──');
  const optionalFields = [
    'AUTO_LIMIT_CSL', 'AUTO_LIMIT_BI_PER_PERS', 'AUTO_LIMIT_BI_PER_ACC', 'AUTO_LIMIT_PD',
    'WC_OFFICER_YN',
  ];
  for (const key of optionalFields) {
    if (!FIELD_VALIDATORS[key]) {
      console.log(`  UNGUARDED  ${key}  →  ${RENDERED_FROM_FILL[key] ?? 'unknown'}`);
      unguarded++;
    }
  }
  if (unguarded === 0) console.log('  (all checked fields have validators)');

  console.log(`\nSummary: ${zombies} zombies, ${silent} silent renders, ${unguarded} unguarded optional fields`);
  console.log('(exits 0 — informational only)\n');
}

main();
