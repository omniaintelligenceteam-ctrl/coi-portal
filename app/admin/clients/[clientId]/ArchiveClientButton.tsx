'use client';

/**
 * Archive / restore action for a client.
 *
 * Soft-archive only — never hard-delete. Archive flips active=false, sets
 * archived_at, and stores an optional reason. Restore clears archived_at +
 * reason and flips active back on. The audit log records the action with
 * the reason note (on archive).
 *
 * UX: collapses to a single danger-tinted button. Click reveals a small
 * inline confirmation strip (with a reason textarea on archive) so the
 * user can't archive a client by misclick. Matches the VoidCertButton
 * pattern so it feels familiar.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/app/components/ui';

export function ArchiveClientButton({
  clientId,
  businessName,
  isArchived,
}: {
  clientId: string;
  businessName: string;
  isArchived: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: 'archive' | 'restore') {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/archive-client', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          action,
          reason: action === 'archive' ? reason.trim() || undefined : undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        const message = payload.detail || payload.error || `Request failed (${res.status}).`;
        setError(message);
        toast.error(message);
        return;
      }
      toast.success(action === 'archive' ? `${businessName} archived.` : `${businessName} restored.`);
      setOpen(false);
      setReason('');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Restore is a single confident click — no reason required.
  if (isArchived) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => handle('restore')}
        loading={submitting}
      >
        Restore client
      </Button>
    );
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-danger hover:bg-danger-soft/50 hover:text-danger"
      >
        Archive client…
      </Button>
    );
  }

  return (
    <div className="w-full max-w-md">
      <p className="text-[0.8125rem] text-ink">
        Archive <span className="font-semibold">{businessName}</span>? They won't be able to sign in
        or request certs. All history is preserved and you can restore them anytime.
      </p>
      <label htmlFor="archive-reason" className="caps mt-3 block text-[0.6rem] font-semibold text-ink-muted">
        Reason (optional)
      </label>
      <textarea
        id="archive-reason"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. policy lapsed, business sold, paused service"
        maxLength={500}
        className="field-underline mt-1 block w-full resize-none text-[0.85rem] text-ink"
      />
      {error && <p className="mt-2 text-[0.75rem] font-medium text-danger">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setReason('');
            setError(null);
          }}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => handle('archive')}
          loading={submitting}
        >
          Archive client
        </Button>
      </div>
    </div>
  );
}
