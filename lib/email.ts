/**
 * Resend wrapper. Sends a generated COI PDF to the cert holder's contact (the
 * client's contact_email) with Brook CC'd. Uses the From address configured by
 * RESEND_FROM_EMAIL — during demo this is whatever Wes has verified on his
 * Resend account; in prod we switch to Brook's certs@ alias on her own domain.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { mintApprovalToken } from './approvalToken';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function portalBase(): string {
  const url = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '');
  return url || 'https://coi-portal.vercel.app';
}

function adminNotifyList(): string[] {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ['wesoverstreet@gmail.com'];
}

async function resendPost(
  apiKey: string,
  fromEmail: string,
  payload: Record<string, unknown>,
): Promise<CoiEmailResult> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `The Policy Place <${fromEmail}>`, ...payload }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${errText}`);
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new Error('Resend returned no id field');
  return { id: body.id };
}

export type CoiEmailInput = {
  to: string;
  cc: string[];
  pdfBytes: Uint8Array;
  certNumber: string;
  holderName: string;
  insuredBusinessName: string;
  /** Public URL for the holder to verify this certificate is current. */
  verifyUrl?: string;
  /** RFC822 Message-ID of the inbound email we are replying to (no angle brackets needed; we add them). */
  inReplyTo?: string;
  /** Existing References header from the inbound thread. We append inReplyTo to it. */
  references?: string;
  /** Override the subject line. Useful when threading a reply ("Re: ..."). */
  subjectOverride?: string;
};

export type CoiEmailResult = { id: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(input: CoiEmailInput): string {
  const insured = escapeHtml(input.insuredBusinessName);
  const holder = escapeHtml(input.holderName);
  const certNum = escapeHtml(input.certNumber);
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<p>Hi,</p>
<p>Attached is Certificate of Insurance <strong>${certNum}</strong>, issued on behalf of
${insured} to ${holder}.</p>
<p>If anything looks wrong, reply to this email and we'll sort it out right away.</p>
${input.verifyUrl ? `<p style="margin-top:16px;font-size:12px;color:#6b7280;">
Holders can verify this certificate is current at:<br/>
<a href="${escapeHtml(input.verifyUrl)}" style="color:#3d6b73;">${escapeHtml(input.verifyUrl)}</a>
</p>` : ''}
<p style="margin-top:24px;">— The Policy Place<br/>
908 Poplar St, Benton, KY 42025<br/>
<a href="mailto:brook@yourpolicyplace.com">brook@yourpolicyplace.com</a> · 270-410-2015
</p>
</body></html>`;
}

function buildText(input: CoiEmailInput): string {
  return `Hi,

Attached is Certificate of Insurance ${input.certNumber}, issued on behalf of ${input.insuredBusinessName} to ${input.holderName}.

If anything looks wrong, reply to this email and we'll sort it out right away.
${input.verifyUrl ? `\nHolders can verify this certificate at: ${input.verifyUrl}\n` : ''}
— The Policy Place
908 Poplar St, Benton, KY 42025
brook@yourpolicyplace.com · 270-410-2015
`;
}

// ─── Expiry warning ──────────────────────────────────────────────────────────

export type ExpiryWarningInput = {
  to: string;
  cc?: string[];
  businessName: string;
  policyType: string;
  policyNumber: string;
  expDateFormatted: string;
  daysUntilExpiry: number;
  agentEmail: string;
  agentPhone: string;
};

function buildExpiryHtml(input: ExpiryWarningInput): string {
  const name = escapeHtml(input.businessName);
  const ptype = escapeHtml(input.policyType);
  const pnum = escapeHtml(input.policyNumber);
  const exp = escapeHtml(input.expDateFormatted);
  const days = input.daysUntilExpiry;
  const urgency = days <= 7 ? 'urgent' : 'heads-up';
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<p>Hi,</p>
<p>This is a ${urgency} — your <strong>${ptype}</strong> policy (${pnum}) for
<strong>${name}</strong> expires on <strong>${exp}</strong>, which is
<strong>${days} day${days === 1 ? '' : 's'} away</strong>.</p>
<p>If you're renewing with the same carrier, reach out and we'll get a fresh certificate
ready as soon as the new policy binds. If anything's changing, let's talk before the
expiration date.</p>
<p>Reply to this email or call us directly:</p>
<p><a href="mailto:${escapeHtml(input.agentEmail)}">${escapeHtml(input.agentEmail)}</a><br/>
${escapeHtml(input.agentPhone)}</p>
<p style="margin-top:24px;">— The Policy Place</p>
</body></html>`;
}

function buildExpiryText(input: ExpiryWarningInput): string {
  return `Hi,

Your ${input.policyType} policy (${input.policyNumber}) for ${input.businessName} expires on ${input.expDateFormatted} — ${input.daysUntilExpiry} day${input.daysUntilExpiry === 1 ? '' : 's'} away.

If you're renewing, reach out and we'll get a fresh certificate ready the moment the new policy binds.

${input.agentEmail}
${input.agentPhone}

— The Policy Place
`;
}

export async function sendExpiryWarningEmail(input: ExpiryWarningInput): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');
  const urgency = input.daysUntilExpiry <= 7 ? '⚠️ Urgent: ' : '';
  return resendPost(apiKey, fromEmail, {
    to: [input.to],
    cc: input.cc?.length ? input.cc : undefined,
    subject: `${urgency}Your ${input.policyType} policy expires ${input.expDateFormatted} — ${input.businessName}`,
    html: buildExpiryHtml(input),
    text: buildExpiryText(input),
  });
}

