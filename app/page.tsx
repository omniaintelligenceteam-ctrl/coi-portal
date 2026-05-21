import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowRight, Mail, Phone } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { selectableCoverages, type DbPolicy } from '@/lib/getClientPolicies';
import { CoverageForm, type PolicyForForm, type SavedHolder } from './CoverageForm';
import { Header } from './components/Header';
import { Logo } from './components/Logo';
import { MasterCertButton } from './MasterCertButton';
import { SealCorner } from './components/SealCorner';
import { Banner, ButtonLink, Card, EmptyState, PageShell } from './components/ui';
import { RecentCertsSection, type RecentCert } from './_client/RecentCertsSection';

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
       status, cancelled_at, cancelled_reason,
       addl_insured_blanket, subrogation_waived, description,
       insurer:insurers ( name, naic )`,
    )
    .eq('client_id', client.id)
    .order('exp_date', { ascending: false })
    .returns<PolicyRow[]>();

  const today = new Date();
  const eligible = selectableCoverages(policiesRaw ?? [], today);
  const renewalAlerts = computeRenewalAlerts(policiesRaw ?? [], today);

  const { data: holdersRaw } = await supabase
    .from('cert_holders')
    .select('name, address1, address2')
    .eq('client_id', client.id)
    .order('last_used_at', { ascending: false })
    .limit(20)
    .returns<SavedHolder[]>();

  const savedHolders: SavedHolder[] = holdersRaw ?? [];

  // Recent certificates — surfaced above the request form so re-sending the
  // last cert to a new holder is one tap (the dominant client use case).
  const { data: recentRows } = await supabase
    .from('cert_requests')
    .select('cert_number, holder_name, sent_at')
    .eq('client_id', client.id)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(3);

  const recentCerts: RecentCert[] = (recentRows ?? []).map((r) => ({
    certNumber: r.cert_number as string,
    holderName: r.holder_name as string,
    sentAt: (r.sent_at as string | null) ?? null,
  }));

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

      <PageShell as="main" className="page-pad-top page-pad-bot">
        {/* Insured identity — editorial card with corner seal mark */}
        <section className="relative mb-8 overflow-hidden rounded-[var(--r-lg)] border border-hairline bg-card px-5 py-6 shadow-card sm:mb-12 sm:px-8 sm:py-8">
          <span
            aria-hidden="true"
            className="caps absolute right-3 top-3 hidden text-[0.55rem] font-semibold tracking-[0.35em] text-seal/60 sm:right-4 sm:top-4 sm:block"
          >
            · POLICY PLACE ·
          </span>
          <SealCorner size="md" position="tr" />

          <p className="caps relative text-[0.62rem] font-semibold tracking-[0.2em] text-seal-deep">
            Insured
          </p>
          <h1 className="font-display relative mt-2 text-[1.75rem] font-medium leading-[1.05] tracking-display text-ink sm:mt-3 sm:text-[2.625rem]">
            {client.business_name}
          </h1>
          {client.business_address1 && (
            <p className="relative mt-3 font-mono text-[0.78rem] leading-relaxed text-ink-muted sm:mt-3 sm:text-[0.875rem]">
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

        {renewalAlerts.length > 0 && (
          <div className="mb-8 sm:mb-10">
            <RenewalBanner alerts={renewalAlerts} />
          </div>
        )}

        <RecentCertsSection certs={recentCerts} />

        {policiesForForm.length === 0 ? (
          <NoActivePolicies />
        ) : (
          <>
            <CoverageForm
              clientId={client.id}
              policies={policiesForForm}
              savedHolders={savedHolders}
            />
            <MasterCertButton
              policyIds={policiesForForm.map((p) => p.id)}
              businessName={client.business_name}
              businessAddress1={client.business_address1 ?? ''}
              businessAddress2={client.business_address2 ?? ''}
            />
          </>
        )}

        {/* Note from Brook */}
        <aside className="mt-12 rounded-[var(--r-md)] border-l-2 border-seal/50 bg-seal-soft/30 px-5 py-4 sm:mt-16 sm:border-l-2 sm:bg-transparent sm:px-0 sm:py-0">
          <p className="caps text-[0.6rem] font-semibold tracking-[0.2em] text-seal-deep">
            A note from Brook
          </p>
          <p className="mt-2 text-[0.875rem] leading-[1.6] text-ink-muted">
            If your contract requires Additional Insured status, Waiver of Subrogation, or custom
            language, those must be set up on your policy before they can appear on a certificate.
            Reach out and we&apos;ll get you sorted —{' '}
            <a
              className="font-medium text-brand-deep underline-offset-4 hover:text-brand-near hover:underline"
              href="mailto:brook@yourpolicyplace.com"
            >
              brook@yourpolicyplace.com
            </a>{' '}
            or{' '}
            <a
              className="font-medium text-brand-deep underline-offset-4 hover:text-brand-near hover:underline"
              href="tel:+12704102015"
            >
              (270) 410-2015
            </a>
            .
          </p>
        </aside>
      </PageShell>
    </>
  );
}

function NoClientFound({ email }: { email: string }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageShell as="div" className="pt-safe">
        <Link
          href="/"
          aria-label="The Policy Place — home"
          className="focus-ring -m-1 mt-6 inline-flex rounded p-1 sm:mt-8"
        >
          <Logo tone="dark" />
        </Link>
      </PageShell>

      <PageShell as="main" width="narrow" className="flex-1 page-pad-top page-pad-bot">
        <div>
          <Card padding="lg" raised>
            <p className="caps text-[0.65rem] font-semibold text-warning">Access pending</p>
            <h1 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.5rem]">
              We can&apos;t place this email yet.
            </h1>
            <p className="mt-4 text-[0.9375rem] leading-[1.6] text-ink-muted">
              No Policy Place account is linked to{' '}
              <span className="font-mono text-ink">{email}</span> yet. If you&apos;ve already
              requested access, Brook or Wes is reviewing. As soon as it&apos;s approved, you can
              sign in instantly with this email.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
              <ButtonLink
                href="/signup"
                size="lg"
                trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
              >
                Request access
              </ButtonLink>
              <ButtonLink
                href="mailto:brook@yourpolicyplace.com"
                external
                variant="secondary"
                size="lg"
                leadingIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
              >
                Email Brook
              </ButtonLink>
            </div>
            <p className="mt-5 flex items-center gap-2 text-[0.875rem] text-ink-muted">
              <Phone className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
              Or call{' '}
              <a
                className="font-medium text-brand-deep underline-offset-4 hover:underline"
                href="tel:+12704102015"
              >
                (270) 410-2015
              </a>
            </p>
          </Card>
        </div>
      </PageShell>
    </div>
  );
}

function NoActivePolicies() {
  return (
    <EmptyState
      tone="seal"
      icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
      eyebrow="No active policies"
      title="We don't see any in-force policies on your account."
      description="Reach out to Brook to confirm your coverage status — once your policy is on file, certificates can be requested here in seconds."
      actions={
        <ButtonLink
          href="mailto:brook@yourpolicyplace.com"
          external
          leadingIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
        >
          Email Brook
        </ButtonLink>
      }
    />
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
  daysOut: number;
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
    <Banner
      tone={hasExpired ? 'danger' : 'warning'}
      title={hasExpired ? 'Action needed — coverage expired' : 'Renewal coming up'}
    >
      <ul className="space-y-1 text-[0.875rem] leading-[1.5] text-ink">
        {expired.map((a) => (
          <li key={a.policyId}>
            Your <span className="font-semibold">{a.label}</span> policy expired{' '}
            <span className="font-semibold">{formatExpDate(a.expDate)}</span>. It can&apos;t appear
            on new certificates until it&apos;s renewed.
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
      <p className="mt-3 text-[0.8125rem] leading-[1.5] text-ink-muted">
        Reach out to Brook to start the renewal —{' '}
        <a
          className="font-medium text-brand-deep underline-offset-4 hover:underline"
          href="mailto:brook@yourpolicyplace.com"
        >
          brook@yourpolicyplace.com
        </a>{' '}
        or{' '}
        <a
          className="font-medium text-brand-deep underline-offset-4 hover:underline"
          href="tel:+12704102015"
        >
          (270) 410-2015
        </a>
        .
      </p>
    </Banner>
  );
}
