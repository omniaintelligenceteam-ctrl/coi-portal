/**
 * Build a CoiInput (fillAcord25's expected shape) from raw Supabase rows.
 *
 * The fillAcord25 renderer doesn't know about the database — it takes a
 * typed CoiInput. This module is the adapter between DB rows and that shape.
 */

import type {
  Agency,
  CertOverrides,
  CoiInput,
  Coverage,
  CoverageOverride,
  GLCoverage,
  AutoCoverage,
  UmbrellaCoverage,
  WCCoverage,
  EquipmentCoverage,
  Insured,
  Insurer,
  InsurerLetter,
  Holder,
} from './types';

export type DbAgency = {
  name: string;
  address1: string | null;
  address2: string | null;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

export type DbClient = {
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
};

export type DbPolicyFull = {
  id: string;
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';
  policy_number: string;
  eff_date: string; // 'YYYY-MM-DD'
  exp_date: string;
  active: boolean;
  /** Coverage lifecycle (migration 20260520_0002). Optional for backward
   *  compat with older callers — missing/undefined treated as 'active'. */
  status?: 'active' | 'cancelled' | 'expired';
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  limits_jsonb: Record<string, number>;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  description: string | null;
  insurer: { name: string; naic: string } | null;
};

function isoToUsDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

/**
 * Assign insurer letters (A, B, C, ...) to the distinct insurers across the
 * policies. Returns the insurer block + a NAIC→letter map for coverage
 * rendering.
 *
 * `slotCount` defaults to 6 (ACORD 25 has rows A-F). Other forms may have
 * different counts — pass the form's FormConfig.insurerSlotCount.
 */
const INSURER_LETTERS: InsurerLetter[] = ['A', 'B', 'C', 'D', 'E', 'F'];

function letterMap(
  policies: DbPolicyFull[],
  slotCount: number = INSURER_LETTERS.length,
): {
  insurers: Insurer[];
  naicToLetter: Map<string, InsurerLetter>;
} {
  const effective = Math.min(slotCount, INSURER_LETTERS.length);
  const letters = INSURER_LETTERS.slice(0, effective);
  const seen = new Map<string, InsurerLetter>();
  const insurers: Insurer[] = [];
  for (const p of policies) {
    if (!p.insurer) continue;
    if (seen.has(p.insurer.naic)) continue;
    const letter = letters[seen.size];
    if (!letter) {
      throw new Error(
        `More than ${effective} distinct insurers — this form template only has ${effective} insurer slot(s).`,
      );
    }
    seen.set(p.insurer.naic, letter);
    insurers.push({ letter, name: p.insurer.name, naic: p.insurer.naic });
  }
  return { insurers, naicToLetter: seen };
}

function buildCoverage(p: DbPolicyFull, letter: InsurerLetter): Coverage {
  const base = {
    insurerLetter: letter,
    policyNumber: p.policy_number,
    effDate: isoToUsDate(p.eff_date),
    expDate: isoToUsDate(p.exp_date),
    addlInsuredBlanket: p.addl_insured_blanket,
    subrogationWaived: p.subrogation_waived,
    policyId: p.id,
  };
  switch (p.type) {
    case 'GL': {
      const lim = p.limits_jsonb;
      const gl: GLCoverage = {
        ...base,
        type: 'GL',
        generalAggregateAppliesPer: 'POLICY',
        limits: {
          eachOccurrence: lim.eachOccurrence ?? 0,
          damageToRented: lim.damageToRented ?? 0,
          medExp: lim.medExp ?? 0,
          personalAdvInjury: lim.personalAdvInjury ?? 0,
          generalAggregate: lim.generalAggregate ?? 0,
          productsCompOp: lim.productsCompOp ?? 0,
        },
      };
      return gl;
    }
    case 'AUTO': {
      const lim = p.limits_jsonb;
      const auto: AutoCoverage = {
        ...base,
        type: 'AUTO',
        limits: {
          combinedSingleLimit: lim.combinedSingleLimit,
          bodilyInjuryPerPerson: lim.bodilyInjuryPerPerson,
          bodilyInjuryPerAccident: lim.bodilyInjuryPerAccident,
          propertyDamage: lim.propertyDamage,
        },
      };
      return auto;
    }
    case 'UMBRELLA': {
      const lim = p.limits_jsonb;
      const umb: UmbrellaCoverage = {
        ...base,
        type: 'UMBRELLA',
        deductibleVsRetention: 'RETENTION',
        limits: {
          eachOccurrence: lim.eachOccurrence ?? 0,
          aggregate: lim.aggregate ?? 0,
          retention: lim.retention,
        },
      };
      return umb;
    }
    case 'WC': {
      const lim = p.limits_jsonb;
      const wc: WCCoverage = {
        ...base,
        type: 'WC',
        officerExcluded: true,
        perStatuteVsOther: 'PER_STATUTE',
        limits: {
          eachAccident: lim.eachAccident ?? 0,
          diseaseEaEmployee: lim.diseaseEaEmployee ?? 0,
          diseasePolicyLimit: lim.diseasePolicyLimit ?? 0,
        },
      };
      return wc;
    }
    case 'EQUIPMENT': {
      const lim = p.limits_jsonb;
      const eq: EquipmentCoverage = {
        ...base,
        type: 'EQUIPMENT',
        description: p.description ?? 'Contractors Equipment',
        limits: { equipmentLimit: lim.equipmentLimit ?? 0 },
      };
      return eq;
    }
    case 'OTHER':
    default: {
      const lim = p.limits_jsonb;
      const other: EquipmentCoverage = {
        ...base,
        type: 'EQUIPMENT',
        description: p.description ?? 'Other Coverage',
        limits: { equipmentLimit: lim.equipmentLimit ?? lim.eachOccurrence ?? 0 },
      };
      return other;
    }
  }
}

export function buildCoiInput(args: {
  agency: DbAgency;
  client: DbClient;
  policies: DbPolicyFull[];
  holder: Holder;
  certNumber: string;
  today: Date;
  templatePngPath: string;
  signaturePngPath: string;
  description?: string;
  revisionNumber?: string;
  /** Brook-edited cert field snapshot. Merged over DB-derived values. */
  overrides?: CertOverrides;
  /** Stamp the rendered PDF with a VOIDED watermark. */
  voided?: boolean;
}): CoiInput {
  const agency: Agency = {
    name: args.agency.name,
    address1: args.agency.address1 ?? '',
    address2: args.agency.address2 ?? '',
    contactName: args.agency.contact_name ?? '',
    phone: args.agency.phone ?? '',
    fax: args.agency.fax ?? '',
    email: args.agency.email ?? '',
  };

  const insured: Insured = {
    name: args.client.business_name,
    address1: args.client.business_address1 ?? '',
    address2: args.client.business_address2 ?? '',
  };

  // Sort policies by coverage type so insurer letter assignment is deterministic
  // and matches ACORD convention (GL's insurer = A, WC's = B, etc).
  const TYPE_ORDER: Record<DbPolicyFull['type'], number> = {
    GL: 0, AUTO: 1, UMBRELLA: 2, WC: 3, EQUIPMENT: 4, OTHER: 5,
  };
  const sortedPolicies = [...args.policies].sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type],
  );

  const { insurers, naicToLetter } = letterMap(sortedPolicies);

  const coverages: Coverage[] = sortedPolicies.flatMap((p) => {
    if (!p.insurer) return [];
    const letter = naicToLetter.get(p.insurer.naic);
    if (!letter) return [];
    return [buildCoverage(p, letter)];
  });

  const m = (args.today.getMonth() + 1).toString().padStart(2, '0');
  const d = args.today.getDate().toString().padStart(2, '0');
  const y = args.today.getFullYear().toString();
  const certDate = `${m}/${d}/${y}`;

  const base: CoiInput = {
    agency,
    insured,
    insurers,
    coverages,
    holder: args.holder,
    certNumber: args.certNumber,
    certDate,
    ...(args.description ? { description: args.description } : {}),
    ...(args.revisionNumber ? { revisionNumber: args.revisionNumber } : {}),
    signaturePngPath: args.signaturePngPath,
    templatePngPath: args.templatePngPath,
    ...(args.voided ? { voided: true } : {}),
  };

  return args.overrides ? applyCertOverrides(base, args.overrides) : base;
}

