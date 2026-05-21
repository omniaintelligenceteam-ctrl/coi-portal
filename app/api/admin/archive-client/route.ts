/**
 * Admin endpoint — archive or restore a client.
 *
 * Archive is a soft-delete: archived_at is set, active is flipped to false,
 * and the client disappears from the active roster. Cert history is preserved
 * forever because hard-delete is never used.
 *
 * Restore clears archived_at + archived_reason and sets active=true. The check
 * constraint coi_clients_archived_consistency enforces that archived_at is
 * always set together with active=false; we keep them in sync here too.
 *
 * Body shape: { clientId: uuid, action: 'archive' | 'restore', reason?: string }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeClientAudit } from '@/lib/clientAuditLog';
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
  action: z.enum(['archive', 'restore']),
  reason: z.string().max(500).optional(),
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
    return NextResponse.json(
      { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const update =
    body.action === 'archive'
      ? {
          archived_at: new Date().toISOString(),
          archived_reason: body.reason?.trim() || null,
          active: false,
        }
      : {
          archived_at: null,
          archived_reason: null,
          active: true,
        };

  const { data, error } = await admin
    .from('coi_clients')
    .update(update)
    .eq('id', body.clientId)
    .select('id, business_name, active, archived_at, archived_reason')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'db error', detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  await writeClientAudit(admin, {
    clientId: body.clientId,
    action: body.action === 'archive' ? 'archived' : 'restored',
    actorEmail: email,
    actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    note: body.action === 'archive' ? body.reason?.trim() || null : null,
  });

  log.info(`client.${body.action}d`, { clientId: body.clientId, by: email });

  return NextResponse.json({ ok: true, client: data });
}
