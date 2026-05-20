/**
 * Void a sent certificate.
 *
 * Called when Brook discovers a cert needs to be pulled back — usually because
 * a referenced coverage was cancelled mid-term, or the cert was issued with
 * bad data and the corrected version supersedes it.
 *
 * Steps:
 *   1. Load cert_requests row + guard: must be in 'sent' status to void.
 *   2. Flip status='voided' atomically. Optimistic lock guards against races.
 *   3. Re-render the PDF with a VOIDED watermark and overwrite the canonical
 *      storage path. Anyone with the existing URL now sees the void stamp.
 *   4. Email the client (who has the holder's contact) and CC Brook so the
 *      holder can be notified that this cert is no longer in force.
 *
 * The original PDF bytes are NOT preserved — coi_audit stores the original
 * cert metadata for E&O, and the new stamped PDF is what /verify shows from
 * here on. If forensic recovery is ever needed, Supabase storage versioning
 * can be enabled per-bucket.
 */

import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fillAcord25 } from './fillAcord25';
import { buildCoiInput, type DbPolicyFull } from './coiInputBuilder';
import { sendVoidedCertEmail } from './email';
import { stampVerifyQr } from './verifyQr';
import { log } from './logger';
import type { CertOverrides, Holder } from './types';

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
  cert_overrides: CertOverrides | null;
  is_master: boolean;
};

type AgencyRow = {
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

export type VoidCertInput = {
  admin: SupabaseClient;
  requestId: string;
  reason: string;
  byEmail: string;
};

export type VoidCertResult =
  | { ok: true; certNumber: string; pdfStoragePath: string; emailId: string }
  | { ok: false; status: number; error: string; detail?: string };

export async function voidCert(input: VoidCertInput): Promise<VoidCertResult> {
  const { admin, requestId, reason, byEmail } = input;
  const t0 = Date.now();

  // 1. Load + validate status
  const { data: req, error: reqErr } = await admin
    .from('cert_requests')
    .select(
      `id, client_id, agency_id, cert_number,
       holder_name, holder_address1, holder_address2,
       coverages_selected, pdf_storage_path, status,
       cert_overrides, is_master`,
    )
    .eq('id', requestId)
    .maybeSingle<CertRequestRow>();
  if (reqErr) return { ok: false, status: 500, error: 'db error', detail: reqErr.message };
  if (!req) return { ok: false, status: 404, error: 'cert request not found' };
  if (req.status !== 'sent') {
    return {
      ok: false,
      status: 409,
      error: 'can only void a sent certificate',
      detail: `current status is '${req.status}'`,
    };
  }

  // 2. Flip to voided under optimistic lock so a concurrent void can't double-stamp
  const voidedAt = new Date().toISOString();
  const { data: locked, error: lockErr } = await admin
    .from('cert_requests')
    .update({
      status: 'voided',
      voided_at: voidedAt,
      voided_reason: reason,
      voided_by_email: byEmail,
    })
    .eq('id', requestId)
    .eq('status', 'sent')
    .select('id')
    .maybeSingle();
  if (lockErr) return { ok: false, status: 500, error: 'lock failed', detail: lockErr.message };
  if (!locked) {
    return {
      ok: false,
      status: 409,
      error: 'cert was modified by another action; refresh and retry',
    };
  }

  // 3. Re-fetch what we need to render. Note we load policies WITHOUT eligibility
  //    filtering — a void should faithfully reproduce the original cert (with
  //    its now-cancelled coverage included) and stamp VOIDED on top.
  const { data: client } = await admin
    .from('coi_clients')
    .select('id, business_name, business_address1, business_address2, contact_email')
    .eq('id', req.client_id)
    .maybeSingle<ClientRow>();
  if (!client) return { ok: false, status: 500, error: 'client not found' };

  const { data: agency } = await admin
    .from('agencies')
    .select('name, address1, address2, contact_name, phone, fax, email')
    .eq('id', req.agency_id)
    .maybeSingle<AgencyRow>();
  if (!agency) return { ok: false, status: 500, error: 'agency not found' };

  const { data: policies } = await admin
    .from('policies')
    .select(
      `id, type, policy_number, eff_date, exp_date, active,
       status, cancelled_at, cancelled_reason,
       addl_insured_blanket, subrogation_waived, description, limits_jsonb,
       insurer:insurers ( name, naic )`,
    )
    .in('id', req.coverages_selected)
    .returns<DbPolicyFull[]>();

  // 4. Render with VOIDED stamp
  const holder: Holder = {
    name: req.holder_name,
    address1: req.holder_address1,
    address2: req.holder_address2 ?? '',
  };
  const coiInput = buildCoiInput({
    agency,
    client: {
      business_name: client.business_name,
      business_address1: client.business_address1,
      business_address2: client.business_address2,
    },
    policies: policies ?? [],
    holder,
    certNumber: req.cert_number,
    today: new Date(),
    templatePngPath: TEMPLATE_PATH,
    signaturePngPath: SIGNATURE_PATH,
    overrides: req.cert_overrides ?? undefined,
    voided: true,
  });

  let pdfBytes = await fillAcord25(coiInput);
  try {
    pdfBytes = await stampVerifyQr(pdfBytes, req.cert_number);
  } catch {
    // Non-fatal — QR is informational; void stamp is what matters here.
  }

  // 5. Upload (overwrite canonical path)
  const storagePath = req.pdf_storage_path || `certs/${req.cert_number}.pdf`;
  const { error: upErr } = await admin.storage
    .from('coi-archive')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    log.error('voidCert.upload_failed', { certNumber: req.cert_number, error: upErr.message });
    return { ok: false, status: 500, error: 'storage upload failed', detail: upErr.message };
  }

  // 6. Email — client gets the void notice so they can forward to the holder.
  let emailId = '';
  try {
    const { id } = await sendVoidedCertEmail({
      to: client.contact_email,
      cc: [agency.email, process.env.COI_CC_AUDIT_EMAIL]
        .filter((e): e is string => Boolean(e) && e !== client.contact_email),
      certNumber: req.cert_number,
      insuredBusinessName: client.business_name,
      holderName: req.holder_name,
      reason: reason.trim(),
      voidedAtISO: voidedAt,
    });
    emailId = id;
  } catch (err) {
    log.error('voidCert.email_failed', {
      certNumber: req.cert_number,
      error: (err as Error).message,
    });
    // Non-fatal: the cert IS voided. The email failure surfaces back to Brook
    // via the API response so she can manually notify if needed.
    return {
      ok: false,
      status: 502,
      error: 'cert was voided but the holder notification email failed',
      detail: (err as Error).message,
    };
  }

  log.info('voidCert.completed', {
    certNumber: req.cert_number,
    requestId,
    byEmail,
    durationMs: Date.now() - t0,
  });

  return {
    ok: true,
    certNumber: req.cert_number,
    pdfStoragePath: storagePath,
    emailId,
  };
}
