import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Admin endpoint — Brook (or any ADMIN_EMAILS user) decides on a queued cert.
 *
 * Three decision modes:
 *  - approve  → status='approved', will render+email in a follow-up worker
 *  - edit     → mutate holder fields, status='edited', record diff
 *  - reject   → status='rejected', record decision_note
 *
 * Optional `override` payload adds a row to client_overrides so the reviewer
 * agent applies the same correction on future requests for this client.
 *
 * Phase 4 will hook approval/edit to the actual send pipeline. For now this
 * just records the decision so we can verify the UI end-to-end.
 */

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
]);

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

  const now = new Date().toISOString();
  const decidedBy = email;

  if (parsed.decision === 'approve') {
    const { error } = await supabase
      .from('cert_requests')
      .update({
        status: 'approved',
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', parsed.requestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (parsed.decision === 'edit') {
    const { data: existing, error: readErr } = await supabase
      .from('cert_requests')
      .select('holder_name, holder_address1, holder_address2')
      .eq('id', parsed.requestId)
      .maybeSingle();
    if (readErr || !existing) {
      return NextResponse.json({ error: readErr?.message ?? 'request not found' }, { status: 404 });
    }
    const diff = computeHolderDiff(existing, parsed.holder);
    const { error } = await supabase
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
      .eq('id', parsed.requestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (parsed.decision === 'reject') {
    const { error } = await supabase
      .from('cert_requests')
      .update({
        status: 'rejected',
        decision_note: parsed.decisionNote || null,
        decided_by_email: decidedBy,
        decided_at: now,
      })
      .eq('id', parsed.requestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (parsed.decision !== 'reject' && parsed.override) {
    const { error } = await supabase.from('client_overrides').insert({
      client_id: parsed.override.clientId,
      scope: parsed.override.scope,
      pattern: parsed.override.pattern,
      correction: parsed.override.correction,
      added_by: decidedBy,
      source_request_id: parsed.requestId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
