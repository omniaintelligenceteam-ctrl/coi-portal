/**
 * Admin-side policy loader. Returns ALL policies for a client regardless of
 * status (active, cancelled, expired). Brook's per-client hub uses this so she
 * can see and re-activate cancelled coverages.
 *
 * Counterpart to lib/getClientPolicies.ts:selectableCoverages, which is the
 * E&O-critical eligibility gate for cert RENDERING. Never use this loader for
 * cert generation — only for admin display + per-policy editing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminPolicyRow = {
  id: string;
  client_id: string;
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';
  policy_number: string;
  eff_date: string;
  exp_date: string;
  active: boolean;
  status: 'active' | 'cancelled' | 'expired';
  cancelled_at: string | null;
  cancelled_reason: string | null;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  description: string | null;
  limits_jsonb: Record<string, number>;
  insurer_id: string;
  insurer: { name: string; naic: string } | null;
};

export async function getClientPoliciesAll(
  admin: SupabaseClient,
  clientId: string,
): Promise<AdminPolicyRow[]> {
  const { data, error } = await admin
    .from('policies')
    .select(
      `id, client_id, type, policy_number, eff_date, exp_date, active,
       status, cancelled_at, cancelled_reason,
       addl_insured_blanket, subrogation_waived, description, limits_jsonb,
       insurer_id, insurer:insurers ( name, naic )`,
    )
    .eq('client_id', clientId)
    .order('status', { ascending: true }) // active first, then cancelled/expired
    .order('exp_date', { ascending: false })
    .returns<AdminPolicyRow[]>();
  if (error) throw new Error(`getClientPoliciesAll: ${error.message}`);
  return data ?? [];
}
