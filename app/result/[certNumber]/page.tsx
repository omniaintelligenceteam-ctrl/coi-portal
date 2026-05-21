import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, ChevronLeft, Download, ExternalLink } from 'lucide-react';
import { Header } from '@/app/components/Header';
import { Hairline } from '@/app/components/Hairline';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { CopyButton } from '@/app/components/motion';
import { Banner, ButtonLink, Card, PageShell } from '@/app/components/ui';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildCertFilename, createCertSignedUrl } from '@/lib/storage';
import { AutoRefresh } from './AutoRefresh';
import { LifecycleTimeline } from './LifecycleTimeline';
import { PdfPreview } from './PdfPreview';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ certNumber: string }>;
};

type ReviewerFlag = { severity?: string; field?: string; message?: string };

type ResultRow = {
  id: string;
  cert_number: string;
  status: CertStatus;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  pdf_storage_path: string | null;
  decision_note: string | null;
  requested_at: string;
  requested_by_email: string | null;
  reviewed_at: string | null;
  reviewer_pass: boolean | null;
  reviewer_flags: ReviewerFlag[] | null;
  decided_at: string | null;
  decided_by_email: string | null;
  sent_at: string | null;
  client: { business_name: string } | null;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function ResultPage({ params }: PageProps) {
  const { certNumber } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data: req } = await supabase
    .from('cert_requests')
    .select(
      `id, cert_number, status, holder_name, holder_address1, holder_address2,
       pdf_storage_path, decision_note, requested_at, requested_by_email,
       reviewed_at, reviewer_pass, reviewer_flags,
       decided_at, decided_by_email, sent_at,
       client:coi_clients ( business_name )`,
    )
    .eq('cert_number', certNumber)
    .maybeSingle<ResultRow>();

  if (!req) notFound();

  let previewUrl: string | null = null;
  let downloadUrl: string | null = null;
  if (req.pdf_storage_path) {
    try {
      const admin = createAdminClient();
      const filename = buildCertFilename(
        req.cert_number,
        req.holder_name,
        req.sent_at ?? req.requested_at,
      );
      [previewUrl, downloadUrl] = await Promise.all([
        createCertSignedUrl(admin, req.pdf_storage_path),
        createCertSignedUrl(admin, req.pdf_storage_path, { downloadFilename: filename }),
      ]);
    } catch (err) {
      console.error('signed URL mint failed:', err);
    }
  }

  const isSent = req.status === 'sent';
  const isRejected = req.status === 'rejected';
  const isInFlight = !isSent && !isRejected;

  return (
    <>
      <Header email={user.email} showMyCerts />
      <AutoRefresh status={req.status} />

      <PageShell as="main" className="page-pad-top page-pad-bot">
        <div>
          <Link
            href="/certificates"
            className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.65rem] font-medium tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All certificates
          </Link>

          <header className="mt-6">
            <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">
              Certificate of Insurance
            </p>
            <h1 className="num-tabular mt-3 font-mono text-[1.875rem] font-medium leading-[1] text-ink sm:text-[2.5rem]">
              <CopyButton
                text={req.cert_number}
                title="Copy certificate number"
                pillLabel="Copied"
                className="focus-ring -m-1 rounded p-1 text-inherit transition-colors hover:text-brand"
              >
                {req.cert_number}
              </CopyButton>
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-5 sm:gap-x-4">
              <StatusPill status={req.status} size="md" />
              <span className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
                Requested
              </span>
              <span className="font-mono text-[0.78rem] text-ink-muted">
                {formatDateTime(req.requested_at)}
              </span>
              {req.sent_at && (
                <>
                  <span className="text-hairline-strong" aria-hidden="true">
                    ·
                  </span>
                  <span className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
                    Sent
                  </span>
                  <span className="font-mono text-[0.78rem] text-ink-muted">
                    {formatDateTime(req.sent_at)}
                  </span>
                </>
              )}
            </div>
          </header>

          <Hairline className="mt-8 sm:mt-10" />

          <section className="mt-8 grid gap-8 sm:mt-10 sm:gap-10 lg:grid-cols-[minmax(0,1fr),minmax(0,320px)]">
            <div className="min-w-0">
              {isSent && (
                <SignedAndSent
                  downloadUrl={downloadUrl}
                  insured={req.client?.business_name ?? 'You'}
                />
              )}
              {isRejected && (
                <Rejected
                  reason={req.decision_note ?? 'Brook flagged this request — please reach out.'}
                />
              )}
              {isInFlight && <InFlight status={req.status} />}
            </div>

            <aside className="space-y-6">
              <div>
                <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint">
                  Holder
                </p>
                <p className="font-display mt-2 text-[1.2rem] font-medium leading-[1.2] tracking-tight text-ink">
                  {req.holder_name}
                </p>
                {req.holder_address1 && (
                  <p className="mt-2 font-mono text-[0.78rem] leading-[1.55] text-ink-muted">
                    {req.holder_address1}
                    {req.holder_address2 && (
                      <>
                        <br />
                        {req.holder_address2}
                      </>
                    )}
                  </p>
                )}
              </div>
              {req.client?.business_name && (
                <div>
                  <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-faint">
                    Insured
                  </p>
                  <p className="font-display mt-2 text-[1.2rem] font-medium leading-[1.2] tracking-tight text-ink">
                    {req.client.business_name}
                  </p>
                </div>
              )}
            </aside>
          </section>

          <LifecycleTimeline
            status={req.status}
            requestedAt={req.requested_at}
            requestedByEmail={req.requested_by_email}
            reviewedAt={req.reviewed_at}
            reviewerPass={req.reviewer_pass}
            reviewerFlags={req.reviewer_flags}
            decidedAt={req.decided_at}
            decidedByEmail={req.decided_by_email}
            sentAt={req.sent_at}
            holderName={req.holder_name}
            holderOpenedAt={null}
          />

          {previewUrl && !isRejected && (
            <section className="mt-12 sm:mt-14">
              <Hairline
                label={isSent ? 'Signed certificate' : 'Preview · awaiting signature'}
                className="mb-5"
              />
              <Card padding="none" className="overflow-hidden">
                <PdfPreview src={previewUrl} title={`Certificate ${req.cert_number}`} />
              </Card>
              <p className="caps mt-3 text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
                Preview not loading?{' '}
                <a
                  href={downloadUrl ?? previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-deep hover:underline"
                >
                  Open the PDF in a new tab
                </a>
              </p>
              {isSent && downloadUrl && (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
                    Signed and on file · Download link valid for 7 days
                  </p>
                  <ButtonLink
                    href={downloadUrl}
                    external
                    size="lg"
                    leadingIcon={<Download className="h-4 w-4" aria-hidden="true" />}
                    className="w-full sm:w-auto"
                  >
                    Download PDF
                  </ButtonLink>
                </div>
              )}
              {!isSent && (
                <p className="caps mt-5 text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
                  This page refreshes automatically · You&apos;ll also receive an email the moment
                  it&apos;s signed.
                </p>
              )}
            </section>
          )}

          {!previewUrl && req.pdf_storage_path && !isRejected && (
            <section className="mt-12 sm:mt-14">
              <Hairline label="PDF temporarily unavailable" className="mb-5" />
              <Banner tone="warning" title="Couldn't load preview">
                Your certificate exists on file, but the preview link couldn&apos;t be generated
                right now. Refresh the page, or email{' '}
                <a
                  href="mailto:brook@yourpolicyplace.com"
                  className="font-medium text-brand-deep underline-offset-2 hover:underline"
                >
                  brook@yourpolicyplace.com
                </a>{' '}
                with reference{' '}
                <span className="font-mono font-semibold text-ink">{req.cert_number}</span> for a
                fresh copy.
              </Banner>
            </section>
          )}

          <aside className="mt-14 rounded-[var(--r-md)] border-l-2 border-seal/50 bg-seal-soft/30 px-5 py-4 sm:bg-transparent sm:px-0 sm:py-0">
            <p className="caps text-[0.6rem] font-semibold tracking-[0.2em] text-seal-deep">
              Need a change?
            </p>
            <p className="mt-2 text-[0.875rem] leading-[1.6] text-ink-muted">
              Reach{' '}
              <a
                className="font-medium text-brand-deep underline-offset-4 hover:text-brand-near hover:underline"
                href="mailto:brook@yourpolicyplace.com"
              >
                brook@yourpolicyplace.com
              </a>{' '}
              or{' '}
              <a
                className="font-medium text-brand-deep underline-offset-4 hover:text-brand-near hover:underline"
                href="tel:+12704102015"
              >
                (270) 410-2015
              </a>{' '}
              with this reference number and we&apos;ll sort it.
            </p>
          </aside>
        </div>
      </PageShell>
    </>
  );
}

