import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decideCertRequest, type DecisionResultErrCode } from '@/lib/decideCert';
import { CertOverridesSchema } from '@/lib/certOverridesSchema';

/**
 * Admin endpoint — Brook (or any ADMIN_EMAILS user) decides on a queued cert
 * from the desktop dashboard form (app/admin/queue/[id]/DecisionForm.tsx).
 *
 * Auth: Supabase session cookie + ADMIN_EMAILS allowlist.
 * Work: delegated to lib/decideCert.ts (shared with the email-link approval
 *       flow at app/admin/approve/[id]/actions.ts).
 */

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const HolderSchema = z.object({
  name: z.string().min(1),
  address1: z.string().min(1),
  address2: z.string().optional().default(''),
});

const OverrideSchema = z.object({
  clientId: z.string().uuid(),
  scope: z.enum(['holder', 'coverage', 'general']),
  pattern: z.string().min(1),
  correction: z.string().min(1),
});

const BodySchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('approve'),
    requestId: z.string().uuid(),
    override: OverrideSchema.optional(),
  }),
  z.object({
    decision: z.literal('edit'),
    requestId: z.string().uuid(),
    holder: HolderSchema,
    /** Cert-level edits beyond holder (insured, producer, coverages, etc.). */
    certOverrides: CertOverridesSchema.optional(),
    override: OverrideSchema.optional(),
  }),
  z.object({
    decision: z.literal('reject'),
    requestId: z.string().uuid(),
    decisionNote: z.string().optional().default(''),
  }),
  // Retry — re-runs sendApprovedCert against a row already at approved/edited
  // status, recovering from a failed send (Resend down, storage glitch, etc).
  z.object({
    decision: z.literal('retry'),
    requestId: z.string().uuid(),
  }),
]);

const STATUS_BY_CODE: Record<DecisionResultErrCode, number> = {
  not_found: 404,
  already_decided: 409,
  invalid_state: 409,
  send_failed: 502,
  db_error: 500,
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await decideCertRequest(admin, email, parsed);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: STATUS_BY_CODE[result.code] },
    );
  }

  if (result.status === 'rejected') {
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  return NextResponse.json({
    ok: true,
    status: 'sent',
    certNumber: result.certNumber,
    emailId: result.emailId,
  });
}
