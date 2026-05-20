import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, ChevronLeft, FileText, RotateCcw, XCircle } from 'lucide-react';
import { Header } from '@/app/components/Header';
import { Hairline } from '@/app/components/Hairline';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { CountUp } from '@/app/components/motion';
import { Banner, ButtonLink, EmptyState, PageHeader } from '@/app/components/ui';
import { createClient } from '@/lib/supabase/server';
import { DeleteCertButton } from './DeleteCertButton';

const CLIENT_DELETABLE: ReadonlySet<CertStatus> = new Set<CertStatus>([
  'pending',
  'reviewed',
  'rejected',
]);

const STAGGER_CAP = 8;
const STAGGER_MS = 50;
const rowReveal = (i: number) => ({
  className: 'row-reveal',
  style: {
    animationDelay: `${Math.min(i, STAGGER_CAP - 1) * STAGGER_MS}ms`,
  } as React.CSSProperties,
});

export const dynamic = 'force-dynamic';

const FLASH_MESSAGES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  not_found: { tone: 'error', text: "Couldn't find that request." },
  not_deletable: {
    tone: 'error',
    text: 'That certificate has already been sent or approved — only Brook can remove it.',
  },
  delete_failed: { tone: 'error', text: "Couldn't delete the request — try again." },
};

