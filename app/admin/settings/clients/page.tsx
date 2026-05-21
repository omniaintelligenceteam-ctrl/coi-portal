import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { PageShell } from '@/app/components/ui';
import { ClientRoster } from './ClientRoster';

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
  contact_email: string | null;
  active: boolean;
  auto_approve_enabled: boolean;
};

type PolicyCountRow = { client_id: string };
type CertRow = { client_id: string; requested_at: string };

export type RosterRow = {
  id: string;
  businessName: string;
  contactEmail: string | null;
  active: boolean;
  autoApprove: boolean;
  activePolicies: number;
  lastIssuedAt: string | null;
};

export default async function ClientRosterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();

  const [{ data: clients }, { data: policies }, { data: certs }] = await Promise.all([
    admin
      .from('coi_clients')
      .select('id, business_name, contact_email, active, auto_approve_enabled')
      .order('business_name')
      .returns<ClientRow[]>(),
    admin
      .from('policies')
      .select('client_id')
      .eq('active', true)
      .returns<PolicyCountRow[]>(),
    admin
      .from('cert_requests')
      .select('client_id, requested_at')
      .order('requested_at', { ascending: false })
      .returns<CertRow[]>(),
  ]);

  const policyCounts = new Map<string, number>();
  (policies ?? []).forEach((p) => {
    policyCounts.set(p.client_id, (policyCounts.get(p.client_id) ?? 0) + 1);
  });

  const lastIssued = new Map<string, string>();
  (certs ?? []).forEach((c) => {
    if (!lastIssued.has(c.client_id)) lastIssued.set(c.client_id, c.requested_at);
  });

  const rows: RosterRow[] = (clients ?? []).map((c) => ({
    id: c.id,
    businessName: c.business_name,
    contactEmail: c.contact_email,
    active: c.active,
    autoApprove: c.auto_approve_enabled,
    activePolicies: policyCounts.get(c.id) ?? 0,
    lastIssuedAt: lastIssued.get(c.id) ?? null,
  }));

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <Link
        href="/admin/settings"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to settings
      </Link>

      <header className="mt-6 mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Roster</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
            Clients
          </h1>
          <span className="font-mono text-sm text-ink-muted">
            {rows.length} total · {rows.filter((r) => r.active).length} active
          </span>
        </div>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          Every insured on file with last-issued activity. Click a row to generate on their behalf,
          or open "Overrides" to manage reviewer corrections.
        </p>
      </header>

      <Hairline className="mb-6" />

      <ClientRoster rows={rows} />
    </PageShell>
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
