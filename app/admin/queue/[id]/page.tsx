import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DecisionForm } from './DecisionForm';

type RequestDetail = {
  id: string;
  cert_number: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  coverages_selected: string[];
  status: 'pending' | 'reviewed' | 'approved' | 'edited' | 'rejected' | 'sent';
  reviewer_pass: boolean | null;
  reviewer_flags: { field: string; severity: string; message: string }[];
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

const STATUS_STYLE: Record<RequestDetail['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  edited: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  sent: 'bg-slate-100 text-slate-600',
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

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      {/* Breadcrumb + heading */}
      <div className="mb-6">
        <Link
          href="/admin/queue"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to queue
        </Link>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-slate-900 font-mono">{req.cert_number}</h1>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[req.status]}`}
          >
            {req.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Requested by {req.requested_by_email} ·{' '}
          {new Date(req.requested_at).toLocaleString()}
        </p>
      </div>

      {/* AI Reviewer card */}
      <ReviewerCard
        pass={req.reviewer_pass}
        notes={req.reviewer_notes}
        flags={req.reviewer_flags ?? []}
        model={req.reviewer_model}
      />

      {/* Insured + Holder — 2-col */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoCard label="Insured">
          <p className="font-semibold text-slate-900">
            {req.client?.business_name ?? 'Unknown client'}
          </p>
          {req.client?.business_address1 && (
            <p className="text-sm text-slate-500 mt-0.5">
              {req.client.business_address1}
              {req.client.business_address2 ? `, ${req.client.business_address2}` : ''}
            </p>
          )}
        </InfoCard>

        <InfoCard label="Certificate Holder">
          <p className="font-semibold text-slate-900">{req.holder_name}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {req.holder_address1}
            {req.holder_address2 ? `, ${req.holder_address2}` : ''}
          </p>
        </InfoCard>
      </div>

      {/* Coverages */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm p-5">
        <SectionLabel>Coverages selected</SectionLabel>
        <div className="mt-3 space-y-2">
          {(coverages ?? []).map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-slate-900">{c.type}</span>
                <span className="font-mono text-xs text-slate-400">{c.policy_number}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {c.insurer?.name ?? 'Unknown insurer'} · {formatDate(c.eff_date)} —{' '}
                {formatDate(c.exp_date)}
              </p>
              {(c.addl_insured_blanket || c.subrogation_waived || c.description) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.addl_insured_blanket && (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      AI: blanket
                    </span>
                  )}
                  {c.subrogation_waived && (
                    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      WoS
                    </span>
                  )}
                  {c.description && (
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {c.description}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Decision form or resolved state */}
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
      ) : (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          This request is{' '}
          <span className="font-semibold text-slate-800">{req.status}</span> — no further
          action needed.
        </div>
      )}
    </main>
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
  flags: { field: string; severity: string; message: string }[];
  model: string | null;
}) {
  if (pass === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500 italic">
        AI reviewer still running…
      </div>
    );
  }

  const hasError = flags.some((f) => f.severity === 'error');
  const tone = hasError
    ? 'border-red-200 bg-red-50'
    : pass
      ? 'border-green-200 bg-green-50'
      : 'border-amber-200 bg-amber-50';

  const label = hasError ? 'Needs attention' : pass ? 'Clean' : 'Warnings';
  const labelColor = hasError ? 'text-red-800' : pass ? 'text-green-800' : 'text-amber-800';
  const iconColor = hasError ? 'text-red-600' : pass ? 'text-green-600' : 'text-amber-600';

  return (
    <div className={`rounded-xl border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {pass && !hasError ? (
            <CheckCircleIcon className={`h-5 w-5 shrink-0 ${iconColor}`} />
          ) : (
            <ExclamationIcon className={`h-5 w-5 shrink-0 ${iconColor}`} />
          )}
          <span className={`font-semibold text-sm ${labelColor}`}>
            AI Review: {label}
          </span>
        </div>
        {model && (
          <span className="text-xs text-slate-400 font-mono shrink-0">{model}</span>
        )}
      </div>
      {notes && (
        <p className="mt-2.5 text-sm text-slate-700 leading-relaxed">{notes}</p>
      )}
      {flags.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {flags.map((f, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm">
              <span
                className={`shrink-0 text-xs font-bold uppercase ${
                  f.severity === 'error'
                    ? 'text-red-700'
                    : f.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-slate-500'
                }`}
              >
                {f.severity}
              </span>
              <span className="font-mono text-xs text-slate-400">{f.field}</span>
              <span className="text-slate-700">{f.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</p>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
