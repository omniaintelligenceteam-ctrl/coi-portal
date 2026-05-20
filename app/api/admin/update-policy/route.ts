/**
 * Admin endpoint — edit an existing policy row in place.
 *
 * Distinct from /api/admin/save-policy which CREATES a new policy from an
 * extracted-then-confirmed import. This endpoint patches an existing row so
 * Brook can fix typos / update limits / change insurer for a policy already
 * on file.
 *
 * Insurer lookup mirrors save-policy: if a new insurer name+NAIC are
 * provided, find-or-create the insurer record and reassign insurer_id.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  policyId: z.string().uuid(),
  type: z.enum(['GL', 'WC', 'AUTO', 'UMBRELLA', 'EQUIPMENT', 'OTHER']).optional(),
  policyNumber: z.string().min(1).max(60).optional(),
  effDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limits: z.record(z.string(), z.number().nonnegative()).optional(),
  addlInsuredBlanket: z.boolean().optional(),
  subrogationWaived: z.boolean().optional(),
  description: z.string().max(2000).optional().nullable(),
  insurerName: z.string().min(1).max(200).optional(),
  insurerNaic: z.string().min(1).max(20).optional(),
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

  // Optional insurer reassignment (find-or-create by NAIC)
  let insurerId: string | undefined;
  if (body.insurerNaic && body.insurerName) {
    const { data: existing } = await admin
      .from('insurers')
      .select('id')
      .eq('naic', body.insurerNaic)
      .maybeSingle();
    if (existing) {
      insurerId = existing.id;
      // Optionally update the insurer name if it drifted (admin typed a new spelling)
      await admin.from('insurers').update({ name: body.insurerName }).eq('id', existing.id);
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('insurers')
        .insert({ name: body.insurerName, naic: body.insurerNaic })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return NextResponse.json({ error: 'insurer upsert failed', detail: insErr?.message }, { status: 500 });
      }
      insurerId = inserted.id;
    }
  }

  const update: Record<string, unknown> = {};
  if (body.type !== undefined) update.type = body.type;
  if (body.policyNumber !== undefined) update.policy_number = body.policyNumber;
  if (body.effDate !== undefined) update.eff_date = body.effDate;
  if (body.expDate !== undefined) update.exp_date = body.expDate;
  if (body.limits !== undefined) update.limits_jsonb = body.limits;
  if (body.addlInsuredBlanket !== undefined) update.addl_insured_blanket = body.addlInsuredBlanket;
  if (body.subrogationWaived !== undefined) update.subrogation_waived = body.subrogationWaived;
  if (body.description !== undefined) update.description = body.description || null;
  if (insurerId !== undefined) update.insurer_id = insurerId;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('policies')
    .update(update)
    .eq('id', body.policyId)
    .select('id, type, policy_number, eff_date, exp_date, status')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'policy not found' }, { status: 404 });
  }

  log.info('policy.updated', { policyId: body.policyId, by: email, fields: Object.keys(update) });
  return NextResponse.json({ ok: true, policy: data });
}
