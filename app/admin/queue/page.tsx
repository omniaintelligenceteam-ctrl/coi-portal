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
  rejected: 'bg-red-100 text-red-800',
  sent: 'bg-gray-100 text-gray-700',
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
  const then = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.round((now - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
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
        <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
        <span className="text-sm text-gray-500">
          {rows.length} {rows.length === 1 ? 'request' : 'requests'} waiting
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm text-gray-500">Nothing in the queue. All caught up.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>Cert #</Th>
                <Th>Client</Th>
                <Th>Holder</Th>
                <Th>Status</Th>
                <Th>Reviewer</Th>
                <Th>Requested</Th>
                <Th aria-label="actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((r) => {
                const counts = flagCounts(r.reviewer_flags ?? []);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <Td className="font-mono text-xs text-gray-700">{r.cert_number}</Td>
                    <Td>{r.client?.business_name ?? 'Unknown client'}</Td>
                    <Td>{r.holder_name}</Td>
                    <Td>
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </Td>
                    <Td>
                      {r.reviewer_pass === null ? (
                        <span className="text-xs text-gray-400">…running</span>
                      ) : r.reviewer_pass && counts.errors === 0 && counts.warnings === 0 ? (
                        <span className="text-xs text-green-700">✓ clean</span>
                      ) : (
                        <span className="text-xs">
                          {counts.errors > 0 && (
                            <span className="font-semibold text-red-700">
                              {counts.errors} error{counts.errors > 1 ? 's' : ''}
                            </span>
                          )}
                          {counts.errors > 0 && counts.warnings > 0 && (
                            <span className="text-gray-400"> · </span>
                          )}
                          {counts.warnings > 0 && (
                            <span className="text-amber-700">
                              {counts.warnings} warning{counts.warnings > 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs text-gray-500">{relativeTime(r.requested_at)}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/admin/queue/${r.id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-500"
                      >
                        Review →
                      </Link>
                    </Td>
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

function Th({ children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
      {...rest}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 text-sm text-gray-900 ${className}`}>{children}</td>;
}
