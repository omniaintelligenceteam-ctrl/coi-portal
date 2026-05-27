import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import {
  PageShell,
  DataTable,
  Thead,
  Tbody,
  Th,
  Td,
} from '@/app/components/ui';
import { getClientPoliciesAll } from '@/lib/getClientPoliciesAll';
import { CancelCoverageButton } from './CancelCoverageButton';
import { UncancelCoverageButton } from './UncancelCoverageButton';
import { ProfileForm, type AgencyOption, type ProfileFormInitial } from './ProfileForm';
import { VoidCertButton } from './VoidCertButton';
import { AuditLogPanel, type AuditLogEntry } from './AuditLogPanel';
import { MasterFileTab } from './MasterFileTab';
import { FormsTab, type RegisteredFormSummary } from './FormsTab';
import { listForms, DEFAULT_FORM_ID } from '@/lib/forms/registry';

export const dynamic = 'force-dynamic';

type TabKey = 'master' | 'certificates' | 'policies' | 'forms' | 'profile' | 'audit';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type Client = {
  id: string;
  agency_id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
  contact_name: string | null;
  contact_email: string;
  phone: string | null;
  active: boolean;
  auto_approve_enabled: boolean;
  archived_at: string | null;
  archived_reason: string | null;
  default_description: string | null;
  auto_approve_threshold_low: number | null;
  auto_approve_threshold_high: number | null;
  enabled_forms: string[] | null;
};

