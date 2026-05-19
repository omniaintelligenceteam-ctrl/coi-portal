import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { MonoTag } from '@/app/components/MonoTag';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { buildCertFilename, createCertSignedUrl } from '@/lib/storage';
import { DecisionForm } from './DecisionForm';
import { RetrySend } from './RetrySend';
import { DeleteRequest } from './DeleteRequest';

export const dynamic = 'force-dynamic';

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
  client: {
    id: string;
    business_name: string;
    business_address1: string | null;
    business_address2: string | null;
  } | null;
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: req } = await supabase
    .from('cert_requests')
    .select(
      `id, cert_number, holder_name, holder_address1, holder_address2,
       coverages_selected, status, pdf_storage_path,
       reviewer_pass, reviewer_flags, reviewer_notes, reviewer_model,
       requested_at, requested_by_email,
       client:coi_clients ( id, business_name, business_address1, business_address2 )`,
    )
    .eq('id', id)
    .maybeSingle<RequestDetail>();

  if (!req) notFound();

  const policyIds = req.coverages_selected ?? [];
  const { data: coverages } = policyIds.length
    ? await supabase
        .from('policies')
        .select(
          `id, type, policy_number, eff_date, exp_date,
           addl_insured_blanket, subrogation_waived, description,
           insurer:insurers ( name, naic )`,
        )
        .in('id', policyIds)
        .returns<CoverageDetail[]>()
    : { data: [] as CoverageDetail[] };

  const canDecide = req.status === 'pending' || req.status === 'reviewed';
  // approved/edited means Brook already decided but the email didn't finish —
  // surface a retry instead of pretending the cert is "closed".
  const canRetrySend = req.status === 'approved' || req.status === 'edited';

  // Mint signed URL for inline PDF preview (private bucket → service-role).
  let previewUrl: string | null = null;
  let downloadUrl: string | null = null;
  if (req.pdf_storage_path) {
    try {
      const admin = createAdminClient();
      const filename = buildCertFilename(
        req.cert_number,
        req.holder_name,
        req.requested_at,
      );
      [previewUrl, downloadUrl] = await Promise.all([
        createCertSignedUrl(admin, req.pdf_storage_path),
        createCertSignedUrl(admin, req.pdf_storage_path, { downloadFilename: filename }),
      ]);
    } catch (err) {
      console.error('signed URL mint failed (admin queue detail):', err);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <Link
        href="/admin/queue"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to queue
      </Link>

      {/* Document-style header — spans full width above the split */}
      <header className="mt-8">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Certificate of Insurance</p>
        <h1 className="mt-3 font-mono text-[2.25rem] font-medium leading-none tabular-nums text-ink sm:text-[2.75rem]">
          {req.cert_number}
        </h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusPill status={req.status} size="md" />
          <span className="caps text-[0.6rem] font-medium text-ink-faint">
            Requested by
          </span>
          <span className="font-mono text-[0.75rem] text-ink">{req.requested_by_email}</span>
          <span className="text-hairline-strong">·</span>
          <span className="font-mono text-[0.75rem] text-ink-muted">
            {new Date(req.requested_at).toLocaleString()}
          </span>
        </div>
      </header>

      <Hairline className="mt-10" />

      {/* Two-column split: details/decision left, sticky PDF preview right */}
      <div className="mt-10 grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,1fr),minmax(0,560px)]">
        <div className="min-w-0">
          {/* AI Reviewer card */}
          <section>
            <ReviewerCard
              pass={req.reviewer_pass}
              notes={req.reviewer_notes}
              flags={req.reviewer_flags ?? []}
              model={req.reviewer_model}
            />
          </section>

          {/* Insured + Holder */}
          <section className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2">
            <PartyCard
              label="Insured"
              name={req.client?.business_name ?? 'Unknown client'}
              address1={req.client?.business_address1}
              address2={req.client?.business_address2}
            />
            <PartyCard
              label="Certificate Holder"
              name={req.holder_name}
              address1={req.holder_address1}
              address2={req.holder_address2}
            />
          </section>

          {/* Coverages */}
          <section className="mt-14">
            <Hairline label="Coverages selected" className="mb-6" />
            <ul className="divide-y divide-hairline border-y border-hairline">
              {(coverages ?? []).map((c) => (
                <li key={c.id} className="py-5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">
                      {TYPE_LABEL[c.type] ?? c.type}
                    </span>
                    <span className="caps text-[0.6rem] font-medium text-ink-faint">{c.type}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.78rem] text-ink-muted">
                    <span>{c.insurer?.name ?? 'Unknown insurer'}</span>
                    <span className="text-hairline-strong">·</span>
                    <MonoTag size="sm" tone="subtle">{c.policy_number}</MonoTag>
                    <span className="text-hairline-strong">·</span>
                    <span className="font-mono">
                      {formatDate(c.eff_date)} → {formatDate(c.exp_date)}
                    </span>
                  </div>
                  {(c.addl_insured_blanket || c.subrogation_waived || c.description) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {c.addl_insured_blanket && (
                        <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                          <span className="h-1 w-1 rounded-full bg-seal" />
                          AI · blanket
                        </span>
                      )}
                      {c.subrogation_waived && (
                        <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                          <span className="h-1 w-1 rounded-full bg-seal" />
                          WoS
                        </span>
                      )}
                      {c.description && (
                        <span className="rounded-[3px] border border-hairline-strong bg-white px-2 py-0.5 text-[0.7rem] text-ink-muted">
                          {c.description}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Decision form, retry CTA, or resolved state */}
          <section className="mt-14">
            {canDecide ? (
              <DecisionForm
                requestId={req.id}
                clientId={req.client?.id ?? ''}
                currentHolder={{
                  name: req.holder_name,
                  address1: req.holder_address1,
                  address2: req.holder_address2 ?? '',
                }}
              />
            ) : canRetrySend ? (
              <RetrySend requestId={req.id} />
            ) : (
              <div className="border-l-2 border-hairline-strong pl-5">
                <p className="caps text-[0.62rem] font-semibold text-ink-faint">Closed</p>
                <p className="mt-2 text-sm leading-relaxed text-ink">
                  This request is{' '}
                  <span className="font-semibold text-ink">{req.status}</span> — no further action
                  needed.
                </p>
              </div>
            )}

            {/* Destructive escape hatch — admin can purge any row (e.g. spam,
                test submissions, duplicates). client_overrides.source_request_id
                is ON DELETE SET NULL and coi_audit is independent, so the
                institutional memory + sent-cert audit trail survive. */}
            <div className="mt-10 border-t border-hairline pt-6">
              <p className="caps text-[0.6rem] font-medium text-ink-faint">Danger zone</p>
              <div className="mt-3">
                <DeleteRequest requestId={req.id} certNumber={req.cert_number} />
              </div>
            </div>
          </section>
        </div>

        {/* Right column: sticky PDF preview */}
        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <Hairline label="PDF preview" className="mb-4" />
          {previewUrl ? (
            <>
              <div className="border border-hairline bg-card">
                <iframe
                  src={previewUrl}
                  title={`Certificate ${req.cert_number} preview`}
                  className="block h-[60vh] min-h-[400px] w-full xl:h-[760px]"
                />
              </div>
              {/* Mobile escape hatch — PDFs frequently render small in iframes
                  on phones; a direct link guarantees the reviewer can always
                  see the document at full size. */}
              <p className="caps mt-2 text-[0.6rem] font-medium text-ink-faint xl:hidden">
                {previewUrl && (
                  <a
                    href={downloadUrl ?? previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand hover:underline"
                  >
                    Open PDF in a new tab →
                  </a>
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="caps text-[0.58rem] font-medium text-ink-faint">
                  Holder + signature reflect the current row · re-rendered on send
                </p>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-white px-3 py-1.5 text-[0.72rem] font-semibold text-ink transition-colors hover:bg-paper-deep/40"
                  >
                    Download
                    <ArrowDown className="h-3 w-3" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="border border-warning/30 bg-warning-soft/40 px-5 py-6">
              <p className="caps text-[0.6rem] font-semibold text-warning">No PDF on file</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                The cert record has no <code className="font-mono text-[0.78rem]">pdf_storage_path</code>.
                The submit pipeline may have failed mid-flight. Investigate before approving.
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
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
      <p className="caps text-[0.62rem] font-semibold text-ink-faint">{label}</p>
      <p className="font-display mt-3 text-[1.4rem] font-medium leading-tight tracking-tight text-ink">
        {name}
      </p>
      {address1 && (
        <p className="mt-3 font-mono text-[0.78rem] leading-relaxed text-ink-muted">
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
      <div className="border border-hairline bg-card px-6 py-5">
        <p className="caps flex items-center gap-2 text-[0.65rem] font-semibold text-ink-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-muted opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-muted" />
          </span>
          AI Review · running
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          The reviewer is checking this request now. Reload in a moment.
        </p>
      </div>
    );
  }

  const hasError = flags.some((f) => f.severity === 'error');
  const hasWarning = flags.some((f) => f.severity === 'warning');

  const tone: {
    border: string;
    bg: string;
    dot: string;
    title: string;
    label: string;
  } = hasError
    ? {
        border: 'border-danger/40',
        bg: 'bg-danger-soft/40',
        dot: 'bg-danger',
        title: 'text-danger',
        label: 'Needs attention',
      }
    : hasWarning || !pass
    ? {
        border: 'border-warning/40',
        bg: 'bg-warning-soft/30',
        dot: 'bg-warning',
        title: 'text-warning',
        label: 'Warnings',
      }
    : {
        border: 'border-success/30',
        bg: 'bg-success-soft/30',
        dot: 'bg-success',
        title: 'text-success',
        label: 'All clear',
      };

  return (
    <div className={`border ${tone.border} ${tone.bg} px-6 py-5`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          <p className={`caps text-[0.65rem] font-semibold ${tone.title}`}>
            AI Review · {tone.label}
          </p>
        </div>
        {model && (
          <span className="font-mono text-[0.68rem] text-ink-faint">{model}</span>
        )}
      </div>
      {notes && (
        <p className="mt-4 text-sm leading-relaxed text-ink">{notes}</p>
      )}
      {flags.length > 0 && (
        <ul className="mt-5 space-y-3 border-t border-hairline pt-4">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <SeverityChip severity={f.severity} />
              <div className="min-w-0 flex-1">
                {f.field && (
                  <span className="font-mono text-[0.72rem] text-ink-faint">
                    {f.field}
                  </span>
                )}
                <p className="mt-0.5 leading-relaxed text-ink">{f.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
      className={`caps mt-0.5 inline-flex shrink-0 items-center rounded-[3px] px-1.5 py-0.5 text-[0.55rem] font-semibold ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function ArrowDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}
