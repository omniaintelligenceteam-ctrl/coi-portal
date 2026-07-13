/**
 * Admin endpoint — save a holder's coverage requirements.
 *
 * The requirements jsonb feeds the deterministic requirements engine
 * (lib/requirementsCheck.ts): every future cert for this holder is checked
 * requested-vs-carried, and any mismatch forces the manual lane.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { HolderRequirementsSchema } from '@/lib/requirementsCheck';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  holderId: z.string().uuid(),
  /** null clears the requirements entirely. */
  requirements: HolderRequirementsSchema.nullable(),
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
  const { data: updated, error } = await admin
    .from('holders')
    .update({ requirements: body.requirements })
    .eq('id', body.holderId)
    .select('id')
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'holder not found' }, { status: 404 });
  }

  log.info('holder.requirements_saved', {
    holderId: body.holderId,
    by: email,
    cleared: body.requirements === null,
  });
  return NextResponse.json({ ok: true });
}
