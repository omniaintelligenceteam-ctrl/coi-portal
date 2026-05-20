'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Client-side trigger for issuing a "master" certificate — a cert where the
 * insured itself is listed as the certificate holder. Useful for the insured
 * to keep a clean copy of their own current coverages.
 *
 * Two-step: first click expands a confirmation card showing which active
 * coverages will be included; second click submits to /api/generate-coi with
 * isMaster: true. The server pre-fills the holder block from coi_clients.
 */
export function MasterCertButton({
  policyIds,
  businessName,
  businessAddress1,
  businessAddress2,
}: {
  policyIds: string[];
  businessName: string;
  businessAddress1: string;
  businessAddress2: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/generate-coi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          selectedPolicyIds: policyIds,
          isMaster: true,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        certNumber?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.certNumber) {
        setError(payload.detail || payload.error || `Request failed (${res.status})`);
        return;
      }
      router.push('/certificates');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  if (policyIds.length === 0) return null;

  return (
    <div className="mt-12 border border-hairline bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="caps text-[0.62rem] font-semibold text-seal-deep">Master certificate</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink">
            Issue a certificate listing <strong>{businessName}</strong> as both the insured AND the
            certificate holder — handy for your own records or to share when a holder hasn't been
            named yet.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="focus-ring caps tap-target inline-flex items-center rounded-md border border-seal/40 bg-white px-4 py-2 text-[0.7rem] font-semibold text-seal-deep transition-colors hover:bg-seal-soft/60"
          >
            Generate master cert
          </button>
        )}
      </div>

      {open && (
        <div className="mt-5 border-t border-hairline pt-5">
          <p className="caps text-[0.6rem] font-semibold text-ink-muted">Holder (auto-filled)</p>
          <p className="mt-2 font-display text-[1.1rem] font-medium text-ink">{businessName}</p>
          {businessAddress1 && (
            <p className="mt-1 font-mono text-[0.78rem] text-ink-muted">
              {businessAddress1}
              {businessAddress2 && (
                <>
                  <br />
                  {businessAddress2}
                </>
              )}
            </p>
          )}
          <p className="mt-4 text-[0.78rem] text-ink-muted">
            All {policyIds.length} of your active coverage{policyIds.length === 1 ? '' : 's'} will
            be included.
          </p>
          {error && (
            <p className="mt-3 border-l-2 border-danger pl-3 text-[0.78rem] text-danger">{error}</p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="focus-ring rounded px-3 py-2 text-[0.78rem] font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handle}
              disabled={submitting}
              className="focus-ring tap-target inline-flex items-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Confirm & submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
