'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { approveAction, rejectAction } from './actions';

export type ApprovalCardCert = {
  requestId: string;
  certNumber: string;
  clientName: string;
  holderName: string;
  holderAddress1: string;
  holderAddress2: string | null;
  reviewerPass: boolean | null;
  reviewerNotes: string | null;
  reviewerFlags: { field: string; severity: 'error' | 'warning' | 'info'; message: string }[];
};

/**
 * Mobile-first approval card. Three actions:
 *   Approve  → server action consumes token + runs sendApprovedCert pipeline
 *   Edit     → /admin/queue/[id] (admin is signed in via the entry handler)
 *   Reject   → inline confirmation with reason, then server action
 *
 * Tap targets are 56px+ (well above the 44px iOS minimum). No horizontal
 * scroll. Safe-area-aware padding inherited from parent.
 */
export function ApprovalCard({ cert, token }: { cert: ApprovalCardCert; token: string }) {
  const [mode, setMode] = useState<'review' | 'reject'>('review');
  const [rejectReason, setRejectReason] = useState('');

  const reviewerTone = reviewerToneFor(cert);

  return (
    <div className="space-y-5">
      {/* Cert summary */}
      <section className="border border-hairline-strong bg-card px-5 py-5">
        <p className="caps text-[0.6rem] font-semibold text-ink-faint">Certificate</p>
        <p className="mt-1 font-mono text-[1rem] font-medium text-ink">{cert.certNumber}</p>

        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Client" value={cert.clientName} />
          <Row
            label="Holder"
            value={
              <>
                <span className="block">{cert.holderName}</span>
                <span className="block text-ink-muted">{cert.holderAddress1}</span>
                {cert.holderAddress2 && (
                  <span className="block text-ink-muted">{cert.holderAddress2}</span>
                )}
              </>
            }
          />
        </dl>
      </section>

      {/* AI reviewer summary */}
      <section
        className={`border ${reviewerTone.border} ${reviewerTone.bg} px-5 py-5`}
        aria-label="AI reviewer summary"
      >
        <p className={`caps text-[0.6rem] font-semibold ${reviewerTone.title}`}>
          AI review · {reviewerTone.label}
        </p>
        {cert.reviewerNotes && (
          <p className="mt-3 text-sm leading-relaxed text-ink">{cert.reviewerNotes}</p>
        )}
        {cert.reviewerFlags.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-hairline pt-3 text-sm">
            {cert.reviewerFlags.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    f.severity === 'error'
                      ? 'bg-danger'
                      : f.severity === 'warning'
                        ? 'bg-warning'
                        : 'bg-ink-muted'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  {f.field && (
                    <span className="font-mono text-[0.7rem] text-ink-faint">{f.field}</span>
                  )}
                  <span className="block leading-relaxed text-ink">{f.message}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mode === 'review' ? (
        <>
          {/* Primary action: Approve */}
          <form action={approveAction}>
            <input type="hidden" name="requestId" value={cert.requestId} />
            <input type="hidden" name="token" value={token} />
            <SubmitButton tone="primary" label="Approve & send cert" pendingLabel="Sending…" />
          </form>

          {/* Secondary: Edit (full dashboard) */}
          <Link
            href={`/admin/queue/${cert.requestId}`}
            className="focus-ring flex w-full items-center justify-center rounded-md border border-hairline-strong bg-white px-5 py-3.5 text-sm font-semibold text-ink hover:bg-paper-deep/40"
          >
            Edit before approving
          </Link>

          {/* Tertiary: Reject */}
          <button
            type="button"
            onClick={() => setMode('reject')}
            className="focus-ring flex w-full items-center justify-center rounded-md px-5 py-3.5 text-sm font-semibold text-danger hover:bg-danger-soft/40"
          >
            Reject request
          </button>
        </>
      ) : (
        <form action={rejectAction} className="space-y-4">
          <input type="hidden" name="requestId" value={cert.requestId} />
          <input type="hidden" name="token" value={token} />

          <div className="border border-danger/40 bg-danger-soft/30 px-5 py-5">
            <label htmlFor="reject-reason" className="caps block text-[0.62rem] font-semibold text-danger">
              Reason — sent to client
            </label>
            <textarea
              id="reject-reason"
              name="decisionNote"
              required
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="The holder address looks incomplete — please double-check and resubmit."
              className="field-underline mt-3 block w-full resize-none bg-transparent text-base text-ink"
            />
          </div>

          <SubmitButton
            tone="danger"
            label="Send rejection"
            pendingLabel="Sending…"
            disabled={rejectReason.trim().length < 4}
          />
          <button
            type="button"
            onClick={() => {
              setMode('review');
              setRejectReason('');
            }}
            className="focus-ring flex w-full items-center justify-center rounded-md px-5 py-3 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="caps text-[0.58rem] font-medium text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function SubmitButton({
  tone,
  label,
  pendingLabel,
  disabled,
}: {
  tone: 'primary' | 'danger';
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const bg =
    tone === 'primary' ? 'bg-success hover:bg-success/90' : 'bg-danger hover:bg-danger/90';
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`focus-ring flex w-full items-center justify-center rounded-md px-5 py-4 text-base font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${bg}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function reviewerToneFor(cert: ApprovalCardCert): {
  border: string;
  bg: string;
  title: string;
  label: string;
} {
  if (cert.reviewerPass === null) {
    return {
      border: 'border-hairline',
      bg: 'bg-card',
      title: 'text-ink-muted',
      label: 'still running',
    };
  }
  const hasError = cert.reviewerFlags.some((f) => f.severity === 'error');
  const hasWarning = cert.reviewerFlags.some((f) => f.severity === 'warning');
  if (hasError) {
    return {
      border: 'border-danger/40',
      bg: 'bg-danger-soft/30',
      title: 'text-danger',
      label: 'needs attention',
    };
  }
  if (hasWarning || !cert.reviewerPass) {
    return {
      border: 'border-warning/40',
      bg: 'bg-warning-soft/30',
      title: 'text-warning',
      label: 'warnings',
    };
  }
  return {
    border: 'border-success/30',
    bg: 'bg-success-soft/30',
    title: 'text-success',
    label: 'all clear',
  };
}