// ─── Queue notification ───────────────────────────────────────────────────────

export type QueueNotificationInput = {
  certNumber: string;
  requestId: string;
  clientName: string;
  holderName: string;
  reviewerPass: boolean | null;
  flagCount: number;
  /** Optional 0-100 reviewer confidence — surfaced in the email if present. */
  confidenceScore?: number | null;
  /**
   * Trust-ladder lane. When 'holdback', the email frames the request as
   * auto-issuing on its own and gives Brook a one-tap "intercept" link to
   * stop the cron from releasing it.
   */
  lane?: 'manual' | 'holdback' | 'instant' | null;
  /** ISO timestamp the cron will release a holdback cert. Required for the holdback framing. */
  holdbackUntil?: string | null;
};

function buildQueueText(args: {
  certNumber: string;
  clientName: string;
  holderName: string;
  reviewerLine: string;
  approveUrl: string;
  dashboardUrl: string;
  holdbackLine?: string;
  isHoldback?: boolean;
}): string {
  const header = args.isHoldback
    ? `Holdback — cert auto-issues in 1 hour.\n\n${args.holdbackLine}\n\nIntercept it via the dashboard if you want to review manually.`
    : 'New cert request ready for review.';
  return `${header}

Cert: ${args.certNumber}
Client: ${args.clientName}
Holder: ${args.holderName}
${args.reviewerLine}

${args.isHoldback ? `Intercept (review manually before it ships):
${args.dashboardUrl}

Or` : 'One-tap approve (mobile-friendly, no login):'}
${args.approveUrl}

Or open the full dashboard:
${args.dashboardUrl}

— The Policy Place`;
}

