import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  contact_email: string | null;
  active: boolean;
};

type PolicyCountRow = { client_id: string; status: 'active' | 'cancelled' | 'expired' | null };
type CertCountRow = { client_id: string; requested_at: string };

export default async function ClientsHubPage() {
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
      .select('id, business_name, contact_email, active')
      .order('business_name')
      .returns<ClientRow[]>(),
    admin
      .from('policies')
      .select('client_id, status')
      .returns<PolicyCountRow[]>(),
    admin
      .from('cert_requests')
      .select('client_id, requested_at')
      .order('requested_at', { ascending: false })
      .returns<CertCountRow[]>(),
  ]);

  const activePolicyCount = new Map<string, number>();
  const cancelledPolicyCount = new Map<string, number>();
  (policies ?? []).forEach((p) => {
    if ((p.status ?? 'active') === 'active') {
      activePolicyCount.set(p.client_id, (activePolicyCount.get(p.client_id) ?? 0) + 1);
    } else if (p.status === 'cancelled') {
      cancelledPolicyCount.set(p.client_id, (cancelledPolicyCount.get(p.client_id) ?? 0) + 1);
    }
  });
  const totalCerts = new Map<string, number>();
  const lastCertAt = new Map<string, string>();
  (certs ?? []).forEach((c) => {
    totalCerts.set(c.client_id, (totalCerts.get(c.client_id) ?? 0) + 1);
    if (!lastCertAt.has(c.client_id)) lastCertAt.set(c.client_id, c.requested_at);
  });

  const rows = (clients ?? []).map((c) => ({
    id: c.id,
    name: c.business_name,
    email: c.contact_email,
    active: c.active,
    activePolicies: activePolicyCount.get(c.id) ?? 0,
    cancelledPolicies: cancelledPolicyCount.get(c.id) ?? 0,
    totalCerts: totalCerts.get(c.id) ?? 0,
    lastCertAt: lastCertAt.get(c.id) ?? null,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <header className="mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Clients</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
            Everything per insured.
          </h1>
          <span className="font-mono text-sm text-ink-muted">
            {rows.length} total · {rows.filter((r) => r.active).length} active
          </span>
        </div>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          Pick a client to see every certificate they've ever submitted, manage their policies,
          or edit their insured profile. Coverage cancellation lives here too.
        </p>
      </header>

      <Hairline className="mb-6" />

      <div className="border-y border-hairline">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-hairline">
              <Th>Client</Th>
              <Th align="right">Active policies</Th>
              <Th align="right">Cancelled</Th>
              <Th align="right">Certs on file</Th>
              <Th align="right">Last cert</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-ink-muted">
                  No clients yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="group border-b border-hairline last:border-b-0">
                  <Td>
                    <Link
                      href={`/admin/clients/${r.id}`}
                      className="focus-ring -m-1 inline-block rounded p-1 text-[0.95rem] font-medium text-ink hover:text-brand"
                    >
                      {r.name}
                    </Link>
                    {r.email && (
                      <p className="mt-0.5 font-mono text-[0.72rem] text-ink-faint">{r.email}</p>
                    )}
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[0.78rem] text-ink">{r.activePolicies}</span>
                  </Td>
                  <Td align="right">
                    <span className={`font-mono text-[0.78rem] ${r.cancelledPolicies > 0 ? 'text-danger' : 'text-ink-faint'}`}>
                      {r.cancelledPolicies}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[0.78rem] text-ink">{r.totalCerts}</span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[0.72rem] text-ink-faint">
                      {r.lastCertAt ? formatDate(r.lastCertAt) : '—'}
                    </span>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`caps px-3 py-3 text-[0.6rem] font-semibold text-ink-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td className={`px-3 py-4 align-middle ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </td>
  );
}