type CertRow = {
  id: string;
  cert_number: string;
  status: CertStatus;
  holder_name: string;
  is_master: boolean;
  requested_at: string;
  sent_at: string | null;
  voided_at: string | null;
  voided_reason: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

export default async function ClientHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const tab: TabKey = ((sp.tab as TabKey) ?? 'certificates') as TabKey;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();

  // Try the full select including Phase-A trust ladder columns + Master File
  // default_description. Fall back to legacy column set if the new migrations
  // haven't been applied yet — keeps the client hub usable in either state.
  const fullSelect = await admin
    .from('coi_clients')
    .select(
      `id, agency_id, business_name, business_address1, business_address2,
       contact_name, contact_email, phone, active, auto_approve_enabled,
       archived_at, archived_reason,
       default_description, auto_approve_threshold_low, auto_approve_threshold_high,
       enabled_forms`,
    )
    .eq('id', clientId)
    .maybeSingle<Client>();

  let client: Client | null = fullSelect.data ?? null;

  if (fullSelect.error) {
    const legacy = await admin
      .from('coi_clients')
      .select(
        `id, agency_id, business_name, business_address1, business_address2,
         contact_name, contact_email, phone, active, auto_approve_enabled,
         archived_at, archived_reason`,
      )
      .eq('id', clientId)
      .maybeSingle();
    if (legacy.data) {
      client = {
        ...(legacy.data as Omit<Client, 'default_description' | 'auto_approve_threshold_low' | 'auto_approve_threshold_high' | 'enabled_forms'>),
        default_description: null,
        auto_approve_threshold_low: null,
        auto_approve_threshold_high: null,
        enabled_forms: null,
      };
    }
  }

  if (!client) notFound();

  const [{ data: certs }, policies, { data: agencies }, { data: auditEntries }] =
    await Promise.all([
      admin
        .from('cert_requests')
        .select(
          `id, cert_number, status, holder_name, is_master, requested_at, sent_at,
           voided_at, voided_reason`,
        )
        .eq('client_id', clientId)
        .order('requested_at', { ascending: false })
        .returns<CertRow[]>(),
      getClientPoliciesAll(admin, clientId),
      admin.from('agencies').select('id, name').order('name'),
      // Only fetch audit when the tab is visible — small win on the dominant
      // 'certificates' load path and the table can grow over time.
      tab === 'audit'
        ? admin
            .from('client_audit_log')
            .select('id, action, actor_email, diff, note, created_at')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(100)
            .returns<AuditLogEntry[]>()
        : Promise.resolve({ data: [] as AuditLogEntry[] }),
    ]);

  const agencyOptions: AgencyOption[] = (agencies ?? []) as AgencyOption[];
  const isArchived = client.archived_at !== null;

  const profileInitial: ProfileFormInitial = {
    businessName: client.business_name,
    businessAddress1: client.business_address1 ?? '',
    businessAddress2: client.business_address2 ?? '',
    contactName: client.contact_name ?? '',
    contactEmail: client.contact_email,
    phone: client.phone ?? '',
    agencyId: client.agency_id,
    active: client.active,
    autoApproveEnabled: client.auto_approve_enabled,
    archivedAt: client.archived_at,
    archivedReason: client.archived_reason,
  };

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <Link
        href="/admin/clients"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        ← Back to clients
      </Link>

      <header className="mt-6 mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="caps text-[0.65rem] font-semibold text-seal-deep">Insured</p>
          {isArchived && (
            <span className="caps rounded-[3px] border border-danger/40 bg-danger-soft/40 px-2 py-0.5 text-[0.55rem] font-semibold text-danger">
              Archived
            </span>
          )}
          {!client.active && !isArchived && (
            <span className="caps rounded-[3px] border border-warning/40 bg-warning-soft/40 px-2 py-0.5 text-[0.55rem] font-semibold text-warning">
              Inactive
            </span>
          )}
        </div>
        <h1 className="mt-3 font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
          {client.business_name}
        </h1>
        <p className="mt-2 font-mono text-[0.78rem] text-ink-muted">{client.contact_email}</p>
      </header>

      {/* Tabs */}
      <div className="mb-8 flex flex-wrap gap-1 border-b border-hairline-strong">
        {(
          [
            ['master', 'Master file'],
            ['certificates', `Certificates (${certs?.length ?? 0})`],
            ['policies', `Policies (${policies.length})`],
            ['forms', `Forms (${(client.enabled_forms ?? [DEFAULT_FORM_ID]).length})`],
            ['profile', 'Profile'],
            ['audit', 'Audit'],
          ] as const
        ).map(([id, label]) => {
          const active = tab === id;
          return (
            <Link
              key={id}
              href={`/admin/clients/${clientId}?tab=${id}`}
              className={`focus-ring -mb-px border-b-2 px-4 py-2 text-[0.78rem] font-medium transition-colors ${
                active
                  ? 'border-brand text-brand-deep'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {tab === 'master' && (
        <MasterFileTab
          clientId={clientId}
          client={{
            business_name: client.business_name,
            business_address1: client.business_address1,
            contact_email: client.contact_email,
            contact_name: client.contact_name,
            phone: client.phone,
            default_description: client.default_description,
            contact_email_display: client.contact_email,
            address_display: [client.business_address1, client.business_address2]
              .filter(Boolean)
              .join(', ') || '—',
          }}
          policies={policies}
          autoApproveEnabled={client.auto_approve_enabled}
          thresholdLow={client.auto_approve_threshold_low ?? 70}
          thresholdHigh={client.auto_approve_threshold_high ?? 90}
        />
      )}
      {tab === 'certificates' && <CertsTab certs={certs ?? []} />}
      {tab === 'policies' && (
        <PoliciesTab clientId={clientId} policies={policies} />
      )}
      {tab === 'forms' && (
        <FormsTab
          clientId={clientId}
          clientName={client.business_name}
          forms={
            listForms().map((f): RegisteredFormSummary => ({
              id: f.id,
              displayName: f.displayName,
              revision: f.revision,
            }))
          }
          initialEnabled={client.enabled_forms ?? [DEFAULT_FORM_ID]}
        />
      )}
      {tab === 'profile' && (
        <ProfileForm
          clientId={client.id}
          initial={profileInitial}
          agencies={agencyOptions}
        />
      )}
      {tab === 'audit' && <AuditLogPanel entries={auditEntries ?? []} />}
    </PageShell>
  );
}

function CertsTab({ certs }: { certs: CertRow[] }) {
  if (certs.length === 0) {
    return (
      <div className="rounded-[var(--r-md)] border border-hairline bg-card px-6 py-12 text-center shadow-card">
        <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint">
          No certificates
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          This client has not requested or been issued any certificates yet.
        </p>
      </div>
    );
  }
  return (
    <DataTable>
      <Thead>
        <Th>Cert #</Th>
        <Th>Holder</Th>
        <Th>Status</Th>
        <Th align="right">Requested</Th>
        <Th align="right">Sent</Th>
        <Th />
      </Thead>
      <Tbody>
          {certs.map((c) => (
            <tr key={c.id} className="border-b border-hairline last:border-b-0">
              <Td>
                <Link
                  href={`/admin/queue/${c.id}`}
                  className="focus-ring -m-1 inline-flex items-center gap-2 rounded p-1 font-mono text-[0.78rem] text-ink hover:text-brand"
                >
                  {c.cert_number}
                  {c.is_master && (
                    <span className="caps inline-flex items-center rounded-[3px] border border-seal/30 bg-seal-soft px-1.5 py-0.5 text-[0.55rem] font-semibold text-seal-deep">
                      Master
                    </span>
                  )}
                </Link>
              </Td>
              <Td>
                <span className="text-[0.85rem] text-ink">{c.holder_name}</span>
                {c.voided_reason && (
                  <p className="mt-0.5 text-[0.7rem] italic text-danger">
                    Voided: {c.voided_reason}
                  </p>
                )}
              </Td>
              <Td>
                <StatusPill status={c.status} />
              </Td>
              <Td align="right">
                <span className="font-mono text-[0.72rem] text-ink-muted">
                  {formatDateTime(c.requested_at)}
                </span>
              </Td>
              <Td align="right">
                <span className="font-mono text-[0.72rem] text-ink-faint">
                  {c.sent_at ? formatDateTime(c.sent_at) : '—'}
                </span>
              </Td>
              <Td align="right">
                {c.status === 'sent' && (
                  <VoidCertButton requestId={c.id} certNumber={c.cert_number} />
                )}
              </Td>
            </tr>
          ))}
      </Tbody>
    </DataTable>
  );
}

type PolicyRow = Awaited<ReturnType<typeof getClientPoliciesAll>>[number];

function PoliciesTab({
  clientId,
  policies,
}: {
  clientId: string;
  policies: PolicyRow[];
}) {
  if (policies.length === 0) {
    return (
      <div className="border border-hairline bg-card px-6 py-12 text-center">
        <p className="caps text-[0.62rem] font-semibold text-ink-faint">No policies on file</p>
        <p className="mt-3 text-sm text-ink-muted">
          Import a policy from the Admin tab to get this client started.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Hairline label="Policies (all)" />
      {policies.map((p) => {
        const isCancelled = p.status === 'cancelled';
        const isExpired = p.status === 'expired';
        return (
          <div
            key={p.id}
            className={`border bg-card p-5 ${
              isCancelled
                ? 'border-danger/30 bg-danger-soft/30'
                : isExpired
                  ? 'border-warning/30 bg-warning-soft/20'
                  : 'border-hairline'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-[1.05rem] font-semibold text-ink">
                    {TYPE_LABEL[p.type] ?? p.type}
                  </span>
                  <span className="caps text-[0.6rem] font-medium text-ink-faint">{p.type}</span>
                  {isCancelled && (
                    <span className="caps rounded-[3px] border border-danger/40 bg-white px-2 py-0.5 text-[0.6rem] font-semibold text-danger">
                      Cancelled
                    </span>
                  )}
                  {isExpired && (
                    <span className="caps rounded-[3px] border border-warning/40 bg-white px-2 py-0.5 text-[0.6rem] font-semibold text-warning">
                      Expired
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.78rem] text-ink-muted">
                  <span>{p.insurer?.name ?? 'Unknown insurer'}</span>
                  {p.insurer?.naic && (
                    <span className="font-mono text-[0.72rem] text-ink-faint">
                      NAIC {p.insurer.naic}
                    </span>
                  )}
                  <span className="text-hairline-strong">·</span>
                  <span className="font-mono text-[0.72rem]">{p.policy_number}</span>
                  <span className="text-hairline-strong">·</span>
                  <span className="font-mono text-[0.72rem]">
                    {p.eff_date} → {p.exp_date}
                  </span>
                </div>
                {isCancelled && p.cancelled_reason && (
                  <p className="mt-3 border-l-2 border-danger/40 pl-3 text-[0.78rem] italic text-danger">
                    {p.cancelled_reason}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {isCancelled ? (
                  <UncancelCoverageButton policyId={p.id} />
                ) : isExpired ? (
                  <span className="caps text-[0.6rem] text-ink-faint">renew via import</span>
                ) : (
                  <CancelCoverageButton policyId={p.id} clientId={clientId} />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
