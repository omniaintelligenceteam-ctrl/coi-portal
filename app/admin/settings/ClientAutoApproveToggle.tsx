'use client';

import { useState } from 'react';

export function ClientAutoApproveToggle({
  clientId,
  initialEnabled,
}: {
  clientId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setTo(next: boolean) {
    if (pending || next === enabled) return;
    const prev = enabled;
    setEnabled(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/toggle-auto-approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, enabled: next }),
      });
      let payload: { ok?: boolean; error?: string; detail?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // non-JSON
      }
      if (!res.ok || !payload.ok) {
        setEnabled(prev);
        setError(payload.detail || payload.error || `Request failed (${res.status}).`);
      }
    } catch (err) {
      setEnabled(prev);
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div
        role="radiogroup"
        aria-label="Approval mode"
        className="inline-flex overflow-hidden rounded-md border border-hairline-strong bg-card"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!enabled}
          disabled={pending}
          onClick={() => setTo(false)}
          className={`focus-ring caps px-3 py-1.5 text-[0.62rem] font-semibold tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            !enabled
              ? 'bg-ink text-paper'
              : 'text-ink-muted hover:bg-paper-deep/40'
          }`}
        >
          Manual
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={enabled}
          disabled={pending}
          onClick={() => setTo(true)}
          className={`focus-ring caps border-l border-hairline-strong px-3 py-1.5 text-[0.62rem] font-semibold tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            enabled
              ? 'bg-success text-white'
              : 'text-ink-muted hover:bg-paper-deep/40'
          }`}
        >
          Auto
        </button>
      </div>
      {error && (
        <p className="text-[0.7rem] leading-tight text-danger">{error}</p>
      )}
    </div>
  );
}
