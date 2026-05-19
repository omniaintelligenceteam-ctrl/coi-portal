import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectableCoverages, type DbPolicy } from '@/lib/getClientPolicies';
import { CoverageForm, type PolicyForForm, type SavedHolder } from '@/app/CoverageForm';
import { Hairline } from '@/app/components/Hairline';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type ClientRow = {
  id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
  contact_email: string | null;
  active: boolean;
};

type PolicyRow = DbPolicy & {
  policy_number: string;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  description: string | null;
  insurer: { name: string; naic: string } | null;
};

export default async function GenerateForClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();

  const { data: client } = await admin
    .from('coi_clients')
    .select('id, business_name, business_address1, business_address2, contact_email, active')
    .eq('id', clientId)
    .maybeSingle<ClientRow>();
  if (!client) notFound();

  const { data: policiesRaw } = await admin
    .from('policies')
    .select(
      `id, type, policy_number, eff_date, exp_date, active,
       addl_insured_blanket, subrogation_waived, description,
       insurer:insurers ( name, naic )`,
    )
    .eq('client_id', client.id)
    .order('exp_date', { ascending: false })
    .returns<PolicyRow[]>();

  const eligible = selectableCoverages(policiesRaw ?? [], new Date());

  const { data: holdersRaw } = await admin
    .from('cert_holders')
    .select('name, address1, address2')
    .eq('client_id', client.id)
    .order('last_used_at', { ascending: false })
    .limit(20)
    .returns<SavedHolder[]>();

  const savedHolders: SavedHolder[] = holdersRaw ?? [];

  const policiesForForm: PolicyForForm[] = eligible.map((p) => ({
    id: p.id,
    type: p.type,
    policyNumber: p.policy_number,
    effDate: p.eff_date,
    expDate: p.exp_date,
    insurerName: p.insurer?.name ?? 'Unknown insurer',
    addlInsuredBlanket: p.addl_insured_blanket,
    subrogationWaived: p.subrogation_waived,
    description: p.description ?? '',
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/generate"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to clients
      </Link>

      <section className="relative mt-6 mb-10 overflow-hidden border border-hairline bg-card px-5 py-6 sm:mb-14 sm:px-8 sm:py-8">
        <span
          aria-hidden="true"
          className="caps absolute right-3 top-3 hidden text-[0.5rem] font-semibold tracking-[0.35em] text-seal/60 sm:right-4 sm:top-4 sm:block"
        >
          · POLICY PLACE ·
        </span>
        <p className="caps text-[0.62rem] font-semibold text-seal-deep">Insured</p>
        <h1 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:mt-4 sm:text-[3rem]">
          {client.business_name}
        </h1>
        {client.business_address1 && (
          <p className="mt-3 font-mono text-[0.78rem] leading-relaxed text-ink-muted sm:mt-4 sm:text-sm">
            <span className="block sm:inline">{client.business_address1}</span>
            {client.business_address2 && (
              <>
                <span className="hidden text-ink-faint sm:inline">{'  ·  '}</span>
                <span className="block sm:inline">{client.business_address2}</span>
              </>
            )}
          </p>
        )}
        {client.contact_email && (
          <p className="mt-2 font-mono text-[0.72rem] text-ink-faint">
            {client.contact_email}
          </p>
        )}
      </section>

      {policiesForForm.length === 0 ? (
        <NoActivePolicies />
      ) : (
        <CoverageForm
          clientId={client.id}
          policies={policiesForForm}
          savedHolders={savedHolders}
          mode="admin"
          onBehalfOf={client.business_name}
        />
      )}

      <Hairline className="mt-16" />
      </div>
    </main>
  );
}

function NoActivePolicies() {
  return (
    <div className="border border-warning/30 bg-warning-soft/50 px-6 py-5">
      <p className="caps text-[0.62rem] font-semibold text-warning">No active policies</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        This client has no in-force policies on file. Import one before issuing a certificate.
      </p>
    </div>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}
