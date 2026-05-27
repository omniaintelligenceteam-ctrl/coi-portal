import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueCert, type IssueCertClient } from '@/lib/issueCert';
import { isKnownForm, DEFAULT_FORM_ID } from '@/lib/forms/registry';

export const runtime = 'nodejs';

const BodySchema = z.object({
  selectedPolicyIds: z.array(z.string().uuid()).min(1),
  // Holder is optional when isMaster=true — the server pre-fills it from the
  // client's own business info. For normal certs it's required.
  holder: z
    .object({
      name: z.string().min(1).max(200),
      address1: z.string().min(1).max(200),
      address2: z.string().max(200).optional().default(''),
    })
    .optional(),
  /** Master certificate flag — holder = insured, server-enforced. */
  isMaster: z.boolean().optional().default(false),
  // Form picker selection. Omitted → default form (ACORD_25). The client
  // is only allowed to issue forms in their coi_clients.enabled_forms list;
  // we enforce that below in addition to the registry check.
  formId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Validate body
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  // 3. Resolve client by auth email — never trust client-supplied clientId.
  //    Pull enabled_forms so we can authorize the picker selection below.
  const { data: client, error: clientErr } = await supabase
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2, enabled_forms')
    .eq('contact_email', user.email)
    .maybeSingle<IssueCertClient & { enabled_forms: string[] | null }>();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'no client account' }, { status: 403 });
  }

  const admin = createAdminClient();
  const requestedIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  if (!body.isMaster && !body.holder) {
    return NextResponse.json(
      { error: 'holder is required for non-master certificates' },
      { status: 400 },
    );
  }
  // For master certs the server forces holder = insured inside issueCert. We
  // still pass through any incoming holder so validateHolderInput has a value
  // to work with on the non-master path.
  const holderInput = body.holder ?? {
    name: client.business_name,
    address1: client.business_address1 ?? '',
    address2: client.business_address2 ?? '',
  };

  // Form picker: validate against the registry AND the client's per-account
  // whitelist. The picker UI only renders enabled forms, but a hand-crafted
  // POST could try to bypass that — so the server enforces.
  const formId = body.formId ?? DEFAULT_FORM_ID;
  if (!isKnownForm(formId)) {
    return NextResponse.json(
      { error: 'unknown form', detail: `form_type "${formId}" is not registered` },
      { status: 400 },
    );
  }
  const enabled = client.enabled_forms ?? [DEFAULT_FORM_ID];
  if (!enabled.includes(formId)) {
    return NextResponse.json(
      { error: 'form not enabled', detail: `your account is not authorized for form_type "${formId}"` },
      { status: 403 },
    );
  }

  const result = await issueCert({
    reader: supabase,
    admin,
    client,
    selectedPolicyIds: body.selectedPolicyIds,
    holder: holderInput,
    requestedByEmail: user.email,
    requestedIp,
    isMaster: body.isMaster,
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
