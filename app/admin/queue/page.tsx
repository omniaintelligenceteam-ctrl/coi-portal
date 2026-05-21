import { CheckCircle2, Inbox, XCircle } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { CountUp } from '@/app/components/motion';
import { Banner, EmptyState, PageHeader, PageShell } from '@/app/components/ui';
import { QueueTable, type QueueRow } from './QueueTable';

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const sp = await searchParams;
  const deletedFlash = sp.deleted === '1';

  const supabase = createAdminClient();
  const { data: requests, error: fetchError } = await supabase
    .from('cert_requests')
    .select(
      `id, cert_number, holder_name, status, requested_at,
       reviewer_pass, reviewer_flags,
       confidence_score, auto_approve_lane, holdback_until, intercepted_at,
       client:coi_clients ( business_name )`,
    )
    .in('status', ['pending', 'reviewed'])
    .order('requested_at', { ascending: true })
    .returns<QueueRow[]>();

  const rows = requests ?? [];
  const hasFetchError = Boolean(fetchError);

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
            Approval ledger
          </>
        }
        title="Requests awaiting review"
        subtitle="Pending and reviewed requests, sorted oldest first."
        meta={
          <span className="num-tabular inline-flex items-center gap-2 font-mono text-[0.875rem] text-ink-muted">
            {rows.length === 0 ? '0' : <CountUp value={rows.length} />} open
          </span>
        }
      />

      {deletedFlash && (
        <div className="mt-6">
          <Banner tone="seal" title="Request deleted">
            The request was removed from the queue. Nothing was sent.
          </Banner>
        </div>
      )}

      <div className="mt-8 sm:mt-10">
        {hasFetchError ? (
          <EmptyState
            tone="default"
            icon={<XCircle className="h-6 w-6 text-danger" aria-hidden="true" />}
            eyebrow="Couldn't load"
            title="Couldn't load the queue."
            description="The database call returned an error. Refresh the page; if it keeps failing, check the Supabase logs."
            className="border-danger/30 bg-danger-soft/30"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            tone="seal"
            icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
            eyebrow={
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-seal" aria-hidden="true" />
                Queue clear
              </>
            }
            title="Nothing waiting."
            description="New requests will appear here the moment a client submits one."
          />
        ) : (
          <QueueTable rows={rows} />
        )}
      </div>

      <Hairline className="mt-16" />
      <p className="caps mt-5 flex items-center gap-2 text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
        <Inbox className="h-3 w-3" aria-hidden="true" />
        Showing pending and reviewed requests only · Sorted oldest first
      </p>
    </PageShell>
  );
}
