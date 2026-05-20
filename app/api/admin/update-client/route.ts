/**
 * Admin endpoint — edit a client's insured profile (business name, address).
 * Used by /admin/clients/[clientId] Profile tab.
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
  businessName: z.string().min(1).max(200).optional(),
  businessAddress1: z.string().max(200).optional().nullable(),
  businessAddress2: z.string().max(200).optional().nullable(),
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

  const update: Record<string, string | null> = {};
  if (body.businessName !== undefined) update.business_name = body.businessName;
  if (body.businessAddress1 !== undefined) update.business_address1 = body.businessAddress1 || null;
  if (body.businessAddress2 !== undefined) update.business_address2 = body.businessAddress2 || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('coi_clients')
    .update(update)
    .eq('id', body.clientId)
    .select('id, business_name, business_address1, business_address2')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  log.info('client.updated', { clientId: body.clientId, by: email, fields: Object.keys(update) });
  return NextResponse.json({ ok: true, client: data });
}
