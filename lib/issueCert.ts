import { after } from 'next/server';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';
import { PDFDocument } from '@cantoo/pdf-lib';
import { fillAcord25 } from './fillAcord25';
import { reviewCert, type ClientOverride } from './reviewerAgent';
import { selectableCoverages } from './getClientPolicies';
import { buildCoiInput, computeNextCertNumber, type DbPolicyFull } from './coiInputBuilder';
import { sendQueueNotification } from './email';
import { sendApprovedCert } from './sendApprovedCert';
import { log } from './logger';

/**
 * Tamper-evident checksum suffix.
 *
 * A cert number `PP-20260518-0001` is augmented to `PP-20260518-0001-K9X`
 * where `K9X` is a 3-char base32-ish slice of SHA-256(base). A holder can
 * eyeball the suffix to catch typo'd or hand-forged numbers; the public
 * `/verify/[certNumber]` page rejects mismatches up front.
 *
 * Format constraints:
 *   - base32 alphabet (Crockford-ish): A-Z + 0-9 minus I, L, O, U (no visual
 *     ambiguity). The base64url slice is uppercased and any `_` / `-` are
 *     remapped to letters from a safe pool so the suffix is always 3 chars
 *     of unambiguous A-Z0-9.
 */
const CHECKSUM_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

function checksumFor(base: string): string {
  const hash = createHash('sha256').update(base).digest();
  // Map first 3 bytes onto the 30-char unambiguous alphabet.
  let out = '';
  for (let i = 0; i < 3; i++) {
    out += CHECKSUM_ALPHABET[hash[i]! % CHECKSUM_ALPHABET.length];
  }
  return out;
}

/**
 * Strip a checksum suffix (if present) and return the base cert number.
 * Base form is `PP-YYYYMMDD-XXXX`; suffix form is `PP-YYYYMMDD-XXXX-CCC`.
 */
export function stripChecksum(certNumber: string): string {
  const m = /^(PP-\d{8}-\d{4})-[A-Z0-9]{3}$/.exec(certNumber);
  return m ? m[1]! : certNumber;
}

/**
 * Validate the trailing `-XXX` checksum on a cert number.
 *
 * Returns true for:
 *   - Legacy cert numbers with no suffix (`PP-20260518-0001`) — pre-checksum
 *     certificates remain valid by design.
 *   - Suffixed cert numbers whose recomputed checksum matches.
 *
 * Returns false only when a suffix is present AND it doesn't match the
 * deterministic checksum of the base.
 */
export function verifyChecksum(certNumber: string): boolean {
  const idx = certNumber.lastIndexOf('-');
  if (idx < 0) return true;
  const maybeSuffix = certNumber.slice(idx + 1);
  // A suffix is exactly 3 chars of A-Z/0-9; anything else means there's no
  // checksum present (legacy format) and we treat it as valid.
  if (!/^[A-Z0-9]{3}$/.test(maybeSuffix)) return true;
  const base = certNumber.slice(0, idx);
  // Sanity: the base must look like a real cert number, otherwise the input
  // is malformed and we let downstream lookup decide whether it exists.
  if (!/^PP-\d{8}-\d{4}$/.test(base)) return true;
  return checksumFor(base) === maybeSuffix;
}

/**
 * Append the checksum to a base cert number. Idempotent — if the input
 * already carries a valid checksum, returns it unchanged.
 */
export function withChecksum(baseCertNumber: string): string {
  if (/-[A-Z0-9]{3}$/.test(baseCertNumber) && verifyChecksum(baseCertNumber)) {
    return baseCertNumber;
  }
  return `${baseCertNumber}-${checksumFor(baseCertNumber)}`;
}

/**
 * Stamp a QR code into the lower-right of the rendered ACORD 25 PDF that
 * deep-links to the public verify page. Small (~88pt square) with a thin
 * caption so it never competes with the form content.
 */
async function stampVerifyQr(pdfBytes: Uint8Array, certNumber: string): Promise<Uint8Array> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const verifyUrl = `${siteUrl}/verify/${certNumber}`;

  // High error-correction so the QR still scans even with the form's hairlines
  // bleeding into its quiet zone. Margin is the white quiet-zone padding in
  // modules; 1 keeps it tight without sacrificing scan reliability.
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

  // US Letter is 612x792 pts. Drop the QR in the lower-right margin
  // (below the cert holder block) with a small caption underneath.
  const QR_SIZE = 56;
  const QR_X = 612 - QR_SIZE - 22;
  const QR_Y = 22;
  page.drawImage(qrImage, { x: QR_X, y: QR_Y + 10, width: QR_SIZE, height: QR_SIZE });

  // Caption — thin, mono-ish. Use Helvetica at 5pt so it sits as a quiet
  // utility line. We deliberately keep it ASCII to avoid font-embed issues.
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