function SignedAndSent({
  downloadUrl,
  insured,
}: {
  downloadUrl: string | null;
  insured: string;
}) {
  return (
    <div>
      <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-success">
        Signed &amp; sent
      </p>
      <h2 className="font-display mt-3 text-[1.875rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.25rem]">
        Your certificate is on its way.
      </h2>
      <p className="mt-4 max-w-md text-[0.9375rem] leading-[1.6] text-ink-muted">
        The signed PDF was emailed on behalf of <strong className="text-ink">{insured}</strong>.
        Download it anytime from this page — the link below stays live for the next week.
      </p>
      {!downloadUrl && (
        <Banner tone="warning" className="mt-4">
          The download link couldn&apos;t be generated. Refresh, or email Brook for a copy.
        </Banner>
      )}
    </div>
  );
}

function Rejected({ reason }: { reason: string }) {
  return (
    <div>
      <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-danger">
        Needs attention
      </p>
      <h2 className="font-display mt-3 text-[1.875rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.25rem]">
        Brook flagged this request.
      </h2>
      <Card tone="danger" padding="md" className="mt-5">
        <p className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-danger">Reason</p>
        <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-[1.6] text-ink">
          {reason}
        </p>
      </Card>
      <div className="mt-6">
        <ButtonLink
          href="/"
          size="lg"
          trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
        >
          Submit a new request
        </ButtonLink>
      </div>
    </div>
  );
}

function InFlight({ status }: { status: CertStatus }) {
  const label =
    status === 'pending'
      ? 'Pending review'
      : status === 'reviewed'
      ? 'Reviewed · awaiting Brook'
      : status === 'edited'
      ? 'Edited · sending now'
      : 'Approved · sending now';

  return (
    <div>
      <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">{label}</p>
      <h2 className="font-display mt-3 text-[1.875rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.25rem]">
        Your certificate is being issued.
      </h2>
      <p className="mt-4 max-w-md text-[0.9375rem] leading-[1.6] text-ink-muted">
        Brook is reviewing this request and will email the finished certificate, signed and dated,
        the moment it clears review — usually within a few business hours. The timeline below tracks
        every step.
      </p>
      {/* External link hint for mobile users who want a one-tap preview action */}
      <p className="caps mt-5 inline-flex items-center gap-1.5 text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        You&apos;ll get an email confirmation the moment it ships
      </p>
    </div>
  );
}
