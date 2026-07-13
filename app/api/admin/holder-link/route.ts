/**
 * Admin endpoint — get-or-create (or rotate) a client's holder request link.
 *
 * The link (/request/[token]) is public and long-lived: a certificate holder
 * opens it, fills in who they are, and the request lands in the client's
 * normal pipeline. Rotating the token revokes every previously shared link.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
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
  /** Regenerate the token, revoking any previously shared link. */
  rotate: z.boolean().optional(),
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
  const { data: client, error: clientErr } = await admin
    .from('coi_clients')
    .select('id, holder_link_token, active')
    .eq('id', body.clientId)
    .maybeSingle<{ id: string; holder_link_token: string | null; active: boolean }>();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  let token = client.holder_link_token;
  if (!token || body.rotate) {
    token = randomBytes(32).toString('hex');
    const { error: updErr } = await admin
      .from('coi_clients')
      .update({ holder_link_token: token })
      .eq('id', body.clientId);
    if (updErr) {
      return NextResponse.json({ error: 'db error', detail: updErr.message }, { status: 500 });
    }
    log.info('holderLink.generated', {
      clientId: body.clientId,
      rotated: Boolean(body.rotate),
      by: email,
    });
  }

  const portalBase =
    process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ?? 'https://coi-portal.vercel.app';
  return NextResponse.json({ ok: true, url: `${portalBase}/request/${token}` });
}
