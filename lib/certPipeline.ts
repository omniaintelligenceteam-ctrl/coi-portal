/**
 * Shared cert-generation pipeline used by both the v1 agent API and the inbound-email webhook.
 *
 * Does the synchronous half of cert creation:
 *   resolve client by email → rate limit → policies + eligibility → cert number →
 *   render PDF → upload to coi-archive → insert cert_requests row → upsert cert_holders
 *
 * Does NOT:
 *   - run the reviewer (callers decide sync vs background)
 *   - send any email (callers decide who to email and how to thread)
 *
 * Returns rich context (coiInput, client, agency, policies) so callers can pass it
 * into the reviewer and the outbound mailer without re-fetching.
 */

import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { PDFDocument } from '@cantoo/pdf-lib';
import { fillAcord25 } from './fillAcord25';
import { selectableCoverages } from './getClientPolicies';
import { buildCoiInput, computeNextCertNumber, type DbPolicyFull } from './coiInputBuilder';
import { stripChecksum, withChecksum } from './issueCert';
import type { CoiInput } from './types';
import { log } from './logger';

/**
 * Stamp a QR code into the lower-right of the rendered ACORD 25 PDF that
 * deep-links to the public verify page. Mirrors the implementation in
 * `lib/issueCert.ts` (which is module-private there) so both issuance paths
 * produce visually identical trust artifacts.
 */
async function stampVerifyQr(pdfBytes: Uint8Array, certNumber: string): Promise<Uint8Array> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const verifyUrl = `${siteUrl}/verify/${certNumber}`;

  const qrPngDataUrl = await QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  const qrPngBytes = Buffer.from(qrPngDataUrl.split(',')[1]!, 'base64');

  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(0);
  const qrImage = await doc.embedPng(qrPngBytes);

  const QR_SIZE = 56;
  const QR_X = 612 - QR_SIZE - 22;
  const QR_Y = 22;
  page.drawImage(qrImage, { x: QR_X, y: QR_Y + 10, width: QR_SIZE, height: QR_SIZE });

  const { StandardFonts } = await import('@cantoo/pdf-lib');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const caption = 'Verify at policyplace.com/verify';
  const captionSize = 5;
  const captionWidth = font.widthOfTextAtSize(caption, captionSize);
  page.drawText(caption, {
    x: QR_X + (QR_SIZE - captionWidth) / 2,
    y: QR_Y + 3,
    size: captionSize,
    font,
  });

  return doc.save();
}

const TEMPLATE_PATH = resolve(process.cwd(), 'assets/template/acord-25-page-1.png');
const SIGNATURE_PATH = resolve(process.cwd(), 'assets/policy-place-signature.png');

export type GenerateCertificateInput = {
  admin: SupabaseClient;
  clientEmail: string;
  holder: { name: string; address1: string; address2?: string };
  selectedPolicyIds?: string[];
  /** Free-form provenance string written into cert_requests.requested_by_email. */
  requestedByEmail: string;
  requestedIp?: string | null;
  source: 'web' | 'api' | 'inbound-email';
};

export type GenerateCertificateClient = {
  id: string;
  agency_id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
  contact_email: string;
};

