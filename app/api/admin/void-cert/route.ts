/**
 * Admin endpoint — void a sent certificate.
 *
 * Flips cert_requests.status to 'voided', regenerates the PDF with a VOIDED
 * watermark, overwrites the canonical storage path, and emails the client
 * (with Brook CC'd) so the holder can be notified.
 *
 * Admin-only. Delegates the work to lib/voidCert.ts.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { voidCert } from '@/lib/voidCert';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await voidCert({
    admin,
    requestId: body.requestId,
    reason: body.reason,
    byEmail: email,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    certNumber: result.certNumber,
    pdfStoragePath: result.pdfStoragePath,
    emailId: result.emailId,
  });
}
