/**
 * Standard semantic field catalog for the visual mapper.
 *
 * Each entry binds a stable string key to (a) a human-readable label and
 * group for the mapper UI, and (b) a resolver function that pulls the
 * corresponding value out of a CoiInput. The generic renderer
 * (lib/forms/genericRenderer.ts) calls the resolver at render time so an
 * uploaded form's fields can hydrate from the same data that drives ACORD 25.
 *
 * Keys mirror the legacy COORDS keys in lib/coords.ts (lowercased with
 * underscores), so the ACORD 25 migration script can map COORDS one-to-one.
 *
 * To add a new field type to the dictionary:
 *   1. Add a new entry with a fresh key, label, group, and resolver.
 *   2. If the value needs formatting (money, date), use one of the helpers
 *      below — keeps formatting consistent across forms.
 *   3. The dictionary is consumed by the mapper UI's "add field" dropdown;
 *      groups are used to organize the picker.
 */

import type { CoiInput, Coverage, InsurerLetter } from '../types';

/** Group used to organize the mapper UI's field picker. */
export type FieldGroup =
  | 'header'
  | 'producer'
  | 'contact'
  | 'insurers'
  | 'insured'
  | 'cert'
  | 'gl'
  | 'auto'
  | 'umbrella'
  | 'wc'
  | 'other'
  | 'description'
  | 'holder';

export interface FieldDictionaryEntry {
  /** Stable key — matches form_fields.field_key. e.g. 'insured_name'. */
  key: string;
  /** Human label shown in the mapper UI. e.g. 'Insured: Business Name'. */
  label: string;
  /** Section the field belongs to. Drives mapper UI grouping. */
  group: FieldGroup;
  /** Pulls the value from a CoiInput. Return '' to skip rendering (the
   *  generic renderer treats empty strings as "don't draw"). */
  resolver: (input: CoiInput) => string;
}

// =============================================================================
// Formatters — mirror fillAcord25's exact conventions so the data-driven
// renderer produces byte-identical output to the legacy renderer.
// =============================================================================

/** Comma-grouped, no decimals. `1000000` → `"1,000,000"`. */
function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null) return '';
  return n.toLocaleString('en-US');
}

/** Find a coverage by type with full type inference. */
function findCov<T extends Coverage['type']>(
  coverages: Coverage[],
  type: T,
): Extract<Coverage, { type: T }> | undefined {
  return coverages.find((c) => c.type === type) as Extract<Coverage, { type: T }> | undefined;
}

/** Find an insurer by letter (A-F). */
function findInsurer(input: CoiInput, letter: InsurerLetter) {
  return input.insurers.find((i) => i.letter === letter);
}

/** Checkbox X if predicate is truthy, '' otherwise. */
function check(b: unknown): string {
  return b ? 'X' : '';
}

// =============================================================================
// Dictionary entries — mirror every COORDS entry in lib/coords.ts
// =============================================================================

