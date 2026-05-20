import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApprovalToken } from '@/lib/approvalToken';
import { ApprovalCard, type ApprovalCardCert } from './_approval-card';
import type { CertStatus } from '@/app/components/StatusPill';

/**
 * Mobile-first approval landing for the email link. Entry flow:
 *   email → /api/approve/[id]?t=<token>   (route handler — verifies + mints session)
 *         → /approve/[id]?t=<token>        (this page — renders the card)
 *
 * Token is consumed by the server actions in actions.ts on Approve / Reject
 * click, NOT here. Viewing the page is idempotent so refreshes don't burn
 * the link.
 *
 * Outside the /admin/ route group on purpose — the admin layout redirects
 * unauthenticated visitors to /login, which would defeat the whole feature
 * the FIRST time the admin lands (session is minted by the entry handler
 * BEFORE this page renders, but only on the redirect from /api/approve/).
 */

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    t?: string;
    err?: string;
    done?: string;
    cert?: string;
    note?: string;
  }>;
};

type ErrCopy = { title: string; body: string };
type DoneCopy = { title: string; body: string; tone: 'ok' | 'warn' };

const ERR_INVALID: ErrCopy = {
  title: 'This approval link is invalid',
  body:
    'The link in your email looks wrong — it may have been edited or corrupted in transit. Open the full dashboard to review the request directly.',
};

const ERR_COPY: Record<string, ErrCopy> = {
  invalid: ERR_INVALID,
  expired: {
    title: 'This approval link expired',
    body:
      'Approval links are good for 72 hours. Open the dashboard to review and approve the request from there.',
  },
  consumed: {
    title: 'This link has already been used',
    body:
      'Looks like a decision was already recorded for this request. Open the dashboard to see the current status.',
  },
  wrong_request: {
    title: 'This link is for a different request',
    body:
      'The token in this email doesn\'t match this cert request. Open the dashboard to find the right one.',
  },
  revoked: {
    title: 'Your admin access was revoked',
    body:
      'This email used to be on the admin list, but no longer is. Reach out to Wes if that\'s a mistake.',
  },
  session_failed: {
    title: 'We couldn\'t sign you in automatically',
    body:
      'The approval link verified, but the auto-login step failed. Open the dashboard and sign in to approve manually.',
  },
};

function errCopyFor(code: string): ErrCopy {
  return ERR_COPY[code] ?? ERR_INVALID;
}

const DONE_APPROVE: DoneCopy = {
  title: 'Approved & sent',
  body:
    'The certificate has been re-rendered, emailed to the cert holder, and audit-logged. You\'re done here.',
  tone: 'ok',
};

const DONE_COPY: Record<string, DoneCopy> = {
  approve: DONE_APPROVE,
  reject: {
    title: 'Request rejected',
    body:
      'The client has been notified with your reason. They can resubmit a corrected request from their portal.',
    tone: 'warn',
  },
  already_decided: {
    title: 'Already decided',
    body:
      'This request was approved or rejected by someone else (or in another tab) while you were here. No double-action.',
    tone: 'warn',
  },
  send_failed: {
    title: 'Decision saved, but email failed',
    body:
      'Your decision was recorded, but the holder email didn\'t go through. Open the dashboard and use the Retry button to resend.',
    tone: 'warn',
  },
};

function doneCopyFor(kind: string): DoneCopy {
  return DONE_COPY[kind] ?? DONE_APPROVE;
}

type CertRow = {
  id: string;
  cert_number: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  status: CertStatus;
  reviewer_pass: boolean | null;
  reviewer_flags: { field: string; severity: 'error' | 'warning' | 'info'; message: string }[] | null;
  reviewer_notes: string | null;
  decided_by_email: string | null;
  decided_at: string | null;
  client: { business_name: string } | { business_name: string }[] | null;
};

