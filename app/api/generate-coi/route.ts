import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolve } from 'node:path';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fillAcord25 } from '@/lib/fillAcord25';
import { reviewCert, type ClientOverride } from '@/lib/reviewerAgent';
import { selectableCoverages } from '@/lib/getClientPolicies';
import { buildCoiInput, computeNextCertNumber, type DbPolicyFull } from '@/lib/coiInputBuilder';
import { sendQueueNotification } from '@/lib/email';

export const runtime = 'nodejs';

const BodySchema = z.object({
  selectedPolicyIds: z.array(z.string().uuid()).min(1),
  holder: z.object({
    name: z.string().min(1).max(200),
    address1: z.string().min(1).max(200),
    address2: z.string().max(200).optional().default(''),
  }),
});

const TEMPLATE_PATH = resolve(process.cwd(), 'assets/template/acord-25-page-1.png');
const SIGNATURE_PATH = resolve(process.cwd(), 'assets/policy-place-signature.png');

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

  // 3. Resolve client by auth.email() — never trust client-supplied clientId
  const { data: client, error: clientErr } = await supabase
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2, auto_approve_enabled')
    .eq('contact_email', user.email)
    .maybeSingle();
  if (clientErr || !client) {
    return NextResponse.json({ error: 'no client account' }, { status: 403 });
  }

  // 4. Agency (RLS enabled, no user policy — must use admin client)
  const admin = createAdminClient();
  const { data: agency } = await admin
    .from('agencies')
    .select('name, address1, address2, contact_name, phone, fax, email')
    .eq('id', client.agency_id)
    .maybeSingle();
  if (!agency) {
    return NextResponse.json({ error: 'agency not found' }, { status: 500 });
  }

  // 5. All policies for this client + apply expiry gate (server-side, never trust UI)
  const { data: allPolicies } = await supabase
    .from('policies')
    .select(
      `id, type, policy_number, eff_date, exp_date, active,
       addl_insured_blanket, subrogation_waived, description, limits_jsonb,
       insurer:insurers ( name, naic )`,
    )
    .eq('client_id', client.id)
    .returns<DbPolicyFull[]>();

  const today = new Date();
  const eligible = selectableCoverages(allPolicies ?? [], today);
  const eligibleById = new Map(eligible.map((p) => [p.id, p]));

  // 6. Validate every selected ID is eligible AND belongs to this client
  const invalid = body.selectedPolicyIds.filter((id) => !eligibleById.has(id));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: 'selected policies are not eligible (expired, inactive, or not yours)' },
      { status: 400 },
    );
  }
  const selected = body.selectedPolicyIds
    .map((id) => eligibleById.get(id)!)
    .filter(Boolean);

  // 7. Compute next cert number for today
  const todayPrefix = formatDatePrefix(today);
  const { data: maxRow } = await admin
    .from('cert_requests')
    .select('cert_number')
    .like('cert_number', `PP-${todayPrefix}-%`)
    .order('cert_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  const certNumber = computeNextCertNumber(today, maxRow?.cert_number ?? null);

  // 8. Build CoiInput
  const coiInput = buildCoiInput({
    agency,
    client: {
      business_name: client.business_name,
      business_address1: client.business_address1,
      business_address2: client.business_address2,
    },
    policies: selected,
    holder: {
      name: body.holder.name,
      address1: body.holder.address1,
      address2: body.holder.address2 || '',
    },
    certNumber,
    today,
    templatePngPath: TEMPLATE_PATH,
    signaturePngPath: SIGNATURE_PATH,
  });

  // 9. Render PDF
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await fillAcord25(coiInput);
  } catch (err) {
    return NextResponse.json(
      { error: 'pdf render failed', detail: (err as Error).message },
      { status: 500 },
    );
  }

  // 10. Upload PDF to storage (private bucket, service-role)
  const storagePath = `certs/${certNumber}.pdf`;
  const { error: upErr } = await admin.storage
    .from('coi-archive')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    return NextResponse.json({ error: 'storage upload failed', detail: upErr.message }, { status: 500 });
  }

  // 11. Insert cert_request row (status starts pending)
  const requestedIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const { data: inserted, error: insErr } = await admin
    .from('cert_requests')
    .insert({
      client_id: client.id,
      agency_id: client.agency_id,
      holder_name: body.holder.name,
      holder_address1: body.holder.address1,
      holder_address2: body.holder.address2 || null,
      coverages_selected: body.selectedPolicyIds,
      cert_number: certNumber,
      pdf_storage_path: storagePath,
      status: 'pending',
      requested_by_email: user.email,
      requested_ip: requestedIp,
    })
    .select('id')
    .single();
  if (insErr || !inserted) {
    return NextResponse.json({ error: 'insert failed', detail: insErr?.message }, { status: 500 });
  }

  // 12. Run reviewer agent (synchronous — adds ~2-5s but Brook needs it before approval)
  try {
    const { data: overridesRaw } = await admin
      .from('client_overrides')
      .select('scope, pattern, correction')
      .eq('client_id', client.id)
      .eq('active', true)
      .returns<ClientOverride[]>();

    const review = await reviewCert({
      request: coiInput,
      clientOverrides: overridesRaw ?? [],
    });

    await admin
      .from('cert_requests')
      .update({
        reviewer_pass: review.pass,
        reviewer_flags: review.flags,
        reviewer_notes: review.notes,
        reviewer_model: review.model,
        reviewed_at: new Date().toISOString(),
        status: 'reviewed',
      })
      .eq('id', inserted.id);
  } catch (err) {
    // Reviewer failed — row stays at 'pending', Brook reviews manually.
    console.error('reviewer failed:', err);
  }

  // 13. Notify Wes (awaited — serverless kills detached promises after response)
  try {
    await sendQueueNotification({
      certNumber,
      requestId: inserted.id,
      clientName: client.business_name,
      holderName: body.holder.name,
      reviewerPass: null,
      flagCount: 0,
    });
  } catch {
    // non-fatal — cert is already queued
  }

  return NextResponse.json({
    certNumber,
    requestId: inserted.id,
    status: 'queued',
  });
}

function formatDatePrefix(today: Date): string {
  const y = today.getFullYear().toString().padStart(4, '0');
  const m = (today.getMonth() + 1).toString().padStart(2, '0');
  const d = today.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}
