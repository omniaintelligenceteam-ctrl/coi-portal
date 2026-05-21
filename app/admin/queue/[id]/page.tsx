import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, FileText } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { MonoTag } from '@/app/components/MonoTag';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { buildCertFilename, createCertSignedUrl } from '@/lib/storage';
import { Banner, Card, PageShell } from '@/app/components/ui';
import { DecisionForm, type EditableCoverage } from './DecisionForm';
import { PdfPreviewPanel } from './PdfPreviewPanel';
import { RetrySend } from './RetrySend';
import { DeleteRequest } from './DeleteRequest';
import type { CertOverrides } from '@/lib/types';

export const dynamic = 'force-dynamic';

type ClientJoin = {
  id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
};

type AgencyJoin = {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
};

type RequestDetail = {
  id: string;
  cert_number: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  coverages_selected: string[];
  status: CertStatus;
  reviewer_pass: boolean | null;
  reviewer_flags: { field: string; severity: 'error' | 'warning' | 'info'; message: string }[];
  reviewer_notes: string | null;
  reviewer_model: string | null;
  pdf_storage_path: string | null;
  requested_at: string;
  requested_by_email: string;
  cert_overrides: CertOverrides | null;
  is_master: boolean;
  client: ClientJoin | ClientJoin[] | null;
  agency: AgencyJoin | AgencyJoin[] | null;
};

const FLASH_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  delete_failed: { tone: 'error', text: "Couldn't delete this request — try again." },
  email_failed: { tone: 'error', text: 'Decision saved but the email failed to send.' },
  update_failed: { tone: 'error', text: "Couldn't update this request." },
};

type CoverageDetail = {
  id: string;
  type: string;
  policy_number: string;
  eff_date: string;
  exp_date: string;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  description: string | null;
  limits_jsonb: Record<string, number> | null;
  insurer: { name: string; naic: string } | null;
};

