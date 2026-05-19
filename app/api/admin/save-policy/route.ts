/**
 * Saves an extracted (and admin-confirmed) policy to the database.
 * Finds or creates the insurer record by NAIC code.
 * Admin-only.
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
  clientId: z.string().uuid(),
  type: z.enum(['GL', 'WC', 'AUTO', 'UMBRELLA', 'EQUIPMENT']),
  policyNumber: z.string().min(1),
  effDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  insurerName: z.string().min(1),
  insurerNaic: z.string().optional().nullable(),
  limits: z.record(z.string(), z.number()),
  addlInsuredBlanket: z.boolean().default(false),
  subrogationWaived: z.boolean().default(false),
  description: z.string().optional().nullable(),
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

  // Verify the client exists (and its agency)
  const { data: client } = await admin
    .from('coi_clients')
    .select('id, agency_id')
    .eq('id', body.clientId)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  // Find or create insurer
  let insurerId: string;
  if (body.insurerNaic) {
    const { data: existing } = await admin
      .from('insurers')
      .select('id')
      .eq('naic', body.insurerNaic)
      .maybeSingle();
    if (existing) {
      insurerId = existing.id;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('insurers')
        .insert({ name: body.insurerName, naic: body.insurerNaic })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return NextResponse.json({ error: 'failed to create insurer', detail: insErr?.message }, { status: 500 });
      }
      insurerId = inserted.id;
    }
  } else {
    // No NAIC — find by name or create
    const { data: existing } = await admin
      .from('insurers')
      .select('id')
      .ilike('name', body.insurerName)
      .limit(1)
      .maybeSingle();
    if (existing) {
      insurerId = existing.id;
    } else {
      const naic = `UNKNOWN-${Date.now()}`;
      const { data: inserted, error: insErr } = await admin
        .from('insurers')
        .insert({ name: body.insurerName, naic })
        .select('id')
        .single();
      if (insErr || !inserted) {
        return NextResponse.json({ error: 'failed to create insurer', detail: insErr?.message }, { status: 500 });
      }
      insurerId = inserted.id;
    }
  }

  // Insert the policy
  const { data: policy, error: polErr } = await admin
    .from('policies')
    .insert({
      client_id: body.clientId,
      insurer_id: insurerId,
      type: body.type,
      policy_number: body.policyNumber,
      eff_date: body.effDate,
      exp_date: body.expDate,
      limits_jsonb: body.limits,
      addl_insured_blanket: body.addlInsuredBlanket,
      subrogation_waived: body.subrogationWaived,
      description: body.description ?? null,
      active: true,
    })
    .select('id')
    .single();

  if (polErr || !policy) {
    log.error('policy.save_failed', { clientId: body.clientId, error: polErr?.message });
    return NextResponse.json({ error: 'failed to save policy', detail: polErr?.message }, { status: 500 });
  }

  log.info('policy.saved', { policyId: policy.id, clientId: body.clientId, type: body.type });
  return NextResponse.json({ ok: true, policyId: policy.id });
}