function buildQueueHtml(args: {
  certNumber: string;
  clientName: string;
  holderName: string;
  reviewerLine: string;
  approveUrl: string;
  dashboardUrl: string;
  holdbackLine?: string;
  isHoldback?: boolean;
}): string {
  const cert = escapeHtml(args.certNumber);
  const client = escapeHtml(args.clientName);
  const holder = escapeHtml(args.holderName);
  const reviewer = escapeHtml(args.reviewerLine);
  const approve = escapeHtml(args.approveUrl);
  const dashboard = escapeHtml(args.dashboardUrl);
  const holdbackBanner = args.isHoldback
    ? `<div style="background:#f4eede;border-left:4px solid #b8923a;padding:14px 18px;margin-bottom:24px;border-radius:4px;">
        <strong style="color:#8c6d27;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;">Holdback</strong>
        <p style="margin:6px 0 0 0;color:#1f2937;font-size:14px;">${escapeHtml(args.holdbackLine ?? '')}</p>
        <p style="margin:8px 0 0 0;color:#4a4a47;font-size:13px;">Use the dashboard link below to intercept and review manually.</p>
      </div>`
    : '';
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;margin:0;padding:0;">
<div style="max-width:560px;margin:0 auto;padding:24px 20px;">
<p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Action needed</p>
<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#1f2937;">New cert request ready for review</h1>

<table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0 24px 0;font-size:14px;">
  <tr><td style="padding:6px 0;color:#6b7280;width:90px;">Cert</td><td style="padding:6px 0;color:#1f2937;font-family:ui-monospace,Menlo,Consolas,monospace;">${cert}</td></tr>
  </table>${holdbackBanner}<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
  <tr><td style="padding:6px 0;color:#6b7280;">Client</td><td style="padding:6px 0;color:#1f2937;">${client}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Holder</td><td style="padding:6px 0;color:#1f2937;">${holder}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Review</td><td style="padding:6px 0;color:#1f2937;">${reviewer}</td></tr>
</table>

<p style="margin:24px 0;">
  <a href="${approve}" style="display:inline-block;background:#3d6b73;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px;min-width:200px;text-align:center;">Approve on phone</a>
</p>

<p style="margin:8px 0 24px 0;font-size:13px;color:#6b7280;">
  The "Approve on phone" link signs you in automatically — no password, no second tap. Works from any mail app or webview. Expires in 72 hours, single use.
</p>

<p style="margin:16px 0;font-size:13px;color:#6b7280;">
  Or open the full dashboard:<br/>
  <a href="${dashboard}" style="color:#3d6b73;">${dashboard}</a>
</p>

<p style="margin-top:32px;font-size:13px;color:#6b7280;">— The Policy Place</p>
</div>
</body></html>`;
}

/**
 * Send the queue-review email to each admin individually with a unique signed
 * approval token in the URL. The token lets that admin land on the approval
 * card without a session — solving the "Gmail webview cookie isolation"
 * mobile re-login problem (plan: jazzy-questing-squirrel.md).
 *
 * Mints one token per admin via lib/approvalToken.ts. Single email per admin
 * so each gets their own token; no to:[] broadcast (would break single-use).
 * A mint failure for one admin doesn't stop the others.
 *
 * `admin` is a service-role Supabase client (createAdminClient()).
 */
export async function sendQueueNotification(
  admin: SupabaseClient,
  input: QueueNotificationInput,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return;

  const recipients = adminNotifyList();
  if (recipients.length === 0) return;

  const confidenceFragment =
    typeof input.confidenceScore === 'number'
      ? ` Confidence ${input.confidenceScore}/100.`
      : '';
  const reviewerLine =
    (input.reviewerPass === null
      ? 'Reviewer still running.'
      : input.reviewerPass && input.flagCount === 0
        ? 'AI reviewer: clean.'
        : `AI reviewer: ${input.flagCount} flag(s) — review carefully.`) + confidenceFragment;

  const dashboardUrl = `${portalBase()}/admin/queue/${input.requestId}`;
  const isHoldback = input.lane === 'holdback' && Boolean(input.holdbackUntil);
  const subject = isHoldback
    ? `[Holding 1h] ${input.certNumber} auto-issues — ${input.clientName}`
    : `[Action needed] Cert request ${input.certNumber} — ${input.clientName}`;
  const holdbackLine = isHoldback
    ? `Auto-issuing at ${new Date(input.holdbackUntil as string).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })} unless you intercept.`
    : '';

  await Promise.all(
    recipients.map(async (adminEmail) => {
      let rawToken: string;
      try {
        const minted = await mintApprovalToken({
          admin,
          requestId: input.requestId,
          adminEmail,
        });
        rawToken = minted.rawToken;
      } catch (err) {
        console.error(`approval token mint for ${adminEmail} failed:`, err);
        return;
      }

      const approveUrl = `${portalBase()}/api/approve/${input.requestId}?t=${rawToken}`;
      const body = {
        certNumber: input.certNumber,
        clientName: input.clientName,
        holderName: input.holderName,
        reviewerLine,
        approveUrl,
        dashboardUrl,
        holdbackLine,
        isHoldback,
      };
      try {
        await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `The Policy Place <${fromEmail}>`,
            to: [adminEmail],
            subject,
            text: buildQueueText(body),
            html: buildQueueHtml(body),
          }),
        });
      } catch (err) {
        console.error(`queue notification to ${adminEmail} failed:`, err);
      }
    }),
  );
}

export { adminNotifyList };

export type RejectionEmailInput = {
  to: string;
  cc?: string[];
  certNumber: string;
  insuredBusinessName: string;
  holderName: string;
  reason: string;
  resubmitUrl: string;
};

function buildRejectionHtml(input: RejectionEmailInput): string {
  const insured = escapeHtml(input.insuredBusinessName);
  const holder = escapeHtml(input.holderName);
  const certNum = escapeHtml(input.certNumber);
  const reasonHtml = escapeHtml(input.reason).replace(/\n/g, '<br/>');
  const url = escapeHtml(input.resubmitUrl);
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<p>Hi,</p>
<p>Your request for Certificate of Insurance <strong>${certNum}</strong>
(${insured} → ${holder}) needs a quick adjustment before we can send it.</p>
<p style="margin:20px 0;padding:14px 16px;border-left:3px solid #c97a4a;background:#fbf6f0;color:#1f2937;">
${reasonHtml}
</p>
<p>When you're ready, you can submit a new request here:<br/>
<a href="${url}" style="color:#3d6b73;text-decoration:underline;">${url}</a></p>
<p>Questions? Just reply to this email — Brook will jump in.</p>
<p style="margin-top:24px;">— The Policy Place<br/>
908 Poplar St, Benton, KY 42025<br/>
<a href="mailto:brook@yourpolicyplace.com">brook@yourpolicyplace.com</a> · 270-410-2015
</p>
</body></html>`;
}

