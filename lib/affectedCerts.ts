/**
 * Find every live (sent / approved / edited) cert that referenced a given
 * policy. Surfaces the list to Brook when she cancels a coverage so she can
 * decide which certs to void.
 *
 * Reads the cert_requests_active_policies view (migration 20260520_0002),
 * which flattens cert_requests.coverages_selected (jsonb array of policy_id
 * strings) into one row per (cert × policy_id).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AffectedCert = {
  requestId: string;
  clientId: string;
  certNumber: string;
  holderName: string;
  status: 'sent' | 'approved' | 'edited';
  sentAt: string | null;
  requestedAt: string;
};

type ViewRow = {
  request_id: string;
  client_id: string;
  cert_number: string;
  holder_name: string;
  status: 'sent' | 'approved' | 'edited';
  sent_at: string | null;
  requested_at: string;
  policy_id: string;
};

export async function findAffectedCertsForPolicy(
  admin: SupabaseClient,
  policyId: string,
): Promise<AffectedCert[]> {
  const { data, error } = await admin
    .from('cert_requests_active_policies')
    .select('request_id, client_id, cert_number, holder_name, status, sent_at, requested_at, policy_id')
    .eq('policy_id', policyId)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .returns<ViewRow[]>();
  if (error) throw new Error(`findAffectedCertsForPolicy: ${error.message}`);
  return (data ?? []).map((r) => ({
    requestId: r.request_id,
    clientId: r.client_id,
    certNumber: r.cert_number,
    holderName: r.holder_name,
    status: r.status,
    sentAt: r.sent_at,
    requestedAt: r.requested_at,
  }));
}