// =============================================================================
// applyCertOverrides — merge a Brook-edited overrides snapshot over a CoiInput.
// =============================================================================
// Pure function. The caller is responsible for sourcing the canonical CoiInput
// from the DB. Used:
//   - From buildCoiInput at render time (overrides come from cert_requests row)
//   - From the preview flow (overrides come from un-saved DecisionForm state)
//
// INVARIANTS:
//   - certDate, certNumber, signaturePngPath, templatePngPath, revisionNumber
//     are NEVER mutated. Mode is structurally enforced by CertOverrides type.
//   - holder is NEVER mutated here — it lives on cert_requests row columns.
//   - Coverage overrides match on policyId. Coverages without policyId (legacy)
//     are passed through untouched.
//   - Insurer overrides match on the CURRENT naic. If the override mutates the
//     naic itself, the insurer block is updated but coverages still reference
//     it by letter, so no coverage rewrites are needed.
// =============================================================================

export function applyCertOverrides(input: CoiInput, overrides: CertOverrides): CoiInput {
  const out: CoiInput = {
    ...input,
    agency: applyAgencyOverride(input.agency, overrides.agency),
    insured: applyInsuredOverride(input.insured, overrides.insured),
    insurers: applyInsurerOverrides(input.insurers, overrides.insurers),
    coverages: applyCoverageOverrides(input.coverages, overrides.coverages),
  };
  if (overrides.description !== undefined) {
    if (overrides.description.length > 0) {
      out.description = overrides.description;
    } else {
      delete out.description;
    }
  }
  if (overrides.revisionNumber !== undefined) {
    if (overrides.revisionNumber.length > 0) {
      out.revisionNumber = overrides.revisionNumber;
    } else {
      delete out.revisionNumber;
    }
  }
  return out;
}

