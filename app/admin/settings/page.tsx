import { Building2, KeyRound, Users } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { ButtonLink, Card, PageHeader } from '@/app/components/ui';
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
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-8 sm:px-10 sm:pt-12 lg:px-16 lg:pt-14 xl:px-24">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
            Configuration
          </>
        }
        title="Settings"
        subtitle="Producer profile, client roster, approval mode, and environment values."
        meta={
          <span className="num-tabular inline-flex items-center gap-2 font-mono text-[0.875rem] text-ink-muted">
            {autoCount} of {rows.length} on auto-approve
          </span>
        }
      />

      <section className="mt-12">
        <Hairline label="Producer (your agency)" className="mb-3" />
        <p className="mb-5 max-w-2xl text-[0.875rem] leading-[1.55] text-ink-muted">
          The name, address, phone, fax, email, and license number that fill the Producer block on
          every certificate you issue. Edit here whenever your contact info changes.
        </p>
        <ButtonLink
          href="/admin/settings/agency"
          variant="secondary"
          leadingIcon={<Building2 className="h-4 w-4" aria-hidden="true" />}
        >
          Edit agency profile
        </ButtonLink>
      </section>

      <section className="mt-12">
        <Hairline label="Clients" className="mb-3" />
        <p className="mb-5 max-w-2xl text-[0.875rem] leading-[1.55] text-ink-muted">
          Roster of every insured on file with policy counts, last-issued activity, and a way to
          manage reviewer overrides per client.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink
            href="/admin/clients"
            variant="secondary"
            leadingIcon={<Users className="h-4 w-4" aria-hidden="true" />}
          >
            Open clients hub
          </ButtonLink>
          <ButtonLink href="/admin/settings/clients" variant="secondary">
            Manage overrides
          </ButtonLink>
          <ButtonLink href="/admin/access-requests" variant="secondary">
            Access requests &amp; invites
          </ButtonLink>
        </div>
      </section>

      <section className="mt-12">
        <Hairline label="Approval mode" className="mb-3" />
        <p className="mb-5 max-w-2xl text-[0.875rem] leading-[1.55] text-ink-muted">
          Auto-approve sends every certificate this client generates straight to their contact
          email. The AI reviewer still runs and its flags are stored on the request for audit, but
          they don&apos;t block sending. Default for new clients is Manual until they&apos;ve been
          watched for a stretch.
        </p>

        {rows.length === 0 ? (
          <Card padding="md">
            <p className="text-[0.875rem] text-ink-muted">No clients yet.</p>
          </Card>
        ) : (
          <>
            {/* Mobile card stack */}
            <ul className="space-y-3 sm:hidden">
              {rows.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[var(--r-md)] border border-hairline bg-card p-4 shadow-card"
                >
                  <p className="font-display text-[1.05rem] font-medium leading-[1.2] text-ink">
                    {c.business_name}
                  </p>
                  <p className="mt-1 break-all font-mono text-[0.78rem] text-ink-muted">
                    {c.contact_email ?? '—'}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                    <span className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint">
                      Mode
                    </span>
                    <ClientAutoApproveToggle
                      clientId={c.id}
                      initialEnabled={c.auto_approve_enabled}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-[var(--r-md)] border border-hairline bg-card shadow-card sm:block">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-hairline bg-paper-deep/40">
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
                        <span className="text-[0.9375rem] font-medium text-ink">
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

      <section className="mt-12">
        <Hairline label="Environment (read-only)" className="mb-3" />
        <p className="mb-5 max-w-2xl text-[0.875rem] leading-[1.55] text-ink-muted">
          These values come from Vercel environment variables. Changes require a redeploy.
        </p>
        <Card padding="none" className="overflow-hidden">
          <dl className="divide-y divide-hairline">
            <EnvRow
              icon={<KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
              label="Admin emails"
              value={adminEmails.length > 0 ? adminEmails.join(', ') : '—'}
            />
            <EnvRow label="Audit CC email" value={ccAudit || '—'} />
            <EnvRow label="Cert hourly limit (per client)" value={hourlyLimit} />
            <EnvRow label="Cert daily limit (per client)" value={dailyLimit} />
          </dl>
        </Card>
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
      className={`caps px-3 py-3 text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint ${
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

function EnvRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 px-4 py-3">
      <dt className="caps inline-flex items-center gap-1.5 text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint">
        {icon}
        {label}
      </dt>
      <dd className="font-mono text-[0.8rem] text-ink">{value}</dd>
    </div>
  );
}