function buildRejectionText(input: RejectionEmailInput): string {
  return `Hi,

Your request for Certificate of Insurance ${input.certNumber} (${input.insuredBusinessName} -> ${input.holderName}) needs a quick adjustment before we can send it.

${input.reason}

Submit a new request:
${input.resubmitUrl}

Questions? Just reply to this email — Brook will jump in.

— The Policy Place
908 Poplar St, Benton, KY 42025
brook@yourpolicyplace.com · 270-410-2015
`;
}

export async function sendRejectionEmail(input: RejectionEmailInput): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  const payload = {
    from: `The Policy Place <${fromEmail}>`,
    to: [input.to],
    cc: input.cc?.length ? input.cc : undefined,
    subject: `Action needed: Certificate ${input.certNumber} — ${input.insuredBusinessName}`,
    html: buildRejectionHtml(input),
    text: buildRejectionText(input),
  };

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend send failed: ${res.status} ${errText}`);
  }
  const body = (await res.json()) as { id?: string };
  if (!body.id) {
    throw new Error('Resend returned no id field');
  }
  return { id: body.id };
}

// ─── Thread-aware simple replies (no PDF attached) ──────────────────────────

export type InboundReplyInput = {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  inReplyTo?: string;
  references?: string;
};

export async function sendInboundReply(input: InboundReplyInput): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  const wrap = (mid: string) => (mid.startsWith('<') ? mid : `<${mid}>`);
  const headers: Record<string, string> = {};
  if (input.inReplyTo) {
    const replyId = wrap(input.inReplyTo);
    headers['In-Reply-To'] = replyId;
    headers['References'] = input.references ? `${input.references} ${replyId}`.trim() : replyId;
  }

  const payload: Record<string, unknown> = {
    to: [input.to],
    subject: input.subject,
    html: input.bodyHtml,
    text: input.bodyText,
  };
  if (Object.keys(headers).length > 0) payload.headers = headers;

  return resendPost(apiKey, fromEmail, payload);
}

// ─── Access requests (signup + invite) ─────────────────────────────────────

export type AccessRequestNotificationInput = {
  requestId: string;
  email: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  message: string | null;
};

export async function sendAccessRequestNotification(
  input: AccessRequestNotificationInput,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return;

  const reviewUrl = `${portalBase()}/admin/access-requests`;
  const text = `New access request waiting for review.

