/**
 * Build a CoiInput (fillAcord25's expected shape) from raw Supabase rows.
 *
 * The fillAcord25 renderer doesn't know about the database — it takes a
 * typed CoiInput. This module is the adapter between DB rows and that shape.
 */

import type {
  Agency,
  CoiInput,
  Coverage,
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
 * Assign insurer letters A..F to the distinct insurers across the policies.
 * Returns the insurer block + a NAIC→letter map for coverage rendering.
 */
function letterMap(policies: DbPolicyFull[]): {
  insurers: Insurer[];
  naicToLetter: Map<string, InsurerLetter>;
} {
  const letters: InsurerLetter[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  const seen = new Map<string, InsurerLetter>();
  const insurers: Insurer[] = [];
  for (const p of policies) {
    if (!p.insurer) continue;
    if (seen.has(p.insurer.naic)) continue;
    const letter = letters[seen.size];
    if (!letter) throw new Error('More than 6 distinct insurers — ACORD 25 only has slots A-F.');
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

  return {
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
  };
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