export type GenerateCertificateAgency = {
  name: string;
  address1: string | null;
  address2: string | null;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

export type GenerateCertificateOk = {
  ok: true;
  certNumber: string;
  requestId: string;
  pdfBytes: Uint8Array;
  storagePath: string;
  coiInput: CoiInput;
  client: GenerateCertificateClient;
  agency: GenerateCertificateAgency;
  selectedPolicies: DbPolicyFull[];
};

export type GenerateCertificateErr = {
  ok: false;
  /** HTTP status the caller should surface (404, 422, 429, 500). */
  status: number;
  error: string;
};

export type GenerateCertificateResult = GenerateCertificateOk | GenerateCertificateErr;

export async function generateCertificate(
  input: GenerateCertificateInput,
): Promise<GenerateCertificateResult> {
  const { admin } = input;
  const t0 = Date.now();

  // 1. Resolve client by email
  const { data: client } = await admin
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2, contact_email, active')
    .eq('contact_email', input.clientEmail)
    .eq('active', true)
    .maybeSingle<GenerateCertificateClient & { active: boolean }>();
  if (!client) {
    return { ok: false, status: 404, error: 'client not found or inactive' };
  }

  // 2. Rate limit
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
    admin.from('cert_requests').select('*', { count: 'exact', head: true })
      .eq('client_id', client.id).gte('requested_at', oneHourAgo),
    admin.from('cert_requests').select('*', { count: 'exact', head: true })
      .eq('client_id', client.id).gte('requested_at', oneDayAgo),
  ]);
  const HOURLY = parseInt(process.env.CERT_HOURLY_LIMIT ?? '20');
  const DAILY = parseInt(process.env.CERT_DAILY_LIMIT ?? '200');
  if ((hourCount ?? 0) >= HOURLY) {
    return { ok: false, status: 429, error: 'rate limit exceeded (hourly)' };
  }
  if ((dayCount ?? 0) >= DAILY) {
    return { ok: false, status: 429, error: 'rate limit exceeded (daily)' };
  }

  // 3. Agency
  const { data: agency } = await admin
    .from('agencies')
    .select('name, address1, address2, contact_name, phone, fax, email')
    .eq('id', client.agency_id)
    .maybeSingle<GenerateCertificateAgency>();
  if (!agency) {
    return { ok: false, status: 500, error: 'agency not found' };
  }

  // 4. Policies + eligibility
  const { data: allPolicies } = await admin
    .from('policies')
    .select(
      `id, type, policy_number, eff_date, exp_date, active,
       addl_insured_blanket, subrogation_waived, description, limits_jsonb,
       insurer:insurers ( name, naic )`,
    )
    .eq('client_id', client.id)
    .returns<DbPolicyFull[]>();

  const today = new Date();
  const eligible = selectableCoverages(allPolicies ?? [], today);
  const eligibleById = new Map(eligible.map((p) => [p.id, p]));

  let selected: DbPolicyFull[];
  if (input.selectedPolicyIds?.length) {
    const invalid = input.selectedPolicyIds.filter((id) => !eligibleById.has(id));
    if (invalid.length > 0) {
      return { ok: false, status: 400, error: 'some selectedPolicyIds are not eligible' };
    }
    selected = input.selectedPolicyIds.map((id) => eligibleById.get(id)!).filter(Boolean);
  } else {
    selected = eligible;
  }

  if (selected.length === 0) {
    return { ok: false, status: 422, error: 'no eligible policies for this client' };
  }

  // 5. Cert number. The DB may carry either legacy (`PP-YYYYMMDD-XXXX`) or
  // checksum-suffixed (`PP-YYYYMMDD-XXXX-CCC`) rows; strip any suffix before
  // feeding `computeNextCertNumber` so its regex (which expects the base
  // form) keeps incrementing the per-day sequence cleanly. We then append a
  // fresh checksum to the new number so all issuance paths produce the same
  // tamper-evident format.
  const todayPrefix = formatDatePrefix(today);
  const { data: maxRow } = await admin
    .from('cert_requests')
    .select('cert_number')
    .like('cert_number', `PP-${todayPrefix}-%`)
    .order('cert_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const priorMaxBase = maxRow?.cert_number ? stripChecksum(maxRow.cert_number) : null;
  const baseCertNumber = computeNextCertNumber(today, priorMaxBase);
  const certNumber = withChecksum(baseCertNumber);

  // 6. Build CoiInput + render
  const holder = {
    name: input.holder.name,
    address1: input.holder.address1,
    address2: input.holder.address2 || '',
  };
  const coiInput = buildCoiInput({
    agency,
    client: {
      business_name: client.business_name,
      business_address1: client.business_address1,
      business_address2: client.business_address2,
    },
    policies: selected,
    holder,
    certNumber,
    today,
    templatePngPath: TEMPLATE_PATH,
    signaturePngPath: SIGNATURE_PATH,
  });

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await fillAcord25(coiInput);
  } catch (err) {
    log.error('certPipeline.pdf_render_failed', { certNumber, error: (err as Error).message });
    return { ok: false, status: 500, error: 'pdf render failed' };
  }

  // Stamp the verify-QR into the lower-right of the cert. Non-fatal: if QR
  // generation hiccups we'd rather ship the cert than block on the badge.
  try {
    pdfBytes = await stampVerifyQr(pdfBytes, certNumber);
  } catch (err) {
    log.warn('certPipeline.qr_stamp_failed', { certNumber, error: (err as Error).message });
  }

  // 7. Upload
  const storagePath = `certs/${certNumber}.pdf`;
  const { error: upErr } = await admin.storage
    .from('coi-archive')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    return { ok: false, status: 500, error: 'storage upload failed' };
  }

  // 8. Insert
  const { data: inserted, error: insErr } = await admin
    .from('cert_requests')
    .insert({
      client_id: client.id,
      agency_id: client.agency_id,
      holder_name: holder.name,
      holder_address1: holder.address1,
      holder_address2: holder.address2 || null,
      coverages_selected: selected.map((p) => p.id),
      cert_number: certNumber,
      pdf_storage_path: storagePath,
      status: 'pending',
      requested_by_email: input.requestedByEmail,
      requested_ip: input.requestedIp ?? null,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    return { ok: false, status: 500, error: 'insert failed' };
  }

  log.info('certPipeline.submitted', {
    certNumber,
    requestId: inserted.id,
    clientId: client.id,
    source: input.source,
    durationMs: Date.now() - t0,
  });

  // 9. Holder upsert (non-fatal)
  try {
    await admin.from('cert_holders').upsert(
      {
        client_id: client.id,
        name: holder.name,
        address1: holder.address1,
        address2: holder.address2 || '',
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,name,address1' },
    );
  } catch {}

  return {
    ok: true,
    certNumber,
    requestId: inserted.id,
    pdfBytes,
    storagePath,
    coiInput,
    client: {
      id: client.id,
      agency_id: client.agency_id,
      business_name: client.business_name,
      business_address1: client.business_address1,
      business_address2: client.business_address2,
      contact_email: client.contact_email,
    },
    agency,
    selectedPolicies: selected,
  };
}

function formatDatePrefix(today: Date): string {
  const y = today.getFullYear().toString().padStart(4, '0');
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}
