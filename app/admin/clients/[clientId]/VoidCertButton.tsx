'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VoidCertButton({
  requestId,
  certNumber,
}: {
  requestId: string;
  certNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/void-cert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, reason: reason.trim() }),
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
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Void certificate ${certNumber}`}
        className="focus-ring caps inline-flex items-center rounded-md border border-danger/40 bg-white px-2.5 py-1.5 text-[0.6rem] font-semibold text-danger transition-colors hover:bg-danger-soft/50"
      >
        Void
      </button>
    );
  }

  return (
    <div className="text-left">
      <label className="caps block text-[0.58rem] font-semibold text-ink-muted">Void reason</label>
      <textarea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. GL coverage cancelled mid-term"
        className="field-underline mt-1 block w-64 resize-none text-[0.78rem] text-ink"
      />
      {error && <p className="mt-1 text-[0.7rem] text-danger">{error}</p>}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason('');
            setError(null);
          }}
          className="focus-ring rounded px-2 py-1 text-[0.72rem] text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handle}
          disabled={submitting || reason.trim().length === 0}
          className="focus-ring rounded-md bg-danger px-2.5 py-1 text-[0.72rem] font-semibold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Voiding…' : 'Void & notify'}
        </button>
      </div>
    </div>
  );
}
