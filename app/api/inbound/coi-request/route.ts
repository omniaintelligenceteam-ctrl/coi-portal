/**
 * Inbound-email webhook. Clients email a free-form COI request to the address
 * configured at the inbound provider (e.g. coi@inbound.policyplace.com). Provider
 * (Resend Inbound by default) POSTs the parsed message here.
 *
 * Flow:
 *   1. Verify shared secret + idempotency on RFC822 Message-ID
 *   2. Classify intent with Claude
 *   3. Route:
 *      - other            → polite "can't help with this" reply
 *      - error_report     → resolve cert → alert Brook URGENT (no client reply)
 *      - new_request /
 *        followup_info    → parse → look up client → generate cert →
 *                           run reviewer sync → if pass: email PDF on the thread;
 *                           if fail: alert Brook URGENT, no client reply
 *   4. Write inbound_email_log row regardless of path
 *
 * Returns 200 OK on success or expected business outcomes (so the provider
 * doesn't retry forever); 401/500 on signature/system errors so the provider
 * retries those.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateCertificate } from '@/lib/certPipeline';
import { classifyInbound } from '@/lib/classifyInbound';
import { parseInboundCoi } from '@/lib/parseInboundCoi';
import { alertBrookUrgent } from '@/lib/alertBrookUrgent';
import { sendCoiEmail, sendInboundReply } from '@/lib/email';
import { reviewCert, type ClientOverride } from '@/lib/reviewerAgent';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60; // give us enough time for parse + render + reviewer + send

const CERT_NUMBER_REGEX = /PP-\d{8}-\d{4}(?:-[A-Z0-9]{3})?/;

type InboundLogStatus =
  | 'received'
  | 'replied_ok'
  | 'replied_missing'
  | 'no_client_match'
  | 'error_report_escalated'
  | 'reviewer_flagged_escalated'
  | 'other_intent'
  | 'duplicate'
  | 'error';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** Normalises the various inbound webhook payload shapes into one local type. */
type Normalized = {
  messageId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  inReplyTo: string;
  references: string;
};

function pickHeader(headers: Record<string, unknown> | undefined, name: string): string {
  if (!headers) return '';
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      if (typeof v === 'string') return v;
      if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    }
  }
  return '';
}

function extractAddress(input: unknown): string {
  if (typeof input === 'string') {
    // "Name <addr@x>" or "addr@x"
    const m = input.match(/<([^>]+)>/);
    return ((m && m[1]) ? m[1] : input).trim().toLowerCase();
  }
  if (input && typeof input === 'object') {
    const obj = input as { address?: string; email?: string };
    return (obj.address ?? obj.email ?? '').trim().toLowerCase();
  }
  return '';
}

