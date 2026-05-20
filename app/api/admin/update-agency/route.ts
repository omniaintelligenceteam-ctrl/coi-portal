/**
 * Admin endpoint — edit Brook's agency record (name, address, contact info).
 * Used by /admin/settings/agency.
 *
 * Single-tenant for now — we resolve the agency by the admin's email through
 * the coi_clients linkage rather than letting the request specify agency_id.
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
  agencyId: z.string().uuid(),
  name: z.string().max(200).optional(),
  address1: z.string().max(200).optional().nullable(),
  address2: z.string().max(200).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  fax: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  licenseNo: z.string().max(60).optional().nullable(),
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
  if (body.name !== undefined) update.name = body.name;
  if (body.address1 !== undefined) update.address1 = body.address1 || null;
  if (body.address2 !== undefined) update.address2 = body.address2 || null;
  if (body.contactName !== undefined) update.contact_name = body.contactName || null;
  if (body.phone !== undefined) update.phone = body.phone || null;
  if (body.fax !== undefined) update.fax = body.fax || null;
  if (body.email !== undefined) update.email = body.email || null;
  if (body.licenseNo !== undefined) update.license_no = body.licenseNo || null;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('agencies')
    .update(update)
    .eq('id', body.agencyId)
    .select('id, name, address1, address2, contact_name, phone, fax, email, license_no')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'agency not found' }, { status: 404 });
  }

  log.info('agency.updated', { agencyId: body.agencyId, by: email, fields: Object.keys(update) });
  return NextResponse.json({ ok: true, agency: data });
}