function applyAgencyOverride(agency: Agency, ov: CertOverrides['agency']): Agency {
  if (!ov) return agency;
  return {
    name: ov.name ?? agency.name,
    address1: ov.address1 ?? agency.address1,
    address2: ov.address2 ?? agency.address2,
    contactName: ov.contactName ?? agency.contactName,
    phone: ov.phone ?? agency.phone,
    fax: ov.fax ?? agency.fax,
    email: ov.email ?? agency.email,
  };
}

function applyInsuredOverride(insured: Insured, ov: CertOverrides['insured']): Insured {
  if (!ov) return insured;
  return {
    name: ov.name ?? insured.name,
    address1: ov.address1 ?? insured.address1,
    address2: ov.address2 ?? insured.address2,
  };
}

function applyInsurerOverrides(
  insurers: Insurer[],
  ov: CertOverrides['insurers'],
): Insurer[] {
  if (!ov || Object.keys(ov).length === 0) return insurers;
  return insurers.map((ins) => {
    const o = ov[ins.naic];
    if (!o) return ins;
    return {
      letter: ins.letter,
      name: o.name ?? ins.name,
      naic: o.naic ?? ins.naic,
    };
  });
}

function applyCoverageOverrides(
  coverages: Coverage[],
  ov: CertOverrides['coverages'],
): Coverage[] {
  if (!ov || Object.keys(ov).length === 0) return coverages;
  return coverages.map((cov) => {
    const pid = cov.policyId;
    if (!pid) return cov;
    const o = ov[pid];
    if (!o) return cov;
    return applyOneCoverageOverride(cov, o);
  });
}

