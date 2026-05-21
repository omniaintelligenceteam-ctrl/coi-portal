'use client';

/**
 * Intercept button — pulls a holdback cert back into manual review before
 * the cron auto-releases it. Inline action on the queue card.
 *
 * Posts to /api/admin/intercept-cert. Optimistically removes the lane
 * badge after a successful intercept so the UI feels instant.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Hand } from 'lucide-react';

export function InterceptButton({
  requestId,
  certNumber,
}: {
  requestId: string;
  certNumber: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handle(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch('/api/admin/intercept-cert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        toast.error(payload.detail || payload.error || `Couldn't intercept (${res.status}).`);
        return;
      }
      toast.success(`${certNumber} intercepted. Decide manually now.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="focus-ring caps inline-flex items-center gap-1 rounded border border-warning/40 bg-warning-soft px-2 py-1 text-[0.6rem] font-semibold tracking-caps text-warning transition-colors hover:bg-warning hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={`Intercept ${certNumber} before auto-release`}
    >
      <Hand className="h-3 w-3" aria-hidden="true" />
      {pending ? 'Intercepting…' : 'Intercept'}
    </button>
  );
}
