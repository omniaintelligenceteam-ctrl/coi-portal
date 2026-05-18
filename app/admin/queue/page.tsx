import { createClient } from '@/lib/supabase/server';
import { Hairline } from '@/app/components/Hairline';
import { QueueTable, type QueueRow } from './QueueTable';

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
    <main className="mx-auto max-w-6xl px-6 pb-24 pt-12 sm:px-10 lg:pt-16">
      <header className="mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Approval Ledger</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
            Requests awaiting review
          </h1>
          <span className="font-mono text-sm text-ink-muted">
            {rows.length === 0 ? '0 open' : `${rows.length} open`}
          </span>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <QueueTable rows={rows} />
      )}

      <Hairline className="mt-16" />
      <p className="caps mt-5 text-[0.6rem] font-medium text-ink-faint">
        Showing pending and reviewed requests only · Sorted oldest first
      </p>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden border border-hairline bg-card px-8 py-20 text-center sm:py-24">
      <div
        aria-hidden="true"
        className="absolute -right-20 -top-20 h-72 w-72 rounded-full border-[6px] border-seal/15"
      />
      <div className="relative">
        <div className="caps inline-flex items-center gap-2 rounded-full border border-seal/30 bg-seal-soft px-3 py-1 text-[0.62rem] font-semibold text-seal-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-seal" />
          Queue clear
        </div>
        <h2 className="font-display mt-6 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          Nothing waiting.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          New requests will appear here the moment a client submits.
        </p>
      </div>
    </div>
  );
}
