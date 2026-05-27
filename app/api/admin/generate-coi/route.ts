import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueCert, type IssueCertClient } from '@/lib/issueCert';
import { isKnownForm, DEFAULT_FORM_ID } from '@/lib/forms/registry';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  clientId: z.string().uuid(),
  selectedPolicyIds: z.array(z.string().uuid()).min(1),
  holder: z.object({
    name: z.string().min(1).max(200),
    address1: z.string().min(1).max(200),
    address2: z.string().max(200).optional().default(''),
  }),
  // Form picker selection. Omitted body → default form (ACORD_25). The picker
  // only surfaces forms in coi_clients.enabled_forms, so admin can't choose a
  // form the client isn't authorized for via the UI. We still validate against
  // the registry below — a typo'd formId would otherwise wedge issueCert.
  formId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // 1. Auth — must be a known admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!adminEmails().includes(email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2. Validate body
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  // 3. Resolve client by body-supplied clientId (admin chose them in the UI).
  //    Service-role read since the admin's RLS scope doesn't cover client rows.
  const admin = createAdminClient();
  const { data: client, error: clientErr } = await admin
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2, active')
    .eq('id', body.clientId)
    .maybeSingle<IssueCertClient & { active: boolean }>();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }
  if (!client.active) {
    return NextResponse.json({ error: 'client is inactive' }, { status: 400 });
  }

  const requestedIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const formId = body.formId ?? DEFAULT_FORM_ID;
  if (!isKnownForm(formId)) {
    return NextResponse.json(
      { error: 'unknown form', detail: `form_type "${formId}" is not registered` },
      { status: 400 },
    );
  }

  const result = await issueCert({
    reader: admin,
    admin,
    client,
    selectedPolicyIds: body.selectedPolicyIds,
    holder: body.holder,
    requestedByEmail: user!.email!, // admin's email — audit trail of who issued
    requestedIp,
    formId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.detail ? { detail: result.detail } : {}) },
      { status: result.status },
    );
  }

  return NextResponse.json({
    certNumber: result.certNumber,
    requestId: result.requestId,
    status: 'queued',
  });
}
