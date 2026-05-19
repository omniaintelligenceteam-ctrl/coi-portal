import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Hairline } from '@/app/components/Hairline';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function ExportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <Link
        href="/admin/queue"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to queue
      </Link>

      <header className="mt-6 mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Compliance Audit</p>
        <h1 className="font-display mt-3 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          Export certificates.
        </h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          Download a CSV of all certificates matching your filters. Covers cert number, insured,
          holder, status, and timestamps — ready to hand to a lawyer or auditor.
        </p>
      </header>

      <Hairline className="mb-10" />

      <ExportForm />

      <div className="mt-16 border-t border-hairline pt-8">
        <p className="caps mb-4 text-[0.6rem] font-medium text-ink-faint">Other admin tools</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/import-policy"
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep/40"
          >
            Import a policy (AI intake)
          </Link>
          <Link
            href="/admin/queue"
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep/40"
          >
            Approval queue
          </Link>
        </div>
      </div>
    </main>
  );
}

// Client form — inline since it's small and has no heavy deps
function ExportForm() {
  return (
    <form action="/api/admin/export-certs" method="GET" className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="holderName" className="caps block text-[0.62rem] font-semibold text-ink-muted">
            Holder name (partial match)
          </label>
          <input
            id="holderName"
            name="holderName"
            type="text"
            placeholder="Sheffer Construction"
            className="field-underline mt-2 block w-full text-base text-ink"
          />
        </div>
        <div>
          <label htmlFor="status" className="caps block text-[0.62rem] font-semibold text-ink-muted">
            Status filter
          </label>
          <select
            id="status"
            name="status"
            className="field-underline mt-2 block w-full appearance-none bg-transparent text-base text-ink"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <label htmlFor="dateFrom" className="caps block text-[0.62rem] font-semibold text-ink-muted">
            Requested from
          </label>
          <input
            id="dateFrom"
            name="dateFrom"
            type="date"
            className="field-underline mt-2 block w-full text-base text-ink"
          />
        </div>
        <div>
          <label htmlFor="dateTo" className="caps block text-[0.62rem] font-semibold text-ink-muted">
            Requested to
          </label>
          <input
            id="dateTo"
            name="dateTo"
            type="date"
            className="field-underline mt-2 block w-full text-base text-ink"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          className="focus-ring inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-brand-deep"
        >
          <DownloadIcon className="h-4 w-4" />
          Download CSV
        </button>
        <p className="caps mt-3 text-[0.6rem] font-medium text-ink-faint">
          Max 5,000 rows · sorted newest first
        </p>
      </div>
    </form>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
