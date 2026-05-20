import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { issueCert, type IssueCertClient } from '@/lib/issueCert';

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

  // 3. Resolve client by auth email — never trust client-supplied clientId
  const { data: client, error: clientErr } = await supabase
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2')
    .eq('contact_email', user.email)
    .maybeSingle<IssueCertClient>();
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

  const result = await issueCert({
    reader: supabase,
    admin,
    client,
    selectedPolicyIds: body.selectedPolicyIds,
    holder: holderInput,
    requestedByEmail: user.email,
    requestedIp,
    isMaster: body.isMaster,
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
