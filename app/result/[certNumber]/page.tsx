import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Header } from '@/app/components/Header';
import { Hairline } from '@/app/components/Hairline';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildCertFilename, createCertSignedUrl } from '@/lib/storage';
import { AutoRefresh } from './AutoRefresh';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ certNumber: string }>;
};

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

  // RLS bounds this to the requesting client's own row.
  const { data: req } = await supabase
    .from('cert_requests')
    .select(
      `id, cert_number, status, holder_name, holder_address1, holder_address2,
       pdf_storage_path, decision_note, requested_at, sent_at,
       client:coi_clients ( business_name )`,
    )
    .eq('cert_number', certNumber)
    .maybeSingle<ResultRow>();

  if (!req) notFound();

  // Mint signed URLs against the private bucket via the admin client.
  // We avoid the download filename on the preview URL so iframes don't
  // force an attachment disposition.
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
      // Non-fatal — the page still renders with status info, just no PDF.
      console.error('signed URL mint failed:', err);
    }
  }

  const isSent = req.status === 'sent';
  const isRejected = req.status === 'rejected';
  const isInFlight = !isSent && !isRejected;

  return (
    <>
      <Header email={user.email} />
      <AutoRefresh status={req.status} />

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-12 sm:px-10 lg:pt-16">
        <Link
          href="/certificates"
          className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          All certificates
        </Link>

        {/* Header block */}
        <header className="mt-6">
          <p className="caps text-[0.65rem] font-semibold text-seal-deep">Certificate of Insurance</p>
          <h1 className="mt-3 font-mono text-[2.25rem] font-medium leading-none tabular-nums text-ink sm:text-[2.75rem]">
            {req.cert_number}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusPill status={req.status} size="md" />
            <span className="caps text-[0.6rem] font-medium text-ink-faint">Requested</span>
            <span className="font-mono text-[0.75rem] text-ink-muted">
              {formatDateTime(req.requested_at)}
            </span>
            {req.sent_at && (
              <>
                <span className="text-hairline-strong">·</span>
                <span className="caps text-[0.6rem] font-medium text-ink-faint">Sent</span>
                <span className="font-mono text-[0.75rem] text-ink-muted">
                  {formatDateTime(req.sent_at)}
                </span>
              </>
            )}
          </div>
        </header>

        <Hairline className="mt-10" />

        {/* Status-specific message + holder summary */}
        <section className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr),minmax(0,320px)]">
          <div>
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

          <aside>
            <p className="caps text-[0.62rem] font-semibold text-ink-faint">Holder</p>
            <p className="font-display mt-3 text-[1.2rem] font-medium leading-tight tracking-tight text-ink">
              {req.holder_name}
            </p>
            {req.holder_address1 && (
              <p className="mt-3 font-mono text-[0.78rem] leading-relaxed text-ink-muted">
                {req.holder_address1}
                {req.holder_address2 && (
                  <>
                    <br />
                    {req.holder_address2}
                  </>
                )}
              </p>
            )}
            {req.client?.business_name && (
              <>
                <p className="caps mt-8 text-[0.62rem] font-semibold text-ink-faint">Insured</p>
                <p className="font-display mt-3 text-[1.2rem] font-medium leading-tight tracking-tight text-ink">
                  {req.client.business_name}
                </p>
              </>
            )}
          </aside>
        </section>

        {/* PDF preview */}
        {previewUrl && !isRejected && (
          <section className="mt-14">
            <Hairline label={isSent ? 'Signed certificate' : 'Preview · awaiting signature'} className="mb-6" />
            <div className="border border-hairline bg-card">
              <iframe
                src={previewUrl}
                title={`Certificate ${req.cert_number}`}
                className="block h-[820px] w-full"
              />
            </div>
            {isSent && downloadUrl && (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="caps text-[0.6rem] font-medium text-ink-faint">
                  Signed and on file · Download link valid for 7 days
                </p>
                <a
                  href={downloadUrl}
                  className="focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-deep"
                >
                  Download PDF
                  <ArrowDown className="h-4 w-4" />
                </a>
              </div>
            )}
            {!isSent && (
              <p className="caps mt-6 text-[0.6rem] font-medium text-ink-faint">
                This page refreshes automatically · You'll also receive an email the moment it's
                signed.
              </p>
            )}
          </section>
        )}

        {/* Contact callout */}
        <div className="mt-16 border-l-2 border-seal/40 pl-5">
          <p className="caps text-[0.6rem] font-semibold text-seal-deep">Need a change?</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Reach{' '}
            <a
              className="font-medium text-brand underline-offset-4 hover:underline"
              href="mailto:brook@yourpolicyplace.com"
            >
              brook@yourpolicyplace.com
            </a>{' '}
            with this reference number and we'll sort it.
          </p>
        </div>
      </main>
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
      <p className="caps text-[0.65rem] font-semibold text-success">Signed & sent</p>
      <h2 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.4rem]">
        Your certificate is on its way.
      </h2>
      <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
        The signed PDF was emailed on behalf of <strong className="text-ink">{insured}</strong>.
        Download it anytime from this page — the link below stays live for the next week.
      </p>
      {!downloadUrl && (
        <p className="mt-4 text-sm leading-relaxed text-warning">
          The download link couldn't be generated. Refresh, or email Brook for a copy.
        </p>
      )}
    </div>
  );
}

function Rejected({ reason }: { reason: string }) {
  return (
    <div>
      <p className="caps text-[0.65rem] font-semibold text-danger">Needs attention</p>
      <h2 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.4rem]">
        Brook flagged this request.
      </h2>
      <div className="mt-6 border-l-2 border-danger/60 pl-5">
        <p className="caps text-[0.6rem] font-semibold text-danger">Reason</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{reason}</p>
      </div>
      <div className="mt-8">
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-deep"
        >
          Submit a new request
          <ArrowRight className="h-4 w-4" />
        </Link>
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
      <p className="caps text-[0.65rem] font-semibold text-seal-deep">{label}</p>
      <h2 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.4rem]">
        Your certificate is being issued.
      </h2>
      <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
        Brook is reviewing this request and will email the finished certificate, signed and dated,
        the moment it clears review — usually within a few business hours.
      </p>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <Stepper
          number="01"
          title="Reviewed"
          body="A licensed agent verifies coverage selections, holder details, and any prior corrections on file."
        />
        <Stepper
          number="02"
          title="Emailed"
          body="The signed PDF arrives in your inbox as soon as it's approved. Reply to that email if anything needs adjusting."
        />
      </div>
    </div>
  );
}

function Stepper({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[0.78rem] font-medium tabular-nums text-seal">{number}</span>
        <span className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">
          {title}
        </span>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
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

function ArrowDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}
