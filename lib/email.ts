/**
 * Resend wrapper. Sends a generated COI PDF to the cert holder's contact (the
 * client's contact_email) with Brook CC'd. Uses the From address configured by
 * RESEND_FROM_EMAIL — during demo this is whatever Wes has verified on his
 * Resend account; in prod we switch to Brook's certs@ alias on her own domain.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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
<a href="${escapeHtml(input.verifyUrl)}" style="color:#2563eb;">${escapeHtml(input.verifyUrl)}</a>
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
};

export async function sendQueueNotification(input: QueueNotificationInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return;
  const adminEmails = ['wesoverstreet@gmail.com'];

  const reviewerLine = input.reviewerPass === null
    ? 'Reviewer still running.'
    : input.reviewerPass && input.flagCount === 0
      ? 'AI reviewer: clean.'
      : `AI reviewer: ${input.flagCount} flag(s) — review carefully.`;

  const text = `New cert request ready for review.

Cert: ${input.certNumber}
Client: ${input.clientName}
Holder: ${input.holderName}
${reviewerLine}

Review and approve: https://coi-portal.vercel.app/admin/queue/${input.requestId}`;

  await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `The Policy Place <${fromEmail}>`,
      to: adminEmails,
      subject: `[Action needed] Cert request ${input.certNumber} — ${input.clientName}`,
      text,
    }),
  });
}

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
<a href="${url}" style="color:#2563eb;text-decoration:underline;">${url}</a></p>
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

export async function sendCoiEmail(input: CoiEmailInput): Promise<CoiEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) throw new Error('RESEND_API_KEY not set.');
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL not set.');

  const payload = {
    from: `The Policy Place <${fromEmail}>`,
    to: [input.to],
    cc: input.cc.length ? input.cc : undefined,
    subject: `Certificate of Insurance ${input.certNumber} — ${input.insuredBusinessName}`,
    html: buildHtml(input),
    text: buildText(input),
    attachments: [
      {
        filename: `${input.certNumber}.pdf`,
        content: Buffer.from(input.pdfBytes).toString('base64'),
      },
    ],
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