const TYPE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export default async function CertDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const flashKey = sp.error;
  const flash = flashKey ? FLASH_MESSAGES[flashKey] : null;
  const supabase = createAdminClient();

  const { data: req } = await supabase
    .from('cert_requests')
    .select(
      `id, cert_number, holder_name, holder_address1, holder_address2,
       coverages_selected, status, pdf_storage_path,
       reviewer_pass, reviewer_flags, reviewer_notes, reviewer_model,
       requested_at, requested_by_email, cert_overrides, is_master,
       client:coi_clients ( id, business_name, business_address1, business_address2 ),
       agency:agencies ( id, name, address1, address2, contact_name, phone, fax, email )`,
    )
    .eq('id', id)
    .maybeSingle<RequestDetail>();

  if (!req) notFound();

  const client: ClientJoin | null = Array.isArray(req.client)
    ? req.client[0] ?? null
    : req.client;
  const agency: AgencyJoin | null = Array.isArray(req.agency)
    ? req.agency[0] ?? null
    : req.agency;

  const policyIds = req.coverages_selected ?? [];
  const { data: coverages } = policyIds.length
    ? await supabase
        .from('policies')
        .select(
          `id, type, policy_number, eff_date, exp_date,
           addl_insured_blanket, subrogation_waived, description, limits_jsonb,
           insurer:insurers ( name, naic )`,
        )
        .in('id', policyIds)
        .returns<CoverageDetail[]>()
    : { data: [] as CoverageDetail[] };

  const canDecide = req.status === 'pending' || req.status === 'reviewed';
  const canRetrySend = req.status === 'approved' || req.status === 'edited';

  let previewUrl: string | null = null;
  let downloadUrl: string | null = null;
  if (req.pdf_storage_path) {
    try {
      const filename = buildCertFilename(
        req.cert_number,
        req.holder_name,
        req.requested_at,
      );
      [previewUrl, downloadUrl] = await Promise.all([
        createCertSignedUrl(supabase, req.pdf_storage_path),
        createCertSignedUrl(supabase, req.pdf_storage_path, { downloadFilename: filename }),
      ]);
    } catch (err) {
      console.error('signed URL mint failed (admin queue detail):', err);
    }
  }

  return (
    <PageShell as="main" className="page-pad-top pb-32">
      <Link
        href="/admin/queue"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.65rem] font-medium tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to queue
      </Link>

      {flash && (
        <div className="mt-5">
          <Banner tone={flash.tone === 'ok' ? 'seal' : 'danger'}>{flash.text}</Banner>
        </div>
      )}

      {/* Document-style header — client name primary, cert# secondary */}
      <header className="mt-7">
        <p className="caps text-[0.65rem] font-semibold tracking-caps text-brand">
          Certificate request
        </p>
        <h1 className="font-display mt-3 text-[1.875rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.5rem]">
          {client?.business_name ?? 'Unknown client'}
        </h1>
        <p className="num-tabular mt-2 font-mono text-[0.9rem] text-ink-muted">
          {req.cert_number}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-5 sm:gap-x-4">
          <StatusPill status={req.status} size="md" />
          <span className="caps text-[0.6rem] font-medium tracking-caps text-ink-faint">
            Requested by
          </span>
          <span className="font-mono text-[0.78rem] text-ink">{req.requested_by_email}</span>
          <span className="text-hairline-strong" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-[0.75rem] text-ink-muted">
            {new Date(req.requested_at).toLocaleString()}
          </span>
        </div>
      </header>

      <Hairline className="mt-8 sm:mt-10" />

      {/* Two-column split */}
      <div className="mt-8 grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr),minmax(0,560px)] xl:gap-12 sm:mt-10">
        <div className="min-w-0 space-y-10 sm:space-y-12">
          <section>
            <ReviewerCard
              pass={req.reviewer_pass}
              notes={req.reviewer_notes}
              flags={req.reviewer_flags ?? []}
              model={req.reviewer_model}
            />
          </section>

          <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
            <PartyCard
              label="Insured"
              name={client?.business_name ?? 'Unknown client'}
              address1={client?.business_address1}
              address2={client?.business_address2}
            />
            <PartyCard
              label="Certificate holder"
              name={req.holder_name}
              address1={req.holder_address1}
              address2={req.holder_address2}
            />
          </section>

          <section>
            <Hairline label="Coverages selected" className="mb-5" />
            <Card padding="none" className="overflow-hidden">
              <ul className="divide-y divide-hairline">
                {(coverages ?? []).map((c) => (
                  <li key={c.id} className="px-5 py-5 sm:px-6">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">
                        {TYPE_LABEL[c.type] ?? c.type}
                      </span>
                      <span className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
                        {c.type}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.78rem] text-ink-muted">
                      <span>{c.insurer?.name ?? 'Unknown insurer'}</span>
                      <span className="text-hairline-strong" aria-hidden="true">·</span>
                      <MonoTag size="sm" tone="subtle">
                        {c.policy_number}
                      </MonoTag>
                      <span className="text-hairline-strong" aria-hidden="true">·</span>
                      <span className="font-mono">
                        {formatDate(c.eff_date)} → {formatDate(c.exp_date)}
                      </span>
                    </div>
                    {(c.addl_insured_blanket || c.subrogation_waived || c.description) && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.addl_insured_blanket && (
                          <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                            <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
                            AI · blanket
                          </span>
                        )}
                        {c.subrogation_waived && (
                          <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                            <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
                            WoS
                          </span>
                        )}
                        {c.description && (
                          <span className="rounded-[3px] border border-hairline-strong bg-card px-2 py-0.5 text-[0.72rem] text-ink-muted">
                            {c.description}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* Mobile-only PDF preview button — opens fullscreen sheet */}
          {previewUrl && (
            <div className="xl:hidden">
              <PdfPreviewPanel
                previewUrl={previewUrl}
                downloadUrl={downloadUrl ?? previewUrl}
                certNumber={req.cert_number}
                variant="mobile"
              />
            </div>
          )}

          <section>
            {canDecide ? (
              <DecisionForm
                requestId={req.id}
                clientId={client?.id ?? ''}
                currentHolder={{
                  name: req.holder_name,
                  address1: req.holder_address1,
                  address2: req.holder_address2 ?? '',
                }}
                currentInsured={{
                  name: client?.business_name ?? '',
                  address1: client?.business_address1 ?? '',
                  address2: client?.business_address2 ?? '',
                }}
                currentAgency={{
                  name: agency?.name ?? '',
                  address1: agency?.address1 ?? '',
                  address2: agency?.address2 ?? '',
                  contactName: agency?.contact_name ?? '',
                  phone: agency?.phone ?? '',
                  fax: agency?.fax ?? '',
                  email: agency?.email ?? '',
                }}
                currentCoverages={(coverages ?? []).map(
                  (c): EditableCoverage => ({
                    policyId: c.id,
                    type: c.type,
                    policyNumber: c.policy_number,
                    effDate: c.eff_date,
                    expDate: c.exp_date,
                    addlInsuredBlanket: c.addl_insured_blanket,
                    subrogationWaived: c.subrogation_waived,
                    description: c.description ?? '',
                    limits: c.limits_jsonb ?? {},
                    insurerName: c.insurer?.name ?? '',
                    insurerNaic: c.insurer?.naic ?? '',
                  }),
                )}
                currentCertOverrides={req.cert_overrides ?? {}}
              />
            ) : canRetrySend ? (
              <RetrySend requestId={req.id} />
            ) : (
              <Card padding="md" surface="paper" bordered>
                <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint">
                  Closed
                </p>
                <p className="mt-2 text-[0.875rem] leading-[1.55] text-ink">
                  This request is{' '}
                  <span className="font-semibold text-ink">{req.status}</span> — no further action
                  needed.
                </p>
              </Card>
            )}

            <div className="mt-10 border-t border-hairline pt-6">
              <p className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
                Danger zone
              </p>
              <div className="mt-3">
                <DeleteRequest requestId={req.id} certNumber={req.cert_number} />
              </div>
            </div>
          </section>
        </div>

        {/* Right column: sticky PDF preview (desktop only) */}
        <aside className="hidden min-w-0 xl:sticky xl:top-28 xl:block xl:self-start">
          <Hairline label="PDF preview" className="mb-4" />
          {previewUrl ? (
            <PdfPreviewPanel
              previewUrl={previewUrl}
              downloadUrl={downloadUrl ?? previewUrl}
              certNumber={req.cert_number}
              variant="desktop"
            />
          ) : (
            <Banner
              tone="warning"
              icon={<FileText className="h-4 w-4" aria-hidden="true" />}
              title="No PDF on file"
            >
              The cert record has no{' '}
              <code className="font-mono text-[0.78rem]">pdf_storage_path</code>. The submit
              pipeline may have failed mid-flight. Investigate before approving.
            </Banner>
          )}
        </aside>
      </div>
    </PageShell>
  );
}

function PartyCard({
  label,
  name,
  address1,
  address2,
}: {
  label: string;
  name: string;
  address1?: string | null;
  address2?: string | null;
}) {
  return (
    <div>
      <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint">{label}</p>
      <p className="font-display mt-2.5 text-[1.3rem] font-medium leading-[1.15] tracking-tight text-ink sm:text-[1.5rem]">
        {name}
      </p>
      {address1 && (
        <p className="mt-3 font-mono text-[0.78rem] leading-[1.55] text-ink-muted">
          {address1}
          {address2 && (
            <>
              <br />
              {address2}
            </>
          )}
        </p>
      )}
    </div>
  );
}

function ReviewerCard({
  pass,
  notes,
  flags,
  model,
}: {
  pass: boolean | null;
  notes: string | null;
  flags: { field: string; severity: 'error' | 'warning' | 'info'; message: string }[];
  model: string | null;
}) {
  if (pass === null) {
    return (
      <Card padding="md">
        <p className="caps flex items-center gap-2 text-[0.65rem] font-semibold tracking-[0.18em] text-ink-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-muted opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-muted" />
          </span>
          AI review · running
        </p>
        <p className="mt-3 text-[0.875rem] leading-[1.55] text-ink-muted">
          The reviewer is checking this request now. Reload in a moment.
        </p>
      </Card>
    );
  }

  const hasError = flags.some((f) => f.severity === 'error');
  const hasWarning = flags.some((f) => f.severity === 'warning');
  const tone = hasError ? 'danger' : hasWarning || !pass ? 'warning' : 'success';
  const label = hasError ? 'Needs attention' : hasWarning || !pass ? 'Warnings' : 'All clear';
  const dotClass =
    tone === 'danger' ? 'bg-danger' : tone === 'warning' ? 'bg-warning' : 'bg-success';
  const titleClass =
    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-success';

  return (
    <Card padding="md" tone={tone}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
          <p className={`caps text-[0.65rem] font-semibold tracking-[0.18em] ${titleClass}`}>
            AI review · {label}
          </p>
        </div>
        {model && (
          <span className="font-mono text-[0.7rem] text-ink-faint">{model}</span>
        )}
      </div>
      {notes && (
        <p className="mt-4 text-[0.875rem] leading-[1.55] text-ink">{notes}</p>
      )}
      {flags.length > 0 && (
        <ul className="mt-5 space-y-3 border-t border-hairline pt-4">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-3 text-[0.875rem]">
              <SeverityChip severity={f.severity} />
              <div className="min-w-0 flex-1">
                {f.field && (
                  <span className="font-mono text-[0.72rem] text-ink-faint">{f.field}</span>
                )}
                <p className="mt-0.5 leading-[1.55] text-ink">{f.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SeverityChip({ severity }: { severity: 'error' | 'warning' | 'info' }) {
  const map = {
    error: { bg: 'bg-danger', text: 'text-white', label: 'Error' },
    warning: { bg: 'bg-warning', text: 'text-white', label: 'Warn' },
    info: { bg: 'bg-ink-muted', text: 'text-white', label: 'Info' },
  } as const;
  const s = map[severity];
  return (
    <span
      className={`caps mt-0.5 inline-flex shrink-0 items-center rounded-[3px] px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-[0.16em] ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}
