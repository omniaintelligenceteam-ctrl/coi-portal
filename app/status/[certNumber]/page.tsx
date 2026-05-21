/**
 * Client status page — Statement Phase 3.
 *
 * Shows the live state of a single cert request: where it is in the
 * pipeline (submitted → reviewer pass → Brook's decision → sent), what
 * Brook can see, and a clear next step.
 *
 * Reached from /status/[certNumber] — typically tapped from the
 * PendingRequestBanner on the client home, or a magic-link email.
 *
 * Server-rendered. RLS scopes the cert_requests row to the signed-in
 * insured's contact_email so this is naturally protected.
 */

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Clock, Mail, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { Hairline } from '@/app/components/Hairline';
import { Header } from '@/app/components/Header';
import { Card, PageShell, StaticChip } from '@/app/components/ui';

export const dynamic = 'force-dynamic';

type RequestRow = {
  id: string;
  cert_number: string;
  status: string;
  holder_name: string;
  reviewer_pass: boolean | null;
  reviewer_notes: string | null;
  requested_at: string;
  reviewed_at: string | null;
  decided_at: string | null;
  sent_at: string | null;
};

type Step = {
  key: string;
  label: string;
  description: string;
  state: 'done' | 'active' | 'pending';
  at?: string | null;
};

export default async function StatusPage({
  params,
}: {
  params: Promise<{ certNumber: string }>;
}) {
  const { certNumber: raw } = await params;
  const certNumber = decodeURIComponent(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data: req } = await supabase
    .from('cert_requests')
    .select(
      'id, cert_number, status, holder_name, reviewer_pass, reviewer_notes, requested_at, reviewed_at, decided_at, sent_at',
    )
    .eq('cert_number', certNumber)
    .maybeSingle<RequestRow>();

  if (!req) notFound();

  const steps = buildSteps(req);
  const isTerminal = req.status === 'sent' || req.status === 'rejected' || req.status === 'voided';

  return (
    <>
      <Header email={user.email} showMyCerts />
      <PageShell as="main" className="page-pad-top page-pad-bot" width="narrow">
        <Link
          href="/"
          className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.65rem] font-medium tracking-caps text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back home
        </Link>

        <header className="mt-7">
          <p className="caps text-[0.65rem] font-semibold tracking-caps text-brand">
            Request status
          </p>
          <h1 className="num-tabular mt-3 font-mono text-[1.625rem] font-medium leading-[1] text-ink sm:text-[2.25rem]">
            {req.cert_number}
          </h1>
          <p className="mt-3 text-[0.95rem] leading-[1.5] text-ink-muted">
            for <span className="font-medium text-ink">{req.holder_name}</span>
          </p>
        </header>

        <Hairline className="mt-8" />

        <ol className="mt-8 space-y-5">
          {steps.map((step, idx) => (
            <li key={step.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={[
                    'grid h-7 w-7 place-items-center rounded-full border transition-colors',
                    step.state === 'done'
                      ? 'border-brand bg-brand text-white'
                      : step.state === 'active'
                        ? 'border-brand text-brand'
                        : 'border-hairline-strong text-ink-mute',
                  ].join(' ')}
                >
                  {step.state === 'done' ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : step.state === 'active' ? (
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <span className="num-tabular text-[0.7rem] font-semibold">{idx + 1}</span>
                  )}
                </span>
                {idx < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={[
                      'mt-1 w-px flex-1',
                      step.state === 'done' ? 'bg-brand' : 'bg-hairline',
                    ].join(' ')}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-3">
                <p
                  className={[
                    'text-[0.95rem] font-medium leading-[1.3]',
                    step.state === 'pending' ? 'text-ink-muted' : 'text-ink',
                  ].join(' ')}
                >
                  {step.label}
                </p>
                <p className="mt-1 text-[0.85rem] leading-[1.5] text-ink-muted">{step.description}</p>
                {step.at && (
                  <p className="mt-1 font-mono text-[0.72rem] text-ink-faint">{formatAt(step.at)}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        {req.reviewer_notes && (
          <Card padding="md" tone="brand" className="mt-10">
            <p className="caps text-[0.62rem] font-semibold tracking-caps text-brand">
              Reviewer note
            </p>
            <p className="mt-2 text-[0.875rem] leading-[1.55] text-ink">{req.reviewer_notes}</p>
          </Card>
        )}

        {isTerminal && req.status === 'sent' && (
          <Card padding="md" tone="seal" className="mt-8">
            <p className="caps text-[0.62rem] font-semibold tracking-caps text-seal-deep">
              Sent
            </p>
            <p className="mt-2 text-[0.875rem] leading-[1.55] text-ink">
              Your certificate was emailed to <span className="font-medium">{req.holder_name}</span>.
              You can re-download or share it from the result page.
            </p>
            <Link
              href={`/result/${encodeURIComponent(req.cert_number)}`}
              className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded text-[0.875rem] font-medium text-brand hover:text-brand-deep"
            >
              Open certificate
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Card>
        )}

        <div className="mt-12 border-t border-hairline pt-6">
          <p className="caps text-[0.6rem] font-semibold tracking-caps text-ink-faint">
            Need to reach Brook?
          </p>
          <p className="mt-2 flex items-center gap-2 text-[0.875rem] text-ink-muted">
            <Mail className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
            <a
              className="font-medium text-brand-deep underline-offset-2 hover:underline"
              href="mailto:brook@yourpolicyplace.com"
            >
              brook@yourpolicyplace.com
            </a>
            <span className="text-hairline-strong">·</span>
            <a
              className="font-medium text-brand-deep underline-offset-2 hover:underline"
              href="tel:+12704102015"
            >
              (270) 410-2015
            </a>
          </p>
        </div>
      </PageShell>
    </>
  );
}

function buildSteps(req: RequestRow): Step[] {
  const status = req.status;
  const isPending = status === 'pending';
  const isReviewed = status === 'reviewed';
  const isApprovedish = status === 'approved' || status === 'edited';
  const isSent = status === 'sent';
  const isRejected = status === 'rejected';
  const isVoided = status === 'voided';

  if (isRejected) {
    return [
      {
        key: 'submit',
        label: 'Submitted',
        description: 'Your request reached the queue.',
        state: 'done',
        at: req.requested_at,
      },
      {
        key: 'reject',
        label: 'Declined by Brook',
        description: 'Reach out and Brook will walk through why and how to resubmit.',
        state: 'done',
        at: req.decided_at,
      },
    ];
  }

  return [
    {
      key: 'submit',
      label: 'Submitted',
      description: 'Your request reached the queue.',
      state: 'done',
      at: req.requested_at,
    },
    {
      key: 'review',
      label: 'AI review',
      description:
        req.reviewer_pass === null
          ? 'The reviewer agent is checking coverages and language now.'
          : req.reviewer_pass
            ? 'The reviewer agent passed it through.'
            : 'The reviewer agent flagged something for Brook to look at.',
      state: isPending && req.reviewer_pass === null ? 'active' : 'done',
      at: req.reviewed_at,
    },
    {
      key: 'approve',
      label: "Brook's approval",
      description: isApprovedish
        ? 'Approved — rendering and emailing now.'
        : isSent
          ? 'Approved by Brook.'
          : isVoided
            ? 'Approved earlier — the cert was later voided.'
            : 'Brook reviews every cert until the system has earned your trust.',
      state: isReviewed && !isApprovedish && !isSent ? 'active' : isApprovedish || isSent || isVoided ? 'done' : 'pending',
      at: req.decided_at,
    },
    {
      key: 'sent',
      label: isVoided ? 'Voided' : 'Sent',
      description: isVoided
        ? 'This certificate was voided after sending. A replacement may be in the works.'
        : isSent
          ? 'Your certificate was emailed to the holder.'
          : 'Once Brook approves, the PDF emails immediately.',
      state: isSent ? 'done' : isApprovedish ? 'active' : 'pending',
      at: req.sent_at,
    },
  ];
}

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
