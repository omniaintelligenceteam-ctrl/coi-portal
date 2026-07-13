/**
 * Deterministic requirements engine.
 *
 * Holder contracts demand specific coverage types, limits, and endorsements.
 * The LLM reviewer can *notice* mismatches; this module *proves* them: a pure
 * requested-vs-carried comparison between a holder's stored requirements
 * (holders.requirements jsonb) and the policies actually selected for the
 * cert. Findings merge into reviewer_flags, and any error-severity finding
 * forces the trust ladder into the manual lane — an LLM confidence score can
 * never override a hard contractual mismatch.
 */

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from './logger';

const POLICY_TYPES = ['GL', 'WC', 'AUTO', 'UMBRELLA', 'EQUIPMENT', 'OTHER'] as const;
export type RequirementPolicyType = (typeof POLICY_TYPES)[number];

export const HolderRequirementsSchema = z.object({
  /** Coverage types that must appear on the cert. */
  requiredCoverageTypes: z.array(z.enum(POLICY_TYPES)).optional(),
  /** Minimum limits per coverage type, keyed by limits_jsonb key
   *  (e.g. { GL: { eachOccurrence: 1000000, generalAggregate: 2000000 } }). */
  requiredLimits: z
    .partialRecord(z.enum(POLICY_TYPES), z.record(z.string(), z.number().nonnegative()))
    .optional(),
  requiresAdditionalInsured: z.boolean().optional(),
  requiresWaiverOfSubrogation: z.boolean().optional(),
  requiresPrimaryNoncontributory: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export type HolderRequirements = z.infer<typeof HolderRequirementsSchema>;

/** Matches the reviewer flag shape so findings merge into reviewer_flags. */
export type RequirementFinding = {
  field: string;
  severity: 'error' | 'warning';
  message: string;
};

export type PolicyForRequirements = {
  type: RequirementPolicyType;
  limits_jsonb: Record<string, number> | null;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  primary_noncontributory?: boolean;
};

/** Human labels for limit keys — falls back to the raw key. */
const LIMIT_LABEL: Record<string, string> = {
  eachOccurrence: 'each occurrence',
  generalAggregate: 'general aggregate',
  productsCompOp: 'products/completed ops',
  personalAdvInjury: 'personal & adv injury',
  damageToRented: 'damage to rented premises',
  medExp: 'medical expense',
  combinedSingleLimit: 'combined single limit',
  eachAccident: 'each accident',
  diseaseEaEmployee: 'disease each employee',
  diseasePolicyLimit: 'disease policy limit',
  aggregate: 'aggregate',
  equipmentLimit: 'equipment limit',
};

function money(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export function parseHolderRequirements(raw: unknown): HolderRequirements | null {
  if (raw == null) return null;
  const parsed = HolderRequirementsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Pure requested-vs-carried check. Returns [] when everything the holder
 * requires is carried by the selected policies.
 */
export function checkRequirements(
  req: HolderRequirements,
  policies: PolicyForRequirements[],
): RequirementFinding[] {
  const findings: RequirementFinding[] = [];
  const byType = new Map<RequirementPolicyType, PolicyForRequirements[]>();
  for (const p of policies) {
    const arr = byType.get(p.type) ?? [];
    arr.push(p);
    byType.set(p.type, arr);
  }

  for (const t of req.requiredCoverageTypes ?? []) {
    if (!byType.has(t)) {
      findings.push({
        field: `requirements.coverage.${t}`,
        severity: 'error',
        message: `Holder requires ${t} coverage — not included on this certificate.`,
      });
    }
  }

  for (const [t, limits] of Object.entries(req.requiredLimits ?? {})) {
    const type = t as RequirementPolicyType;
    const carried = byType.get(type);
    if (!carried || carried.length === 0) {
      // Only flag here if the missing-coverage error wasn't already raised.
      if (!(req.requiredCoverageTypes ?? []).includes(type)) {
        findings.push({
          field: `requirements.coverage.${type}`,
          severity: 'error',
          message: `Holder requires ${type} limits — ${type} coverage is not on this certificate.`,
        });
      }
      continue;
    }
    for (const [key, required] of Object.entries(limits ?? {})) {
      if (!(required > 0)) continue;
      // Best carried value across policies of this type (umbrella stacking is
      // intentionally NOT netted in — that's an agent judgment call).
      const best = Math.max(...carried.map((p) => p.limits_jsonb?.[key] ?? 0));
      if (best < required) {
        findings.push({
          field: `requirements.limit.${type}.${key}`,
          severity: 'error',
          message: `Holder requires ${type} ${LIMIT_LABEL[key] ?? key} of ${money(required)} — policy carries ${best > 0 ? money(best) : 'no value'}.`,
        });
      }
    }
  }

  if (req.requiresAdditionalInsured && !policies.some((p) => p.addl_insured_blanket)) {
    findings.push({
      field: 'requirements.additionalInsured',
      severity: 'error',
      message:
        'Holder requires Additional Insured status — no selected policy carries a blanket AI endorsement.',
    });
  }
  if (req.requiresWaiverOfSubrogation && !policies.some((p) => p.subrogation_waived)) {
    findings.push({
      field: 'requirements.waiverOfSubrogation',
      severity: 'error',
      message:
        'Holder requires a Waiver of Subrogation — no selected policy carries a blanket waiver.',
    });
  }
  if (
    req.requiresPrimaryNoncontributory &&
    !policies.some((p) => p.primary_noncontributory === true)
  ) {
    findings.push({
      field: 'requirements.primaryNoncontributory',
      severity: 'error',
      message:
        'Holder requires Primary & Noncontributory wording — no selected policy is flagged P&NC.',
    });
  }

  return findings;
}

export type RequirementsGateResult = {
  flags: RequirementFinding[];
  hasError: boolean;
  /** True when the holder has requirements on file (even if all satisfied). */
  hasRequirements: boolean;
};

const GATE_OK: RequirementsGateResult = { flags: [], hasError: false, hasRequirements: false };

/**
 * Load the cert request's holder requirements + selected policies and run the
 * deterministic check. Fail-open by design: a gate infrastructure error must
 * not block issuance (it logs loudly instead) — but a *parsed* requirements
 * mismatch always surfaces.
 */
export async function requirementsGateForRequest(
  admin: SupabaseClient,
  requestId: string,
): Promise<RequirementsGateResult> {
  try {
    const { data: cert, error: certErr } = await admin
      .from('cert_requests')
      .select('holder_id, coverages_selected')
      .eq('id', requestId)
      .maybeSingle<{ holder_id: string | null; coverages_selected: string[] }>();
    if (certErr || !cert || !cert.holder_id) return GATE_OK;

    const { data: holderRow, error: holderErr } = await admin
      .from('holders')
      .select('requirements')
      .eq('id', cert.holder_id)
      .maybeSingle<{ requirements: unknown }>();
    if (holderErr || !holderRow) return GATE_OK;

    const requirements = parseHolderRequirements(holderRow.requirements);
    if (!requirements) return GATE_OK;

    const { data: policies, error: polErr } = await admin
      .from('policies')
      .select('type, limits_jsonb, addl_insured_blanket, subrogation_waived, primary_noncontributory')
      .in('id', cert.coverages_selected ?? []);
    if (polErr) throw new Error(polErr.message);

    const flags = checkRequirements(requirements, (policies ?? []) as PolicyForRequirements[]);
    return {
      flags,
      hasError: flags.some((f) => f.severity === 'error'),
      hasRequirements: true,
    };
  } catch (err) {
    log.error('requirementsGate.failed', { requestId, error: (err as Error).message });
    return GATE_OK;
  }
}