type Row = {
  id: string;
  cert_number: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  status: CertStatus;
  requested_at: string;
  sent_at: string | null;
  is_master: boolean;
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

export default async function CertificatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const flashKey =
    sp.deleted === '1'
      ? 'deleted'
      : sp.error && FLASH_MESSAGES[sp.error]
        ? sp.error
        : null;
  const flash =
    flashKey === 'deleted'
      ? { tone: 'ok' as const, text: 'Request deleted.' }
      : flashKey
        ? FLASH_MESSAGES[flashKey]
        : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data: rows, error: fetchError } = await supabase
    .from('cert_requests')
    .select(
      'id, cert_number, holder_name, holder_address1, holder_address2, status, requested_at, sent_at, is_master',
    )
    .order('requested_at', { ascending: false })
    .returns<Row[]>();

  const list = rows ?? [];
  const hasFetchError = Boolean(fetchError);

  return (
    <>
      <Header email={user.email} />
      <main className="mx-auto w-full max-w-5xl px-8 pb-24 pt-8 sm:px-12 sm:pt-12 lg:px-20 lg:pt-14 xl:px-32">
        <Link
          href="/"
          className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.65rem] font-medium tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          New request
        </Link>

        {flash && (
          <div className="mt-5">
            <Banner tone={flash.tone === 'ok' ? 'seal' : 'danger'}>{flash.text}</Banner>
          </div>
        )}

        <div className="mt-6">
          <PageHeader
            eyebrow={
              <>
                <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
                My certificates
              </>
            }
            title="Every certificate, all in one place."
            subtitle="Status, preview, and download — sorted newest first."
            meta={
              <span className="num-tabular inline-flex items-center gap-2 font-mono text-[0.875rem] text-ink-muted">
                {list.length === 0 ? '0' : <CountUp value={list.length} />} on file
              </span>
            }
          />
        </div>

        <div className="mt-8 sm:mt-10">
          {hasFetchError && list.length === 0 ? (
            <EmptyState
              tone="default"
              icon={<XCircle className="h-6 w-6 text-danger" aria-hidden="true" />}
              eyebrow="Couldn't load"
              title="Your certificates aren't loading right now."
              description="This usually clears in a minute. Refresh the page, and if it still won't load, email brook@yourpolicyplace.com."
              className="border-danger/30 bg-danger-soft/30"
            />
          ) : list.length === 0 ? (
            <EmptyState
              tone="seal"
              icon={<FileText className="h-6 w-6" aria-hidden="true" />}
              eyebrow={
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-seal" aria-hidden="true" />
                  Nothing yet
                </>
              }
              title="No certificates on file."
              description="Once you submit a request, it'll show up here with its status, preview, and download link."
              actions={
                <ButtonLink
                  href="/"
                  trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                >
                  Request a certificate
                </ButtonLink>
              }
            />
          ) : (
            <>
              {/* Mobile card stack */}
              <ul className="space-y-3 sm:hidden">
                {list.map((r, i) => (
                  <li
                    key={r.id}
                    className={`relative rounded-[var(--r-md)] border border-hairline bg-card p-4 shadow-card ${rowReveal(i).className}`}
                    style={rowReveal(i).style}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/result/${r.cert_number}`}
                          className="focus-ring num-tabular -m-1 inline-flex items-center gap-2 rounded p-1 font-mono text-[0.8rem] font-semibold text-ink"
                        >
                          {r.cert_number}
                          {r.is_master && (
                            <span className="caps inline-flex items-center rounded-[3px] border border-seal/30 bg-seal-soft px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-[0.16em] text-seal-deep">
                              Master
                            </span>
                          )}
                        </Link>
                        <p className="font-display mt-1.5 truncate text-[1.05rem] font-medium leading-[1.2] text-ink">
                          {r.holder_name}
                        </p>
                        <p className="num-tabular mt-1 font-mono text-[0.72rem] text-ink-faint">
                          {formatDateTime(r.requested_at)}
                        </p>
                      </div>
                      <StatusPill status={r.status} />
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      {r.status === 'sent' && (
                        <Link
                          href={`/?reissue=${encodeURIComponent(r.cert_number)}`}
                          aria-label={`Reissue certificate ${r.cert_number}`}
                          className="focus-ring caps tap-target inline-flex w-full items-center justify-center gap-2 rounded-md border border-seal/40 bg-seal-soft px-4 py-3 text-[0.7rem] font-semibold tracking-[0.16em] text-seal-deep transition-colors hover:border-seal hover:bg-seal/15"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Reissue
                        </Link>
                      )}
                      <ButtonLink
                        href={`/result/${r.cert_number}`}
                        size="md"
                        fullWidth
                        trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                      >
                        Open certificate
                      </ButtonLink>
                      {CLIENT_DELETABLE.has(r.status) && (
                        <DeleteCertButton
                          requestId={r.id}
                          certNumber={r.cert_number}
                          size="md"
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-[var(--r-md)] border border-hairline bg-card shadow-card sm:block">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-hairline bg-paper-deep/40">
                      <Th>Certificate</Th>
                      <Th>Holder</Th>
                      <Th>Status</Th>
                      <Th align="right">Requested</Th>
                      <Th align="right">Sent</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`group border-b border-hairline last:border-b-0 transition-colors hover:bg-paper-deep/40 ${rowReveal(i).className}`}
                        style={rowReveal(i).style}
                      >
                        <Td>
                          <Link
                            href={`/result/${r.cert_number}`}
                            className="focus-ring num-tabular -m-1 inline-flex items-center gap-2 rounded p-1 font-mono text-[0.78rem] font-medium text-ink"
                          >
                            {r.cert_number}
                            {r.is_master && (
                              <span className="caps inline-flex items-center rounded-[3px] border border-seal/30 bg-seal-soft px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-[0.16em] text-seal-deep">
                                Master
                              </span>
                            )}
                          </Link>
                        </Td>
                        <Td>
                          <span className="text-[0.9375rem] text-ink">{r.holder_name}</span>
                        </Td>
                        <Td>
                          <StatusPill status={r.status} />
                        </Td>
                        <Td align="right">
                          <span className="num-tabular font-mono text-[0.75rem] text-ink-muted">
                            {formatDateTime(r.requested_at)}
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="num-tabular font-mono text-[0.75rem] text-ink-faint">
                            {r.sent_at ? formatDateTime(r.sent_at) : '—'}
                          </span>
                        </Td>
                        <td className="py-4 pl-3 pr-3 text-right align-middle">
                          <div className="flex items-center justify-end gap-2.5">
                            {CLIENT_DELETABLE.has(r.status) && (
                              <DeleteCertButton
                                requestId={r.id}
                                certNumber={r.cert_number}
                              />
                            )}
                            {r.status === 'sent' && (
                              <Link
                                href={`/?reissue=${encodeURIComponent(r.cert_number)}`}
                                aria-label={`Reissue certificate ${r.cert_number}`}
                                className="focus-ring caps inline-flex items-center gap-1.5 rounded-md border border-seal/40 bg-seal-soft px-2.5 py-1.5 text-[0.62rem] font-semibold tracking-[0.16em] text-seal-deep transition-colors hover:border-seal hover:bg-seal/15"
                              >
                                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                Reissue
                              </Link>
                            )}
                            <Link
                              href={`/result/${r.cert_number}`}
                              className="focus-ring inline-flex items-center gap-1 rounded text-[0.78rem] font-semibold text-brand-deep opacity-0 transition-opacity group-hover:opacity-100"
                            >
                              Open
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <Hairline className="mt-16" />
        <p className="caps mt-5 text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
          Sorted newest first · Click any row to view status, preview, or download
        </p>
      </main>
    </>
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
      className={`caps px-3 py-3 text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint ${
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
