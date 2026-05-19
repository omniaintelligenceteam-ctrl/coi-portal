import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendApprovedCert } from '@/lib/sendApprovedCert';
import { sendRejectionEmail } from '@/lib/email';
import type { CertStatus } from '@/app/components/StatusPill';

/**
 * Admin endpoint — Brook (or any ADMIN_EMAILS user) decides on a queued cert.
 *
 * approve  → status='approved', sendApprovedCert() fires (status→sent)
 * edit     → mutate holder fields + edited_diff, then sendApprovedCert()
 * reject   → status='rejected', record decision_note
 *
 * Optional `override` payload adds a row to client_overrides so the reviewer
 * agent applies the same correction on future requests for this client.
 *
 * Auth check uses the user-cookie client; writes use the service-role client
 * (cert_requests has RLS enabled with no write policies — service-role bypasses).
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
    override: OverrideSchema.optional(),
  }),
  z.object({
    decision: z.literal('reject'),
    requestId: z.string().uuid(),
    decisionNote: z.string().optional().default(''),
  }),
  // Retry — re-runs sendApprovedCert against a row already at approved/edited
  // status, recovering from a failed send (Resend down, storage glitch, etc).
  // No status mutation here; sendApprovedCert handles the approved→sent flip.
  z.object({
    decision: z.literal('retry'),
    requestId: z.string().uuid(),
  }),
]);

export async function POST(req: NextRequest) {
  // Auth: user-cookie client just to read the session
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

  // All writes go through admin (cert_requests + client_overrides RLS denies user writes)
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const decidedBy = email;

  // Retry path — cert is already at approved/edited (status was recorded on a
  // prior decision call but the send failed). Re-validate status, then re-run
  // sendApprovedCert. No status mutation, no override write.
  if (parsed.decision === 'retry') {
    const { data: existing, error: readErr } = await admin
      .from('cert_requests')
      .select('status')
      .eq('id', parsed.requestId)
      .maybeSingle<{ status: CertStatus }>();
    if (readErr || !existing) {
      return NextResponse.json(
        { error: readErr?.message ?? 'request not found' },
        { status: 404 },
      );
    }
    if (existing.status !== 'approved' && existing.status !== 'edited') {
      return NextResponse.json(
        {
          error: 'retry not allowed',
          detail: `cert is at status '${existing.status}', not approved/edited`,
        },
        { status: 409 },
      );
    }
    try {
      const result = await sendApprovedCert(admin, parsed.requestId);
      return NextResponse.json({
        ok: true,
        status: 'sent',
        certNumber: result.certNumber,
        emailId: result.emailId,
      });
    } catch (err) {
      return NextResponse.json(
        { error: 'send failed', detail: (err as Error).message },
        { status: 502 },
      );
    }
  }

  if (parsed.decision === 'reject') {
    const { data: guarded, error } = await admin
      .from('cert_requests')
      .update({
        status: 'rejected',
        decision_note: parsed.decisionNote || null,
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', parsed.requestId)
      .in('status', ['pending', 'reviewed'])
      .select('id')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!guarded) return NextResponse.json({ error: 'already_decided' }, { status: 409 });

    // Notify the client by email — non-fatal if it fails (row is already updated)
    try {
      const { data: detail } = await admin
        .from('cert_requests')
        .select('cert_number, holder_name, client:coi_clients ( business_name, contact_email )')
        .eq('id', parsed.requestId)
        .maybeSingle<{
          cert_number: string;
          holder_name: string;
          client: { business_name: string; contact_email: string } | null;
        }>();

      const contactEmail = detail?.client?.contact_email;
      if (detail && contactEmail) {
        const portalBase =
          process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ??
          'https://coi-portal.vercel.app';
        await sendRejectionEmail({
          to: contactEmail,
          certNumber: detail.cert_number,
          insuredBusinessName: detail.client?.business_name ?? 'Insured',
          holderName: detail.holder_name,
          reason:
            parsed.decisionNote?.trim() ||
            'Please reach out to Brook so we can sort out the details before re-issuing.',
          resubmitUrl: `${portalBase}/`,
        });
      }
    } catch (emailErr) {
      console.error('rejection email failed:', emailErr);
    }

    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  if (parsed.decision === 'edit') {
    const { data: existing, error: readErr } = await admin
      .from('cert_requests')
      .select('holder_name, holder_address1, holder_address2')
      .eq('id', parsed.requestId)
      .maybeSingle();
    if (readErr || !existing) {
      return NextResponse.json({ error: readErr?.message ?? 'request not found' }, { status: 404 });
    }
    const diff = computeHolderDiff(existing, parsed.holder);
    const { data: guarded, error: updateErr } = await admin
      .from('cert_requests')
      .update({
        status: 'edited',
        holder_name: parsed.holder.name,
        holder_address1: parsed.holder.address1,
        holder_address2: parsed.holder.address2 || null,
        edited_diff: diff,
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', parsed.requestId)
      .in('status', ['pending', 'reviewed'])
      .select('id')
      .maybeSingle();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    if (!guarded) return NextResponse.json({ error: 'already_decided' }, { status: 409 });
  } else if (parsed.decision === 'approve') {
    const { data: guarded, error: updateErr } = await admin
      .from('cert_requests')
      .update({
        status: 'approved',
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', parsed.requestId)
      .in('status', ['pending', 'reviewed'])
      .select('id')
      .maybeSingle();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    if (!guarded) return NextResponse.json({ error: 'already_decided' }, { status: 409 });
  }

  // Optional override write (only on approve/edit)
  if (parsed.override) {
    const { error: ovErr } = await admin.from('client_overrides').insert({
      client_id: parsed.override.clientId,
      scope: parsed.override.scope,
      pattern: parsed.override.pattern,
      correction: parsed.override.correction,
      added_by: decidedBy,
      source_request_id: parsed.requestId,
    });
    if (ovErr) return NextResponse.json({ error: ovErr.message }, { status: 500 });
  }

  // Re-render + send + audit + mark sent
  try {
    const result = await sendApprovedCert(admin, parsed.requestId);
    return NextResponse.json({
      ok: true,
      status: 'sent',
      certNumber: result.certNumber,
      emailId: result.emailId,
    });
  } catch (err) {
    // Send failed AFTER decision was recorded — leave row at approved/edited so
    // Brook can retry. Return 502 so the UI surfaces the email error.
    return NextResponse.json(
      { error: 'send failed', detail: (err as Error).message },
      { status: 502 },
    );
  }
}

function computeHolderDiff(
  before: {
    holder_name: string | null;
    holder_address1: string | null;
    holder_address2: string | null;
  },
  after: { name: string; address1: string; address2: string },
): Record<string, { from: string | null; to: string }> {
  const diff: Record<string, { from: string | null; to: string }> = {};
  if (before.holder_name !== after.name) {
    diff.name = { from: before.holder_name, to: after.name };
  }
  if (before.holder_address1 !== after.address1) {
    diff.address1 = { from: before.holder_address1, to: after.address1 };
  }
  if ((before.holder_address2 ?? '') !== after.address2) {
    diff.address2 = { from: before.holder_address2, to: after.address2 };
  }
  return diff;
}
