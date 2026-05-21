import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { CountUp } from '@/app/components/motion';
import {
  EmptyState,
  PageHeader,
  PageShell,
  DataTable,
  Thead,
  Tbody,
  Th,
  Td,
} from '@/app/components/ui';

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

  const activeCount = rows.filter((r) => r.active).length;

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
            Clients
          </>
        }
        title="Everything per insured."
        subtitle="Pick a client to see every certificate they&apos;ve ever submitted, manage their policies, or edit their insured profile. Coverage cancellation lives here too."
        meta={
          <span className="num-tabular inline-flex items-center gap-2 font-mono text-[0.875rem] text-ink-muted">
            {rows.length === 0 ? '0' : <CountUp value={rows.length} />} total · {activeCount} active
          </span>
        }
      />

      <Hairline className="mt-10 mb-6" />

      <div>
        {rows.length === 0 ? (
          <EmptyState
            tone="default"
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            eyebrow="No clients"
            title="No clients on file."
            description="Approve an access request or send an invite to add the first client."
          />
        ) : (
          <>
            {/* Mobile card stack */}
            <ul className="space-y-3 sm:hidden">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-[var(--r-md)] border border-hairline bg-card p-4 shadow-card"
                >
                  <Link
                    href={`/admin/clients/${r.id}`}
                    className="focus-ring -m-1 inline-block rounded p-1 font-display text-[1.05rem] font-medium leading-[1.2] text-ink hover:text-brand"
                  >
                    {r.name}
                  </Link>
                  {r.email && (
                    <p className="mt-1 break-all font-mono text-[0.78rem] text-ink-faint">
                      {r.email}
                    </p>
                  )}
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-hairline pt-3">
                    <Stat label="Active policies" value={r.activePolicies} />
                    <Stat
                      label="Cancelled"
                      value={r.cancelledPolicies}
                      tone={r.cancelledPolicies > 0 ? 'danger' : undefined}
                    />
                    <Stat label="Certs on file" value={r.totalCerts} />
                    <Stat
                      label="Last cert"
                      value={r.lastCertAt ? formatDate(r.lastCertAt) : '—'}
                    />
                  </dl>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <DataTable>
              <Thead>
                <Th>Client</Th>
                <Th align="right">Active policies</Th>
                <Th align="right">Cancelled</Th>
                <Th align="right">Certs on file</Th>
                <Th align="right">Last cert</Th>
              </Thead>
              <Tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="group border-b border-hairline last:border-b-0 transition-colors hover:bg-paper-deep/40"
                  >
                    <Td>
                      <Link
                        href={`/admin/clients/${r.id}`}
                        className="focus-ring -m-1 inline-block rounded p-1 text-[0.95rem] font-medium text-ink group-hover:text-brand-deep"
                      >
                        {r.name}
                      </Link>
                      {r.email && (
                        <p className="mt-0.5 font-mono text-[0.72rem] text-ink-faint">
                          {r.email}
                        </p>
                      )}
                    </Td>
                    <Td align="right">
                      <span className="num-tabular font-mono text-[0.78rem] text-ink">
                        {r.activePolicies}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className={`num-tabular font-mono text-[0.78rem] ${
                          r.cancelledPolicies > 0 ? 'text-danger' : 'text-ink-faint'
                        }`}
                      >
                        {r.cancelledPolicies}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="num-tabular font-mono text-[0.78rem] text-ink">
                        {r.totalCerts}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="num-tabular font-mono text-[0.72rem] text-ink-faint">
                        {r.lastCertAt ? formatDate(r.lastCertAt) : '—'}
                      </span>
                    </Td>
                  </tr>
                ))}
              </Tbody>
            </DataTable>
          </>
        )}
      </div>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
        {label}
      </dt>
      <dd
        className={`num-tabular font-mono text-[0.78rem] ${
          tone === 'danger' ? 'text-danger' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
