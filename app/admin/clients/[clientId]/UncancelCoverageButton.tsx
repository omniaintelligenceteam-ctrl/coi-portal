'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function UncancelCoverageButton({ policyId }: { policyId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/uncancel-coverage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ policyId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.detail || payload.error || `Request failed (${res.status})`);
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
    <div className="text-right">
      <button
        type="button"
        onClick={handle}
        disabled={submitting}
        className="focus-ring caps inline-flex items-center rounded-md border border-success/40 bg-white px-3 py-1.5 text-[0.62rem] font-semibold text-success transition-colors hover:bg-success-soft/50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Working…' : 'Reactivate'}
      </button>
      {error && <p className="mt-1 text-[0.7rem] text-danger">{error}</p>}
    </div>
  );
}