function applyOneCoverageOverride(cov: Coverage, o: CoverageOverride): Coverage {
  const merged: Coverage = { ...cov };
  if (o.policyNumber !== undefined) merged.policyNumber = o.policyNumber;
  if (o.effDate !== undefined) merged.effDate = o.effDate;
  if (o.expDate !== undefined) merged.expDate = o.expDate;
  if (o.addlInsuredBlanket !== undefined) merged.addlInsuredBlanket = o.addlInsuredBlanket;
  if (o.subrogationWaived !== undefined) merged.subrogationWaived = o.subrogationWaived;
  // Per-coverage description (EQUIPMENT / OTHER use this slot)
  if (o.description !== undefined && (merged.type === 'EQUIPMENT')) {
    (merged as EquipmentCoverage).description = o.description;
  }
  // Limits: shallow-merge over the existing limits object. Keys in the override
  // that map to `undefined` are ignored (zod stripped them).
  if (o.limits && Object.keys(o.limits).length > 0) {
    const existingLimits = (merged as { limits?: Record<string, unknown> }).limits;
    const mergedLimits: Record<string, unknown> = { ...(existingLimits ?? {}) };
    for (const [k, v] of Object.entries(o.limits)) {
      if (v !== undefined) mergedLimits[k] = v;
    }
    (merged as { limits: Record<string, unknown> }).limits = mergedLimits;
  }
  // Type-specific flags. Only apply to the matching coverage type — silently
  // skip GL flags on an Auto row, etc. (Brook can't physically tab to those
  // controls anyway; this is defense in depth against a malformed payload.)
  if (merged.type === 'GL') {
    const gl = merged as GLCoverage;
    if (o.claimsMade !== undefined) gl.claimsMade = o.claimsMade;
    if (o.generalAggregateAppliesPer !== undefined) gl.generalAggregateAppliesPer = o.generalAggregateAppliesPer;
    if (o.generalAggregateOtherText !== undefined) gl.generalAggregateOtherText = o.generalAggregateOtherText;
  } else if (merged.type === 'AUTO') {
    const a = merged as AutoCoverage;
    if (o.anyAuto !== undefined) a.anyAuto = o.anyAuto;
    if (o.ownedAutosOnly !== undefined) a.ownedAutosOnly = o.ownedAutosOnly;
    if (o.scheduledAutos !== undefined) a.scheduledAutos = o.scheduledAutos;
    if (o.hiredAutosOnly !== undefined) a.hiredAutosOnly = o.hiredAutosOnly;
    if (o.nonOwnedAutosOnly !== undefined) a.nonOwnedAutosOnly = o.nonOwnedAutosOnly;
  } else if (merged.type === 'UMBRELLA') {
    const u = merged as UmbrellaCoverage;
    if (o.excess !== undefined) u.excess = o.excess;
    if (o.claimsMade !== undefined) u.claimsMade = o.claimsMade;
    if (o.deductibleVsRetention !== undefined) u.deductibleVsRetention = o.deductibleVsRetention;
  } else if (merged.type === 'WC') {
    const w = merged as WCCoverage;
    if (o.officerExcluded !== undefined) w.officerExcluded = o.officerExcluded;
    if (o.perStatuteVsOther !== undefined) w.perStatuteVsOther = o.perStatuteVsOther;
    if (o.perStatuteOtherText !== undefined) w.perStatuteOtherText = o.perStatuteOtherText;
  }
  return merged;
}

/**
 * Compute the next cert number for today by querying the max existing
 * sequence for today's date prefix. Pure helper — caller passes today + the
 * max-seen-cert-number-for-today.
 */
export function computeNextCertNumber(today: Date, currentMaxForDay: string | null): string {
  const y = today.getFullYear().toString().padStart(4, '0');
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  const datePart = `${y}${m}${d}`;

  let nextSeq = 1;
  if (currentMaxForDay) {
    const match = /^PP-\d{8}-(\d{4})$/.exec(currentMaxForDay);
    if (match) {
      nextSeq = Number.parseInt(match[1]!, 10) + 1;
    }
  }
  if (nextSeq > 9999) {
    throw new Error('Daily cert limit (9999) exceeded.');
  }
  return `PP-${datePart}-${nextSeq.toString().padStart(4, '0')}`;
}