export default async function ApproveLandingPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  const admin = createAdminClient();

  // ── Done state — approval card forwards here after successful decision ──
  if (sp.done && DONE_COPY[sp.done]) {
    return (
      <ResultPage
        kind={sp.done}
        certNumber={sp.cert ?? null}
        note={sp.note ?? null}
        requestId={id}
      />
    );
  }
  // Hand off unknown ?done= values to the error fallback rather than render
  // a misleading "Approved" state.
  if (sp.done) {
    const copy = errCopyFor('invalid');
    return <ErrorPage title={copy.title} body={copy.body} requestId={id} />;
  }

  // ── Error state — entry handler forwards here when token check fails ───
  if (sp.err) {
    const copy = errCopyFor(sp.err);
    return <ErrorPage title={copy.title} body={copy.body} requestId={id} />;
  }

  // ── Normal path — re-verify token, render approval card ─────────────────
  const rawToken = sp.t ?? '';
  if (!rawToken) {
    return (
      <ErrorPage
        title="Missing approval token"
        body="The link looks incomplete. Re-open it from the email, or use the dashboard instead."
        requestId={id}
      />
    );
  }

  const verify = await verifyApprovalToken({ admin, requestId: id, rawToken });
  if (!verify.ok) {
    const copy = errCopyFor(verify.reason);
    return <ErrorPage title={copy.title} body={copy.body} requestId={id} />;
  }

  const { data: cert } = await admin
    .from('cert_requests')
    .select(
      `id, cert_number, holder_name, holder_address1, holder_address2,
       status, reviewer_pass, reviewer_flags, reviewer_notes,
       decided_by_email, decided_at,
       client:coi_clients ( business_name )`,
    )
    .eq('id', id)
    .maybeSingle<CertRow>();
  if (!cert) notFound();

  // If a decision was already made (e.g. another admin tapped Approve first),
  // show a friendly "already decided" state instead of letting them try again.
  if (cert.status !== 'pending' && cert.status !== 'reviewed') {
    return (
      <AlreadyDecidedPage
        certNumber={cert.cert_number}
        status={cert.status}
        decidedBy={cert.decided_by_email}
        decidedAt={cert.decided_at}
      />
    );
  }

  const clientName = Array.isArray(cert.client)
    ? cert.client[0]?.business_name ?? 'Unknown client'
    : cert.client?.business_name ?? 'Unknown client';

  const cardCert: ApprovalCardCert = {
    requestId: id,
    certNumber: cert.cert_number,
    clientName,
    holderName: cert.holder_name,
    holderAddress1: cert.holder_address1,
    holderAddress2: cert.holder_address2,
    reviewerPass: cert.reviewer_pass,
    reviewerNotes: cert.reviewer_notes,
    reviewerFlags: cert.reviewer_flags ?? [],
  };

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-8 sm:max-w-lg sm:px-8 sm:pt-12">
      <header className="mb-6">
        <p className="caps text-[0.62rem] font-semibold text-seal-deep">
          Approval — The Policy Place
        </p>
        <h1 className="font-display mt-2 text-2xl font-medium tracking-tight text-ink sm:text-[1.75rem]">
          Review &amp; approve
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          You&apos;re signed in as an admin. Approve to send the cert, or reject to send it back.
        </p>
      </header>

      <ApprovalCard cert={cardCert} token={rawToken} />

      <p className="mt-8 text-center text-[0.7rem] text-ink-faint">
        Trouble approving here?{' '}
        <Link
          href={`/admin/queue/${id}`}
          className="font-semibold text-brand hover:underline"
        >
          Open full dashboard
        </Link>
      </p>
    </main>
  );
}

function ErrorPage({
  title,
  body,
  requestId,
}: {
  title: string;
  body: string;
  requestId: string;
}) {
  return (
    <main className="mx-auto w-full max-w-md px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-12 sm:max-w-lg sm:px-8 sm:pt-16">
      <div className="border border-danger/40 bg-danger-soft/40 px-6 py-7">
        <p className="caps text-[0.62rem] font-semibold text-danger">Approval link</p>
        <h1 className="font-display mt-3 text-xl font-medium tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">{body}</p>
      </div>
      <div className="mt-6 flex justify-center">
        <Link
          href={`/admin/queue/${requestId}`}
          className="focus-ring inline-flex items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Open full dashboard
        </Link>
      </div>
    </main>
  );
}

function ResultPage({
  kind,
  certNumber,
  note,
  requestId,
}: {
  kind: string;
  certNumber: string | null;
  note: string | null;
  requestId: string;
}) {
  const copy = doneCopyFor(kind);
  const isOk = copy.tone === 'ok';
  return (
    <main className="mx-auto w-full max-w-md px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-12 sm:max-w-lg sm:px-8 sm:pt-16">
      <div
        className={
          isOk
            ? 'border border-success/40 bg-success-soft/40 px-6 py-7'
            : 'border border-warning/40 bg-warning-soft/40 px-6 py-7'
        }
      >
        <p
          className={`caps text-[0.62rem] font-semibold ${
            isOk ? 'text-success' : 'text-warning'
          }`}
        >
          {isOk ? 'Done' : 'Heads up'}
        </p>
        <h1 className="font-display mt-3 text-xl font-medium tracking-tight text-ink">
          {copy.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink">{copy.body}</p>
        {certNumber && (
          <p className="mt-4 font-mono text-[0.78rem] text-ink-muted">Cert · {certNumber}</p>
        )}
        {note && (
          <p className="mt-4 border-l-2 border-hairline-strong pl-3 text-[0.78rem] italic text-ink-muted">
            {note}
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/admin/queue"
          className="focus-ring inline-flex items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Open the queue
        </Link>
        <Link
          href={`/admin/queue/${requestId}`}
          className="focus-ring inline-flex items-center justify-center rounded-md border border-hairline-strong bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-paper-deep/40"
        >
          View this request
        </Link>
      </div>
    </main>
  );
}

function AlreadyDecidedPage({
  certNumber,
  status,
  decidedBy,
  decidedAt,
}: {
  certNumber: string;
  status: CertStatus;
  decidedBy: string | null;
  decidedAt: string | null;
}) {
  return (
    <main className="mx-auto w-full max-w-md px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-12 sm:max-w-lg sm:px-8 sm:pt-16">
      <div className="border border-hairline-strong bg-card px-6 py-7">
        <p className="caps text-[0.62rem] font-semibold text-ink-muted">Already decided</p>
        <h1 className="font-display mt-3 text-xl font-medium tracking-tight text-ink">
          {certNumber} is {status}
        </h1>
        {decidedBy && decidedAt && (
          <p className="mt-3 text-sm leading-relaxed text-ink">
            Decided by <span className="font-mono text-[0.8rem]">{decidedBy}</span> on{' '}
            {new Date(decidedAt).toLocaleString()}.
          </p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          No further action needed here. Open the dashboard for the full audit trail.
        </p>
      </div>
      <div className="mt-6 flex justify-center">
        <Link
          href="/admin/queue"
          className="focus-ring inline-flex items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Open the queue
        </Link>
      </div>
    </main>
  );
}
