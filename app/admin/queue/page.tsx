import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type QueueRow = {
  id: string;
  cert_number: string;
  holder_name: string;
  status: 'pending' | 'reviewed' | 'approved' | 'edited' | 'rejected' | 'sent';
  requested_at: string;
  reviewer_pass: boolean | null;
  reviewer_flags: { severity: 'error' | 'warning' | 'info' }[];
  client: { business_name: string } | null;
};

const STATUS_STYLE: Record<QueueRow['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  reviewed: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  edited: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  sent: 'bg-slate-100 text-slate-600',
};

function flagCounts(flags: QueueRow['reviewer_flags']): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const f of flags) {
    if (f.severity === 'error') errors++;
    else if (f.severity === 'warning') warnings++;
  }
  return { errors, warnings };
}

function relativeTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function QueuePage() {
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from('cert_requests')
    .select(
      `id, cert_number, holder_name, status, requested_at,
       reviewer_pass, reviewer_flags,
       client:coi_clients ( business_name )`,
    )
    .in('status', ['pending', 'reviewed'])
    .order('requested_at', { ascending: true })
    .returns<QueueRow[]>();

  const rows = requests ?? [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Approval Queue</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length === 0
              ? 'All caught up'
              : `${rows.length} ${rows.length === 1 ? 'request' : 'requests'} waiting`}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-14 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
            <CheckCircleIcon className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm font-medium text-slate-700">Nothing in the queue</p>
          <p className="text-xs text-slate-400 mt-1">New requests will appear here when clients submit them.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <Th>Cert #</Th>
                <Th>Client</Th>
                <Th>Holder</Th>
                <Th>Status</Th>
                <Th>AI Review</Th>
                <Th>Received</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const counts = flagCounts(r.reviewer_flags ?? []);
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <Td>
                      <span className="font-mono text-xs text-slate-500">{r.cert_number}</span>
                    </Td>
                    <Td>
                      <span className="font-medium text-sm text-slate-800">
                        {r.client?.business_name ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-sm text-slate-700">{r.holder_name}</span>
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </Td>
                    <Td>
                      {r.reviewer_pass === null ? (
                        <span className="text-xs text-slate-400 italic">Running…</span>
                      ) : r.reviewer_pass && counts.errors === 0 && counts.warnings === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                          <CheckCircleIcon className="h-3.5 w-3.5" /> Clean
                        </span>
                      ) : (
                        <span className="text-xs">
                          {counts.errors > 0 && (
                            <span className="font-semibold text-red-600">
                              {counts.errors} error{counts.errors > 1 ? 's' : ''}
                            </span>
                          )}
                          {counts.errors > 0 && counts.warnings > 0 && (
                            <span className="text-slate-300 mx-1">·</span>
                          )}
                          {counts.warnings > 0 && (
                            <span className="text-amber-600">
                              {counts.warnings} warn{counts.warnings > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-xs text-slate-400">{relativeTime(r.requested_at)}</span>
                    </Td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/queue/${r.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-kyblue-300 bg-white px-3 py-1.5 text-xs font-semibold text-kyblue-600 hover:bg-kyblue-50 hover:border-kyblue-400 transition-colors"
                      >
                        Review
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400"
    >
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 text-sm text-slate-900 ${className}`}>{children}</td>;
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
