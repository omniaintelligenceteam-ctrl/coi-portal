/**
 * Saves an extracted (and admin-confirmed) policy to the database.
 * Finds or creates the insurer record by NAIC code.
 * Admin-only.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processRenewal, type RenewalResult } from '@/lib/renewals';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
// Renewal detection can batch-reissue certs (renders + sends) synchronously.
export const maxDuration = 300;

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

  // Renewal detection (import path): a fresh policy row whose term starts
  // adjacent to an existing same-type policy's expiry is a renewal of it.
  // Live certs reference the OLD policy id, so the reissue swaps old → new.
  let renewal: RenewalResult | null = null;
  try {
    const { data: predecessor } = await admin
      .from('policies')
      .select('id, exp_date')
      .eq('client_id', body.clientId)
      .eq('type', body.type)
      .neq('id', policy.id)
      .in('status', ['active', 'expired'])
      .lte('exp_date', body.expDate)
      .order('exp_date', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; exp_date: string }>();

    if (predecessor) {
      // Adjacent terms only (±60 days between old expiry and new effective
      // date) — anything wider is a new coverage line, not a renewal.
      const gapDays = Math.abs(
        (new Date(body.effDate).getTime() - new Date(predecessor.exp_date).getTime()) / 86_400_000,
      );
      if (gapDays <= 60) {
        renewal = await processRenewal(admin, {
          renewedPolicyId: policy.id,
          previousPolicyId: predecessor.id,
          clientId: body.clientId,
          oldExpDate: predecessor.exp_date,
          newExpDate: body.expDate,
          byEmail: email,
          requestedIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        });
      }
    }
  } catch (err) {
    // Renewal automation must never fail the policy save itself.
    log.error('policy.save_renewal_detection_failed', {
      policyId: policy.id,
      error: (err as Error).message,
    });
  }

  return NextResponse.json({ ok: true, policyId: policy.id, renewal });
}
