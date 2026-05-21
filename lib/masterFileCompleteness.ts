/**
 * Master file completeness scoring.
 *
 * Brook keeps a master file per client. This function looks at what's filled
 * in versus what an ACORD 25 would need and emits a 0-100 score plus a list
 * of specific missing fields. Used on the client hub header and on the admin
 * home "Files needing attention" bento card.
 *
 * Pure function, no DB calls. The caller fetches the data and passes it in.
 */

type PolicyType = 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';

export type ClientForMF = {
  business_name: string | null;
  business_address1: string | null;
  contact_email: string | null;
  contact_name: string | null;
  phone: string | null;
  default_description: string | null;
};

export type PolicyForMF = {
  id: string;
  type: PolicyType;
  policy_number: string | null;
  eff_date: string | null;
  exp_date: string | null;
  status?: 'active' | 'cancelled' | 'expired';
  active: boolean;
  limits_jsonb: Record<string, number> | null;
  insurer: { name: string; naic: string } | null;
};

export type MissingField = {
  area: 'identity' | 'defaults' | 'policy';
  policyId?: string;
  policyType?: PolicyType;
  label: string;
};

export type CompletenessResult = {
  /** 0-100 percentage of required fields populated. */
  score: number;
  missing: MissingField[];
  passed: number;
  total: number;
  hasActivePolicies: boolean;
};

/**
 * Required numeric limit keys per coverage type. These are the bare minimum a
 * COI typically needs — Brook can fill in more on the limits editor, but
 * these are the ones we flag as "missing" if zero / absent.
 *
 * AUTO is special: a policy is considered complete if EITHER combinedSingleLimit
 * OR all three split limits (BI per person, BI per accident, property damage)
 * are populated. We surface a single "needs CSL or split limits" gap in that
 * case rather than three separate gaps.
 */
const REQUIRED_NUMERIC_LIMITS: Record<PolicyType, Array<{ key: string; label: string }>> = {
  GL: [
    { key: 'eachOccurrence', label: 'Each occurrence' },
    { key: 'generalAggregate', label: 'General aggregate' },
  ],
  WC: [
    { key: 'eachAccident', label: 'Each accident' },
    { key: 'diseaseEaEmployee', label: 'Disease — each employee' },
    { key: 'diseasePolicyLimit', label: 'Disease — policy limit' },
  ],
  UMBRELLA: [
    { key: 'eachOccurrence', label: 'Each occurrence' },
    { key: 'aggregate', label: 'Aggregate' },
  ],
  EQUIPMENT: [{ key: 'equipmentLimit', label: 'Equipment limit' }],
  // AUTO checked specially below.
  AUTO: [],
  OTHER: [{ key: 'equipmentLimit', label: 'Limit' }],
};

const TYPE_LABEL: Record<PolicyType, string> = {
  GL: 'General Liability',
  WC: "Workers' Comp",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella',
  EQUIPMENT: 'Equipment',
  OTHER: 'Other',
};

function hasPositiveNumber(obj: Record<string, number> | null, key: string): boolean {
  if (!obj) return false;
  const v = obj[key];
  return typeof v === 'number' && v > 0;
}

export function scoreMasterFile(
  client: ClientForMF,
  policies: PolicyForMF[],
): CompletenessResult {
  const missing: MissingField[] = [];
  let total = 0;
  let passed = 0;

  // --- Identity (3 required) ---
  const idChecks: Array<[keyof ClientForMF, string]> = [
    ['business_name', 'Business name'],
    ['business_address1', 'Mailing address'],
    ['contact_email', 'Contact email'],
  ];
  for (const [key, label] of idChecks) {
    total++;
    if (typeof client[key] === 'string' && (client[key] as string).trim().length > 0) {
      passed++;
    } else {
      missing.push({ area: 'identity', label });
    }
  }

  // --- Defaults (soft — counts toward score but only one ding for missing) ---
  total++;
  if (client.default_description && client.default_description.trim().length > 0) {
    passed++;
  } else {
    missing.push({ area: 'defaults', label: 'Default description of operations' });
  }

  // --- Policies (the bulk of the score) ---
  const activePolicies = policies.filter((p) => p.active && (p.status ?? 'active') === 'active');
  const hasActivePolicies = activePolicies.length > 0;

  for (const policy of activePolicies) {
    // Each active policy gets checks for: insurer present, policy number,
    // both dates, and its required limits.
    const tlabel = TYPE_LABEL[policy.type];

    total++;
    if (policy.insurer && policy.insurer.name && policy.insurer.naic) {
      passed++;
    } else {
      missing.push({
        area: 'policy',
        policyId: policy.id,
        policyType: policy.type,
        label: `${tlabel}: insurer + NAIC`,
      });
    }

    total++;
    if (policy.policy_number && policy.policy_number.trim().length > 0) {
      passed++;
    } else {
      missing.push({
        area: 'policy',
        policyId: policy.id,
        policyType: policy.type,
        label: `${tlabel}: policy number`,
      });
    }

    total++;
    if (policy.eff_date && policy.exp_date) {
      passed++;
    } else {
      missing.push({
        area: 'policy',
        policyId: policy.id,
        policyType: policy.type,
        label: `${tlabel}: effective + expiration dates`,
      });
    }

    // AUTO: special — either CSL OR full split set
    if (policy.type === 'AUTO') {
      total++;
      const hasCSL = hasPositiveNumber(policy.limits_jsonb, 'combinedSingleLimit');
      const hasSplit =
        hasPositiveNumber(policy.limits_jsonb, 'bodilyInjuryPerPerson') &&
        hasPositiveNumber(policy.limits_jsonb, 'bodilyInjuryPerAccident') &&
        hasPositiveNumber(policy.limits_jsonb, 'propertyDamage');
      if (hasCSL || hasSplit) {
        passed++;
      } else {
        missing.push({
          area: 'policy',
          policyId: policy.id,
          policyType: policy.type,
          label: 'Commercial Auto: combined single limit OR split limits (BI per person + per accident + property damage)',
        });
      }
      continue;
    }

    // Standard required numeric limits
    for (const { key, label } of REQUIRED_NUMERIC_LIMITS[policy.type] ?? []) {
      total++;
      if (hasPositiveNumber(policy.limits_jsonb, key)) {
        passed++;
      } else {
        missing.push({
          area: 'policy',
          policyId: policy.id,
          policyType: policy.type,
          label: `${tlabel}: ${label}`,
        });
      }
    }
  }

  // If the client has zero active policies, that's its own gap on top of
  // whatever's missing on the identity side.
  if (!hasActivePolicies) {
    total++;
    missing.push({ area: 'policy', label: 'No active in-force policies on file' });
  } else {
    total++;
    passed++;
  }

  return {
    score: Math.round((passed / Math.max(1, total)) * 100),
    missing,
    passed,
    total,
    hasActivePolicies,
  };
}
