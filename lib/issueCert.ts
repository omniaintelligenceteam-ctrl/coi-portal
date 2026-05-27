import { after } from 'next/server';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderCertificate, renderCertificateFromDb, templatePngPathFor } from './renderCertificate';
import { DEFAULT_FORM_ID } from './forms/registry';
import { reviewCert, type ClientOverride } from './reviewerAgent';
import { selectableCoverages } from './getClientPolicies';
import { buildCoiInput, type DbPolicyFull } from './coiInputBuilder';
import { sendQueueNotification } from './email';
import { sendApprovedCert } from './sendApprovedCert';
import {
  decideLane,
  holdbackUntil,
  DEFAULT_THRESHOLD_HIGH,
  DEFAULT_THRESHOLD_LOW,
} from './laneDecision';
import { log } from './logger';
import { stampVerifyQr } from './verifyQr';
import { validateHolderInput } from './holderInput';

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

const HOURLY_LIMIT = () => parseInt(process.env.CERT_HOURLY_LIMIT ?? '20');
const DAILY_LIMIT = () => parseInt(process.env.CERT_DAILY_LIMIT ?? '200');

// Signature path is form-agnostic — same Brook signature is overlaid on
// every form regardless of type. Template path now resolves per-call from
// the form picker's chosen formId (Phase 5 — multi-form lift, 2026-05-27).
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
  /** Master cert: holder = insured. When true the server forces the holder
   *  block to mirror the insured's business name + address regardless of any
   *  client-supplied holder values. */
  isMaster?: boolean;
  /** Form to render. Defaults to DEFAULT_FORM_ID (ACORD_25) when omitted. The
   *  picker on /admin/generate/[clientId] and the insured home selects this
   *  from the client's coi_clients.enabled_forms. API routes validate against
   *  isKnownForm before calling here, so by this point it's safe to trust. */
  formId?: string;
}): Promise<IssueCertResult> {
  const t0 = Date.now();
  const { reader, admin, client, selectedPolicyIds, requestedByEmail, requestedIp } = input;
  const isMaster = input.isMaster === true;
  const formId = input.formId ?? DEFAULT_FORM_ID;
  const templatePath = templatePngPathFor(formId);

  // For master certs, the holder is ALWAYS the insured. Don't trust any value
  // the form may have submitted — pre-fill from the canonical client row.
  const incomingHolder: IssueCertHolder = isMaster
    ? {
        name: client.business_name,
        address1: client.business_address1 ?? '',
        address2: client.business_address2 ?? '',
      }
    : input.holder;

  const holderResult = validateHolderInput(incomingHolder);
  if (!holderResult.ok) {
    return { ok: false, status: 400, error: holderResult.error };
  }
  const holder = holderResult.holder;

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
       status, cancelled_at, cancelled_reason,
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

  // Atomic cert-number allocation via the `allocate_cert_number` RPC (D2
  // migration). Replaces the prior read-then-write of MAX(cert_number) which
  // raced under concurrent submits and could collide PDF uploads in storage.
  const { data: allocated, error: allocErr } = await admin.rpc('allocate_cert_number', {
    p_prefix: 'PP-',
  });
  if (allocErr || !allocated) {
    log.error('cert.allocate_failed', { error: allocErr?.message });
    return { ok: false, status: 500, error: 'cert number allocation failed' };
  }
  const baseCertNumber = allocated as string;
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
    templatePngPath: templatePath,
    signaturePngPath: SIGNATURE_PATH,
  });

  // Render PDF. Prefer the DB-backed data-driven path (form_fields rows
  // authored via the visual mapper). Fall back to the legacy code-registered
  // FormConfig if the DB lookup throws — covers the case where a form is
  // registered in code but not yet seeded into form_templates / form_fields
  // (defense-in-depth; should never happen for ACORD_25 post-migration).
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderCertificateFromDb(admin, formId, coiInput);
  } catch (dbErr) {
    log.warn('cert.db_render_fallback_to_legacy', {
      certNumber,
      formId,
      error: (dbErr as Error).message,
    });
    try {
      pdfBytes = await renderCertificate(formId, coiInput);
    } catch (err) {
      log.error('cert.pdf_render_failed', { certNumber, error: (err as Error).message });
      return { ok: false, status: 500, error: 'pdf render failed', detail: (err as Error).message };
    }
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
      form_type: formId,
      requested_by_email: requestedByEmail,
      requested_ip: requestedIp,
      is_master: isMaster,
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

      // Pull the client's auto-approve config so we can pick a lane in the same
      // write that records the reviewer output. Fetching here also lets us tag
      // the cert row with the lane decision BEFORE we branch — keeps the audit
      // trail tight (every row knows exactly which lane it landed in and why).
      const { data: clientRow } = await admin
        .from('coi_clients')
        .select(
          'auto_approve_enabled, auto_approve_threshold_low, auto_approve_threshold_high',
        )
        .eq('id', clientSnapshot.id)
        .maybeSingle();

      const lane = decideLane({
        autoApproveEnabled: clientRow?.auto_approve_enabled ?? false,
        thresholdLow: clientRow?.auto_approve_threshold_low ?? DEFAULT_THRESHOLD_LOW,
        thresholdHigh: clientRow?.auto_approve_threshold_high ?? DEFAULT_THRESHOLD_HIGH,
        confidenceScore: review.confidenceScore,
      });

      // Guard on status='pending' so the reviewer can't clobber a row Brook
      // has already decided (approve/edit/reject) while the reviewer was running.
      const { data: reviewedRow } = await admin
        .from('cert_requests')
        .update({
          reviewer_pass: review.pass,
          reviewer_flags: review.flags,
          reviewer_notes: review.notes,
          reviewer_model: review.model,
          reviewed_at: new Date().toISOString(),
          confidence_score: review.confidenceScore,
          confidence_reasoning: review.confidenceReasoning,
          auto_approve_lane: lane,
          holdback_until: lane === 'holdback' ? holdbackUntil() : null,
          status: 'reviewed',
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (!reviewedRow) {
        log.info('cert.review_skipped_already_decided', {
          certNumber,
          requestId,
          durationMs: Date.now() - reviewT0,
        });
        return;
      }

      log.info('cert.reviewed', {
        certNumber,
        requestId,
        pass: review.pass,
        flagCount: review.flags.length,
        confidenceScore: review.confidenceScore,
        lane,
        durationMs: Date.now() - reviewT0,
      });

      // Three lanes, picked above:
      //   instant   → auto-approve + send now (today's auto_approve path)
      //   holdback  → 1h delay; cron flips to approved unless Brook intercepts
      //   manual    → notify Brook, sit at status=reviewed for her to decide
      //
      // Reviewer crashes (caught below) skip this branch entirely: the row
      // never reaches status='reviewed' so it falls through to the catch
      // block's queue notification.
      let autoApproved = false;
      if (lane === 'instant') {
        try {
          const { data: autoRow } = await admin
            .from('cert_requests')
            .update({
              status: 'approved',
              decided_by_email: 'system:auto-approve',
              decided_at: new Date().toISOString(),
            })
            .eq('id', requestId)
            .eq('status', 'reviewed')
            .select('id')
            .maybeSingle();
          if (!autoRow) {
            log.info('cert.auto_approve_skipped_already_decided', {
              certNumber,
              requestId,
            });
            throw new Error('auto-approve lost race with manual decision');
          }
          await sendApprovedCert(admin, requestId);
          autoApproved = true;
          log.info('cert.auto_approved', {
            certNumber,
            requestId,
            clientId: clientSnapshot.id,
            reviewerPass: review.pass,
            flagCount: review.flags.length,
            confidenceScore: review.confidenceScore,
            lane: 'instant',
          });
        } catch (err) {
          log.error('cert.auto_approve_failed', {
            certNumber,
            requestId,
            error: (err as Error).message,
          });
        }
      }

      // Notify Brook for both the manual and holdback lanes. Holdback notifies
      // with a "this will auto-approve in 1h unless you intercept" framing
      // (the queue UI surfaces the countdown; the email body shows a holdback
      // banner with the deadline + a dashboard link to intercept).
      if (!autoApproved) {
        const holdbackUntilIso =
          lane === 'holdback' ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null;
        await sendQueueNotification(admin, {
          certNumber,
          requestId,
          clientName: clientSnapshot.business_name,
          holderName: holder.name,
          reviewerPass: review.pass,
          flagCount: review.flags.length,
          confidenceScore: review.confidenceScore,
          lane,
          holdbackUntil: holdbackUntilIso,
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
        await sendQueueNotification(admin, {
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

