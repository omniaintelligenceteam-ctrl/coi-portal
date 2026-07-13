'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ReissueOutcome = {
  oldCertNumber: string;
  holderName: string;
  newCertNumber?: string;
  requestId?: string;
  error?: string;
};

type ReissueResult = {
  reissued: number;
  failed: number;
  skippedInFlight: number;
  outcomes: ReissueOutcome[];
};

/**
 * Renewal counterpart to CancelCoverageButton: after Brook renews a policy's
 * dates, one click reissues every live sent cert that referenced it (deduped
 * per holder) through the normal trust-ladder pipeline.
 */
export function ReissueAffectedButton({
  policyId,
  clientId,
}: {
  policyId: string;
  clientId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReissueResult | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reissue-affected', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ policyId }),
      });
      const payload = (await res.json().catch(() => ({}))) as Partial<ReissueResult> & {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.detail || payload.error || `Request failed (${res.status})`);
        return;
      }
      setResult({
        reissued: payload.reissued ?? 0,
        failed: payload.failed ?? 0,
        skippedInFlight: payload.skippedInFlight ?? 0,
        outcomes: payload.outcomes ?? [],
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  if (result !== null) {
    return (
      <div className="w-full sm:w-80">
        <p className="caps text-[0.6rem] font-semibold text-success">
          {result.reissued} cert{result.reissued === 1 ? '' : 's'} reissued.
        </p>
        {result.reissued === 0 && result.failed === 0 && (
          <p className="mt-1 text-[0.78rem] text-ink-muted">
            No live certificates referenced this coverage. Nothing to reissue.
          </p>
        )}
        {result.skippedInFlight > 0 && (
          <p className="mt-1 text-[0.78rem] text-ink-muted">
            {result.skippedInFlight} in-flight request{result.skippedInFlight === 1 ? '' : 's'} skipped
            — they pick up the new dates when sent.
          </p>
        )}
        {result.outcomes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {result.outcomes.map((o) => (
              <li
                key={o.oldCertNumber}
                className={`border bg-white px-3 py-2 text-[0.78rem] ${
                  o.error ? 'border-danger/30' : 'border-hairline'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-ink">
                    {o.newCertNumber ?? o.oldCertNumber}
                  </span>
                  {o.error ? (
                    <span className="caps text-[0.6rem] font-semibold text-danger">failed</span>
                  ) : (
                    <span className="caps text-[0.6rem] font-semibold text-success">queued</span>
                  )}
                </div>
                <p className="mt-1 text-ink-muted">→ {o.holderName}</p>
                {o.error && <p className="mt-1 text-[0.72rem] text-danger">{o.error}</p>}
              </li>
            ))}
          </ul>
        )}
        {result.reissued > 0 && (
          <p className="mt-3 text-[0.78rem]">
            <Link
              href="/admin/queue"
              className="font-semibold text-brand hover:underline"
            >
              Open approval queue →
            </Link>
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring caps inline-flex items-center rounded-md border border-brand/40 bg-white px-3 py-1.5 text-[0.62rem] font-semibold text-brand transition-colors hover:bg-brand-soft/40"
      >
        Reissue live certs
      </button>
    );
  }

  return (
    <div className="w-full sm:w-80">
      <p className="text-[0.78rem] text-ink">
        Reissue every live certificate that references this coverage — one per holder, rendered
        with the policy&apos;s current dates. Auto-approve clients&apos; certs send immediately;
        the rest land in the queue.
      </p>
      {error && <p className="mt-2 text-[0.72rem] text-danger">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="focus-ring rounded px-3 py-1.5 text-[0.72rem] font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="focus-ring inline-flex items-center rounded-md bg-brand px-3 py-1.5 text-[0.72rem] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Reissuing…' : 'Confirm reissue'}
        </button>
      </div>
    </div>
  );
}