export const FIELD_DICTIONARY: readonly FieldDictionaryEntry[] = [
  // ── HEADER ────────────────────────────────────────────────────────────────
  { key: 'date', label: 'Header: Cert Date', group: 'header', resolver: (i) => i.certDate },

  // ── PRODUCER block ────────────────────────────────────────────────────────
  { key: 'producer_name', label: 'Producer: Agency Name', group: 'producer', resolver: (i) => i.agency.name },
  { key: 'producer_address_1', label: 'Producer: Address Line 1', group: 'producer', resolver: (i) => i.agency.address1 },
  { key: 'producer_address_2', label: 'Producer: Address Line 2', group: 'producer', resolver: (i) => i.agency.address2 },

  // ── CONTACT column ────────────────────────────────────────────────────────
  { key: 'contact_name', label: 'Contact: Name', group: 'contact', resolver: (i) => i.agency.contactName },
  { key: 'contact_phone', label: 'Contact: Phone', group: 'contact', resolver: (i) => i.agency.phone },
  { key: 'contact_fax', label: 'Contact: Fax', group: 'contact', resolver: (i) => i.agency.fax },
  { key: 'contact_email', label: 'Contact: Email', group: 'contact', resolver: (i) => i.agency.email },

  // ── INSURERS A-F (name + NAIC) ────────────────────────────────────────────
  ...(['A', 'B', 'C', 'D', 'E', 'F'] as const).flatMap((letter): FieldDictionaryEntry[] => [
    {
      key: `insurer_${letter.toLowerCase()}_name`,
      label: `Insurer ${letter}: Name`,
      group: 'insurers',
      resolver: (i) => findInsurer(i, letter)?.name ?? '',
    },
    {
      key: `insurer_${letter.toLowerCase()}_naic`,
      label: `Insurer ${letter}: NAIC`,
      group: 'insurers',
      resolver: (i) => findInsurer(i, letter)?.naic ?? '',
    },
  ]),

  // ── INSURED block ─────────────────────────────────────────────────────────
  { key: 'insured_name', label: 'Insured: Business Name', group: 'insured', resolver: (i) => i.insured.name },
  { key: 'insured_address_1', label: 'Insured: Address Line 1', group: 'insured', resolver: (i) => i.insured.address1 },
  { key: 'insured_address_2', label: 'Insured: Address Line 2', group: 'insured', resolver: (i) => i.insured.address2 },

  // ── CERT META ─────────────────────────────────────────────────────────────
  { key: 'cert_number', label: 'Certificate Number', group: 'cert', resolver: (i) => i.certNumber },
  { key: 'revision_number', label: 'Revision Number', group: 'cert', resolver: (i) => i.revisionNumber ?? '' },

  // ── GL row ────────────────────────────────────────────────────────────────
  { key: 'gl_chk_type', label: 'GL: Type checkbox', group: 'gl', resolver: (i) => check(findCov(i.coverages, 'GL')) },
  { key: 'gl_chk_occur', label: 'GL: Occurrence checkbox', group: 'gl',
    resolver: (i) => { const gl = findCov(i.coverages, 'GL'); return check(gl && !gl.claimsMade); } },
  { key: 'gl_chk_claims_made', label: 'GL: Claims-Made checkbox', group: 'gl',
    resolver: (i) => check(findCov(i.coverages, 'GL')?.claimsMade) },
  { key: 'gl_chk_agg_policy', label: 'GL: Aggregate per POLICY checkbox', group: 'gl',
    resolver: (i) => check(findCov(i.coverages, 'GL')?.generalAggregateAppliesPer === 'POLICY') },
  { key: 'gl_chk_agg_project', label: 'GL: Aggregate per PROJECT checkbox', group: 'gl',
    resolver: (i) => check(findCov(i.coverages, 'GL')?.generalAggregateAppliesPer === 'PROJECT') },
  { key: 'gl_chk_agg_loc', label: 'GL: Aggregate per LOC checkbox', group: 'gl',
    resolver: (i) => check(findCov(i.coverages, 'GL')?.generalAggregateAppliesPer === 'LOC') },
  { key: 'gl_chk_agg_other', label: 'GL: Aggregate per OTHER checkbox', group: 'gl',
    resolver: (i) => check(findCov(i.coverages, 'GL')?.generalAggregateAppliesPer === 'OTHER') },
  { key: 'gl_agg_other_text', label: 'GL: OTHER aggregate free-text', group: 'gl',
    resolver: (i) => findCov(i.coverages, 'GL')?.generalAggregateOtherText ?? '' },
  { key: 'gl_insr_ltr', label: 'GL: Insurer letter', group: 'gl', resolver: (i) => findCov(i.coverages, 'GL')?.insurerLetter ?? '' },
  { key: 'gl_policy_number', label: 'GL: Policy Number', group: 'gl', resolver: (i) => findCov(i.coverages, 'GL')?.policyNumber ?? '' },
  { key: 'gl_eff_date', label: 'GL: Effective Date', group: 'gl', resolver: (i) => findCov(i.coverages, 'GL')?.effDate ?? '' },
  { key: 'gl_exp_date', label: 'GL: Expiration Date', group: 'gl', resolver: (i) => findCov(i.coverages, 'GL')?.expDate ?? '' },
  { key: 'gl_limit_each_occ', label: 'GL: Limit — Each Occurrence', group: 'gl',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'GL')?.limits.eachOccurrence) },
  { key: 'gl_limit_damage_rent', label: 'GL: Limit — Damage to Rented', group: 'gl',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'GL')?.limits.damageToRented) },
  { key: 'gl_limit_med_exp', label: 'GL: Limit — Med Exp', group: 'gl',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'GL')?.limits.medExp) },
  { key: 'gl_limit_pers_adv_inj', label: 'GL: Limit — Personal & Adv Injury', group: 'gl',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'GL')?.limits.personalAdvInjury) },
  { key: 'gl_limit_gen_agg', label: 'GL: Limit — General Aggregate', group: 'gl',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'GL')?.limits.generalAggregate) },
  { key: 'gl_limit_prod_comp_op', label: 'GL: Limit — Products Comp/Op Agg', group: 'gl',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'GL')?.limits.productsCompOp) },

  // ── AUTO row ──────────────────────────────────────────────────────────────
  { key: 'auto_chk_any_auto', label: 'AUTO: Any Auto checkbox', group: 'auto',
    resolver: (i) => check(findCov(i.coverages, 'AUTO')?.anyAuto) },
  { key: 'auto_chk_owned', label: 'AUTO: Owned Autos Only checkbox', group: 'auto',
    resolver: (i) => check(findCov(i.coverages, 'AUTO')?.ownedAutosOnly) },
  { key: 'auto_chk_scheduled', label: 'AUTO: Scheduled Autos checkbox', group: 'auto',
    resolver: (i) => check(findCov(i.coverages, 'AUTO')?.scheduledAutos) },
  { key: 'auto_chk_hired', label: 'AUTO: Hired Autos Only checkbox', group: 'auto',
    resolver: (i) => check(findCov(i.coverages, 'AUTO')?.hiredAutosOnly) },
  { key: 'auto_chk_non_owned', label: 'AUTO: Non-Owned Autos Only checkbox', group: 'auto',
    resolver: (i) => check(findCov(i.coverages, 'AUTO')?.nonOwnedAutosOnly) },
  { key: 'auto_insr_ltr', label: 'AUTO: Insurer letter', group: 'auto', resolver: (i) => findCov(i.coverages, 'AUTO')?.insurerLetter ?? '' },
  { key: 'auto_policy_number', label: 'AUTO: Policy Number', group: 'auto', resolver: (i) => findCov(i.coverages, 'AUTO')?.policyNumber ?? '' },
  { key: 'auto_eff_date', label: 'AUTO: Effective Date', group: 'auto', resolver: (i) => findCov(i.coverages, 'AUTO')?.effDate ?? '' },
  { key: 'auto_exp_date', label: 'AUTO: Expiration Date', group: 'auto', resolver: (i) => findCov(i.coverages, 'AUTO')?.expDate ?? '' },
  { key: 'auto_limit_csl', label: 'AUTO: Limit — Combined Single Limit', group: 'auto',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'AUTO')?.limits.combinedSingleLimit) },
  { key: 'auto_limit_bi_per_pers', label: 'AUTO: Limit — Bodily Injury / Person', group: 'auto',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'AUTO')?.limits.bodilyInjuryPerPerson) },
  { key: 'auto_limit_bi_per_acc', label: 'AUTO: Limit — Bodily Injury / Accident', group: 'auto',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'AUTO')?.limits.bodilyInjuryPerAccident) },
  { key: 'auto_limit_pd', label: 'AUTO: Limit — Property Damage', group: 'auto',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'AUTO')?.limits.propertyDamage) },

  // ── UMBRELLA row ──────────────────────────────────────────────────────────
  { key: 'umb_chk_umbrella', label: 'UMB: Umbrella Liab checkbox', group: 'umbrella',
    resolver: (i) => { const u = findCov(i.coverages, 'UMBRELLA'); return check(u && !u.excess); } },
  { key: 'umb_chk_excess', label: 'UMB: Excess Liab checkbox', group: 'umbrella',
    resolver: (i) => check(findCov(i.coverages, 'UMBRELLA')?.excess) },
  { key: 'umb_chk_occur', label: 'UMB: Occurrence checkbox', group: 'umbrella',
    resolver: (i) => { const u = findCov(i.coverages, 'UMBRELLA'); return check(u && !u.claimsMade); } },
  { key: 'umb_chk_claims_made', label: 'UMB: Claims-Made checkbox', group: 'umbrella',
    resolver: (i) => check(findCov(i.coverages, 'UMBRELLA')?.claimsMade) },
  { key: 'umb_chk_ded', label: 'UMB: DED checkbox', group: 'umbrella',
    resolver: (i) => check(findCov(i.coverages, 'UMBRELLA')?.deductibleVsRetention === 'DED') },
  { key: 'umb_chk_retention', label: 'UMB: RETENTION checkbox', group: 'umbrella',
    resolver: (i) => check(findCov(i.coverages, 'UMBRELLA')?.deductibleVsRetention === 'RETENTION') },
  { key: 'umb_insr_ltr', label: 'UMB: Insurer letter', group: 'umbrella', resolver: (i) => findCov(i.coverages, 'UMBRELLA')?.insurerLetter ?? '' },
  { key: 'umb_policy_number', label: 'UMB: Policy Number', group: 'umbrella', resolver: (i) => findCov(i.coverages, 'UMBRELLA')?.policyNumber ?? '' },
  { key: 'umb_eff_date', label: 'UMB: Effective Date', group: 'umbrella', resolver: (i) => findCov(i.coverages, 'UMBRELLA')?.effDate ?? '' },
  { key: 'umb_exp_date', label: 'UMB: Expiration Date', group: 'umbrella', resolver: (i) => findCov(i.coverages, 'UMBRELLA')?.expDate ?? '' },
  { key: 'umb_limit_each_occ', label: 'UMB: Limit — Each Occurrence', group: 'umbrella',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'UMBRELLA')?.limits.eachOccurrence) },
  { key: 'umb_limit_agg', label: 'UMB: Limit — Aggregate', group: 'umbrella',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'UMBRELLA')?.limits.aggregate) },
  { key: 'umb_limit_retention', label: 'UMB: Limit — Retention amount', group: 'umbrella',
    resolver: (i) => {
      const r = findCov(i.coverages, 'UMBRELLA')?.limits.retention;
      return r && r > 0 ? fmtMoney(r) : '';
    } },

  // ── WC row ────────────────────────────────────────────────────────────────
  { key: 'wc_chk_per_statute', label: 'WC: PER STATUTE checkbox', group: 'wc',
    resolver: (i) => { const w = findCov(i.coverages, 'WC'); return check(w && w.perStatuteVsOther !== 'OTHER'); } },
  { key: 'wc_chk_other', label: 'WC: OTH- checkbox', group: 'wc',
    resolver: (i) => check(findCov(i.coverages, 'WC')?.perStatuteVsOther === 'OTHER') },
  { key: 'wc_other_text', label: 'WC: OTH- free-text', group: 'wc',
    resolver: (i) => findCov(i.coverages, 'WC')?.perStatuteOtherText ?? '' },
  { key: 'wc_officer_yn', label: 'WC: Officer Excluded Y/N', group: 'wc',
    resolver: (i) => { const w = findCov(i.coverages, 'WC'); return w ? (w.officerExcluded ? 'Y' : 'N') : ''; } },
  { key: 'wc_insr_ltr', label: 'WC: Insurer letter', group: 'wc', resolver: (i) => findCov(i.coverages, 'WC')?.insurerLetter ?? '' },
  { key: 'wc_policy_number', label: 'WC: Policy Number', group: 'wc', resolver: (i) => findCov(i.coverages, 'WC')?.policyNumber ?? '' },
  { key: 'wc_eff_date', label: 'WC: Effective Date', group: 'wc', resolver: (i) => findCov(i.coverages, 'WC')?.effDate ?? '' },
  { key: 'wc_exp_date', label: 'WC: Expiration Date', group: 'wc', resolver: (i) => findCov(i.coverages, 'WC')?.expDate ?? '' },
  { key: 'wc_limit_each_acc', label: 'WC: Limit — Each Accident', group: 'wc',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'WC')?.limits.eachAccident) },
  { key: 'wc_limit_dis_ea_empl', label: 'WC: Limit — Disease/Employee', group: 'wc',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'WC')?.limits.diseaseEaEmployee) },
  { key: 'wc_limit_dis_pol_lim', label: 'WC: Limit — Disease/Policy', group: 'wc',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'WC')?.limits.diseasePolicyLimit) },

  // ── OTHER row (EQUIPMENT lives here) ─────────────────────────────────────
  { key: 'other_insr_ltr', label: 'OTHER: Insurer letter', group: 'other',
    resolver: (i) => findCov(i.coverages, 'EQUIPMENT')?.insurerLetter ?? '' },
  { key: 'other_description', label: 'OTHER: Coverage Description', group: 'other',
    resolver: (i) => findCov(i.coverages, 'EQUIPMENT')?.description ?? '' },
  { key: 'other_policy_number', label: 'OTHER: Policy Number', group: 'other',
    resolver: (i) => findCov(i.coverages, 'EQUIPMENT')?.policyNumber ?? '' },
  { key: 'other_eff_date', label: 'OTHER: Effective Date', group: 'other',
    resolver: (i) => findCov(i.coverages, 'EQUIPMENT')?.effDate ?? '' },
  { key: 'other_exp_date', label: 'OTHER: Expiration Date', group: 'other',
    resolver: (i) => findCov(i.coverages, 'EQUIPMENT')?.expDate ?? '' },
  { key: 'other_limit', label: 'OTHER: Equipment Limit', group: 'other',
    resolver: (i) => fmtMoney(findCov(i.coverages, 'EQUIPMENT')?.limits.equipmentLimit) },

  // ── DESCRIPTION OF OPERATIONS ────────────────────────────────────────────
  { key: 'description', label: 'Description of Operations', group: 'description',
    resolver: (i) => i.description ?? '' },

  // ── CERTIFICATE HOLDER block ─────────────────────────────────────────────
  { key: 'holder_name', label: 'Holder: Name', group: 'holder', resolver: (i) => i.holder.name },
  { key: 'holder_address_1', label: 'Holder: Address Line 1', group: 'holder', resolver: (i) => i.holder.address1 },
  { key: 'holder_address_2', label: 'Holder: Address Line 2', group: 'holder', resolver: (i) => i.holder.address2 },
];

const BY_KEY = new Map<string, FieldDictionaryEntry>(
  FIELD_DICTIONARY.map((e) => [e.key, e]),
);

/** Lookup a resolver by field key. Returns null for unknown keys (e.g.,
 *  'custom_<n>' free-form fields the dictionary doesn't know about). */
export function getResolver(key: string): ((input: CoiInput) => string) | null {
  return BY_KEY.get(key)?.resolver ?? null;
}

/** Lookup a full entry by field key. */
export function getDictionaryEntry(key: string): FieldDictionaryEntry | null {
  return BY_KEY.get(key) ?? null;
}

/** Returns true if the key is in the dictionary (vs. a custom free-form field). */
export function isDictionaryKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Entries grouped for the mapper UI's add-field dropdown. */
export function dictionaryByGroup(): Record<FieldGroup, FieldDictionaryEntry[]> {
  const out: Record<string, FieldDictionaryEntry[]> = {};
  for (const entry of FIELD_DICTIONARY) {
    (out[entry.group] ??= []).push(entry);
  }
  return out as Record<FieldGroup, FieldDictionaryEntry[]>;
}
