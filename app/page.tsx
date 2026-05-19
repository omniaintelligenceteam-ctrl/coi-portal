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

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  // Agents (Brook etc) land directly on the queue — they don't have an
  // insured account; they REVIEW customer requests. The customer-side view
  // is reachable via `/?as=insured` if they need to dogfood the form.
  const email = user.email.toLowerCase();
  if (adminEmails().includes(email)) redirect('/admin/queue');

  const { data: client } = await supabase
    .from('coi_clients')
    .select('id, business_name, business_address1, business_address2')
    .eq('contact_email', email)
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

  const today = new Date();
  const eligible = selectableCoverages(policiesRaw ?? [], today);
  const renewalAlerts = computeRenewalAlerts(policiesRaw ?? [], today);

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

      <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
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

        {renewalAlerts.length > 0 && <RenewalBanner alerts={renewalAlerts} />}

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

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24 pt-10 sm:px-8 sm:pt-12 lg:px-12 lg:pt-16">
        <div className="mx-auto max-w-2xl">

        <p className="caps text-[0.65rem] font-semibold text-warning">Access pending</p>
        <h1 className="font-display mt-4 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          We can't place this email yet.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-ink-muted">
          No Policy Place account is linked to{' '}
          <span className="font-mono text-ink">{email}</span> yet. If you've already requested
          access, Brook or Wes is reviewing — you'll get a sign-in email as soon as it's approved.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-deep"
          >
            Request access →
          </Link>
          <a
            href="mailto:brook@yourpolicyplace.com"
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep/40"
          >
            Email Brook
          </a>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Or call{' '}
          <a
            className="font-medium text-brand underline-offset-4 hover:underline"
            href="tel:+12704102015"
          >
            (270) 410-2015
          </a>
          .
        </p>
        </div>
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

const COVERAGE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Coverage',
};

const RENEWAL_WINDOW_DAYS = 30;

type RenewalAlert = {
  policyId: string;
  label: string;
  expDate: string;
  daysOut: number; // negative if expired
};

function computeRenewalAlerts(policies: PolicyRow[], today: Date): RenewalAlert[] {
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return policies
    .filter((p) => p.active)
    .map((p) => {
      const exp = new Date(p.exp_date + 'T00:00:00').getTime();
      const daysOut = Math.round((exp - startOfDay) / 86_400_000);
      return {
        policyId: p.id,
        label: COVERAGE_LABEL[p.type] ?? p.type,
        expDate: p.exp_date,
        daysOut,
      };
    })
    .filter((a) => a.daysOut <= RENEWAL_WINDOW_DAYS)
    .sort((a, b) => a.daysOut - b.daysOut);
}

function formatExpDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RenewalBanner({ alerts }: { alerts: RenewalAlert[] }) {
  const expired = alerts.filter((a) => a.daysOut < 0);
  const soon = alerts.filter((a) => a.daysOut >= 0);
  const hasExpired = expired.length > 0;

  return (
    <div
      className={
        hasExpired
          ? 'mb-10 border border-danger/40 bg-danger-soft/40 px-5 py-4 sm:px-6 sm:py-5'
          : 'mb-10 border border-warning/40 bg-warning-soft/40 px-5 py-4 sm:px-6 sm:py-5'
      }
    >
      <p
        className={
          hasExpired
            ? 'caps text-[0.62rem] font-semibold text-danger'
            : 'caps text-[0.62rem] font-semibold text-warning'
        }
      >
        {hasExpired ? 'Action needed — coverage expired' : 'Renewal coming up'}
      </p>

      <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink">
        {expired.map((a) => (
          <li key={a.policyId}>
            Your <span className="font-semibold">{a.label}</span> policy expired{' '}
            <span className="font-semibold">{formatExpDate(a.expDate)}</span>. It can't appear on
            new certificates until it's renewed.
          </li>
        ))}
        {soon.map((a) => (
          <li key={a.policyId}>
            Your <span className="font-semibold">{a.label}</span> policy expires{' '}
            <span className="font-semibold">{formatExpDate(a.expDate)}</span>{' '}
            {a.daysOut === 0
              ? '(today)'
              : a.daysOut === 1
              ? '(tomorrow)'
              : `(in ${a.daysOut} days)`}
            .
          </li>
        ))}
      </ul>

      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Reach out to Brook to start the renewal —{' '}
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
    </div>
  );
}
