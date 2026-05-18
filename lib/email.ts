/**
 * Resend wrapper. Sends a generated COI PDF to the cert holder's contact (the
 * client's contact_email) with Brook CC'd. Uses the From address configured by
 * RESEND_FROM_EMAIL — during demo this is whatever Wes has verified on his
 * Resend account; in prod we switch to Brook's certs@ alias on her own domain.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type CoiEmailInput = {
  to: string;
  cc: string[];
  pdfBytes: Uint8Array;
  certNumber: string;
  holderName: string;
  insuredBusinessName: string;
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

— The Policy Place
908 Poplar St, Benton, KY 42025
brook@yourpolicyplace.com · 270-410-2015
`;
}

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
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!apiKey || !fromEmail || adminEmails.length === 0) return;

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
