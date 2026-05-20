'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type AffectedCert = {
  requestId: string;
  certNumber: string;
  holderName: string;
  status: string;
  sentAt: string | null;
};

export function CancelCoverageButton({
  policyId,
  clientId,
}: {
  policyId: string;
  clientId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedCert[] | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cancel-coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ policyId, reason: reason.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        affected?: AffectedCert[];
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.detail || payload.error || `Request failed (${res.status})`);
        return;
      }
      setAffected(payload.affected ?? []);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  if (affected !== null) {
    return (
      <div className="w-full">
        <p className="caps text-[0.6rem] font-semibold text-success">Coverage cancelled.</p>
        {affected.length === 0 ? (
          <p className="mt-1 text-[0.78rem] text-ink-muted">
            No live certificates referenced this coverage. Nothing else to do.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[0.78rem] text-ink">
              {affected.length} live cert{affected.length === 1 ? '' : 's'} referenced this coverage.
              Consider voiding so the holder is notified:
            </p>
            <ul className="mt-3 space-y-2">
              {affected.map((c) => (
                <li
                  key={c.requestId}
                  className="border border-danger/30 bg-white px-3 py-2 text-[0.78rem]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-ink">{c.certNumber}</span>
                    <Link
                      href={`/admin/clients/${clientId}?tab=certificates`}
                      className="text-[0.72rem] font-semibold text-brand hover:underline"
                    >
                      Open list →
                    </Link>
                  </div>
                  <p className="mt-1 text-ink-muted">→ {c.holderName}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring caps inline-flex items-center rounded-md border border-danger/40 bg-white px-3 py-1.5 text-[0.62rem] font-semibold text-danger transition-colors hover:bg-danger-soft/50"
      >
        Cancel coverage
      </button>
    );
  }

  return (
    <div className="w-full sm:w-80">
      <label className="caps block text-[0.6rem] font-semibold text-ink-muted">
        Cancellation reason
      </label>
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Insurer non-renewal; replaced by policy XYZ"
        className="field-underline mt-2 block w-full resize-none text-sm text-ink"
      />
      {error && (
        <p className="mt-2 text-[0.72rem] text-danger">{error}</p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason('');
            setError(null);
          }}
          className="focus-ring rounded px-3 py-1.5 text-[0.72rem] font-medium text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || reason.trim().length === 0}
          className="focus-ring inline-flex items-center rounded-md bg-danger px-3 py-1.5 text-[0.72rem] font-semibold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Cancelling…' : 'Confirm cancellation'}
        </button>
      </div>
    </div>
  );
}
