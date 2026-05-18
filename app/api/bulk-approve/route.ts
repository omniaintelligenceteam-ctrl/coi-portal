import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendApprovedCert } from '@/lib/sendApprovedCert';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  requestIds: z.array(z.string().uuid()).min(1).max(50),
});

type BulkResult = {
  succeeded: string[];
  failed: { id: string; certNumber: string | null; error: string }[];
};

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

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Fetch the requested rows and safety-gate to only pending/reviewed status.
  const { data: rows, error: fetchErr } = await admin
    .from('cert_requests')
    .select('id, cert_number, status')
    .in('id', parsed.requestIds)
    .in('status', ['pending', 'reviewed']);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const eligible = rows ?? [];
  const eligibleIds = new Set(eligible.map((r) => r.id));
  const certNumberById = Object.fromEntries(eligible.map((r) => [r.id, r.cert_number]));

  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of parsed.requestIds) {
    const certNumber = certNumberById[id] ?? null;

    if (!eligibleIds.has(id)) {
      result.failed.push({ id, certNumber, error: 'not eligible (not pending/reviewed, or not found)' });
      continue;
    }

    // Stamp approved before sending (mirrors decide-cert approve path)
    const { error: updateErr } = await admin
      .from('cert_requests')
      .update({ status: 'approved', decided_by_email: email, decided_at: now })
      .eq('id', id);

    if (updateErr) {
      result.failed.push({ id, certNumber, error: updateErr.message });
      continue;
    }

    try {
      await sendApprovedCert(admin, id);
      result.succeeded.push(id);
    } catch (err) {
      result.failed.push({ id, certNumber, error: (err as Error).message });
    }
  }

  return NextResponse.json(result);
}