Business:  ${input.businessName}
Email:     ${input.email}
Name:      ${input.contactName ?? '—'}
Phone:     ${input.phone ?? '—'}

Message:
${input.message ?? '(none)'}

Review and approve: ${reviewUrl}`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<h2 style="margin:0 0 12px 0;color:#1f2937;">New access request</h2>
<p><strong>Business:</strong> ${escapeHtml(input.businessName)}<br/>
<strong>Email:</strong> ${escapeHtml(input.email)}<br/>
<strong>Name:</strong> ${escapeHtml(input.contactName ?? '—')}<br/>
<strong>Phone:</strong> ${escapeHtml(input.phone ?? '—')}</p>
${input.message ? `<p><strong>Message:</strong></p>
<blockquote style="border-left:3px solid #3d6b73;background:#f5f8f8;padding:10px 14px;margin:8px 0;white-space:pre-wrap;">${escapeHtml(input.message)}</blockquote>` : ''}
<p style="margin-top:20px;">
  <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#3d6b73;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Review and approve</a>
</p>
</body></html>`;

  await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `The Policy Place <${fromEmail}>`,
      to: adminNotifyList(),
      subject: `[Access request] ${input.businessName} (${input.email})`,
      text,
      html,
    }),
  });
}

export type AccessApprovedEmailInput = {
  to: string;
  businessName: string;
  source: 'self_signup' | 'admin_invite';
  loginPrompt?: {
    confirmUrl: string;
    emailOtp: string;
    expiresMinutes?: number;
  };
};

export async function sendAccessApprovedEmail(
  input: AccessApprovedEmailInput,
): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  const signInUrl = `${portalBase()}/login`;
  const expires = input.loginPrompt?.expiresMinutes ?? 60;
  const opener =
    input.source === 'admin_invite'
      ? `Brook set up a Policy Place account for ${escapeHtml(input.businessName)} so you can request certificates yourself, anytime.`
      : `You're approved. ${escapeHtml(input.businessName)} is now set up on the Policy Place portal.`;

  const loginText = input.loginPrompt
    ? `Sign in now with one tap:
${input.loginPrompt.confirmUrl}

Backup code (if the link fails): ${input.loginPrompt.emailOtp}
This code expires in about ${expires} minutes.`
    : `To sign in, go here and enter this email address — we'll send you a one-click link:
${signInUrl}`;

  const text = `Hi,

${input.source === 'admin_invite'
  ? `Brook set up a Policy Place account for ${input.businessName} so you can request certificates yourself, anytime.`
  : `You're approved. ${input.businessName} is now set up on the Policy Place portal.`}

${loginText}

If you have any questions, just reply to this email — Brook will jump in.

— The Policy Place
908 Poplar St, Benton, KY 42025
brook@yourpolicyplace.com · 270-410-2015
`;

  const loginHtml = input.loginPrompt
    ? `<p style="margin:20px 0;">
  <a href="${escapeHtml(input.loginPrompt.confirmUrl)}" style="display:inline-block;background:#3d6b73;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;">Sign in now</a>
</p>
<p style="font-size:13px;color:#4b5563;margin-top:0;">
  Backup code (if link fails): <strong style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:0.08em;">${escapeHtml(input.loginPrompt.emailOtp)}</strong><br/>
  Expires in about ${expires} minutes.
</p>`
    : `<p style="margin:20px 0;">
  <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#3d6b73;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;">Sign in to the portal</a>
