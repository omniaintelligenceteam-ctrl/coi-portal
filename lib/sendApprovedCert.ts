/**
 * Approval-send pipeline. Called when Brook (or auto-approve) decides
 * a cert is good to go.
 *
 * Steps:
 *   1. Re-fetch the request + client + agency + selected policies
 *   2. Re-render the PDF (cheap; guarantees latest data after any edits)
 *   3. Re-upload to Storage at the same cert path
 *   4. Email client (with Brook CC'd) via Resend
 *   5. Insert coi_audit row (the E&O paper trail)
 *   6. Mark cert_requests.status = 'sent', sent_at = now
 */

import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fillAcord25 } from './fillAcord25';
import { sendCoiEmail } from './email';
import { buildCoiInput, type DbPolicyFull } from './coiInputBuilder';
import type { Holder } from './types';
import { selectableCoverages } from './getClientPolicies';
import { stampVerifyQr } from './verifyQr';
import { log } from './logger';

const TEMPLATE_PATH = resolve(process.cwd(), 'assets/template/acord-25-page-1.png');
const SIGNATURE_PATH = resolve(process.cwd(), 'assets/policy-place-signature.png');

type CertRequestRow = {
  id: string;
  client_id: string;
  agency_id: string;
  cert_number: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  coverages_selected: string[];
  pdf_storage_path: string | null;
  status: string;
};

