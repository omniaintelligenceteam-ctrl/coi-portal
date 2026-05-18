/**
 * Resend wrapper for sending generated COIs to clients (CC Brook).
 *
 * Phase 1.5: stub. Reads RESEND_API_KEY; throws if missing, logs payload + returns
 * mock id if present. The real fetch lives behind a TODO(phase-3) once Brook's
 * Resend key is provisioned.
 */

export type CoiEmailInput = {
  to: string;
  ccBrook: string;
  pdfBytes: Uint8Array;
  certNumber: string;
  holderName: string;
  insuredBusinessName: string;
};

/**
 * Send a generated COI to the client (and CC Brook) via Resend.
 * In Phase 1.5: this function is a stub that logs payload and throws if RESEND_API_KEY is missing.
 * In Phase 3: actually calls the Resend API.
 */
export async function sendCoiEmail(input: CoiEmailInput): Promise<{ id: string }> {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not set — email send disabled in dev');
  }

  // eslint-disable-next-line no-console
  console.log('[sendCoiEmail] would send', {
    to: input.to,
    ccBrook: input.ccBrook,
    certNumber: input.certNumber,
    holderName: input.holderName,
    insuredBusinessName: input.insuredBusinessName,
    pdfBytesLength: input.pdfBytes.length,
  });

  // TODO(phase-3): replace this mock with a real Resend API call.
  // Expected shape (per Resend docs):
  //   const res = await fetch('https://api.resend.com/emails', {
  //     method: 'POST',
  //     headers: {
  //       Authorization: `Bearer ${apiKey}`,
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       from: 'certs@thepolicyplace.com',
  //       to: input.to,
  //       cc: input.ccBrook,
  //       subject: `Certificate of Insurance ${input.certNumber} — ${input.insuredBusinessName}`,
  //       html: `...`,
  //       attachments: [{
  //         filename: `${input.certNumber}.pdf`,
  //         content: Buffer.from(input.pdfBytes).toString('base64'),
  //       }],
  //     }),
  //   });
  //   if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  //   const { id } = await res.json() as { id: string };
  //   return { id };

  return { id: 'mock-' + Date.now() };
}
