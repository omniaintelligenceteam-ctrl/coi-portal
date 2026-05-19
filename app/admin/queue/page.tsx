import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { CountUp } from '@/app/components/motion';
import { QueueTable, type QueueRow } from './QueueTable';

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const sp = await searchParams;
  const deletedFlash = sp.deleted === '1';

  // Admin pages bypass RLS — gate is the layout's ADMIN_EMAILS check. The
  // cert_requests_self_select policy only shows rows whose client contact_email
  // matches auth.email(), so admins viewing other clients' requests would see
  // an empty queue.
  const supabase = createAdminClient();
  const { data: requests, error: fetchError } = await supabase
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
  // Distinguish "queue is clear" from "fetch broke" — the empty state lies if
  // there's a real DB error and rows came back null.
  const hasFetchError = Boolean(fetchError);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <header className="mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Approval Ledger</p>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
          <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
            Requests awaiting review
          </h1>
          <span className="font-mono text-sm text-ink-muted">
            {rows.length === 0 ? '0 open' : <><CountUp value={rows.length} /> open</>}
          </span>
        </div>
      </header>

      {deletedFlash && (
        <div className="mb-8 border border-seal/40 bg-seal-soft/50 px-5 py-3 text-sm text-seal-deep">
          Request deleted.
        </div>
      )}

      {hasFetchError ? (
        <FetchErrorState />
      ) : rows.length === 0 ? (
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

function FetchErrorState() {
  return (
    <div className="relative overflow-hidden border border-danger/30 bg-danger/5 px-8 py-16 text-center sm:py-20">
      <div className="caps inline-flex items-center gap-2 rounded-full border border-danger/40 bg-white px-3 py-1 text-[0.62rem] font-semibold text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" />
        Couldn't load
      </div>
      <h2 className="font-display mt-6 text-[2rem] font-medium leading-[1.1] tracking-display text-ink">
        Couldn't load queue — try again.
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        The DB call returned an error. Refresh the page; if it keeps failing,
        check Supabase logs.
      </p>
    </div>
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
