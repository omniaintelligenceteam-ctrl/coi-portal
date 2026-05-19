'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Retry CTA for certs stuck at status='approved' or 'edited' because the
 * email send failed after Brook's decision was already recorded. Re-runs
 * sendApprovedCert via /api/decide-cert with decision='retry'.
 */
export function RetrySend({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/decide-cert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'retry', requestId }),
      });
      let payload: { ok?: boolean; error?: string; detail?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // Body wasn't JSON — fall through with status-code error.
      }
      if (!res.ok || !payload.ok) {
        setError(
          payload.detail || payload.error || `Retry failed (${res.status}).`,
        );
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-warning/40 bg-warning-soft/40 px-6 py-5">
      <p className="caps text-[0.62rem] font-semibold text-warning">
        Send didn't complete
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink">
        This cert was approved but the email never went out. The decision and
        any holder edits are already saved — clicking retry just re-runs the
        send (re-validates policies, re-renders the PDF, re-sends).
      </p>
      {error && (
        <p className="mt-4 border-l-2 border-danger pl-3 text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleRetry}
        disabled={submitting}
        className="focus-ring mt-5 inline-flex items-center justify-center rounded-md bg-warning px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-warning/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Retrying…' : 'Retry send'}
      </button>
    </div>
  );
}
