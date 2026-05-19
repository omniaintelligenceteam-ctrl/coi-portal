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
    policies,
    holder,
    certNumber: req.cert_number,
    today: new Date(),
    templatePngPath: TEMPLATE_PATH,
    signaturePngPath: SIGNATURE_PATH,
  });
  const pdfBytes = await fillAcord25(coiInput);

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

  // 7. Insert audit row (E&O paper trail — last write before status update)
  const { error: auditErr } = await admin.from('coi_audit').insert({
    client_id: client.id,
    cert_number: req.cert_number,
    requested_by_email: client.contact_email,
    holder_name: req.holder_name,
    holder_address1: req.holder_address1,
    holder_address2: req.holder_address2,
    coverages_selected: req.coverages_selected,
    pdf_storage_path: storagePath,
  });
  if (auditErr) throw new Error(`audit insert failed: ${auditErr.message}`);

  // 8. Mark sent
  await admin
    .from('cert_requests')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      pdf_storage_path: storagePath,
    })
    .eq('id', req.id);

  return { certNumber: req.cert_number, emailId, pdfStoragePath: storagePath };
}
