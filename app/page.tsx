import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { selectableCoverages, type DbPolicy } from '@/lib/getClientPolicies';
import { CoverageForm, type PolicyForForm, type SavedHolder } from './CoverageForm';
import { Header } from './components/Header';
import { Logo } from './components/Logo';

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
      <Header email={user.email} showMyCerts />

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8 sm:px-10 sm:pt-14 lg:pt-16">
        {/* Insured identity — bordered editorial card with corner seal mark */}
        <section className="relative mb-10 overflow-hidden border border-hairline bg-card px-5 py-6 sm:mb-14 sm:px-8 sm:py-8">
          <span
            aria-hidden="true"
            className="caps absolute right-3 top-3 hidden text-[0.5rem] font-semibold tracking-[0.35em] text-seal/60 sm:right-4 sm:top-4 sm:block"
          >
            · POLICY PLACE ·
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full border-[3px] border-seal/15 sm:-right-12 sm:-top-12 sm:h-44 sm:w-44 sm:border-[4px]"
          />

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
        </section>

        {policiesForForm.length === 0 ? (
          <NoActivePolicies />
        ) : (
          <CoverageForm clientId={client.id} policies={policiesForForm} savedHolders={savedHolders} />
        )}

        {/* Info callout */}
        <aside className="mt-14 border-l-2 border-seal/40 bg-seal-soft/30 py-4 pl-5 pr-4 sm:mt-16 sm:bg-transparent sm:py-0 sm:pr-0">
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
            </a>{' '}
            or{' '}
            <a
              className="font-medium text-brand underline-offset-4 hover:underline"
              href="tel:+12704102015"
            >
              (270) 410-2015
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
        <Link
          href="/"
          aria-label="The Policy Place — home"
          className="focus-ring -m-1 inline-flex rounded p-1"
        >
          <Logo tone="dark" />
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
          or{' '}
          <a
            className="font-medium text-brand underline-offset-4 hover:underline"
            href="tel:+12704102015"
          >
            (270) 410-2015
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