</p>
<p style="font-size:13px;color:#6b7280;">Enter this email address (${escapeHtml(input.to)}) on the sign-in screen and we'll send you a one-click link.</p>`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<p>Hi,</p>
<p>${opener}</p>
${loginHtml}
<p>Questions? Just reply to this email — Brook will jump in.</p>
<p style="margin-top:24px;">— The Policy Place<br/>
908 Poplar St, Benton, KY 42025<br/>
<a href="mailto:brook@yourpolicyplace.com">brook@yourpolicyplace.com</a> · 270-410-2015
</p>
</body></html>`;

  return resendPost(apiKey, fromEmail, {
    to: [input.to],
    subject:
      input.source === 'admin_invite'
        ? `You're set up on the Policy Place — ${input.businessName}`
        : `You're approved on the Policy Place — ${input.businessName}`,
    text,
    html,
  });
}

export type PortalLoginEmailInput = {
  to: string;
  confirmUrl: string;
  emailOtp: string;
  expiresMinutes?: number;
};

export async function sendPortalLoginEmail(input: PortalLoginEmailInput): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  const expires = input.expiresMinutes ?? 60;
  const loginUrl = `${portalBase()}/login`;
  const text = `Hi,

Use this secure sign-in link:
${input.confirmUrl}

Backup code (if the link fails): ${input.emailOtp}
This code expires in about ${expires} minutes.

If you did not request this, you can ignore this message.

— The Policy Place
908 Poplar St, Benton, KY 42025
brook@yourpolicyplace.com · 270-410-2015
`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<p>Hi,</p>
<p>Use this secure sign-in link:</p>
<p style="margin:20px 0;">
  <a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;background:#3d6b73;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;">Sign in now</a>
</p>
<p style="font-size:13px;color:#4b5563;">
  Backup code (if link fails): <strong style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:0.08em;">${escapeHtml(input.emailOtp)}</strong><br/>
  Expires in about ${expires} minutes.
</p>
<p style="font-size:13px;color:#6b7280;">
  If the button does not open, request a fresh link at
  <a href="${escapeHtml(loginUrl)}" style="color:#3d6b73;">${escapeHtml(loginUrl)}</a>.
</p>
<p>If you did not request this, you can ignore this message.</p>
<p style="margin-top:24px;">— The Policy Place<br/>
908 Poplar St, Benton, KY 42025<br/>
<a href="mailto:brook@yourpolicyplace.com">brook@yourpolicyplace.com</a> · 270-410-2015
</p>
</body></html>`;

  return resendPost(apiKey, fromEmail, {
    to: [input.to],
    subject: 'Your Policy Place sign-in link',
    text,
    html,
  });
}

export type AccessRejectedEmailInput = {
  to: string;
  businessName: string;
  reason: string;
};

export async function sendAccessRejectedEmail(
  input: AccessRejectedEmailInput,
): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  const reasonText = input.reason.trim() || "We weren't able to set up an account at this time.";
  const reasonHtml = escapeHtml(reasonText).replace(/\n/g, '<br/>');

  const text = `Hi,

Thanks for reaching out about a Policy Place account for ${input.businessName}.

${reasonText}

If you think this is a mistake or want to talk it through, just reply to this email — Brook will get back to you.

— The Policy Place
908 Poplar St, Benton, KY 42025
brook@yourpolicyplace.com · 270-410-2015
`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<p>Hi,</p>
<p>Thanks for reaching out about a Policy Place account for <strong>${escapeHtml(input.businessName)}</strong>.</p>
<p style="margin:20px 0;padding:14px 16px;border-left:3px solid #c97a4a;background:#fbf6f0;color:#1f2937;">${reasonHtml}</p>
<p>If you think this is a mistake or want to talk it through, just reply to this email — Brook will get back to you.</p>
<p style="margin-top:24px;">— The Policy Place<br/>
908 Poplar St, Benton, KY 42025<br/>
<a href="mailto:brook@yourpolicyplace.com">brook@yourpolicyplace.com</a> · 270-410-2015
</p>
</body></html>`;

  return resendPost(apiKey, fromEmail, {
    to: [input.to],
    subject: `Re: Policy Place account request — ${input.businessName}`,
    text,
    html,
  });
}