type AgencyRow = {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

type ClientRow = {
  id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
  contact_email: string;
};

export type SendResult = {
  certNumber: string;
  emailId: string;
  pdfStoragePath: string;
};

export async function sendApprovedCert(
  admin: SupabaseClient,
  certRequestId: string,
): Promise<SendResult> {
  // 1. Load request
  const { data: req, error: reqErr } = await admin
    .from('cert_requests')
    .select(
      `id, client_id, agency_id, cert_number,
       holder_name, holder_address1, holder_address2,
       coverages_selected, pdf_storage_path, status`,
    )
    .eq('id', certRequestId)
    .maybeSingle<CertRequestRow>();
  if (reqErr || !req) throw new Error(`cert_request ${certRequestId} not found`);
  if (req.status === 'sent') throw new Error('cert already sent');

  // Optimistic lock — flip approved/edited → sent atomically BEFORE rendering
  // and emailing. If another sender (retry, bulk, auto-approve) is already in
  // flight, this UPDATE will return zero rows and we bail without emailing so
  // the winning path is the sole sender. Note: the cert_request_status enum
  // does not include a 'sending' interim state (see migration
  // 20260518_0002_approval_workflow.sql), so we use the final 'sent' status
  // itself as the lock token. Trade-off: if downstream rendering/upload/email
  // fails after this flip, the row stays at 'sent' and the retry path will
  // refuse it via the `if (req.status === 'sent')` guard above. That's the
  // intended behaviour for this approach — single-send guarantee beats easy
  // retry under race.
  const sentAt = new Date().toISOString();
  const { data: lockRow, error: lockErr } = await admin
    .from('cert_requests')
    .update({ status: 'sent', sent_at: sentAt })
    .eq('id', req.id)
    .in('status', ['approved', 'edited'])
    .select('id')
    .maybeSingle();
  if (lockErr) throw new Error(`send-lock update failed: ${lockErr.message}`);
  if (!lockRow) {
    // Another concurrent sender won the race — they will handle the send.
    throw new Error('cert send already in progress (lost optimistic lock)');
  }

  // 2. Load client + agency
  const { data: client, error: clientErr } = await admin
    .from('coi_clients')
    .select('id, business_name, business_address1, business_address2, contact_email')
    .eq('id', req.client_id)
    .maybeSingle<ClientRow>();
  if (clientErr || !client) throw new Error('client not found');

  const { data: agency, error: agencyErr } = await admin
    .from('agencies')
    .select('id, name, address1, address2, contact_name, phone, fax, email')
    .eq('id', req.agency_id)
    .maybeSingle<AgencyRow>();
  if (agencyErr || !agency) throw new Error('agency not found');

  // 3. Load selected policies (re-fetch — never trust the cached coverages_selected
  //    is still valid; an admin could have deactivated a policy since)
  const { data: policies, error: polErr } = await admin
    .from('policies')
    .select(
      `id, type, policy_number, eff_date, exp_date, active,
       addl_insured_blanket, subrogation_waived, description, limits_jsonb,
       insurer:insurers ( name, naic )`,
    )
    .in('id', req.coverages_selected)
    .returns<DbPolicyFull[]>();
  if (polErr || !policies || policies.length === 0) {
    throw new Error('no policies found for this request');
  }

  // Hard gate again at send-time so we never email an expired/inactive policy
  // if a request sat in queue across a renewal boundary.
  const eligible = selectableCoverages(policies, new Date());
  const eligibleById = new Map(eligible.map((p) => [p.id, p]));
  const invalidSelected = req.coverages_selected.filter((id) => !eligibleById.has(id));
  if (invalidSelected.length > 0) {
    throw new Error(
      `some selected coverages are no longer eligible (expired or inactive): ${invalidSelected.join(', ')}`,
    );
  }
  const selectedPolicies = req.coverages_selected
    .map((id) => eligibleById.get(id))
    .filter((p): p is DbPolicyFull => Boolean(p));
  if (selectedPolicies.length === 0) {
    throw new Error('no eligible policies remain for this request');
  }

  // 4. Build CoiInput + render
  const holder: Holder = {
    name: req.holder_name,
    address1: req.holder_address1,
    address2: req.holder_address2 ?? '',
  };
  const coiInput = buildCoiInput({
    agency: {
      name: agency.name,
      address1: agency.address1,
      address2: agency.address2,
      contact_name: agency.contact_name,
      phone: agency.phone,
      fax: agency.fax,
      email: agency.email,
    },
    client: {
      business_name: client.business_name,
      business_address1: client.business_address1,
      business_address2: client.business_address2,
    },
    policies: selectedPolicies,
    holder,
    certNumber: req.cert_number,
    today: new Date(),
    templatePngPath: TEMPLATE_PATH,
    signaturePngPath: SIGNATURE_PATH,
  });
  let pdfBytes = await fillAcord25(coiInput);
  try {
    pdfBytes = await stampVerifyQr(pdfBytes, req.cert_number);
  } catch (err) {
    log.warn('sendApprovedCert.qr_stamp_failed', {
      certNumber: req.cert_number,
      error: (err as Error).message,
    });
  }

  // 5. Upload (overwrite — single canonical copy per cert number)
  const storagePath = req.pdf_storage_path || `certs/${req.cert_number}.pdf`;
  const { error: upErr } = await admin.storage
    .from('coi-archive')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  // 6. Send email
  const portalBase =
    process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ?? 'https://coi-portal.vercel.app';
  const { id: emailId } = await sendCoiEmail({
    to: client.contact_email,
    // Cert Holders see CC addresses in the email envelope (SMTP exposes them).
    // Keep audit CCs configurable so non-staff addresses don't leak in prod.
    cc: [agency.email, process.env.COI_CC_AUDIT_EMAIL]
      .filter((e): e is string => Boolean(e) && e !== client.contact_email),
    pdfBytes,
    certNumber: req.cert_number,
    holderName: req.holder_name,
    insuredBusinessName: client.business_name,
    verifyUrl: `${portalBase}/verify/${req.cert_number}`,
  });

  // 7. Insert audit row (E&O paper trail). Use upsert with ignoreDuplicates so
  // a legitimate retry doesn't blow up on the `cert_number UNIQUE` constraint
  // when an audit row already exists from a prior in-flight attempt.
  const { error: auditErr } = await admin.from('coi_audit').upsert(
    {
      client_id: client.id,
      cert_number: req.cert_number,
      requested_by_email: client.contact_email,
      holder_name: req.holder_name,
      holder_address1: req.holder_address1,
      holder_address2: req.holder_address2,
      coverages_selected: req.coverages_selected,
      pdf_storage_path: storagePath,
    },
    { onConflict: 'cert_number', ignoreDuplicates: true },
  );
  if (auditErr) throw new Error(`audit insert failed: ${auditErr.message}`);

  // 8. Persist final pdf_storage_path (status was already flipped to 'sent' at
  // the top under the optimistic lock; this just captures the canonical path
  // in case the request row's path was stale or missing).
  await admin
    .from('cert_requests')
    .update({ pdf_storage_path: storagePath })
    .eq('id', req.id);

  return { certNumber: req.cert_number, emailId, pdfStoragePath: storagePath };
}
