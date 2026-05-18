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

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link href="/admin/queue" className="text-sm text-gray-500 hover:text-gray-900">
          ← Queue
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          Cert <span className="font-mono">{req.cert_number}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Requested by {req.requested_by_email} ·{' '}
          {new Date(req.requested_at).toLocaleString()}
        </p>
      </div>

      <ReviewerCard
        pass={req.reviewer_pass}
        notes={req.reviewer_notes}
        flags={req.reviewer_flags ?? []}
        model={req.reviewer_model}
      />

      <section className="mt-8 rounded-md border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Insured</h2>
        <p className="mt-2 font-medium text-gray-900">
          {req.client?.business_name ?? 'Unknown client'}
        </p>
        {req.client?.business_address1 && (
          <p className="text-sm text-gray-600">
            {req.client.business_address1}
            {req.client.business_address2 ? `, ${req.client.business_address2}` : ''}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Holder requested
        </h2>
        <p className="mt-2 font-medium text-gray-900">{req.holder_name}</p>
        <p className="text-sm text-gray-600">
          {req.holder_address1}
          {req.holder_address2 ? `, ${req.holder_address2}` : ''}
        </p>
      </section>

      <section className="mt-6 rounded-md border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Coverages selected
        </h2>
        <ul className="mt-3 space-y-3">
          {(coverages ?? []).map((c) => (
            <li key={c.id} className="rounded border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{c.type}</span>
                <span className="font-mono text-xs text-gray-500">{c.policy_number}</span>
              </div>
              <div className="mt-1 text-sm text-gray-600">
                {c.insurer?.name ?? 'Unknown insurer'} · {formatDate(c.eff_date)} —{' '}
                {formatDate(c.exp_date)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {c.addl_insured_blanket && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                    AI: blanket
                  </span>
                )}
                {c.subrogation_waived && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">WoS</span>
                )}
                {c.description && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                    {c.description}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {req.pdf_storage_path && (
        <section className="mt-6 rounded-md border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">PDF</h2>
          <p className="mt-2 text-sm text-gray-600 font-mono">{req.pdf_storage_path}</p>
        </section>
      )}

      {(req.status === 'pending' || req.status === 'reviewed') ? (
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
        <div className="mt-8 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          This request is <span className="font-medium">{req.status}</span> — no further action.
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
      <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        Reviewer agent still running…
      </div>
    );
  }
  const hasError = flags.some((f) => f.severity === 'error');
  const tone = hasError
    ? 'border-red-200 bg-red-50'
    : pass
      ? 'border-green-200 bg-green-50'
      : 'border-amber-200 bg-amber-50';
  return (
    <div className={`rounded-md border p-4 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          Reviewer: {hasError ? 'needs attention' : pass ? 'clean' : 'warnings'}
        </span>
        {model && <span className="text-xs text-gray-500 font-mono">{model}</span>}
      </div>
      {notes && <p className="mt-2 text-sm text-gray-800">{notes}</p>}
      {flags.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {flags.map((f, i) => (
            <li key={i} className="text-sm">
              <span
                className={`inline-block w-16 text-xs font-semibold uppercase ${
                  f.severity === 'error'
                    ? 'text-red-700'
                    : f.severity === 'warning'
                      ? 'text-amber-700'
                      : 'text-gray-600'
                }`}
              >
                {f.severity}
              </span>{' '}
              <span className="font-mono text-xs text-gray-500">{f.field}</span>{' '}
              <span className="text-gray-800">{f.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
