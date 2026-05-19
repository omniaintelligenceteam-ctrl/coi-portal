import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/app/components/Header';
import { Hairline } from '@/app/components/Hairline';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { createClient } from '@/lib/supabase/server';
import { ReissueButton } from './ReissueButton';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  cert_number: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  status: CertStatus;
  requested_at: string;
  sent_at: string | null;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function CertificatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  // RLS restricts cert_requests to the authenticated client's own rows.
  const { data: rows, error: fetchError } = await supabase
    .from('cert_requests')
    .select('id, cert_number, holder_name, holder_address1, holder_address2, status, requested_at, sent_at')
    .order('requested_at', { ascending: false })
    .returns<Row[]>();

  const list = rows ?? [];
  // Distinguish "no certs yet" from "fetch broke" — the empty state lies if
  // there's a real DB/RLS error and rows came back null.
  const hasFetchError = Boolean(fetchError);

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-12 sm:px-10 lg:pt-16">
        <Link
          href="/"
          className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          New request
        </Link>

        <header className="mt-6 mb-10">
          <p className="caps text-[0.65rem] font-semibold text-seal-deep">My certificates</p>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
            <h1 className="font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3rem]">
              Every certificate, all in one place.
            </h1>
            <span className="font-mono text-sm text-ink-muted">
              {list.length === 0 ? '0 on file' : `${list.length} on file`}
            </span>
          </div>
        </header>

        {hasFetchError && list.length === 0 ? (
          <FetchErrorState />
        ) : list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto border-y border-hairline">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-hairline">
                  <Th>Certificate</Th>
                  <Th>Holder</Th>
                  <Th>Status</Th>
                  <Th align="right">Requested</Th>
                  <Th align="right">Sent</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr
                    key={r.id}
                    className="group border-b border-hairline last:border-b-0 transition-colors hover:bg-paper-deep/50"
                  >
                    <Td>
                      <Link
                        href={`/result/${r.cert_number}`}
                        className="focus-ring -m-1 inline-block rounded p-1 font-mono text-[0.78rem] font-medium text-ink"
                      >
                        {r.cert_number}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-[0.9rem] text-ink">{r.holder_name}</span>
                    </Td>
                    <Td>
                      <StatusPill status={r.status} />
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-[0.75rem] text-ink-muted">
                        {formatDateTime(r.requested_at)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="font-mono text-[0.75rem] text-ink-faint">
                        {r.sent_at ? formatDateTime(r.sent_at) : '—'}
                      </span>
                    </Td>
                    <td className="py-4 pl-3 pr-2 text-right align-middle">
                      <div className="flex items-center justify-end gap-3">
                        {r.status === 'sent' && (
                          <ReissueButton
                            name={r.holder_name}
                            address1={r.holder_address1}
                            address2={r.holder_address2 ?? ''}
                          />
                        )}
                        <Link
                          href={`/result/${r.cert_number}`}
                          className="focus-ring inline-flex items-center gap-1 rounded text-[0.78rem] font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          Open
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Hairline className="mt-16" />
        <p className="caps mt-5 text-[0.6rem] font-medium text-ink-faint">
          Sorted newest first · Click any row to view status, preview, or download
        </p>
      </main>
    </>
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
        Your certificates aren't loading right now.
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        This usually clears in a minute. Refresh the page, and if it still
        won't load, email{' '}
        <a
          href="mailto:brook@thepolicyplace.com"
          className="font-medium text-brand underline-offset-2 hover:underline"
        >
          brook@thepolicyplace.com
        </a>
        .
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
          Nothing yet
        </div>
        <h2 className="font-display mt-6 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          No certificates on file.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Once you submit a request, it'll show up here with its status, preview, and download.
        </p>
        <Link
          href="/"
          className="focus-ring mt-8 inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-deep"
        >
          Request a certificate
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`caps px-3 py-3 text-[0.6rem] font-semibold text-ink-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td className={`px-3 py-4 align-middle ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </td>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}
