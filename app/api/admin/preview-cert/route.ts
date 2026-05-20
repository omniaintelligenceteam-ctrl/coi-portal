/**
 * Admin endpoint — render a preview PDF for an existing cert_requests row
 * with un-persisted candidate edits applied. Used by DecisionForm "Preview"
 * button so Brook can see exactly what the cert will look like before she
 * clicks Approve.
 *
 * Reads the existing cert_requests row, merges the candidate holder +
 * cert_overrides over it, renders a fresh PDF, returns the bytes. Nothing
 * is persisted to the DB or storage.
 *
 * Admin-only.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fillAcord25 } from '@/lib/fillAcord25';
import { buildCoiInput, type DbPolicyFull } from '@/lib/coiInputBuilder';
import { CertOverridesSchema } from '@/lib/certOverridesSchema';

export const runtime = 'nodejs';

const TEMPLATE_PATH = resolve(process.cwd(), 'assets/template/acord-25-page-1.png');
const SIGNATURE_PATH = resolve(process.cwd(), 'assets/policy-place-signature.png');

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const HolderSchema = z.object({
  name: z.string().min(1).max(200),
  address1: z.string().min(1).max(200),
  address2: z.string().max(200).optional().default(''),
});

const BodySchema = z.object({
  requestId: z.string().uuid(),
  holder: HolderSchema.optional(),
  certOverrides: CertOverridesSchema.optional(),
});

type CertRequestRow = {
  client_id: string;
  agency_id: string;
  cert_number: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  coverages_selected: string[];
};

type AgencyRow = {
  name: string;
  address1: string | null;
  address2: string | null;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

type ClientRow = {
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
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

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: cert } = await admin
    .from('cert_requests')
    .select(
      `client_id, agency_id, cert_number,
       holder_name, holder_address1, holder_address2,
       coverages_selected`,
    )
    .eq('id', body.requestId)
    .maybeSingle<CertRequestRow>();
  if (!cert) {
    return NextResponse.json({ error: 'cert request not found' }, { status: 404 });
  }

  const [{ data: client }, { data: agency }, { data: policies }] = await Promise.all([
    admin
      .from('coi_clients')
      .select('business_name, business_address1, business_address2')
      .eq('id', cert.client_id)
      .maybeSingle<ClientRow>(),
    admin
      .from('agencies')
      .select('name, address1, address2, contact_name, phone, fax, email')
      .eq('id', cert.agency_id)
      .maybeSingle<AgencyRow>(),
    admin
      .from('policies')
      .select(
        `id, type, policy_number, eff_date, exp_date, active,
         status, cancelled_at, cancelled_reason,
         addl_insured_blanket, subrogation_waived, description, limits_jsonb,
         insurer:insurers ( name, naic )`,
      )
      .in('id', cert.coverages_selected)
      .returns<DbPolicyFull[]>(),
  ]);

  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 });
  if (!agency) return NextResponse.json({ error: 'agency not found' }, { status: 404 });

  const holder = body.holder
    ? {
        name: body.holder.name,
        address1: body.holder.address1,
        address2: body.holder.address2 ?? '',
      }
    : {
        name: cert.holder_name,
        address1: cert.holder_address1,
        address2: cert.holder_address2 ?? '',
      };

  const coiInput = buildCoiInput({
    agency,
    client,
    policies: policies ?? [],
    holder,
    certNumber: cert.cert_number,
    today: new Date(),
    templatePngPath: TEMPLATE_PATH,
    signaturePngPath: SIGNATURE_PATH,
    overrides: body.certOverrides,
  });

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await fillAcord25(coiInput);
  } catch (err) {
    return NextResponse.json(
      { error: 'render failed', detail: (err as Error).message },
      { status: 500 },
    );
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${cert.cert_number}-preview.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
