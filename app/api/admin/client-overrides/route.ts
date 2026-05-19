import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) return { ok: false as const, status: 401, error: 'unauthorized' };
  if (!adminEmails().includes(email)) return { ok: false as const, status: 403, error: 'forbidden' };
  return { ok: true as const, email: user!.email! };
}

const PostSchema = z.object({
  clientId: z.string().uuid(),
  scope: z.enum(['holder', 'coverage', 'general']),
  pattern: z.string().trim().min(1).max(500),
  correction: z.string().trim().min(1).max(1000),
});

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: z.infer<typeof PostSchema>;
  try {
    body = PostSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const admin = createAdminClient();

  // Confirm client exists (cheap sanity check)
  const { data: client } = await admin
    .from('coi_clients')
    .select('id')
    .eq('id', body.clientId)
    .maybeSingle();
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 });

  const { data: inserted, error } = await admin
    .from('client_overrides')
    .insert({
      client_id: body.clientId,
      scope: body.scope,
      pattern: body.pattern,
      correction: body.correction,
      added_by: gate.email,
    })
    .select('id, scope, pattern, correction, added_by, added_at, active')
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { error: 'insert failed', detail: error?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ override: inserted });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const id = req.nextUrl.searchParams.get('id');
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('client_overrides')
    .update({ active: false })
    .eq('id', parsed.data);
  if (error) {
    return NextResponse.json({ error: 'update failed', detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