// ─── Voided cert notification ────────────────────────────────────────────────

export type VoidedCertEmailInput = {
  to: string;
  cc?: string[];
  certNumber: string;
  insuredBusinessName: string;
  holderName: string;
  reason: string;
  voidedAtISO: string;
};

function formatVoidedDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildVoidedHtml(input: VoidedCertEmailInput): string {
  const insured = escapeHtml(input.insuredBusinessName);
  const holder = escapeHtml(input.holderName);
  const certNum = escapeHtml(input.certNumber);
  const reasonHtml = input.reason
    ? `<p style="margin:18px 0;padding:14px 16px;border-left:3px solid #c97a4a;background:#fbf6f0;color:#1f2937;">${escapeHtml(input.reason)}</p>`
    : '';
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;">
<p>Hi,</p>
<p>Certificate of Insurance <strong>${certNum}</strong>, issued on behalf of
${insured} to <strong>${holder}</strong>, has been
<strong style="color:#9c1d1d;">voided as of ${escapeHtml(formatVoidedDate(input.voidedAtISO))}</strong>
and is no longer in force.</p>
${reasonHtml}
<p><strong>Please forward this notice to ${holder}</strong> so they're aware the
certificate they have on file is no longer valid. If they need a current
certificate, reach out and we'll issue a replacement.</p>
<p>An updated copy of the certificate is attached, stamped VOIDED on its face.</p>
<p style="margin-top:24px;">— The Policy Place<br/>
908 Poplar St, Benton, KY 42025<br/>
<a href="mailto:brook@yourpolicyplace.com">brook@yourpolicyplace.com</a> · 270-410-2015
</p>
</body></html>`;
}

function buildVoidedText(input: VoidedCertEmailInput): string {
  return `Hi,

Certificate of Insurance ${input.certNumber}, issued on behalf of ${input.insuredBusinessName} to ${input.holderName}, has been VOIDED as of ${formatVoidedDate(input.voidedAtISO)} and is no longer in force.
${input.reason ? `\nReason: ${input.reason}\n` : ''}
Please forward this notice to ${input.holderName} so they're aware the certificate they have on file is no longer valid. If they need a current certificate, reach out and we'll issue a replacement.

— The Policy Place
908 Poplar St, Benton, KY 42025
brook@yourpolicyplace.com · 270-410-2015
`;
}

export async function sendVoidedCertEmail(input: VoidedCertEmailInput): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  return resendPost(apiKey, fromEmail, {
    to: [input.to],
    cc: input.cc?.length ? input.cc : undefined,
    subject: `VOIDED: Certificate ${input.certNumber} — ${input.insuredBusinessName}`,
    html: buildVoidedHtml(input),
    text: buildVoidedText(input),
  });
}

export async function sendCoiEmail(input: CoiEmailInput): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  // RFC822 headers must be wrapped in angle brackets if not already.
  const wrap = (mid: string) => (mid.startsWith('<') ? mid : `<${mid}>`);
  const headers: Record<string, string> = {};
  if (input.inReplyTo) {
    const replyId = wrap(input.inReplyTo);
    headers['In-Reply-To'] = replyId;
    headers['References'] = input.references ? `${input.references} ${replyId}`.trim() : replyId;
  }

  const subject =
    input.subjectOverride ??
    `Certificate of Insurance ${input.certNumber} — ${input.insuredBusinessName}`;

  const payload: Record<string, unknown> = {
    to: [input.to],
    cc: input.cc.length ? input.cc : undefined,
    subject,
    html: buildHtml(input),
    text: buildText(input),
    attachments: [
      {
        filename: `${input.certNumber}.pdf`,
        content: Buffer.from(input.pdfBytes).toString('base64'),
      },
    ],
  };
  if (Object.keys(headers).length > 0) payload.headers = headers;

  return resendPost(apiKey, fromEmail, payload);
}
