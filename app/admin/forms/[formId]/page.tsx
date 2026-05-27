import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFormConfig, UnknownFormError } from '@/lib/forms/registry';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import {
  Card,
  DataTable,
  EmptyState,
  KeyValue,
  PageShell,
  Section,
  StaticChip,
  Tbody,
  Td,
  Th,
  Thead,
} from '@/app/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Form detail page — one row per registered form. Shows:
 *   - Header with form name + revision + Live chip
 *   - Stats row (clients enabled, certs issued, insurer slots)
 *   - Clients enabled DataTable (toggle from each client's Forms tab)
 *   - Recent certificates DataTable (link into the queue)
 *   - Technical section pointing at the registry + doctor command
 *
 * No blank-template preview iframe in V1 — assets/ aren't served by Next, and
 * shipping a streaming route for one form's PNG just to show a preview here
 * isn't worth the Phase 1 scope. Adding that is a 10-line route handler when
 * Wes wants it.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type ClientRow = {
  id: string;
  business_name: string;
  contact_email: string;
  active: boolean;
};

type CertRow = {
  id: string;
  cert_number: string;
  status: CertStatus;
  holder_name: string;
  requested_at: string;
  client: { business_name: string } | null;
};

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId: rawFormId } = await params;
  const formId = decodeURIComponent(rawFormId);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  let form;
  try {
    form = getFormConfig(formId);
  } catch (err) {
    if (err instanceof UnknownFormError) notFound();
    throw err;
  }

  const admin = createAdminClient();

  const [
    { count: clientsEnabled },
    { count: certsIssued },
    { data: enabledClients },
    { data: recentCerts },
  ] = await Promise.all([
    admin
      .from('coi_clients')
      .select('id', { count: 'exact', head: true })
      .contains('enabled_forms', [formId]),
    admin
      .from('cert_requests')
      .select('id', { count: 'exact', head: true })
      .eq('form_type', formId),
    admin
      .from('coi_clients')
      .select('id, business_name, contact_email, active')
      .contains('enabled_forms', [formId])
      .order('business_name', { ascending: true })
      .limit(50)
      .returns<ClientRow[]>(),
    admin
      .from('cert_requests')
      .select(
        'id, cert_number, status, holder_name, requested_at, client:coi_clients ( business_name )',
      )
      .eq('form_type', formId)
      .order('requested_at', { ascending: false })
      .limit(20)
      .returns<CertRow[]>(),
  ]);

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <Link
        href="/admin/forms"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.65rem] font-medium tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to forms
      </Link>

      <header className="mt-6 mb-10 flex flex-wrap items-end justify-between gap-4 sm:mb-12">
        <div className="min-w-0">
          <p className="caps font-mono text-[0.62rem] font-semibold tracking-[0.18em] text-brand">
            {form.id.replace('_', ' ')} · {form.revision}
          </p>
          <h1 className="font-display mt-2 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.5rem]">
            {form.displayName}
          </h1>
        </div>
        <StaticChip tone="success">Live</StaticChip>
      </header>

      <div className="mb-12 grid grid-cols-2 gap-4 border-y border-hairline py-5 sm:grid-cols-4 sm:gap-6 sm:py-6">
        <KeyValue
          label="Clients enabled"
          value={
            <span className="num-tabular font-mono text-[1.25rem] font-medium text-ink">
              {clientsEnabled ?? 0}
            </span>
          }
        />
        <KeyValue
          label="Certs issued"
          value={
            <span className="num-tabular font-mono text-[1.25rem] font-medium text-ink">
              {certsIssued ?? 0}
            </span>
          }
        />
        <KeyValue
          label="Insurer slots"
          value={
            <span className="num-tabular font-mono text-[1.25rem] font-medium text-ink">
              {form.insurerSlotCount}
            </span>
          }
        />
        <KeyValue
          label="Revision"
          value={
            <span className="font-mono text-[1.25rem] font-medium text-ink">{form.revision}</span>
          }
        />
      </div>

      <div className="space-y-14">
        <Section
          eyebrow="01"
          title="Enabled clients"
          description={
            clientsEnabled
              ? `${clientsEnabled} ${clientsEnabled === 1 ? 'client is' : 'clients are'} authorized to issue this form. Toggle from each client's Forms tab.`
              : 'No clients are authorized for this form yet. Enable from a client profile Forms tab.'
          }
        >
          {!enabledClients || enabledClients.length === 0 ? (
            <EmptyState
              eyebrow="No clients enabled"
              title="Nobody is set up for this form yet."
              description="Open any client, switch to the Forms tab, and toggle this form on. Clients can only request forms they're explicitly enabled for."
            />
          ) : (
            <DataTable>
              <Thead>
                <Th>Client</Th>
                <Th>Contact</Th>
                <Th align="right">Status</Th>
              </Thead>
              <Tbody>
                {enabledClients.map((c) => (
                  <tr key={c.id} className="border-b border-hairline last:border-b-0">
                    <Td>
                      <Link
                        href={`/admin/clients/${c.id}?tab=forms`}
                        className="focus-ring -m-1 inline-flex rounded p-1 text-[0.875rem] font-medium text-ink hover:text-brand"
                      >
                        {c.business_name}
                      </Link>
                    </Td>
                    <Td>
                      <span className="font-mono text-[0.78rem] text-ink-muted">
                        {c.contact_email}
                      </span>
                    </Td>
                    <Td align="right">
                      {c.active ? (
                        <StaticChip tone="success">Active</StaticChip>
                      ) : (
                        <StaticChip tone="warning">Inactive</StaticChip>
                      )}
                    </Td>
                  </tr>
                ))}
              </Tbody>
            </DataTable>
          )}
        </Section>

        <Section
          eyebrow="02"
          title="Recent certificates"
          description={
            certsIssued
              ? `Last ${Math.min(certsIssued, 20)} of ${certsIssued} certificate${certsIssued === 1 ? '' : 's'} issued with this form.`
              : 'No certificates have been issued with this form yet.'
          }
        >
          {!recentCerts || recentCerts.length === 0 ? (
            <EmptyState
              eyebrow="Nothing yet"
              title="No certificates issued with this form."
              description="Once an enabled client requests a certificate using this form, it'll appear here with a link into the queue."
            />
          ) : (
            <DataTable>
              <Thead>
                <Th>Cert #</Th>
                <Th>Client</Th>
                <Th>Holder</Th>
                <Th>Status</Th>
                <Th align="right">Requested</Th>
              </Thead>
              <Tbody>
                {recentCerts.map((c) => (
                  <tr key={c.id} className="border-b border-hairline last:border-b-0">
                    <Td>
                      <Link
                        href={`/admin/queue/${c.id}`}
                        className="focus-ring -m-1 inline-flex rounded p-1 font-mono text-[0.78rem] text-ink hover:text-brand"
                      >
                        {c.cert_number}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-[0.85rem] text-ink">
                        {c.client?.business_name ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[0.85rem] text-ink-muted">{c.holder_name}</span>
                    </Td>
                    <Td>
                      <StatusPill status={c.status} />
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-[0.72rem] text-ink-muted">
                        {formatDateTime(c.requested_at)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </Tbody>
            </DataTable>
          )}
        </Section>

        <Section
          eyebrow="—"
          title="Technical"
          description="Source-of-truth paths for engineering. Adding a form revision = update the FormConfig in the registry and re-run cert-doctor."
        >
          <Card padding="md" surface="sunken">
            <dl className="space-y-3 text-[0.875rem] leading-[1.55]">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-3">
                <dt className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
                  Registry entry
                </dt>
                <dd className="font-mono text-[0.78rem] text-ink">
                  lib/forms/{form.id.toLowerCase().replace('_', '')}/index.ts
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-3">
                <dt className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
                  Template PDF
                </dt>
                <dd className="break-all font-mono text-[0.72rem] text-ink-muted">
                  {form.templatePdfPath.split(/[\\/]/).slice(-2).join('/')}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-3">
                <dt className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
                  Template PNG
                </dt>
                <dd className="break-all font-mono text-[0.72rem] text-ink-muted">
                  {form.templatePngPath.split(/[\\/]/).slice(-2).join('/')}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <dt className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
                  Doctor check
                </dt>
                <dd className="font-mono text-[0.78rem] text-ink">
                  npm run cert-doctor -- --form {form.id}
                </dd>
              </div>
            </dl>
          </Card>
        </Section>
      </div>
    </PageShell>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
