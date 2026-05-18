import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { selectableCoverages, type DbPolicy } from '@/lib/getClientPolicies';
import { CoverageForm, type PolicyForForm, type SavedHolder } from './CoverageForm';
import { Header } from './components/Header';
import { Hairline } from './components/Hairline';
import { ShieldMark } from './components/Logo';

type ClientRow = {
  id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
};

type PolicyRow = DbPolicy & {
  policy_number: string;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  description: string | null;
  insurer: { name: string; naic: string } | null;
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const { data: client } = await supabase
    .from('coi_clients')
    .select('id, business_name, business_address1, business_address2')
    .eq('contact_email', user.email)
    .maybeSingle<ClientRow>();

  if (!client) return <NoClientFound email={user.email} />;

  const { data: policiesRaw } = await supabase
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

  // Fetch saved holders for autocomplete (sorted by most recently used)
  const { data: holdersRaw } = await supabase
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
    <>
      <Header email={user.email} />

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-16 sm:px-10 lg:pt-20">
        {/* Insured identity — editorial hero card */}
        <section className="mb-14">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="caps text-[0.65rem] font-semibold text-seal-deep">Insured</p>
              <h1 className="font-display mt-4 text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3rem]">
                {client.business_name}
              </h1>
              {client.business_address1 && (
                <p className="mt-4 font-mono text-sm text-ink-muted">
                  {client.business_address1}
                  {client.business_address2 ? `  ·  ${client.business_address2}` : ''}
                </p>
              )}
            </div>
            <Link
              href="/certificates"
              className="focus-ring caps mt-2 inline-flex shrink-0 items-center gap-1.5 rounded-md border border-hairline-strong bg-white px-3 py-1.5 text-[0.62rem] font-semibold text-ink hover:bg-paper-deep/40"
            >
              My certificates →
            </Link>
          </div>
        </section>

        <Hairline label="Request a certificate" className="mb-10" />

        {policiesForForm.length === 0 ? (
          <NoActivePolicies />
        ) : (
          <CoverageForm clientId={client.id} policies={policiesForForm} savedHolders={savedHolders} />
        )}

        {/* Info callout */}
        <aside className="mt-16 border-l-2 border-seal/40 pl-5">
          <p className="caps text-[0.6rem] font-semibold text-seal-deep">A note from Brook</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            If your contract requires Additional Insured status, Waiver of Subrogation, or custom
            language, those must be set up on your policy before they can appear on a certificate.
            Reach out and we'll get you sorted —{' '}
            <a
              className="font-medium text-brand underline-offset-4 hover:underline"
              href="mailto:brook@yourpolicyplace.com"
            >
              brook@yourpolicyplace.com
            </a>
            .
          </p>
        </aside>
      </main>
    </>
  );
}

function NoClientFound({ email }: { email: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 sm:px-10">
        <Link href="/" className="focus-ring inline-flex items-center gap-2 -m-1 rounded p-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand">
            <ShieldMark className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight text-ink">
            The Policy Place
          </span>
        </Link>
      </div>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-24 sm:px-10">
        <p className="caps text-[0.65rem] font-semibold text-danger">Account not found</p>
        <h1 className="font-display mt-4 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          We can't place this email yet.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-ink-muted">
          No Policy Place account is linked to{' '}
          <span className="font-mono text-ink">{email}</span>.
        </p>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          If you should have access, reach out to{' '}
          <a
            className="font-medium text-brand underline-offset-4 hover:underline"
            href="mailto:brook@yourpolicyplace.com"
          >
            brook@yourpolicyplace.com
          </a>{' '}
          and we'll get you on file.
        </p>
      </main>
    </div>
  );
}

function NoActivePolicies() {
  return (
    <div className="border border-warning/30 bg-warning-soft/50 px-6 py-5">
      <p className="caps text-[0.62rem] font-semibold text-warning">No active policies</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        We don't see any in-force policies for your account right now. Please reach out to Brook to
        confirm your coverage status before requesting a certificate.
      </p>
    </div>
  );
}
