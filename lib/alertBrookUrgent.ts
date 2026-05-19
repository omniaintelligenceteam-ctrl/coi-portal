/**
 * URGENT escalation email to Brook when a client reports a cert is wrong, or
 * when the AI reviewer flags a cert hard enough that we don't auto-send it.
 *
 * Screaming ALL-CAPS subject line is intentional — it's the signal that cuts
 * through Brook's regular notification email noise. Bot does NOT reply to the
 * client on this path; Brook handles the response personally to keep the tone
 * human.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createCertSignedUrl } from './storage';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type AlertBrookUrgentInput = {
  admin: SupabaseClient;
  /** What the client said is wrong (verbatim quote). */
  clientErrorText: string;
  /** Email address that reported the error. */
  fromAddress: string;
  /** Most reliable cert number we could resolve, or null if we couldn't find one. */
  certNumber: string | null;
  /** Business name of the insured (i.e. the client). Falls back to fromAddress. */
  clientName: string | null;
  /** Optional pdf_storage_path so we can mint a signed URL for Brook to view the bad cert. */
  pdfStoragePath?: string | null;
  /** Optional cert_request id so we can link to the admin queue. */
  certRequestId?: string | null;
  /** Subject + body of the original inbound email (for context). */
  originalSubject?: string;
  originalBody?: string;
  /** Override the screaming reason for non-error-report alerts (e.g. reviewer flag). */
  reasonLabel?: string;
};

export type AlertBrookUrgentResult = { id: string };

export async function alertBrookUrgent(
  input: AlertBrookUrgentInput,
): Promise<AlertBrookUrgentResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  const adminEmails = (process.env.ADMIN_EMAILS ?? 'wesoverstreet@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const certLabel = input.certNumber ?? 'UNKNOWN CERT';
  const clientLabel = input.clientName ?? input.fromAddress;
  const reason = (input.reasonLabel ?? 'COI ERROR REPORTED').toUpperCase();

  const subject = `URGENT — ${reason} — ${certLabel} — ${clientLabel}`;

  // Mint signed URL for the bad cert if we have one (non-fatal if it fails).
  let certUrl: string | null = null;
  if (input.pdfStoragePath) {
    try {
      certUrl = await createCertSignedUrl(input.admin, input.pdfStoragePath);
    } catch {}
  }

  const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ?? 'https://coi-portal.vercel.app';
  const queueUrl = input.certRequestId ? `${portalBase}/admin/queue/${input.certRequestId}` : null;

  const text = [
    `URGENT — a client has reported an issue with a certificate.`,
    ``,
    `Client:       ${clientLabel}`,
    `From:         ${input.fromAddress}`,
    `Cert:         ${certLabel}`,
    certUrl ? `Cert PDF:     ${certUrl}` : null,
    queueUrl ? `Admin queue:  ${queueUrl}` : null,
    ``,
    `What the client said:`,
    `---`,
    input.clientErrorText.trim(),
    `---`,
    ``,
    input.originalSubject ? `Original subject: ${input.originalSubject}` : null,
    ``,
    `The bot did NOT reply to the client. You own this response.`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<h2 style="color:#b91c1c;margin:0 0 12px 0;">URGENT — ${escape(reason)}</h2>
<p><strong>Client:</strong> ${escape(clientLabel)}<br/>
<strong>From:</strong> ${escape(input.fromAddress)}<br/>
<strong>Cert:</strong> ${escape(certLabel)}</p>
${certUrl ? `<p><a href="${escape(certUrl)}">View the certificate PDF</a></p>` : ''}
${queueUrl ? `<p><a href="${escape(queueUrl)}">Open in admin queue</a></p>` : ''}
<p><strong>What the client said:</strong></p>
<blockquote style="border-left:3px solid #b91c1c;background:#fef2f2;padding:10px 14px;margin:8px 0;white-space:pre-wrap;">${escape(input.clientErrorText.trim())}</blockquote>
${input.originalSubject ? `<p style="color:#6b7280;font-size:12px;">Original subject: ${escape(input.originalSubject)}</p>` : ''}
<p style="color:#6b7280;font-size:12px;margin-top:24px;">The bot did NOT reply to the client. You own this response.</p>
</body></html>`;

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `The Policy Place <${fromEmail}>`,
      to: adminEmails,
      subject,
      text,
      html,
      headers: { 'X-Priority': '1', Importance: 'High' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`alertBrookUrgent Resend send failed: ${res.status} ${errText}`);
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error('alertBrookUrgent: Resend returned no id field');
  return { id: body.id };
}