const HOURLY_LIMIT = () => parseInt(process.env.CERT_HOURLY_LIMIT ?? '20');
const DAILY_LIMIT = () => parseInt(process.env.CERT_DAILY_LIMIT ?? '200');

const TEMPLATE_PATH = resolve(process.cwd(), 'assets/template/acord-25-page-1.png');
const SIGNATURE_PATH = resolve(process.cwd(), 'assets/policy-place-signature.png');

export type IssueCertHolder = { name: string; address1: string; address2?: string };

export type IssueCertClient = {
  id: string;
  agency_id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
};

export type IssueCertResult =
  | { ok: true; certNumber: string; requestId: string }
  | { ok: false; status: number; error: string; detail?: string };

export async function issueCert(input: {
  // Authenticated reader for policy lookups (RLS-scoped to caller).
  reader: SupabaseClient;
  // Service-role writer.
  admin: SupabaseClient;
  client: IssueCertClient;
  selectedPolicyIds: string[];
  holder: IssueCertHolder;
  requestedByEmail: string;
  requestedIp: string | null;
}): Promise<IssueCertResult> {
  const t0 = Date.now();
  const { reader, admin, client, selectedPolicyIds, holder, requestedByEmail, requestedIp } = input;

  // Rate limit: count recent requests for this client
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
    admin
      .from('cert_requests')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .gte('requested_at', oneHourAgo),
    admin
      .from('cert_requests')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .gte('requested_at', oneDayAgo),
  ]);
  if ((hourCount ?? 0) >= HOURLY_LIMIT()) {
    log.warn('cert.rate_limited', { clientId: client.id, window: 'hour', count: hourCount });
    return {
      ok: false,
      status: 429,
      error: 'Too many requests — please wait before submitting another certificate.',
    };
  }
  if ((dayCount ?? 0) >= DAILY_LIMIT()) {
    log.warn('cert.rate_limited', { clientId: client.id, window: 'day', count: dayCount });
    return {
      ok: false,
      status: 429,
      error: 'Daily certificate limit reached. Contact Brook if you need more.',
    };
  }

  // Agency
  const { data: agency } = await admin
    .from('agencies')
    .select('name, address1, address2, contact_name, phone, fax, email')
    .eq('id', client.agency_id)
    .maybeSingle();
  if (!agency) {
    return { ok: false, status: 500, error: 'agency not found' };
  }

  // All policies + server-side expiry gate (never trust UI)
  const { data: allPolicies } = await reader
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

  // Validate every selected ID is eligible AND belongs to this client
  const invalid = selectedPolicyIds.filter((id) => !eligibleById.has(id));
  if (invalid.length > 0) {
    return {
      ok: false,
      status: 400,
      error: 'selected policies are not eligible (expired, inactive, or not yours)',
    };
  }
  const selected = selectedPolicyIds.map((id) => eligibleById.get(id)!).filter(Boolean);

  // Compute next cert number for today. The DB may carry either legacy
  // (`PP-YYYYMMDD-XXXX`) or checksum-suffixed (`PP-YYYYMMDD-XXXX-CCC`) rows;
  // strip any suffix before feeding `computeNextCertNumber` so its regex —
  // which expects the base form — keeps incrementing the per-day sequence
  // cleanly. We then append a fresh checksum to the new number.
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

  // Build CoiInput
  const coiInput = buildCoiInput({
    agency,
    client: {
      business_name: client.business_name,
      business_address1: client.business_address1,
      business_address2: client.business_address2,
    },
    policies: selected,
    holder: {
      name: holder.name,
      address1: holder.address1,
      address2: holder.address2 || '',
    },
    certNumber,
    today,
    templatePngPath: TEMPLATE_PATH,
    signaturePngPath: SIGNATURE_PATH,
  });

  // Render PDF
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await fillAcord25(coiInput);
  } catch (err) {
    log.error('cert.pdf_render_failed', { certNumber, error: (err as Error).message });
    return { ok: false, status: 500, error: 'pdf render failed', detail: (err as Error).message };
  }

  // Stamp the verify-QR into the lower-right of the cert. Non-fatal: if QR
  // generation hiccups we'd rather ship the cert than block on the badge.
  try {
    pdfBytes = await stampVerifyQr(pdfBytes, certNumber);
  } catch (err) {
    log.warn('cert.qr_stamp_failed', { certNumber, error: (err as Error).message });
  }

  // Upload PDF to storage (private bucket, service-role)
  const storagePath = `certs/${certNumber}.pdf`;
  const { error: upErr } = await admin.storage
    .from('coi-archive')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    log.error('cert.storage_upload_failed', { certNumber, error: upErr.message });
    return { ok: false, status: 500, error: 'storage upload failed', detail: upErr.message };
  }

  // Insert cert_request row (status starts pending)
  const { data: inserted, error: insErr } = await admin
    .from('cert_requests')
    .insert({
      client_id: client.id,
      agency_id: client.agency_id,
      holder_name: holder.name,
      holder_address1: holder.address1,
      holder_address2: holder.address2 || null,
      coverages_selected: selectedPolicyIds,
      cert_number: certNumber,
      pdf_storage_path: storagePath,
      status: 'pending',
      requested_by_email: requestedByEmail,
      requested_ip: requestedIp,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    log.error('cert.insert_failed', { certNumber, error: insErr?.message });
    return { ok: false, status: 500, error: 'insert failed', detail: insErr?.message };
  }

  log.info('cert.submitted', {
    certNumber,
    requestId: inserted.id,
    clientId: client.id,
    durationMs: Date.now() - t0,
  });

  // Upsert holder for future autocomplete (non-fatal)
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
  } catch {
    // Non-fatal
  }

  // Run reviewer + notify Brook in background
  const requestId = inserted.id;
  const clientSnapshot = { id: client.id, business_name: client.business_name };
  after(async () => {
    const reviewT0 = Date.now();
    try {
      const { data: overridesRaw } = await admin
        .from('client_overrides')
        .select('scope, pattern, correction')
        .eq('client_id', clientSnapshot.id)
        .eq('active', true)
        .returns<ClientOverride[]>();

      const review = await reviewCert({
        request: coiInput,
        clientOverrides: overridesRaw ?? [],
      });

      await admin
        .from('cert_requests')
        .update({
          reviewer_pass: review.pass,
          reviewer_flags: review.flags,
          reviewer_notes: review.notes,
          reviewer_model: review.model,
          reviewed_at: new Date().toISOString(),
          status: 'reviewed',
        })
        .eq('id', requestId);

      log.info('cert.reviewed', {
        certNumber,
        requestId,
        pass: review.pass,
        flagCount: review.flags.length,
        durationMs: Date.now() - reviewT0,
      });

      // Auto-approve branch: reviewer green + client opted-in => send now.
      // Reviewer fails (pass=false) always fall through to the queue.
      let autoApproved = false;
      if (review.pass) {
        const { data: clientRow } = await admin
          .from('coi_clients')
          .select('auto_approve_enabled')
          .eq('id', clientSnapshot.id)
          .maybeSingle();
        if (clientRow?.auto_approve_enabled) {
          try {
            await admin
              .from('cert_requests')
              .update({
                status: 'approved',
                decided_by_email: 'system:auto-approve',
                decided_at: new Date().toISOString(),
              })
              .eq('id', requestId);
            await sendApprovedCert(admin, requestId);
            autoApproved = true;
            log.info('cert.auto_approved', {
              certNumber,
              requestId,
              clientId: clientSnapshot.id,
            });
          } catch (err) {
            // Row is at status='approved' but send failed — RetrySend in the
            // queue picks it up. Fall through to queue notification so Brook
            // sees it.
            log.error('cert.auto_approve_failed', {
              certNumber,
              requestId,
              error: (err as Error).message,
            });
          }
        }
      }

      if (!autoApproved) {
        await sendQueueNotification({
          certNumber,
          requestId,
          clientName: clientSnapshot.business_name,
          holderName: holder.name,
          reviewerPass: review.pass,
          flagCount: review.flags.length,
        });
      }
    } catch (err) {
      log.error('cert.reviewer_failed', {
        certNumber,
        requestId,
        error: (err as Error).message,
        durationMs: Date.now() - reviewT0,
      });
      // Cert stays at 'pending' — Brook reviews manually.
      try {
        await sendQueueNotification({
          certNumber,
          requestId,
          clientName: clientSnapshot.business_name,
          holderName: holder.name,
          reviewerPass: null,
          flagCount: 0,
        });
      } catch {}
    }
  });

  return { ok: true, certNumber, requestId };
}

function formatDatePrefix(today: Date): string {
  const y = today.getFullYear().toString().padStart(4, '0');
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}