function normalizePayload(payload: Record<string, unknown>): Normalized | null {
  // Resend Inbound wraps the email in `data`; others put it at top level.
  const data = (payload.data as Record<string, unknown>) ?? payload;
  const headers = data.headers as Record<string, unknown> | undefined;

  const messageId = pickHeader(headers, 'Message-ID') || (data.message_id as string | undefined) || '';
  if (!messageId) return null;

  const fromRaw = data.from;
  const toRaw = data.to;
  const fromAddress = extractAddress(fromRaw);
  const toAddress = Array.isArray(toRaw) ? extractAddress(toRaw[0]) : extractAddress(toRaw);

  const subject = ((data.subject as string) || '').trim();
  const text = (data.text as string) || '';
  const html = (data.html as string) || '';
  const body = text.trim() || stripHtml(html);

  const inReplyTo = pickHeader(headers, 'In-Reply-To');
  const references = pickHeader(headers, 'References');

  if (!fromAddress) return null;
  return { messageId, fromAddress, toAddress, subject, body, inReplyTo, references };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(req: NextRequest) {
  // 1. Verify shared secret.
  const expected = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'inbound webhook not configured' }, { status: 503 });
  }
  const provided =
    req.headers.get('x-inbound-secret') ??
    req.headers.get('x-webhook-secret') ??
    '';
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const norm = normalizePayload(payload);
  if (!norm) {
    return NextResponse.json({ error: 'unrecognised payload shape' }, { status: 400 });
  }

  const admin = createAdminClient();

  // 2. Idempotency by Message-ID.
  const { data: existing } = await admin
    .from('inbound_email_log')
    .select('id, status')
    .eq('message_id', norm.messageId)
    .maybeSingle();
  if (existing) {
    log.info('inbound.duplicate', { messageId: norm.messageId, prior: existing.status });
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Pre-insert a 'received' row so a crash mid-flow leaves a paper trail.
  const { data: logRow } = await admin
    .from('inbound_email_log')
    .insert({
      message_id: norm.messageId,
      from_address: norm.fromAddress,
      to_address: norm.toAddress || null,
      subject: norm.subject || null,
      in_reply_to: norm.inReplyTo || null,
      references_hdr: norm.references || null,
      status: 'received' satisfies InboundLogStatus,
    })
    .select('id')
    .single();
  const logId = logRow?.id ?? null;

  const finish = async (
    status: InboundLogStatus,
    extra: Record<string, unknown> = {},
  ) => {
    if (logId) {
      await admin.from('inbound_email_log').update({ status, ...extra }).eq('id', logId);
    }
  };

  try {
    // 3. Resolve client by sender address (security boundary).
    const { data: client } = await admin
      .from('coi_clients')
      .select('id, business_name, contact_email')
      .eq('contact_email', norm.fromAddress)
      .eq('active', true)
      .maybeSingle();

    // 4. Classify intent (cheap, ~5s, runs even for unknown senders so we don't
    //    bother them with a polite reply when they're really reporting an error).
    const recentCertNumbers: string[] = [];
    if (client) {
      const { data: recents } = await admin
        .from('cert_requests')
        .select('cert_number')
        .eq('client_id', client.id)
        .order('requested_at', { ascending: false })
        .limit(5);
      for (const r of recents ?? []) recentCertNumbers.push(r.cert_number);
    }

    const classified = await classifyInbound({
      subject: norm.subject,
      body: norm.body,
      fromAddress: norm.fromAddress,
      recentCertNumbers: recentCertNumbers.length ? recentCertNumbers : undefined,
    });

    if (!client) {
      // Unknown sender. Reply politely so they have a path forward; never generate a cert.
      await sendInboundReply({
        to: norm.fromAddress,
        subject: norm.subject ? `Re: ${norm.subject}` : `About your message`,
        inReplyTo: norm.messageId,
        references: norm.references,
        bodyText: `Hi,

Thanks for reaching out. We don't see this address on file as one of our clients, so we can't issue a certificate from this email. Please reach out to Brook directly at brook@yourpolicyplace.com and we'll get you set up.

— The Policy Place`,
        bodyHtml: `<p>Hi,</p><p>Thanks for reaching out. We don't see this address on file as one of our clients, so we can't issue a certificate from this email. Please reach out to Brook directly at <a href="mailto:brook@yourpolicyplace.com">brook@yourpolicyplace.com</a> and we'll get you set up.</p><p>— The Policy Place</p>`,
      });
      await finish('no_client_match', { intent: classified.intent, parse_json: classified });
      return NextResponse.json({ ok: true, status: 'no_client_match' });
    }

    // 5. Error report → escalate to Brook, no client reply.
    if (classified.intent === 'error_report') {
      const certNumber = await resolveCertNumber({
        admin,
        body: norm.body,
        subject: norm.subject,
        classified,
        inReplyTo: norm.inReplyTo,
        references: norm.references,
        clientId: client.id,
      });
      let pdfStoragePath: string | null = null;
      let certRequestId: string | null = null;
      if (certNumber) {
        const { data: cr } = await admin
          .from('cert_requests')
          .select('id, pdf_storage_path')
          .eq('cert_number', certNumber)
          .maybeSingle();
        pdfStoragePath = cr?.pdf_storage_path ?? null;
        certRequestId = cr?.id ?? null;
      }
      await alertBrookUrgent({
        admin,
        clientErrorText: classified.errorSummary ? `${classified.errorSummary}\n\n--- original message ---\n${norm.body}` : norm.body,
        fromAddress: norm.fromAddress,
        certNumber,
        clientName: client.business_name,
        pdfStoragePath,
        certRequestId,
        originalSubject: norm.subject,
      });
      await finish('error_report_escalated', {
        intent: classified.intent,
        cert_number: certNumber,
        cert_request_id: certRequestId,
        client_id: client.id,
        parse_json: classified,
      });
      return NextResponse.json({ ok: true, status: 'error_report_escalated' });
    }

    // 6. Other intent → polite reply.
    if (classified.intent === 'other') {
      await sendInboundReply({
        to: norm.fromAddress,
        subject: norm.subject ? `Re: ${norm.subject}` : `Got your message`,
        inReplyTo: norm.messageId,
        references: norm.references,
        bodyText: `Hi,

Thanks for the note — I wasn't sure if this was a request for a certificate or something else. If you'd like a new COI, just reply with the certificate holder name and address and we'll get it out to you. For anything else, Brook will jump in shortly.

— The Policy Place`,
        bodyHtml: `<p>Hi,</p><p>Thanks for the note — I wasn't sure if this was a request for a certificate or something else. If you'd like a new COI, just reply with the certificate holder name and address and we'll get it out to you. For anything else, Brook will jump in shortly.</p><p>— The Policy Place</p>`,
      });
      await finish('other_intent', { intent: classified.intent, client_id: client.id, parse_json: classified });
      return NextResponse.json({ ok: true, status: 'other_intent' });
    }

    // 7. new_request OR followup_info → parse + run cert pipeline.
    // For followups we gather prior thread context from earlier inbound_email_log rows
    // matching the References: chain so "address is 123 Main" resolves into prior holder name.
    let threadSummary: string | undefined;
    if (classified.intent === 'followup_info' && norm.references) {
      const priorIds = norm.references.match(/<[^>]+>/g) ?? [];
      if (priorIds.length > 0) {
        const { data: priors } = await admin
          .from('inbound_email_log')
          .select('subject, parse_json, received_at')
          .in('message_id', priorIds)
          .order('received_at', { ascending: true });
        if (priors?.length) {
          threadSummary = priors
            .map((p) => `Subject: ${p.subject ?? ''}\nParsed: ${JSON.stringify(p.parse_json ?? {})}`)
            .join('\n---\n');
        }
      }
    }

    const parsed = await parseInboundCoi({
      subject: norm.subject,
      body: norm.body,
      fromAddress: norm.fromAddress,
      threadSummary,
    });

    if (parsed.missing.length > 0) {
      const ask: string[] = [];
      if (parsed.missing.includes('holderName')) ask.push('the certificate holder name (the business or party we should list)');
      if (parsed.missing.includes('holderAddress1')) ask.push('the holder address (street + city/state/zip)');
      const askText = ask.length === 1 ? ask[0] : `${ask.slice(0, -1).join(', ')} and ${ask[ask.length - 1]}`;

      await sendInboundReply({
        to: norm.fromAddress,
        subject: norm.subject ? `Re: ${norm.subject}` : `Quick question on your certificate request`,
        inReplyTo: norm.messageId,
        references: norm.references,
        bodyText: `Hi,

Happy to get this out to you. I just need ${askText} so the certificate is filled in correctly. Reply with that and the cert will be on its way in a few minutes.

— The Policy Place`,
        bodyHtml: `<p>Hi,</p><p>Happy to get this out to you. I just need ${ask
          .map((a) => `<strong>${a}</strong>`)
          .join(' and ')} so the certificate is filled in correctly. Reply with that and the cert will be on its way in a few minutes.</p><p>— The Policy Place</p>`,
      });
      await finish('replied_missing', {
        intent: classified.intent,
        client_id: client.id,
        parse_json: parsed,
      });
      return NextResponse.json({ ok: true, status: 'replied_missing' });
    }

    // 8. Generate cert.
    const result = await generateCertificate({
      admin,
      clientEmail: client.contact_email,
      holder: {
        name: parsed.holderName,
        address1: parsed.holderAddress1,
        address2: parsed.holderAddress2 || '',
      },
      requestedByEmail: `inbound:${norm.fromAddress}`,
      source: 'inbound-email',
    });

    if (!result.ok) {
      // Couldn't generate — escalate to Brook so she can fix.
      await alertBrookUrgent({
        admin,
        clientErrorText: `Inbound request from ${norm.fromAddress} could not be auto-generated: ${result.error}`,
        fromAddress: norm.fromAddress,
        certNumber: null,
        clientName: client.business_name,
        originalSubject: norm.subject,
        originalBody: norm.body,
        reasonLabel: 'COI AUTO-GENERATION FAILED',
      });
      await finish('error', {
        intent: classified.intent,
        client_id: client.id,
        parse_json: parsed,
        error: result.error,
      });
      return NextResponse.json({ ok: true, status: 'error', error: result.error });
    }

    // 9. Run reviewer SYNCHRONOUSLY so we only auto-send when it passes clean.
    const { data: overrides } = await admin
      .from('client_overrides')
      .select('scope, pattern, correction')
      .eq('client_id', result.client.id)
      .eq('active', true)
      .returns<ClientOverride[]>();

    let reviewerPass = false;
    let reviewerFlagCount = 0;
    try {
      const review = await reviewCert({ request: result.coiInput, clientOverrides: overrides ?? [] });
      reviewerPass = review.pass && review.flags.every((f) => f.severity !== 'error');
      reviewerFlagCount = review.flags.length;

      await admin.from('cert_requests').update({
        reviewer_pass: review.pass,
        reviewer_flags: review.flags,
        reviewer_notes: review.notes,
        reviewer_model: review.model,
        reviewed_at: new Date().toISOString(),
        status: 'reviewed',
      }).eq('id', result.requestId);
    } catch (err) {
      log.error('inbound.reviewer_failed', { certNumber: result.certNumber, error: (err as Error).message });
    }

    if (!reviewerPass) {
      // Reviewer flagged or failed → don't auto-send to client. Escalate Brook.
      await alertBrookUrgent({
        admin,
        clientErrorText: `Inbound request auto-generated cert ${result.certNumber} but the AI reviewer flagged ${reviewerFlagCount} issue(s). Cert was NOT sent to the client. Open the admin queue to review and approve.`,
        fromAddress: norm.fromAddress,
        certNumber: result.certNumber,
        clientName: client.business_name,
        pdfStoragePath: result.storagePath,
        certRequestId: result.requestId,
        originalSubject: norm.subject,
        originalBody: norm.body,
        reasonLabel: 'REVIEWER FLAGGED COI — DO NOT SEND',
      });
      await finish('reviewer_flagged_escalated', {
        intent: classified.intent,
        client_id: client.id,
        cert_number: result.certNumber,
        cert_request_id: result.requestId,
        parse_json: parsed,
      });
      return NextResponse.json({
        ok: true,
        status: 'reviewer_flagged_escalated',
        certNumber: result.certNumber,
      });
    }

    // 10. Send the cert back on the same thread.
    const portalBase =
      process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ?? 'https://coi-portal.vercel.app';
    await sendCoiEmail({
      to: norm.fromAddress,
      cc: [result.agency.email, 'wesoverstreet@gmail.com']
        .filter((e): e is string => Boolean(e) && e !== norm.fromAddress),
      pdfBytes: result.pdfBytes,
      certNumber: result.certNumber,
      holderName: result.coiInput.holder.name,
      insuredBusinessName: result.client.business_name,
      verifyUrl: `${portalBase}/verify/${result.certNumber}`,
      inReplyTo: norm.messageId,
      references: norm.references,
      subjectOverride: norm.subject ? `Re: ${norm.subject}` : undefined,
    });

    // Mark request as sent + audit row (mirrors sendApprovedCert's bookkeeping).
    await admin.from('cert_requests').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', result.requestId);
    try {
      await admin.from('coi_audit').insert({
        client_id: result.client.id,
        cert_number: result.certNumber,
        requested_by_email: norm.fromAddress,
        holder_name: result.coiInput.holder.name,
        holder_address1: parsed.holderAddress1,
        holder_address2: parsed.holderAddress2 || null,
        coverages_selected: result.selectedPolicies.map((p) => p.id),
        pdf_storage_path: result.storagePath,
      });
    } catch (err) {
      log.error('inbound.audit_insert_failed', { certNumber: result.certNumber, error: (err as Error).message });
    }

    await finish('replied_ok', {
      intent: classified.intent,
      client_id: client.id,
      cert_number: result.certNumber,
      cert_request_id: result.requestId,
      parse_json: parsed,
    });
    return NextResponse.json({ ok: true, status: 'replied_ok', certNumber: result.certNumber });
  } catch (err) {
    log.error('inbound.unhandled', { messageId: norm.messageId, error: (err as Error).message });
    await finish('error', { error: (err as Error).message });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

/**
 * Best-effort cert-number lookup for error_report intents.
 *   1. classifier-returned referencedCertNumber
 *   2. regex on subject + body
 *   3. In-Reply-To / References chain → original inbound_email_log row → cert_number
 *   4. Most recent cert for the client
 *   5. null (alert still fires with "unknown cert")
 */
async function resolveCertNumber(args: {
  admin: ReturnType<typeof createAdminClient>;
  body: string;
  subject: string;
  classified: { referencedCertNumber?: string };
  inReplyTo: string;
  references: string;
  clientId: string;
}): Promise<string | null> {
  if (args.classified.referencedCertNumber) {
    const m = args.classified.referencedCertNumber.match(CERT_NUMBER_REGEX);
    if (m) return m[0];
  }
  const haystack = `${args.subject} ${args.body}`;
  const m = haystack.match(CERT_NUMBER_REGEX);
  if (m) return m[0];

  if (args.inReplyTo || args.references) {
    const ids = `${args.inReplyTo} ${args.references}`.match(/<[^>]+>/g) ?? [];
    if (ids.length) {
      const { data } = await args.admin
        .from('inbound_email_log')
        .select('cert_number')
        .in('message_id', ids)
        .not('cert_number', 'is', null)
        .order('received_at', { ascending: false })
        .limit(1);
      if (data?.[0]?.cert_number) return data[0].cert_number;
    }
  }

  const { data: recent } = await args.admin
    .from('cert_requests')
    .select('cert_number')
    .eq('client_id', args.clientId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return recent?.cert_number ?? null;
}
