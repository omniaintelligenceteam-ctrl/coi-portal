import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { ClientAutoApproveToggle } from './ClientAutoApproveToggle';

type ClientRow = {
  id: string;
  business_name: string;
  contact_email: string | null;
  auto_approve_enabled: boolean;
};

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('coi_clients')
    .select('id, business_name, contact_email, auto_approve_enabled')
    .order('business_name', { ascending: true })
    .returns<ClientRow[]>();

  const rows = clients ?? [];
  const autoCount = rows.filter((r) => r.auto_approve_enabled).length;

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ccAudit = process.env.COI_CC_AUDIT_EMAIL ?? '';
  const hourlyLimit = process.env.CERT_HOURLY_LIMIT ?? '20';
  const dailyLimit = process.env.CERT_DAILY_LIMIT ?? '200';

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <header className="mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Configuration</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
            Settings
          </h1>
          <span className="font-mono text-sm text-ink-muted">
            {autoCount} of {rows.length} on auto-approve
          </span>
        </div>
      </header>

      <section className="mb-16">
        <Hairline label="Clients" className="mb-3" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Roster of every insured on file with policy counts, last-issued activity, and a way to
          manage reviewer overrides per client.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/settings/clients"
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep/40"
          >
            Manage clients &amp; overrides
          </Link>
          <Link
            href="/admin/access-requests"
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep/40"
          >
            Access requests &amp; invites
          </Link>
        </div>
      </section>

      <section className="mb-16">
        <Hairline label="Approval mode" className="mb-3" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Auto-approve sends every certificate this client generates straight
          to their contact email. The AI reviewer still runs and its flags
          are stored on the request for audit, but they don't block sending.
          Default for new clients is Manual until they've been watched for a
          stretch.
        </p>

        {rows.length === 0 ? (
          <p className="border border-hairline bg-card px-5 py-8 text-sm text-ink-muted">
            No clients yet.
          </p>
        ) : (
          <>
            {/* Mobile card stack */}
            <ul className="space-y-3 sm:hidden">
              {rows.map((c) => (
                <li key={c.id} className="mobile-card">
                  <p className="font-medium text-[0.95rem] text-ink">{c.business_name}</p>
                  <p className="mt-1 break-all font-mono text-[0.78rem] text-ink-muted">
                    {c.contact_email ?? '—'}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                    <span className="caps text-[0.62rem] font-semibold text-ink-faint">Mode</span>
                    <ClientAutoApproveToggle
                      clientId={c.id}
                      initialEnabled={c.auto_approve_enabled}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden border-y border-hairline sm:block">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-hairline">
                    <Th>Client</Th>
                    <Th>Contact</Th>
                    <Th align="right">Mode</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-hairline last:border-b-0 hover:bg-paper-deep/40"
                    >
                      <Td>
                        <span className="font-medium text-[0.92rem] text-ink">
                          {c.business_name}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.78rem] text-ink-muted">
                          {c.contact_email ?? '—'}
                        </span>
                      </Td>
                      <td className="px-3 py-3 align-middle">
                        <ClientAutoApproveToggle
                          clientId={c.id}
                          initialEnabled={c.auto_approve_enabled}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <Hairline label="Environment (read-only)" className="mb-3" />
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-ink-muted">
          These values come from Vercel environment variables. Changes require
          a redeploy.
        </p>
        <dl className="border-y border-hairline divide-y divide-hairline">
          <EnvRow label="Admin emails" value={adminEmails.length > 0 ? adminEmails.join(', ') : '—'} />
          <EnvRow label="Audit CC email" value={ccAudit || '—'} />
          <EnvRow label="Cert hourly limit (per client)" value={hourlyLimit} />
          <EnvRow label="Cert daily limit (per client)" value={dailyLimit} />
        </dl>
      </section>
    </main>
  );
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

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-3 py-4 align-middle">{children}</td>;
}

function EnvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 px-3 py-3">
      <dt className="caps text-[0.62rem] font-semibold text-ink-faint">{label}</dt>
      <dd className="font-mono text-[0.8rem] text-ink">{value}</dd>
    </div>
  );
}
